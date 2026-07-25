from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, delete
from pydantic import BaseModel
from typing import List, Optional
import datetime

from app.db.database import get_db
from app.db.models import (
    User, VacayPlan, VacayPlanMember, VacayUserColor, 
    VacayUserYear, VacayEntry
)
from app.auth.dependencies import get_current_user

router = APIRouter()

# Schemas
class ToggleEntryRequest(BaseModel):
    date: str
    user_id: Optional[int] = None

@router.get("/plan")
async def get_my_plan(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Find if user owns a plan
    result = await db.execute(select(VacayPlan).where(VacayPlan.owner_id == current_user.id))
    plan = result.scalars().first()
    
    if not plan:
        # Check if they are a member of another plan
        member_result = await db.execute(select(VacayPlanMember).where(VacayPlanMember.user_id == current_user.id))
        member = member_result.scalars().first()
        if member:
            result = await db.execute(select(VacayPlan).where(VacayPlan.id == member.plan_id))
            plan = result.scalars().first()
            
    if not plan:
        # Create a default plan
        plan = VacayPlan(owner_id=current_user.id)
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
        
        # Add themselves as member
        member = VacayPlanMember(plan_id=plan.id, user_id=current_user.id, status="active")
        color = VacayUserColor(user_id=current_user.id, plan_id=plan.id, color="#3b82f6") # Blue
        db.add(member)
        db.add(color)
        await db.commit()
    
    # Fetch members
    members_res = await db.execute(select(VacayPlanMember).where(VacayPlanMember.plan_id == plan.id))
    members = members_res.scalars().all()
    
    user_ids = [m.user_id for m in members]
    users_res = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_list = users_res.scalars().all()
    
    colors_res = await db.execute(select(VacayUserColor).where(VacayUserColor.plan_id == plan.id))
    colors_map = {c.user_id: c.color for c in colors_res.scalars().all()}
    
    return {
        "plan": {
            "id": plan.id,
            "owner_id": plan.owner_id,
            "block_weekends": plan.block_weekends,
            "holidays_enabled": plan.holidays_enabled,
            "holidays_region": plan.holidays_region,
            "week_start": plan.week_start
        },
        "users": [
            {"id": u.id, "name": u.name, "email": u.email, "color": colors_map.get(u.id, "#9ca3af")}
            for u in users_list
        ]
    }

@router.get("/entries")
async def get_entries(year: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    plan_data = await get_my_plan(current_user, db)
    plan_id = plan_data["plan"]["id"]
    
    # Fetch entries for the year (basic prefix match)
    res = await db.execute(select(VacayEntry).where(
        VacayEntry.plan_id == plan_id,
        VacayEntry.date.startswith(str(year))
    ))
    entries = res.scalars().all()
    
    return {
        "entries": [{"id": e.id, "user_id": e.user_id, "date": e.date} for e in entries]
    }

@router.post("/entries/toggle")
async def toggle_entry(req: ToggleEntryRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    plan_data = await get_my_plan(current_user, db)
    plan_id = plan_data["plan"]["id"]
    target_user_id = req.user_id or current_user.id
    
    res = await db.execute(select(VacayEntry).where(
        VacayEntry.plan_id == plan_id,
        VacayEntry.user_id == target_user_id,
        VacayEntry.date == req.date
    ))
    existing = res.scalars().first()
    
    if existing:
        await db.delete(existing)
        action = "removed"
    else:
        new_entry = VacayEntry(plan_id=plan_id, user_id=target_user_id, date=req.date)
        db.add(new_entry)
        action = "added"
        
    await db.commit()
    return {"status": "success", "action": action}
