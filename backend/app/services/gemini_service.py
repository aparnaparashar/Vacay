"""
Gemini AI Service — Vacay Chatbot engine.

Uses the google-genai SDK with **gemini-3.5-flash** for all Vacay Chatbot
interactions (chat, function calling, tool orchestration).

IMPORTANT — gemini-3.5-flash returns a `thought_signature` on function-call
parts and rejects follow-up turns that omit it ("Function call is missing a
thought_signature"). The model turn must therefore be appended to the history
verbatim rather than reconstructed. This requires google-genai >= 2.x; the
`thought_signature` field does not exist on `types.Part` in 1.x.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Optional

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# ── Models ────────────────────────────────────────────────────────
# The Vacay Chatbot. The /plan intake and orchestration agents keep their own
# models and are deliberately untouched.
VACAY_CHAT_MODEL = "gemini-3.5-flash"
LEGACY_MODEL = "gemini-2.5-flash"

MAX_TOOL_ROUNDS = 4

# ── System Prompts ────────────────────────────────────────────────

VACAY_SYSTEM_PROMPT = """\
You are **WANDR**, a knowledgeable travel companion — not a generic chatbot.

Your job is to help the traveller answer one question: **"What should I do next?"**

You understand where they are, where they are going, what they like, who they
are travelling with, what they can afford, what the weather is doing, how much
time they have, and what they have already done.

## How you answer

**Be concise.** Short paragraphs and tight lists. Never pad. Do not restate the
question back to the user.

**Be context-aware.** Never ask for something you were already told. If the
travel context or trip data below already contains the destination, dates,
travellers or budget, use it silently.

**Be actionable.** Not "the weather may be rainy" but "rain starts around 2pm,
so do the Bamboo Grove this morning and keep the museum for the afternoon."
Give a concrete plan the traveller can act on.

**Be honest.** If you could not verify something, say so plainly:
"I couldn't verify this from a current source." Never present a guess as fact.
Opening hours, prices and availability change — flag them as worth confirming
rather than stating them as certain.

**Be conversational.** The traveller should not have to phrase things perfectly.
Understand "I'm tired, what's nearby?", "something cheap but nice", and
"I have 3 hours before my train."

## Using tools

You have tools for weather, places, nearby attractions, restaurants, routes and
budget planning. Use them when live or specific data would make the answer
genuinely better — checking the weather before recommending outdoor plans,
searching real places rather than recalling them from memory.

Do not call a tool for small talk, general travel knowledge, or a question you
can already answer from the conversation and the trip data you were given.

When a tool returns `ok: false`, tell the traveller what you could not look up
and answer with what you do know. Never invent a result.

When a tool returns ranked places, respect the ordering — it already accounts
for distance, rating, opening status, budget fit and the weather. Mention *why*
a place suits them ("a 10-minute walk, and indoors given the rain").

## Formatting

Plain conversational prose with short markdown lists where a list genuinely
helps. No headings unless the answer is genuinely long. Never output raw JSON.
"""

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
3. Factor in travel time between POIs.
4. Respect arrival_time on day 1 and departure_time on the last day.
5. Include meal stops with local restaurant/street-food suggestions.
6. If weather data is provided, move outdoor activities to clear-weather days.
7. Provide a budget breakdown (accommodation, food, transport, activities, misc) in INR.
8. Add 3-5 practical tips and packing suggestions.
9. For "relaxed" style, limit to 3-4 activities/day; "packed" can go up to 6-7.
10. Always mention the best time to visit each attraction to avoid crowds.
"""


