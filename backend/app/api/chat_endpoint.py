from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.services.llm_service import llm_service

router = APIRouter()

class ChatPayload(BaseModel):
    message: str
    conversation_history: Optional[List[dict]] = None

class ChatResponse(BaseModel):
    reply: str

@router.post("/", response_model=ChatResponse)
async def chat(payload: ChatPayload):
    try:
        conversation_history = []
        if payload.conversation_history:
            for msg in payload.conversation_history:
                if msg.get("role") in ["user", "assistant"] and isinstance(msg.get("content"), str):
                    conversation_history.append({
                        "role": msg["role"],
                        "content": msg["content"],
                    })

        reply = await llm_service.chat(payload.message, conversation_history)
        return {"reply": reply}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
