"""
Recommendation Ranking Service — spec Section 17.

Recommendations are not sorted by rating alone. Each candidate is scored on:

    preference match + distance + rating + opening status
    + budget fit + context relevance + weather suitability

so a slightly lower-rated place that is close, open, on-budget and matches the
traveller's stated interests can outrank a famous one across town.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Relative weights of each signal. They sum to 1.0 so the final score is 0-1.
WEIGHTS = {
    "preference": 0.24,
    "distance": 0.22,
    "rating": 0.18,
    "open_now": 0.12,
    "budget": 0.10,
    "context": 0.08,
    "weather": 0.06,
}

# Beyond this many km a candidate scores ~0 on proximity.
DISTANCE_FALLOFF_KM = 8.0

EARTH_RADIUS_KM = 6371.0

# Categories that are unpleasant or unusable in bad weather.
_OUTDOOR_HINTS = {
    "park", "garden", "beach", "viewpoint", "peak", "hiking", "nature",
    "zoo", "theme_park", "attraction", "monument", "ruins", "castle",
}
_INDOOR_HINTS = {
    "museum", "gallery", "restaurant", "cafe", "bar", "pub", "mall",
    "theatre", "aquarium", "shopping", "hotel", "spa",
}
_BAD_WEATHER = {"rain", "drizzle", "thunderstorm", "snow", "rain showers"}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


class RecommendationService:
    """Scores and ranks place-like candidates for the chatbot's tools."""

    # ── Individual signals (each returns 0.0-1.0) ────────────────────

    @staticmethod
    def _preference_score(item: dict, preferences: list[str]) -> float:
        """How well the candidate matches the traveller's stated interests."""
        if not preferences:
            return 0.5  # neutral — we have nothing to go on
        haystack = " ".join(
            str(item.get(k, "")) for k in ("name", "type", "category", "cuisine", "address")
        ).lower()
        tags = item.get("tags")
        if isinstance(tags, (list, tuple)):
            haystack += " " + " ".join(str(t).lower() for t in tags)
        hits = sum(1 for p in preferences if p and str(p).lower() in haystack)
        if not hits:
            return 0.35
        return min(1.0, 0.6 + 0.2 * hits)

    @staticmethod
    def _distance_score(distance_km: Optional[float]) -> float:
        """Closer is better, decaying to ~0 at DISTANCE_FALLOFF_KM."""
        if distance_km is None:
            return 0.5
        if distance_km <= 0.2:
            return 1.0
        return max(0.0, 1.0 - (distance_km / DISTANCE_FALLOFF_KM))

    @staticmethod
    def _rating_score(rating: Any) -> float:
        """Normalize a 0-5 rating. Unrated places get a neutral score."""
        try:
            value = float(rating)
        except (TypeError, ValueError):
            return 0.5
        if value <= 0:
            return 0.5
        return max(0.0, min(1.0, value / 5.0))

    @staticmethod
    def _open_score(item: dict) -> float:
        """Prefer places that are open right now when we know."""
        open_now = item.get("open_now")
        if open_now is None:
            return 0.5  # unknown — don't punish
        return 1.0 if open_now else 0.0

    @staticmethod
    def _budget_score(item: dict, max_price_level: Optional[int]) -> float:
        """Penalize places above the traveller's price ceiling."""
        if max_price_level is None:
            return 0.5
        level = item.get("price_level")
        if level is None:
            return 0.5
        try:
            level = int(level)
        except (TypeError, ValueError):
            return 0.5
        if level <= max_price_level:
            return 1.0
        # One level over is a stretch; two or more is out of range.
        return max(0.0, 1.0 - 0.5 * (level - max_price_level))

    @staticmethod
    def _context_score(item: dict, query: Optional[str]) -> float:
        """Direct textual relevance to what the user actually asked for."""
        if not query:
            return 0.5
        name = str(item.get("name", "")).lower()
        blob = f"{name} {str(item.get('type','')).lower()} {str(item.get('cuisine','')).lower()}"
        terms = [t for t in query.lower().split() if len(t) > 3]
        if not terms:
            return 0.5
        hits = sum(1 for t in terms if t in blob)
        return min(1.0, 0.4 + 0.3 * hits)

    @staticmethod
    def _weather_score(item: dict, condition: Optional[str]) -> float:
        """In bad weather, favour indoor options over outdoor ones."""
        if not condition:
            return 0.5
        bad = str(condition).strip().lower() in _BAD_WEATHER
        if not bad:
            return 0.5
        blob = f"{item.get('type','')} {item.get('category','')} {item.get('name','')}".lower()
        if any(h in blob for h in _INDOOR_HINTS):
            return 1.0
        if any(h in blob for h in _OUTDOOR_HINTS):
            return 0.0
        return 0.5

    # ── Public API ───────────────────────────────────────────────────

    def score_item(
        self,
        item: dict,
        *,
        preferences: Optional[list[str]] = None,
        origin: Optional[tuple[float, float]] = None,
        max_price_level: Optional[int] = None,
        query: Optional[str] = None,
        weather_condition: Optional[str] = None,
    ) -> dict:
        """Return a copy of *item* with `distance_km`, `score`, and `why`."""
        enriched = dict(item)

        distance_km = enriched.get("distance_km")
        if distance_km is None and origin:
            lat, lng = enriched.get("lat"), enriched.get("lng")
            if lat is None:
                lat, lng = enriched.get("latitude"), enriched.get("longitude")
            if lat is not None and lng is not None:
                try:
                    distance_km = haversine_km(origin[0], origin[1], float(lat), float(lng))
                except (TypeError, ValueError):
                    distance_km = None
        if distance_km is not None:
            enriched["distance_km"] = round(distance_km, 2)

        signals = {
            "preference": self._preference_score(enriched, preferences or []),
            "distance": self._distance_score(distance_km),
            "rating": self._rating_score(enriched.get("rating")),
            "open_now": self._open_score(enriched),
            "budget": self._budget_score(enriched, max_price_level),
            "context": self._context_score(enriched, query),
            "weather": self._weather_score(enriched, weather_condition),
        }

        total = sum(WEIGHTS[k] * v for k, v in signals.items())
        enriched["score"] = round(total, 4)

        # A short, human-readable justification the model can quote back.
        reasons = []
        if distance_km is not None and distance_km <= 1.5:
            reasons.append("very close by")
        if signals["rating"] >= 0.8:
            reasons.append("highly rated")
        if enriched.get("open_now") is True:
            reasons.append("open now")
        if signals["preference"] >= 0.8:
            reasons.append("matches your interests")
        if signals["weather"] >= 1.0:
            reasons.append("good for the current weather")
        enriched["why"] = ", ".join(reasons) if reasons else None

        return enriched

    def rank(
        self,
        items: list[dict],
        *,
        preferences: Optional[list[str]] = None,
        origin: Optional[tuple[float, float]] = None,
        max_price_level: Optional[int] = None,
        query: Optional[str] = None,
        weather_condition: Optional[str] = None,
        limit: int = 8,
    ) -> list[dict]:
        """Score every candidate and return the best `limit`, highest first."""
        if not items:
            return []

        scored = [
            self.score_item(
                item,
                preferences=preferences,
                origin=origin,
                max_price_level=max_price_level,
                query=query,
                weather_condition=weather_condition,
            )
            for item in items
            if isinstance(item, dict)
        ]
        scored.sort(key=lambda i: i.get("score", 0.0), reverse=True)
        return scored[: max(1, limit)]


recommendation_service = RecommendationService()
