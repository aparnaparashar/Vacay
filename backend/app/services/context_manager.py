"""
Travel Context Manager — spec Section 8.

Maintains the structured travel context for a conversation:

    {
      "destination": "Kyoto",
      "country": "Japan",
      "trip_dates": {"start": "...", "end": "..."},
      "travellers": {"type": "family", "count": 4},
      "budget": {"currency": "USD", "daily_limit": null},
      "preferences": ["culture", "food"],
      "current_location": null,
      "weather_context": null,
      "visited_places": []
    }

Auto-populated from an active trip, then progressively refined as the user
reveals more in conversation.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from app.services.country_resolver import COUNTRY_NAME_TO_ISO, resolve_country_code

logger = logging.getLogger(__name__)

MAX_VISITED_PLACES = 40
MAX_PREFERENCES = 12

# ISO code -> a display country name, derived from the shared resolver so we
# don't maintain a second country table.
_ISO_TO_NAME: dict[str, str] = {}
for _name, _iso in COUNTRY_NAME_TO_ISO.items():
    # Prefer the longest key for an ISO code — it is the country name rather
    # than a city that maps onto it ("india" over "goa").
    if _iso not in _ISO_TO_NAME or len(_name) > len(_ISO_TO_NAME[_iso]):
        _ISO_TO_NAME[_iso] = _name

# Interest keywords we can safely infer from free text (spec Section 7).
_PREFERENCE_KEYWORDS = {
    "history": ("history", "historical", "heritage", "ruins", "ancient"),
    "culture": ("culture", "cultural", "temple", "shrine", "museum", "traditional"),
    "food": ("food", "foodie", "cuisine", "culinary", "street food", "restaurant"),
    "nature": ("nature", "hiking", "mountains", "forest", "outdoors", "scenic"),
    "beach": ("beach", "coast", "seaside", "island"),
    "nightlife": ("nightlife", "bars", "clubbing", "party"),
    "shopping": ("shopping", "markets", "boutique"),
    "adventure": ("adventure", "trekking", "diving", "surfing", "climbing"),
    "relaxation": ("relax", "relaxing", "spa", "slow travel", "chill"),
}

# Traveller-group phrasing -> (type, implied count or None).
_TRAVELLER_PATTERNS = (
    (r"\b(with my (?:parents|family|kids|children)|family trip)\b", "family", None),
    (r"\b(with my (?:wife|husband|partner|girlfriend|boyfriend)|honeymoon|couple)\b", "couple", 2),
    (r"\b(solo|alone|by myself|on my own)\b", "solo", 1),
    (r"\b(with (?:friends|my friends)|group trip)\b", "group", None),
)

_PACE_PATTERNS = (
    (r"\b(relaxed|slow|leisurely|easy pace)\b", "relaxed"),
    (r"\b(packed|fast[- ]paced|jam[- ]packed|see everything)\b", "fast-paced"),
    (r"\b(balanced)\b", "balanced"),
)


def empty_context() -> dict[str, Any]:
    """A fresh travel context with the spec's exact shape."""
    return {
        "destination": None,
        "country": None,
        "trip_dates": {"start": None, "end": None},
        "travellers": {"type": None, "count": None},
        "budget": {"currency": None, "daily_limit": None, "total": None},
        "preferences": [],
        "current_location": None,
        "weather_context": None,
        "visited_places": [],
    }


