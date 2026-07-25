import json
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
from groq import Groq
from app.config import settings

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
