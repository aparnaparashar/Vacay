from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from app.db.database import get_db
from app.db.models import TripRecord, TripMember, User, TripFile, FileLink
from app.auth.dependencies import get_current_user
from typing import List, Optional, Dict, Any
import boto3
import uuid
import mimetypes
import os
from datetime import datetime

router = APIRouter()

# AWS / Cloudflare R2 Config
S3_BUCKET = os.environ.get("R2_BUCKET_NAME", "wandr")
S3_ENDPOINT = os.environ.get("R2_ENDPOINT_URL")
S3_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID")
S3_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")

s3_client = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=S3_ACCESS_KEY,
    aws_secret_access_key=S3_SECRET_KEY,
    region_name='auto'  # R2 requires region_name='auto' or similar
) if S3_ENDPOINT else None

async def verify_trip_access(trip_id: int, current_user: User, db: AsyncSession, require_edit: bool = False):
    access = await db.execute(select(TripMember).where(
        TripMember.trip_id == trip_id, 
        TripMember.user_id == current_user.id
    ))
    member = access.scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Not authorized to access this trip")
    if require_edit and member.role not in ["admin", "editor"]:
        raise HTTPException(status_code=403, detail="Not authorized to modify files for this trip")
    return member

@router.get("/")
async def get_trip_files(trip_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await verify_trip_access(trip_id, current_user, db)
    
    result = await db.execute(
        select(TripFile)
        .where(TripFile.trip_id == trip_id)
        .order_by(desc(TripFile.created_at))
    )
    files = result.scalars().all()
    
    file_list = []
    for f in files:
        f_dict = {
            "id": f.id,
            "trip_id": f.trip_id,
            "uploaded_by_user_id": f.uploaded_by_user_id,
            "original_name": f.original_name,
            "file_size": f.file_size,
            "mime_type": f.mime_type,
            "description": f.description,
            "starred": f.starred,
            "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "url": None
        }
        
        if not f.deleted_at and s3_client:
            try:
                url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': S3_BUCKET, 'Key': f.storage_key},
                    ExpiresIn=3600
                )
                f_dict["url"] = url
            except Exception as e:
                print(f"Error generating presigned url: {e}")
                
        link_result = await db.execute(select(FileLink).where(FileLink.file_id == f.id))
        f_dict["links"] = [{"id": link.id, "place_id": link.place_id, "reservation_id": link.reservation_id} for link in link_result.scalars().all()]
        
        file_list.append(f_dict)
        
    return {"status": "success", "data": file_list}

@router.post("/")
async def upload_trip_file(
    trip_id: int, 
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    await verify_trip_access(trip_id, current_user, db, require_edit=True)
    
    if not s3_client:
        raise HTTPException(status_code=500, detail="Storage not configured")
        
    if file.content_type == "image/svg+xml":
        raise HTTPException(status_code=400, detail="SVG uploads are not permitted for security reasons.")
        
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        
    ext = os.path.splitext(file.filename)[1]
    storage_key = f"trips/{trip_id}/{uuid.uuid4()}{ext}"
    
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=storage_key,
            Body=content,
            ContentType=file.content_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
        
    db_file = TripFile(
        trip_id=trip_id,
        uploaded_by_user_id=current_user.id,
        storage_key=storage_key,
        original_name=file.filename,
        file_size=len(content),
        mime_type=file.content_type,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    
    return {"status": "success", "data": {"id": db_file.id}}

@router.patch("/{file_id}")
async def update_file(
    trip_id: int, 
    file_id: int, 
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    await verify_trip_access(trip_id, current_user, db, require_edit=True)
    
    result = await db.execute(select(TripFile).where(TripFile.id == file_id, TripFile.trip_id == trip_id))
    db_file = result.scalars().first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if "starred" in payload:
        db_file.starred = payload["starred"]
    if "description" in payload:
        db_file.description = payload["description"]
    if "trashed" in payload:
        if payload["trashed"]:
            db_file.deleted_at = datetime.utcnow()
        else:
            db_file.deleted_at = None
            
    await db.commit()
    return {"status": "success"}

@router.delete("/{file_id}")
async def delete_file(
    trip_id: int, 
    file_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    await verify_trip_access(trip_id, current_user, db, require_edit=True)
    
    result = await db.execute(select(TripFile).where(TripFile.id == file_id, TripFile.trip_id == trip_id))
    db_file = result.scalars().first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if s3_client:
        try:
            s3_client.delete_object(Bucket=S3_BUCKET, Key=db_file.storage_key)
        except Exception as e:
            print(f"Failed to delete object from S3: {e}")
            
    await db.delete(db_file)
    await db.commit()
    return {"status": "success"}

@router.post("/{file_id}/links")
async def update_file_links(
    trip_id: int, 
    file_id: int, 
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    await verify_trip_access(trip_id, current_user, db, require_edit=True)
    
    await db.execute(FileLink.__table__.delete().where(FileLink.file_id == file_id))
    
    links = payload.get("links", [])
    for link in links:
        db_link = FileLink(
            file_id=file_id,
            place_id=link.get("place_id"),
            reservation_id=link.get("reservation_id")
        )
        db.add(db_link)
        
    await db.commit()
    return {"status": "success"}
