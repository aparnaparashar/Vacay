from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.database import get_db
from app.db.models import TripRecord, TripMember, User
from sqlalchemy.orm import load_only
from app.auth.dependencies import get_current_user
from app.services.email_service import send_email
from pydantic import BaseModel, EmailStr
from typing import Dict, Any

router = APIRouter()

class TripCreate(BaseModel):
    origin: str
    destination: str
    departure_date: str
    arrival_date: str
    adults: int
    budget: float
    trip_data: Dict[str, Any]

class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "editor"

@router.post("/")
async def save_trip(trip: TripCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_trip = TripRecord(
        owner_id=current_user.id,
        origin=trip.origin,
        destination=trip.destination,
        departure_date=trip.departure_date,
        arrival_date=trip.arrival_date,
        adults=trip.adults,
        budget=trip.budget,
        trip_data=trip.trip_data
    )
    db.add(db_trip)
    await db.commit()
    await db.refresh(db_trip)
    
    # Auto-add creator as admin member
    member = TripMember(trip_id=db_trip.id, user_id=current_user.id, role="admin")
    db.add(member)
    await db.commit()
    
    return {"status": "success", "id": db_trip.id}

@router.get("/")
async def get_trips(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Fetch only trips where the current user is a member (either owner or invitee)
    result = await db.execute(
        select(TripRecord)
        .join(TripMember, TripRecord.id == TripMember.trip_id)
        .where(TripMember.user_id == current_user.id)
        .order_by(TripRecord.created_at.desc())
    )
    trips = result.scalars().all()
    
    # We need to manually inject members into the response so frontend can use them
    from sqlalchemy.orm import selectinload
    result_with_members = await db.execute(
        select(TripRecord)
        .options(selectinload(TripRecord.members).selectinload(TripMember.user))
        .join(TripMember, TripRecord.id == TripMember.trip_id)
        .where(TripMember.user_id == current_user.id)
        .order_by(TripRecord.created_at.desc())
    )
    trips = result_with_members.scalars().all()
    
    response_data = []
    for trip in trips:
        trip_dict = {
            "id": trip.id,
            "owner_id": trip.owner_id,
            "origin": trip.origin,
            "destination": trip.destination,
            "departure_date": trip.departure_date,
            "arrival_date": trip.arrival_date,
            "adults": trip.adults,
            "budget": trip.budget,
            "is_archived": trip.is_archived,
            "created_at": trip.created_at,
            "trip_data": dict(trip.trip_data) if trip.trip_data else {}
        }
        
        # Merge members into participants
        participants = trip_dict["trip_data"].get("participants", [])
        existing_ids = {p.get("id") for p in participants if isinstance(p, dict)}
        
        for m in trip.members:
            if m.user and str(m.user.id) not in existing_ids:
                participants.append({
                    "id": str(m.user.id),
                    "name": m.user.name or m.user.email.split("@")[0],
                    "email": m.user.email,
                    "role": "owner" if trip.owner_id == m.user.id else m.role,
                    "color": "bg-indigo-500" # default, frontend will map
                })
                existing_ids.add(str(m.user.id))
                
        trip_dict["trip_data"]["participants"] = participants
        response_data.append(trip_dict)
        
    return {"status": "success", "data": response_data}

@router.get("/{trip_id}")
async def get_trip(trip_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify access
    access = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == current_user.id))
    if not access.scalars().first():
        raise HTTPException(status_code=403, detail="Not authorized to access this trip")
        
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(TripRecord)
        .options(selectinload(TripRecord.members).selectinload(TripMember.user))
        .where(TripRecord.id == trip_id)
    )
    trip = result.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
        
    trip_dict = {
        "id": trip.id,
        "owner_id": trip.owner_id,
        "origin": trip.origin,
        "destination": trip.destination,
        "departure_date": trip.departure_date,
        "arrival_date": trip.arrival_date,
        "adults": trip.adults,
        "budget": trip.budget,
        "is_archived": trip.is_archived,
        "created_at": trip.created_at,
        "trip_data": dict(trip.trip_data) if trip.trip_data else {}
    }
    
    participants = trip_dict["trip_data"].get("participants", [])
    existing_ids = {p.get("id") for p in participants if isinstance(p, dict)}
    
    for m in trip.members:
        if m.user and str(m.user.id) not in existing_ids:
            participants.append({
                "id": str(m.user.id),
                "name": m.user.name or m.user.email.split("@")[0],
                "email": m.user.email,
                "role": "owner" if trip.owner_id == m.user.id else m.role,
                "color": "bg-indigo-500"
            })
            existing_ids.add(str(m.user.id))
            
    trip_dict["trip_data"]["participants"] = participants

    return {"status": "success", "data": trip_dict}

