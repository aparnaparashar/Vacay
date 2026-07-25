from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.database import get_db
from app.db.models import TripRecord
from app.auth.dependencies import get_current_user_optional
from app.agents.orchestrator import OrchestratorAgent
import json

router = APIRouter()
orchestrator = OrchestratorAgent()

class PlanRequest(BaseModel):
    origin: str
    destination: str
    date: str
    duration: int = 2
    adults: int = 1
    budget: float = 50000.0

@router.post("/stream")
async def stream_orchestration(request: PlanRequest, req: Request, db: AsyncSession = Depends(get_db)):
    # Try to extract the user
    auth_header = req.headers.get("Authorization")
    user = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        user = await get_current_user_optional(token, db)
        
    if user:
        # Check for overlaps
        # Basic check: if any trip has the exact same departure_date for now, or just any existing trip that conflicts
        # For a production robust calendar we'd do datetime logic, but string match works for this demo
        # Actually, let's query all trips for the user and check dates in Python
        from datetime import datetime, timedelta
        
        try:
            req_start = datetime.strptime(request.date, "%Y-%m-%d").date()
            req_end = req_start + timedelta(days=request.duration - 1)
            
            result = await db.execute(select(TripRecord).where(TripRecord.owner_id == user.id))
            user_trips = result.scalars().all()
            
            for t in user_trips:
                t_start = datetime.strptime(t.departure_date, "%Y-%m-%d").date()
                t_end = datetime.strptime(t.arrival_date, "%Y-%m-%d").date()
                
                # Check overlap: start1 <= end2 and start2 <= end1
                if req_start <= t_end and t_start <= req_end:
                    async def error_stream():
                        yield f"data: {json.dumps({'event': 'error', 'message': f'You already have a trip to {t.destination} scheduled during these dates! Please select different dates.'})}\n\n"
                    return StreamingResponse(error_stream(), media_type="text/event-stream")
        except Exception as e:
            print("Error checking overlaps:", e)
            pass

    return StreamingResponse(
        orchestrator.stream_plan(request.model_dump(), user_id=user.id if user else None), 
        media_type="text/event-stream"
    )
