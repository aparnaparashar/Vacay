import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from groq import Groq
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.models.schemas import (
    ChatHistoryMessage,
    ChatHistoryResponse,
    VacayChatRequest,
    VacayChatResponse,
)
from app.services.chat_service import ChatQuotaError, chat_service

logger = logging.getLogger(__name__)

router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatIntakeRequest(BaseModel):
    messages: List[ChatMessage]

class IntakeData(BaseModel):
    is_complete: bool = Field(description="True if ALL required fields (origin, destination, departure_date, arrival_date, adults) are fully gathered.")
    reply_to_user: str = Field(description="Your conversational response to the user. If is_complete is False, ask a natural question to get the missing info. If True, say 'Perfect! Building your itinerary now...'")
    origin: Optional[str] = Field(None, description="The starting city/location")
    destination: Optional[str] = Field(None, description="The destination city/location")
    departure_date: Optional[str] = Field(None, description="Format YYYY-MM-DD")
    arrival_date: Optional[str] = Field(None, description="Format YYYY-MM-DD")
    adults: Optional[int] = Field(None, description="Number of adults")
    budget: Optional[float] = Field(None, description="Total budget in USD")
    missing_field: Optional[str] = Field(None, description="If is_complete is False, specify one primary missing field: 'origin', 'destination', 'dates', 'adults', or 'budget'. This tells the UI to show a widget.")

@router.post("/", response_model=VacayChatResponse)
async def vacay_chat(
    request: VacayChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Vacay Chatbot — conversational travel assistant (spec Section 15).

    Handles recommendations, day planning, weather-aware suggestions and live
    travel Q&A. Gemini's function calling routes each query to the right tool.
    """
    try:
        return await chat_service.process_message(
            db=db,
            user_id=current_user.id,
            message=request.message,
            conversation_id=request.conversation_id,
            trip_context=request.trip_context,
            current_location=request.current_location,
        )
    except ChatQuotaError as e:
        # A single turn can span several model requests, so a low per-minute
        # quota is hit routinely. Tell the traveller plainly instead of
        # pretending something broke.
        raise HTTPException(
            status_code=429,
            detail="WANDR is at its request limit right now. Give it a few seconds and ask again.",
        ) from e
    except Exception as e:
        logger.exception("Vacay chat failed for user %s", current_user.id)
        # Don't leak provider/internal detail to the client.
        raise HTTPException(
            status_code=503,
            detail="WANDR is having trouble answering right now. Please try again.",
        ) from e


@router.get("/conversations/{conversation_id}", response_model=ChatHistoryResponse)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replay a stored conversation so chat survives a page refresh."""
    records = await chat_service.get_history(db, current_user.id, conversation_id)
    return ChatHistoryResponse(
        conversation_id=conversation_id,
        messages=[
            ChatHistoryMessage(
                id=r.id,
                role=r.role,
                content=r.content or "",
                intent=r.intent,
                sources=r.sources or [],
                created_at=r.created_at.isoformat() if r.created_at else None,
            )
            for r in records
        ],
    )


SYSTEM_PROMPT = """You are Wandr AI, a friendly and expert travel agent.
Your goal is to gather the following REQUIRED parameters to plan a trip:
1. Origin (where are they leaving from?)
2. Destination (where are they going?)
3. Dates (both departure and arrival date in YYYY-MM-DD format)
4. Adults (number of travelers)

Optional but good to have: Budget.

Current Date context: Assume the current year is 2026 if not specified.

Read the conversation history. Extract any parameters the user has provided.
If ANY of the 4 required parameters are missing, set `is_complete` to false, and use `reply_to_user` to naturally ask for them (ask for one thing at a time to not overwhelm). Also set `missing_field` to the parameter you are asking for.
If ALL 4 required parameters are gathered, set `is_complete` to true, and set `reply_to_user` to a confirmation message.

Output strictly in JSON matching the schema."""

@router.post("/intake", response_model=IntakeData)
async def chat_intake(request: ChatIntakeRequest):
    try:
        client = None
        
        # Construct history
        history_text = ""
        for msg in request.messages:
            role = "User" if msg.role == "user" else "Wandr"
            history_text += f"{role}: {msg.content}\n"
        
        prompt = f"{SYSTEM_PROMPT}\n\nConversation:\n{history_text}\n\nExtract the data and respond. RETURN STRICTLY VALID JSON."
        
        # 1. Try Gemini First
        try:
            from google import genai
            from google.genai import types
            
            gemini_client = genai.Client(api_key=settings.gemini_api_key)
            response = gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=IntakeData,
                ),
            )
            data = json.loads(response.text)
            
        except Exception as gemini_err:
            # 2. Fallback to Groq if Gemini hits quota/rate limits
            from groq import Groq
            groq_client = Groq(api_key=settings.groq_api_key)
            
            schema_str = IntakeData.schema_json()
            groq_prompt = f"{prompt}\n\nRETURN STRICTLY VALID JSON MATCHING THIS EXACT SCHEMA:\n{schema_str}"
            
            response = groq_client.chat.completions.create(
                model='llama-3.3-70b-versatile',
                messages=[
                    {"role": "system", "content": "You are a JSON-only API. Output ONLY valid JSON."},
                    {"role": "user", "content": groq_prompt}
                ],
                response_format={"type": "json_object"}
            )
            data = json.loads(response.choices[0].message.content)
        
        # Validation layer: Ensure if they say complete, it actually IS complete
        if data.get("is_complete"):
            reqs = ["origin", "destination", "departure_date", "arrival_date", "adults"]
            missing = [r for r in reqs if not data.get(r)]
            if missing:
                data["is_complete"] = False
                data["reply_to_user"] = f"Almost there! I still need to know the {missing[0]}."
                data["missing_field"] = "dates" if "date" in missing[0] else missing[0]
                
        return data
    except Exception as e:
        # Fallback
        return {
            "is_complete": False,
            "reply_to_user": f"I hit a snag. The error is: {str(e)}. Could you tell me where you'd like to go?",
            "missing_field": "destination"
        }
