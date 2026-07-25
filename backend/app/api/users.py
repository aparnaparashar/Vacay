from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.database import get_db
from app.db.models import User
from app.auth.dependencies import get_current_user
from typing import List

router = APIRouter()

@router.get("/search")
async def search_users(q: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not q or len(q) < 2:
        return {"status": "success", "data": []}
        
    # Search by name or email (case-insensitive)
    search_term = f"%{q.lower()}%"
    result = await db.execute(
        select(User).where(
            (User.name.ilike(search_term)) | (User.email.ilike(search_term))
        ).limit(10)
    )
    users = result.scalars().all()
    
    # Filter out the current user from search results
    filtered_users = [
        {"id": u.id, "name": u.name, "email": u.email} 
        for u in users if u.id != current_user.id
    ]
    
    return {"status": "success", "data": filtered_users}
