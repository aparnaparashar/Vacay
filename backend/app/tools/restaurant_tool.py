"""
Restaurant tool — spec Section 4.3.

Wraps the Overpass provider's food categories and ranks results through the
recommendation engine so cuisine, distance, rating and budget all matter — not
just rating (spec Section 17).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.providers.overpass_provider import overpass_provider
from app.services.recommendation_service import recommendation_service
from app.tools.geocode import resolve_point

logger = logging.getLogger(__name__)

# Map a natural meal/venue word onto an Overpass category.
_VENUE_TO_CATEGORY = {
    "restaurant": "restaurant",
    "dinner": "restaurant",
    "lunch": "restaurant",
    "food": "restaurant",
    "cafe": "cafe",
    "café": "cafe",
    "coffee": "cafe",
    "breakfast": "cafe",
    "brunch": "cafe",
    "bar": "bar",
    "pub": "bar",
    "drinks": "bar",
    "nightlife": "bar",
}

MAX_RADIUS_M = 10000
DEFAULT_RADIUS_M = 1500


async def search_restaurants(
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    cuisine: Optional[str] = None,
    venue_type: str = "restaurant",
    radius_meters: Optional[int] = None,
    max_price_level: Optional[int] = None,
    *,
    preferences: Optional[list[str]] = None,
    fallback: Optional[tuple[float, float]] = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Find places to eat or drink near a point."""
    category = _VENUE_TO_CATEGORY.get((venue_type or "restaurant").strip().lower(), "restaurant")

    point = await resolve_point(location, latitude, longitude, fallback)
    if not point:
        return {
            "ok": False,
            "error": "I need a location — either the user's coordinates or a place name.",
        }

    lat, lng, label = point

    if not isinstance(radius_meters, (int, float)) or radius_meters <= 0:
        radius = DEFAULT_RADIUS_M
    else:
        radius = int(max(200, min(MAX_RADIUS_M, radius_meters)))

    try:
        raw = await overpass_provider.explore_category(lat, lng, category, radius)
    except Exception as e:
        logger.error("Restaurant search failed near %s: %s", label, e)
        return {"ok": False, "error": "Restaurant search is temporarily unavailable."}

    if not raw:
        return {
            "ok": True,
            "location": label,
            "count": 0,
            "restaurants": [],
            "note": f"No {category} found within {radius} m.",
        }

    # Cuisine is a soft signal: bias the ranking rather than hard-filtering,
    # because OSM cuisine tags are sparse and a hard filter usually empties
    # the list entirely.
    ranking_preferences = list(preferences or [])
    if cuisine:
        ranking_preferences.append(cuisine)

    ranked = recommendation_service.rank(
        raw,
        preferences=ranking_preferences,
        origin=(lat, lng),
        max_price_level=max_price_level,
        query=cuisine or category,
        limit=limit,
    )

    return {
        "ok": True,
        "location": label,
        "category": category,
        "cuisine": cuisine,
        "radius_meters": radius,
        "count": len(ranked),
        "restaurants": ranked,
        "note": (
            "Cuisine tags in the underlying open data are incomplete, so treat "
            "cuisine as a preference rather than a guarantee."
            if cuisine
            else None
        ),
    }