class ContextManager:
    """Builds and updates the per-conversation travel context."""

    # ── Normalization ────────────────────────────────────────────────

    @staticmethod
    def normalize(raw: Optional[dict]) -> dict[str, Any]:
        """Merge a stored context onto the canonical shape, dropping junk."""
        base = empty_context()
        if not isinstance(raw, dict):
            return base

        for key, value in raw.items():
            if key not in base:
                continue
            if isinstance(base[key], dict):
                if isinstance(value, dict):
                    base[key].update({k: v for k, v in value.items() if k in base[key]})
            elif isinstance(base[key], list):
                if isinstance(value, list):
                    base[key] = value
            else:
                base[key] = value
        return base

    # ── Population from an active trip ───────────────────────────────

    def apply_trip_context(self, context: dict, trip: Optional[Any]) -> dict:
        """Fill the context from the active trip the frontend sent."""
        if not trip:
            return context

        def get(field: str):
            if isinstance(trip, dict):
                return trip.get(field)
            return getattr(trip, field, None)

        destination = get("destination")
        if destination:
            context["destination"] = destination
            iso = resolve_country_code(destination)
            if iso:
                name = _ISO_TO_NAME.get(iso)
                context["country"] = name.title() if name else iso

        if get("departure_date"):
            context["trip_dates"]["start"] = get("departure_date")
        if get("arrival_date"):
            context["trip_dates"]["end"] = get("arrival_date")

        adults = get("adults")
        if isinstance(adults, int) and adults > 0:
            context["travellers"]["count"] = adults
            if not context["travellers"]["type"]:
                context["travellers"]["type"] = "solo" if adults == 1 else "group"

        budget = get("budget")
        if isinstance(budget, (int, float)) and budget > 0:
            context["budget"]["total"] = float(budget)

        # The orchestrator stores INR-denominated trip budgets.
        if context["budget"]["total"] is not None and not context["budget"]["currency"]:
            context["budget"]["currency"] = "INR"

        weather = get("weather")
        if weather:
            context["weather_context"] = self._summarize_weather(weather)

        return context

    @staticmethod
    def _summarize_weather(weather: Any) -> Optional[dict]:
        """Reduce a full forecast to the couple of fields that matter."""
        if not isinstance(weather, dict):
            return None
        forecast = weather.get("forecast")
        if isinstance(forecast, list) and forecast:
            first = forecast[0]
            if isinstance(first, dict):
                return {
                    "condition": first.get("condition"),
                    "temp": first.get("temp"),
                    "date": first.get("date"),
                }
        if weather.get("condition"):
            return {"condition": weather.get("condition"), "temp": weather.get("temp")}
        return None

    # ── Population from live location ────────────────────────────────

    @staticmethod
    def apply_location(context: dict, location: Optional[Any]) -> dict:
        if not location:
            return context
        if isinstance(location, dict):
            lat, lng = location.get("latitude"), location.get("longitude")
        else:
            lat, lng = getattr(location, "latitude", None), getattr(location, "longitude", None)
        if lat is not None and lng is not None:
            context["current_location"] = {"latitude": float(lat), "longitude": float(lng)}
        return context

    # ── Progressive learning from the conversation ───────────────────

    def extract_from_message(self, context: dict, message: str) -> dict:
        """
        Pull durable facts out of what the user just said.

        Deliberately conservative: only high-confidence keyword matches are
        stored, because a wrong inference silently poisons every later answer.
        """
        if not message:
            return context

        text = message.lower()

        # Travel companions
        if not context["travellers"]["type"]:
            for pattern, group_type, count in _TRAVELLER_PATTERNS:
                if re.search(pattern, text):
                    context["travellers"]["type"] = group_type
                    if count and not context["travellers"]["count"]:
                        context["travellers"]["count"] = count
                    break

        # Explicit head count, e.g. "there are 4 of us"
        if not context["travellers"]["count"]:
            m = re.search(r"\b(\d{1,2})\s+of us\b", text)
            if m:
                try:
                    n = int(m.group(1))
                    if 1 <= n <= 20:
                        context["travellers"]["count"] = n
                except ValueError:
                    pass

        # Interests
        prefs = set(context.get("preferences") or [])
        for label, keywords in _PREFERENCE_KEYWORDS.items():
            if any(k in text for k in keywords):
                prefs.add(label)
        context["preferences"] = sorted(prefs)[:MAX_PREFERENCES]

        # Daily budget, e.g. "I only have $40 today"
        money = re.search(
            r"(?:[$€£₹]\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(usd|eur|gbp|inr|dollars|euros|rupees))",
            text,
        )
        if money:
            amount_raw = money.group(1) or money.group(2)
            try:
                amount = float(amount_raw.replace(",", ""))
            except (TypeError, ValueError):
                amount = None
            if amount and amount > 0:
                if re.search(r"\b(today|per day|a day|daily)\b", text):
                    context["budget"]["daily_limit"] = amount
                elif context["budget"]["total"] is None:
                    context["budget"]["total"] = amount
                symbol = money.group(0)[:1]
                currency = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR"}.get(symbol)
                if not currency and money.group(3):
                    currency = {
                        "dollars": "USD", "euros": "EUR", "rupees": "INR",
                        "usd": "USD", "eur": "EUR", "gbp": "GBP", "inr": "INR",
                    }.get(money.group(3))
                if currency:
                    context["budget"]["currency"] = currency

        # Places already seen — avoid recommending them again (session memory)
        visited = re.search(r"\b(?:already (?:visited|seen|been to)|i've (?:visited|seen)) ([^.,!?]{3,60})", text)
        if visited:
            place = visited.group(1).strip()
            places = list(context.get("visited_places") or [])
            if place and place not in places:
                places.append(place)
                context["visited_places"] = places[-MAX_VISITED_PLACES:]

        return context

    @staticmethod
    def extract_preferences(context: dict, message: str) -> dict[str, Any]:
        """
        Derive long-term UserPreference fields from the same message.
        Returns only the fields we are confident about.
        """
        updates: dict[str, Any] = {}
        text = (message or "").lower()

        for pattern, pace in _PACE_PATTERNS:
            if re.search(pattern, text):
                updates["travel_pace"] = pace
                break

        for style, keywords in (
            ("budget", ("budget", "cheap", "backpack", "hostel")),
            ("luxury", ("luxury", "5 star", "five star", "premium")),
            ("backpacker", ("backpacking", "backpacker")),
        ):
            if any(k in text for k in keywords):
                updates["travel_style"] = style
                break

        diet = [
            d
            for d, keys in (
                ("vegetarian", ("vegetarian", "veg only")),
                ("vegan", ("vegan",)),
                ("halal", ("halal",)),
                ("gluten-free", ("gluten free", "gluten-free", "celiac")),
            )
            if any(k in text for k in keys)
        ]
        if diet:
            updates["food_preferences"] = diet

        if context.get("preferences"):
            updates["activity_preferences"] = context["preferences"]

        return updates

    # ── Rendering for the prompt ─────────────────────────────────────

    @staticmethod
    def describe(context: dict) -> str:
        """Compact human-readable rendering for the system prompt."""
        lines = []
        if context.get("destination"):
            place = context["destination"]
            if context.get("country"):
                place += f", {context['country']}"
            lines.append(f"- Destination: {place}")

        dates = context.get("trip_dates") or {}
        if dates.get("start") or dates.get("end"):
            lines.append(f"- Trip dates: {dates.get('start') or '?'} to {dates.get('end') or '?'}")

        travellers = context.get("travellers") or {}
        if travellers.get("type") or travellers.get("count"):
            bits = [b for b in (travellers.get("type"), travellers.get("count")) if b]
            lines.append("- Travelling as: " + " / ".join(str(b) for b in bits))

        budget = context.get("budget") or {}
        if budget.get("daily_limit"):
            lines.append(
                f"- Budget today: {budget.get('currency') or ''} {budget['daily_limit']}".strip()
            )
        elif budget.get("total"):
            lines.append(
                f"- Trip budget: {budget.get('currency') or ''} {budget['total']}".strip()
            )

        if context.get("preferences"):
            lines.append("- Interests: " + ", ".join(context["preferences"]))

        if context.get("current_location"):
            loc = context["current_location"]
            lines.append(
                f"- Current location: {loc.get('latitude')}, {loc.get('longitude')}"
            )

        weather = context.get("weather_context")
        if isinstance(weather, dict) and weather.get("condition"):
            temp = weather.get("temp")
            lines.append(
                f"- Known weather: {weather['condition']}" + (f", {temp}°C" if temp else "")
            )

        if context.get("visited_places"):
            lines.append("- Already visited: " + ", ".join(context["visited_places"][-8:]))

        return "\n".join(lines) if lines else "- Nothing known about this traveller yet."


context_manager = ContextManager()