class GeminiService:
    """Wrapper around the Google GenAI SDK for Wandr-specific calls."""

    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = VACAY_CHAT_MODEL

    @property
    def is_configured(self) -> bool:
        return bool(settings.gemini_api_key)

    # ── Vacay Chatbot: tool-enabled generation ────────────────────

    async def generate_with_tools(
        self,
        *,
        system_prompt: str,
        history: list[types.Content],
        tools: Optional[list[types.Tool]],
        tool_executor,
        max_rounds: int = MAX_TOOL_ROUNDS,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """
        Run a function-calling conversation turn.

        `tool_executor` is an async callable ``(name, args) -> dict``.

        Returns ``{"text": str, "tool_calls": [names], "rounds": int}``.
        """
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=tools or None,
            # We drive the loop ourselves so we can inject conversation-derived
            # arguments (preferences, live location) the model never sees.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=temperature,
        )

        contents = list(history)
        called: list[str] = []

        for round_index in range(max_rounds):
            response = await self.client.aio.models.generate_content(
                model=self.model, contents=contents, config=config
            )

            candidate = (response.candidates or [None])[0]
            if candidate is None or candidate.content is None:
                return {"text": "", "tool_calls": called, "rounds": round_index}

            calls = [
                part.function_call
                for part in (candidate.content.parts or [])
                if getattr(part, "function_call", None)
            ]

            if not calls:
                return {
                    "text": (response.text or "").strip(),
                    "tool_calls": called,
                    "rounds": round_index,
                }

            # Append the model turn *verbatim* — this carries the
            # thought_signature that gemini-3.5-flash requires on the way back.
            contents.append(candidate.content)

            response_parts = []
            for call in calls:
                called.append(call.name)
                result = await tool_executor(call.name, dict(call.args or {}))
                response_parts.append(
                    types.Part.from_function_response(name=call.name, response=result)
                )
            contents.append(types.Content(role="user", parts=response_parts))

        # Tool budget exhausted — ask for a final answer with tools disabled so
        # the model must respond in prose instead of looping again.
        final_config = types.GenerateContentConfig(
            system_instruction=system_prompt, temperature=temperature
        )
        final = await self.client.aio.models.generate_content(
            model=self.model, contents=contents, config=final_config
        )
        return {
            "text": (final.text or "").strip(),
            "tool_calls": called,
            "rounds": max_rounds,
        }

    # ── Chat ──────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        """Send a single chat message and return the full response text."""
        contents = self._build_contents(conversation_history, message)
        try:
            response = await self.client.aio.models.generate_content(
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
            stream = await self.client.aio.models.generate_content_stream(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=CHAT_SYSTEM_PROMPT,
                    temperature=0.8,
                    max_output_tokens=2048,
                ),
            )
            async for chunk in stream:
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
        parts: list[str] = []
        if weather_context:
            parts.append(f"Weather forecast data:\n{weather_context}\n")
        if travel_time_context:
            parts.append(f"Travel time data between POIs:\n{travel_time_context}\n")
        parts.append(prompt)

        try:
            response = await self.client.aio.models.generate_content(
                model=LEGACY_MODEL,
                contents=[types.Content(role="user", parts=[types.Part(text="\n".join(parts))])],
                config=types.GenerateContentConfig(
                    system_instruction=ITINERARY_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            return self._parse_json(response.text)
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
            response = await self.client.aio.models.generate_content(
                model=LEGACY_MODEL,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=ITINERARY_SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            return self._parse_json(response.text)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse refined itinerary JSON: %s", e)
            raise ValueError("Gemini returned invalid refined itinerary JSON") from e
        except Exception as e:
            logger.error("Gemini refine error: %s", e)
            raise

    # ── Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _parse_json(raw: Optional[str]) -> dict:
        text = (raw or "{}").strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        return json.loads(text)

    @staticmethod
    def _build_contents(
        history: list[dict] | None,
        current_message: str,
    ) -> list[types.Content]:
        """Convert conversation history + new message into GenAI contents."""
        contents: list[types.Content] = []
        if history:
            for msg in history:
                role = msg.get("role", "user")
                # The API only accepts "user" and "model".
                role = "model" if role in ("model", "assistant") else "user"
                contents.append(
                    types.Content(
                        role=role, parts=[types.Part(text=msg.get("content", ""))]
                    )
                )
        contents.append(types.Content(role="user", parts=[types.Part(text=current_message)]))
        return contents


# Module-level singleton
gemini_service = GeminiService()
