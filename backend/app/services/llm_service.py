import json
import logging
from typing import AsyncIterator

from groq import AsyncGroq
from app.config import settings

logger = logging.getLogger(__name__)

# ── System Prompts ────────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """\
You are **Wandr**, an expert AI travel assistant specializing in India.

Your knowledge covers:
• Every major tourist circuit — Golden Triangle, Kerala Backwaters, Rajasthan Forts, \
  Northeast Hill Trails, Konkan Coast, Ladakh, Goa beaches, Hampi ruins, etc.
• Seasonal travel — monsoons, best-visit months, festivals (Diwali, Holi, Pushkar Fair, \
  Onam, Hornbill, Rann Utsav).
• Local cuisine — street food, regional thalis, must-try dishes per city.
• Hidden gems — offbeat villages, lesser-known temples, local markets, sunrise viewpoints.
• Practical logistics — train bookings (IRCTC), domestic flights, local transport, \
  budget ranges, safety tips, SIM/connectivity.

Respond in a warm, knowledgeable, and concise tone. Use bullet points when listing \
recommendations. If the user hasn't specified a destination, help narrow it down by \
asking about their preferences (adventure vs. relaxation, budget, season, interests).

Always think about the traveler's safety, comfort, and authentic local experience.
"""

ITINERARY_SYSTEM_PROMPT = """\
You are **Wandr Itinerary Architect**, an AI that creates detailed, realistic day-by-day \
travel itineraries for destinations in India.

Rules:
1. Produce a JSON itinerary matching the schema exactly. Return ONLY valid JSON.
2. Each day must have a theme title and 4-7 activities with realistic time slots.
3. Factor in travel time between POIs — don't schedule Amber Fort and City Palace in \
   back-to-back 30-min slots if they are 11 km apart.
4. Respect arrival_time on day 1 and departure_time on the last day.
5. Include meal stops (breakfast, lunch, dinner) with local restaurant/street-food suggestions.
6. If weather data is provided, move outdoor activities to clear-weather days and suggest \
   indoor alternatives (museums, cooking classes, shopping) on rainy days.
7. Provide a budget breakdown (accommodation, food, transport, activities, misc) in INR.
8. Add 3-5 practical tips and packing suggestions relevant to the destination and season.
9. For "relaxed" style, limit to 3-4 activities/day; "packed" can go up to 6-7.
10. Always mention the best time to visit each attraction to avoid crowds.

Output JSON schema:
{
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "num_days": 0,
  "travel_style": "relaxed|moderate|packed",
  "days": [
    {
      "day_number": 0,
      "date": "YYYY-MM-DD",
      "title": "string",
      "weather_summary": "string or null",
      "activities": [
        {
          "time_slot": "HH:MM - HH:MM",
          "title": "string",
          "description": "string",
          "place_name": "string or null",
          "category": "sightseeing|food|adventure|transit|rest|shopping",
          "estimated_cost": 0.0,
          "travel_time_from_prev": "string or null",
          "weather_note": "string or null",
          "indoor": false
        }
      ],
      "daily_budget": 0.0
    }
  ],
  "budget": {
    "accommodation": 0.0,
    "food": 0.0,
    "transport": 0.0,
    "activities": 0.0,
    "miscellaneous": 0.0,
    "total": 0.0,
    "currency": "INR"
  },
  "tips": ["string"],
  "packing_suggestions": ["string"]
}
"""

class LLMService:
    """Wrapper around the Groq SDK for Wandr-specific calls."""

    def __init__(self) -> None:
        self.client = AsyncGroq(api_key=settings.groq_api_key)
        self.model = "llama-3.3-70b-versatile"

    # ── Chat ──────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        """Send a single chat message and return the full response text."""
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": message})

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.8,
                max_tokens=2048,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error("Groq chat error: %s", e)
            raise

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a chat response token-by-token."""
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": message})

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.8,
                max_tokens=2048,
                stream=True,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            logger.error("Groq stream error: %s", e)
            raise

    # ── Itinerary ─────────────────────────────────────────────────

    async def generate_itinerary(
        self,
        prompt: str,
        weather_context: str = "",
        travel_time_context: str = "",
    ) -> dict:
        """Generate a structured itinerary and return it as a dict."""
        full_prompt_parts = []
        if weather_context:
            full_prompt_parts.append(f"Weather forecast data:\n{weather_context}\n")
        if travel_time_context:
            full_prompt_parts.append(f"Travel time data between POIs:\n{travel_time_context}\n")
        full_prompt_parts.append(prompt)

        user_prompt = "\n".join(full_prompt_parts)

        messages = [
            {"role": "system", "content": ITINERARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse itinerary JSON: %s", e)
            raise ValueError("Groq returned invalid itinerary JSON") from e
        except Exception as e:
            logger.error("Groq itinerary error: %s", e)
            raise

    async def refine_itinerary(self, itinerary_json: str, instruction: str) -> dict:
        """Refine an existing itinerary based on a user instruction."""
        prompt = (
            f"Here is the current itinerary JSON:\n{itinerary_json}\n\n"
            f"User wants the following change: {instruction}\n\n"
            "Return the FULL updated itinerary JSON with the changes applied."
        )
        messages = [
            {"role": "system", "content": ITINERARY_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content or "{}"
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse refined itinerary JSON: %s", e)
            raise ValueError("Groq returned invalid refined itinerary JSON") from e
        except Exception as e:
            logger.error("Groq refine error: %s", e)
            raise

# Module-level singleton
llm_service = LLMService()
