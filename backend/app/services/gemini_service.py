"""
Gemini AI Service — powers chat and itinerary generation.

Uses the google-genai SDK with the gemini-2.0-flash model.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from google import genai
from google.genai import types

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
1. Produce a JSON itinerary matching the schema exactly. Return ONLY valid JSON, no markdown fences.
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
  "num_days": int,
  "travel_style": "relaxed|moderate|packed",
  "days": [
    {
      "day_number": int,
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
          "estimated_cost": float_or_null,
          "travel_time_from_prev": "string or null",
          "weather_note": "string or null",
          "indoor": bool
        }
      ],
      "daily_budget": float_or_null
    }
  ],
  "budget": {
    "accommodation": float,
    "food": float,
    "transport": float,
    "activities": float,
    "miscellaneous": float,
    "total": float,
    "currency": "INR"
  },
  "tips": ["string"],
  "packing_suggestions": ["string"]
}
"""


class GeminiService:
    """Wrapper around the Google GenAI SDK for Wandr-specific calls."""

    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-1.5-flash"

    # ── Chat ──────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        """Send a single chat message and return the full response text."""
        contents = self._build_contents(conversation_history, message)

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=CHAT_SYSTEM_PROMPT,
                    temperature=0.8,
                    max_output_tokens=2048,
                ),
            )
            return response.text or ""
        except Exception as e:
            logger.error("Gemini chat error: %s", e)
            raise

    async def chat_stream(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a chat response token-by-token."""
        contents = self._build_contents(conversation_history, message)

        try:
            stream = self.client.models.generate_content_stream(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=CHAT_SYSTEM_PROMPT,
                    temperature=0.8,
                    max_output_tokens=2048,
                ),
            )
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            logger.error("Gemini stream error: %s", e)
            raise

    # ── Itinerary ─────────────────────────────────────────────────

    async def generate_itinerary(
        self,
        prompt: str,
        weather_context: str = "",
        travel_time_context: str = "",
    ) -> dict:
        """Generate a structured itinerary and return it as a dict."""
        full_prompt_parts: list[str] = []
        if weather_context:
            full_prompt_parts.append(f"Weather forecast data:\n{weather_context}\n")
        if travel_time_context:
            full_prompt_parts.append(f"Travel time data between POIs:\n{travel_time_context}\n")
        full_prompt_parts.append(prompt)

        user_prompt = "\n".join(full_prompt_parts)

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[{"role": "user", "parts": [{"text": user_prompt}]}],
                config=types.GenerateContentConfig(
                    system_instruction=ITINERARY_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            raw = response.text or "{}"
            # Strip markdown fences if the model wraps them anyway
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse itinerary JSON: %s", e)
            raise ValueError("Gemini returned invalid itinerary JSON") from e
        except Exception as e:
            logger.error("Gemini itinerary error: %s", e)
            raise

    async def refine_itinerary(self, itinerary_json: str, instruction: str) -> dict:
        """Refine an existing itinerary based on a user instruction."""
        prompt = (
            f"Here is the current itinerary JSON:\n{itinerary_json}\n\n"
            f"User wants the following change: {instruction}\n\n"
            "Return the FULL updated itinerary JSON with the changes applied."
        )
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                config=types.GenerateContentConfig(
                    system_instruction=ITINERARY_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            raw = (response.text or "{}").strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse refined itinerary JSON: %s", e)
            raise ValueError("Gemini returned invalid refined itinerary JSON") from e
        except Exception as e:
            logger.error("Gemini refine error: %s", e)
            raise

    # ── Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _build_contents(
        history: list[dict] | None,
        current_message: str,
    ) -> list[dict]:
        """Convert conversation history + new message into GenAI contents format."""
        contents: list[dict] = []
        if history:
            for msg in history:
                contents.append({
                    "role": msg.get("role", "user"),
                    "parts": [{"text": msg.get("content", "")}],
                })
        contents.append({
            "role": "user",
            "parts": [{"text": current_message}],
        })
        return contents


# Module-level singleton
gemini_service = GeminiService()