@router.post("/{trip_id}/invite")
async def invite_user(trip_id: int, req: InviteRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify sender is admin/owner
    access = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == current_user.id))
    member_record = access.scalars().first()
    if not member_record or member_record.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can invite others")
        
    trip_req = await db.execute(select(TripRecord).where(TripRecord.id == trip_id))
    trip = trip_req.scalars().first()

    # Find invitee by email
    target_req = await db.execute(select(User).where(User.email == req.email))
    target_user = target_req.scalars().first()
    
    if target_user:
        # Add to trip directly if they exist
        existing_member = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == target_user.id))
        if not existing_member.scalars().first():
            db.add(TripMember(trip_id=trip_id, user_id=target_user.id, role=req.role))
            await db.commit()
            
            # Send Email Notification
            send_email(
                to_email=target_user.email,
                subject=f"You've been invited to {trip.destination} by {current_user.name}!",
                body=f"<p>Hi {target_user.name},</p><p>{current_user.name} has invited you to collaborate on a trip to {trip.destination}.</p><p>Log in to Wandr to view and edit the itinerary!</p>"
            )
            return {"status": "success", "message": "User added and email sent"}
        return {"status": "success", "message": "User is already a member"}
    else:
        # User doesn't exist, send signup invite
        send_email(
            to_email=req.email,
            subject=f"Join Wandr to plan a trip to {trip.destination}!",
            body=f"<p>Hi there,</p><p>{current_user.name} wants you to join their trip to {trip.destination}.</p><p>Sign up at Wandr to join them!</p>"
        )
        return {"status": "success", "message": "Signup invite email sent"}

@router.patch("/{trip_id}/archive")
async def archive_trip(trip_id: int, archive_req: Dict[str, bool], db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify sender is admin/owner
    access = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == current_user.id))
    member_record = access.scalars().first()
    if not member_record or member_record.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can archive trips")
        
    result = await db.execute(select(TripRecord).where(TripRecord.id == trip_id))
    trip = result.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
        
    is_archived = archive_req.get("is_archived", True)
    trip.is_archived = is_archived
    await db.commit()
    return {"status": "success"}

@router.delete("/{trip_id}")
async def delete_trip(trip_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify sender is admin/owner
    access = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == current_user.id))
    member_record = access.scalars().first()
    if not member_record or member_record.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete trips")
        
    result = await db.execute(select(TripRecord).where(TripRecord.id == trip_id))
    trip = result.scalars().first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
        
    # Delete trip members
    await db.execute(TripMember.__table__.delete().where(TripMember.trip_id == trip_id))
    # Note: If there are TripFile records, they should ideally be deleted here too, 
    # but SQLAlchemy cascade="all, delete-orphan" might handle it if configured, 
    # otherwise we might leave orphaned files in S3. For now, just deleting from DB.
    
    await db.delete(trip)
    await db.commit()
    return {"status": "success"}

@router.delete("/{trip_id}/members/{user_id}")
async def remove_member(trip_id: int, user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Verify sender is admin/owner, or the user themselves leaving
    access = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == current_user.id))
    member_record = access.scalars().first()
    
    if not member_record or (member_record.role != "admin" and current_user.id != user_id):
        raise HTTPException(status_code=403, detail="Not authorized to remove members")
        
    trip_req = await db.execute(select(TripRecord).where(TripRecord.id == trip_id))
    trip = trip_req.scalars().first()
    if trip and trip.owner_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the owner of the trip")
        
    target_member = await db.execute(select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user_id == user_id))
    target = target_member.scalars().first()
    
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this trip")
        
    await db.delete(target)
    await db.commit()
    
    return {"status": "success", "message": "Member removed successfully"}
