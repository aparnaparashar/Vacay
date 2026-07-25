"""
Vacay Chat Service — the chatbot brain.

Implements spec Sections 5 (Intelligent Query Routing), 6 (Conversation
Architecture) and 7 (Personalization):

    load conversation + travel context + long-term preferences
        -> build system prompt (persona + context + trip data)
        -> Gemini 3.5 Flash with function calling
        -> tool calls executed and fed back
        -> persist messages, context and learned preferences
        -> return reply + intent + sources

Query routing is Gemini's native function calling rather than a hand-written
classifier: the model reads the query and picks the tool, which is exactly the
routing the spec describes.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ChatConversation, ChatMessageRecord, UserPreference
from app.models.schemas import (
    GeoLocation,
    TripContextPayload,
    VacayChatResponse,
)
from app.services.context_manager import context_manager
from app.services.gemini_service import VACAY_SYSTEM_PROMPT, gemini_service
from app.tools import GEMINI_TOOLS, TOOL_INTENTS, TOOL_SOURCES, execute_tool

logger = logging.getLogger(__name__)

# How many past messages are replayed to the model.
HISTORY_LIMIT = 20
# Guard rails on how much trip JSON we inline (keeps prompts and cost sane).
MAX_TRIP_SECTION_CHARS = 4000


class ChatQuotaError(RuntimeError):
    """
    The model provider rejected the turn for rate/quota reasons.

    Worth its own type: one chat turn can issue several requests (one per tool
    round plus the final answer), so a low per-minute quota is hit routinely and
    the traveller deserves "try again in a moment" rather than a generic error.
    """


def _is_quota_error(exc: Exception) -> bool:
    text = str(exc)
    return "RESOURCE_EXHAUSTED" in text or "429" in text


class ChatService:
    """Orchestrates one chat turn end to end."""

    # ── Conversation persistence ─────────────────────────────────────

    async def _get_or_create_conversation(
        self,
        db: AsyncSession,
        user_id: int,
        conversation_id: Optional[str],
        trip_id: Optional[int],
    ) -> ChatConversation:
        if conversation_id:
            result = await db.execute(
                select(ChatConversation).where(
                    ChatConversation.id == conversation_id,
                    # Scoped to the owner: a conversation id is guessable, and
                    # without this check anyone could read another user's thread.
                    ChatConversation.user_id == user_id,
                )
            )
            conversation = result.scalars().first()
            if conversation:
                if trip_id and conversation.trip_id != trip_id:
                    conversation.trip_id = trip_id
                return conversation

        conversation = ChatConversation(
            id=str(uuid.uuid4()),
            user_id=user_id,
            trip_id=trip_id,
            travel_context={},
        )
        db.add(conversation)
        await db.flush()
        return conversation

    async def _load_history(
        self, db: AsyncSession, conversation_id: str
    ) -> list[ChatMessageRecord]:
        result = await db.execute(
            select(ChatMessageRecord)
            .where(ChatMessageRecord.conversation_id == conversation_id)
            # created_at orders turns; seq orders the two messages inside a turn.
            # Never fall back to `id` — it is a random UUID, not monotonic.
            .order_by(ChatMessageRecord.created_at.asc(), ChatMessageRecord.seq.asc())
        )
        messages = list(result.scalars().all())
        return messages[-HISTORY_LIMIT:]

    async def _load_preferences(
        self, db: AsyncSession, user_id: int
    ) -> Optional[UserPreference]:
        result = await db.execute(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        return result.scalars().first()

    async def _save_preferences(
        self, db: AsyncSession, user_id: int, updates: dict[str, Any]
    ) -> None:
        if not updates:
            return
        record = await self._load_preferences(db, user_id)
        if record is None:
            record = UserPreference(
                id=str(uuid.uuid4()),
                user_id=user_id,
                food_preferences=[],
                activity_preferences=[],
            )
            db.add(record)
        for field, value in updates.items():
            if value:
                setattr(record, field, value)

    # ── Prompt construction ──────────────────────────────────────────

    @staticmethod
    def _json_section(title: str, payload: Any) -> str:
        """Render one trip section, truncated so a huge trip can't blow the prompt."""
        if not payload:
            return ""
        try:
            text = json.dumps(payload, indent=2, default=str)
        except (TypeError, ValueError):
            text = str(payload)
        if len(text) > MAX_TRIP_SECTION_CHARS:
            text = text[:MAX_TRIP_SECTION_CHARS] + "\n… (truncated)"
        return f"\n### {title}\n{text}\n"

    def build_system_prompt(
        self,
        travel_context: dict,
        trip_context: Optional[TripContextPayload],
        preferences: Optional[UserPreference],
    ) -> str:
        prompt = VACAY_SYSTEM_PROMPT

        prompt += (
            "\n\n## Today\n"
            f"The current date is {datetime.now(timezone.utc).strftime('%Y-%m-%d')} (UTC).\n"
        )

        prompt += "\n## Travel Context\n" + context_manager.describe(travel_context) + "\n"

        if preferences:
            pref_lines = []
            if preferences.travel_style:
                pref_lines.append(f"- Travel style: {preferences.travel_style}")
            if preferences.travel_pace:
                pref_lines.append(f"- Preferred pace: {preferences.travel_pace}")
            if preferences.food_preferences:
                pref_lines.append(
                    "- Dietary: " + ", ".join(preferences.food_preferences)
                )
            if preferences.activity_preferences:
                pref_lines.append(
                    "- Likes: " + ", ".join(preferences.activity_preferences)
                )
            if pref_lines:
                prompt += "\n## Known Traveller Preferences\n" + "\n".join(pref_lines) + "\n"

        if trip_context:
            prompt += (
                "\n## Active Trip\n"
                "The traveller has this trip loaded. Use it to answer specifically — "
                "for example, if they ask what they are doing tomorrow, read the "
                "itinerary and tell them that day's activities. Do not ask for "
                "information that is already here.\n"
                f"- Route: {trip_context.origin or '?'} → {trip_context.destination or '?'}\n"
                f"- Dates: {trip_context.departure_date or '?'} to {trip_context.arrival_date or '?'}\n"
                f"- Travellers: {trip_context.adults or '?'}\n"
                f"- Budget: {trip_context.budget if trip_context.budget is not None else '?'}\n"
            )
            prompt += self._json_section("Itinerary", trip_context.itinerary)
            prompt += self._json_section("Flights", trip_context.flights)
            prompt += self._json_section("Hotels", trip_context.hotels)
            prompt += self._json_section("Weather Forecast", trip_context.weather)
            prompt += self._json_section("Budget Breakdown", trip_context.budget_result)
            prompt += self._json_section("Packing List", trip_context.packing)
            prompt += self._json_section("Tracked Expenses", trip_context.expenses)
            prompt += self._json_section("Trip Participants", trip_context.participants)
        else:
            prompt += (
                "\n## Active Trip\n"
                "No trip is loaded. Act as a general travel assistant. If you need "
                "the destination or dates to answer well, ask for just that one "
                "thing — briefly.\n"
            )

        return prompt

    @staticmethod
    def _build_history(
        records: list[ChatMessageRecord], new_message: str
    ) -> list[types.Content]:
        contents: list[types.Content] = []
        for record in records:
            if not record.content:
                continue
            role = "model" if record.role == "assistant" else "user"
            contents.append(
                types.Content(role=role, parts=[types.Part(text=record.content)])
            )
        contents.append(types.Content(role="user", parts=[types.Part(text=new_message)]))
        return contents

    # ── Main entry point ─────────────────────────────────────────────

    async def process_message(
        self,
        *,
        db: AsyncSession,
        user_id: int,
        message: str,
        conversation_id: Optional[str] = None,
        trip_context: Optional[TripContextPayload] = None,
        current_location: Optional[GeoLocation] = None,
    ) -> VacayChatResponse:
        if not gemini_service.is_configured:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        trip_id = trip_context.trip_id if trip_context else None
        conversation = await self._get_or_create_conversation(
            db, user_id, conversation_id, trip_id
        )

        history_records = await self._load_history(db, conversation.id)
        preferences = await self._load_preferences(db, user_id)

        # 1. Build the travel context: stored -> trip -> location -> message.
        travel_context = context_manager.normalize(conversation.travel_context)
        travel_context = context_manager.apply_trip_context(travel_context, trip_context)
        travel_context = context_manager.apply_location(travel_context, current_location)
        travel_context = context_manager.extract_from_message(travel_context, message)

        # 2. Values the tools need but the model must not have to guess.
        user_point: Optional[tuple[float, float]] = None
        if travel_context.get("current_location"):
            loc = travel_context["current_location"]
            user_point = (loc["latitude"], loc["longitude"])

        interests = list(travel_context.get("preferences") or [])
        if preferences and preferences.activity_preferences:
            interests = sorted(set(interests) | set(preferences.activity_preferences))
        if preferences and preferences.food_preferences:
            interests = sorted(set(interests) | set(preferences.food_preferences))

        weather_condition = None
        weather_ctx = travel_context.get("weather_context")
        if isinstance(weather_ctx, dict):
            weather_condition = weather_ctx.get("condition")

        used_tools: list[str] = []

        async def tool_executor(name: str, args: dict[str, Any]) -> dict[str, Any]:
            used_tools.append(name)
            return await execute_tool(
                name,
                args,
                preferences=interests,
                user_point=user_point,
                weather_condition=weather_condition,
            )

        # 3. Run the turn.
        system_prompt = self.build_system_prompt(travel_context, trip_context, preferences)
        contents = self._build_history(history_records, message)

        try:
            result = await gemini_service.generate_with_tools(
                system_prompt=system_prompt,
                history=contents,
                tools=GEMINI_TOOLS,
                tool_executor=tool_executor,
            )
            reply = result.get("text") or ""
        except Exception as e:
            if _is_quota_error(e):
                logger.warning("Vacay chat hit provider quota: %s", e)
                raise ChatQuotaError(str(e)) from e
            logger.exception("Vacay chat generation failed")
            raise RuntimeError(str(e)) from e

        if not reply.strip():
            reply = (
                "I couldn't put together an answer for that one. "
                "Could you rephrase it, or tell me a bit more about what you're after?"
            )

        # 4. Classify the turn from the tools that actually ran.
        intent = "chat"
        sources: list[str] = []
        for name in used_tools:
            intent = TOOL_INTENTS.get(name, intent)
            source = TOOL_SOURCES.get(name)
            if source and source not in sources:
                sources.append(source)

        # 5. Persist: messages, refreshed context, learned preferences.
        # Both rows share one timestamp; `seq` keeps user before assistant.
        turn_at = datetime.now(timezone.utc)
        db.add(
            ChatMessageRecord(
                id=str(uuid.uuid4()),
                conversation_id=conversation.id,
                role="user",
                content=message,
                seq=0,
                created_at=turn_at,
            )
        )
        db.add(
            ChatMessageRecord(
                id=str(uuid.uuid4()),
                conversation_id=conversation.id,
                role="assistant",
                content=reply,
                intent=intent,
                sources=sources,
                seq=1,
                created_at=turn_at,
            )
        )

        conversation.travel_context = travel_context
        conversation.trip_id = trip_id or conversation.trip_id

        await self._save_preferences(
            db, user_id, context_manager.extract_preferences(travel_context, message)
        )

        await db.commit()

        return VacayChatResponse(
            message=reply,
            conversation_id=conversation.id,
            intent=intent,
            sources=sources,
        )

    # ── History ──────────────────────────────────────────────────────

    async def get_history(
        self, db: AsyncSession, user_id: int, conversation_id: str
    ) -> list[ChatMessageRecord]:
        """Messages for a conversation, scoped to its owner."""
        result = await db.execute(
            select(ChatConversation).where(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == user_id,
            )
        )
        if result.scalars().first() is None:
            return []
        return await self._load_history(db, conversation_id)


chat_service = ChatService()
