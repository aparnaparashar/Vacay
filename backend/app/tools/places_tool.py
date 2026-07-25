"""
Places tools — spec Sections 4.2 (destination recommendations) and
4.4 (nearby attractions & hidden gems).

`search_places`          -> Google Places text search, falling back to Nominatim.
`get_nearby_attractions` -> Overpass POI search by category, ranked.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import settings
from app.providers.overpass_provider import overpass_provider
from app.services.places_service import places_service
from app.services.recommendation_service import recommendation_service
from app.tools.geocode import geocode, resolve_point

logger = logging.getLogger(__name__)

# Categories Overpass understands (see overpass_provider.CATEGORY_TAGS).
VALID_CATEGORIES = tuple(overpass_provider.CATEGORY_TAGS.keys())

MAX_RADIUS_M = 20000
DEFAULT_RADIUS_M = 3000


def _clamp_radius(radius: Optional[int]) -> int:
    if not isinstance(radius, (int, float)) or radius <= 0:
        return DEFAULT_RADIUS_M
    return int(max(200, min(MAX_RADIUS_M, radius)))


async def search_places(
    query: str,
    location: Optional[str] = None,
    *,
    preferences: Optional[list[str]] = None,
    fallback: Optional[tuple[float, float]] = None,
    weather_condition: Optional[str] = None,
    limit: int = 6,
) -> dict[str, Any]:
    """Free-text place search, e.g. "heritage temples in Kyoto"."""
    if not query or not query.strip():
        return {"ok": False, "error": "A search query is required."}

    search_text = query if not location else f"{query} in {location}"
    origin = None
    point = await resolve_point(location, None, None, fallback)
    if point:
        origin = (point[0], point[1])

    results: list[dict] = []

    if settings.google_maps_api_key:
        try:
            raw = await places_service.search_places(search_text, max_results=12)
            for p in raw:
                results.append(
                    {
                        "name": p.get("name"),
                        "address": p.get("formatted_address"),
                        "latitude": p.get("latitude"),
                        "longitude": p.get("longitude"),
                        "rating": p.get("rating"),
                        "user_ratings": p.get("user_rating_count"),
                        "type": ", ".join((p.get("types") or [])[:3]),
                        "source": "google_places",
                    }
                )
        except Exception as e:
            logger.warning("Google Places search failed for %r: %s", search_text, e)

    if not results:
        # Free fallback so the tool still answers without a Maps key/quota.
        hit = await geocode(search_text)
        if hit:
            results.append(
                {
                    "name": hit["name"],
                    "address": hit["display_name"],
                    "latitude": hit["latitude"],
                    "longitude": hit["longitude"],
                    "rating": None,
                    "type": "place",
                    "source": "openstreetmap",
                }
            )

    if not results:
        return {"ok": False, "error": f"No places found for '{query}'."}

    ranked = recommendation_service.rank(
        results,
        preferences=preferences,
        origin=origin,
        query=query,
        weather_condition=weather_condition,
        limit=limit,
    )
    return {"ok": True, "query": search_text, "count": len(ranked), "places": ranked}


async def get_nearby_attractions(
    category: str = "sights",
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius_meters: Optional[int] = None,
    *,
    preferences: Optional[list[str]] = None,
    fallback: Optional[tuple[float, float]] = None,
    weather_condition: Optional[str] = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Find points of interest near a point, by category."""
    category = (category or "sights").strip().lower()
    if category not in VALID_CATEGORIES:
        return {
            "ok": False,
            "error": f"Unknown category '{category}'.",
            "valid_categories": list(VALID_CATEGORIES),
        }

    point = await resolve_point(location, latitude, longitude, fallback)
    if not point:
        return {
            "ok": False,
            "error": "I need a location — either the user's coordinates or a place name.",
        }

    lat, lng, label = point
    radius = _clamp_radius(radius_meters)

    try:
        raw = await overpass_provider.explore_category(lat, lng, category, radius)
    except Exception as e:
        logger.error("Overpass lookup failed near %s: %s", label, e)
        return {"ok": False, "error": "Nearby place search is temporarily unavailable."}

    if not raw:
        return {
            "ok": True,
            "location": label,
            "category": category,
            "count": 0,
            "places": [],
            "note": f"No {category} found within {radius} m.",
        }

    ranked = recommendation_service.rank(
        raw,
        preferences=preferences,
        origin=(lat, lng),
        query=category,
        weather_condition=weather_condition,
        limit=limit,
    )
    return {
        "ok": True,
        "location": label,
        "category": category,
        "radius_meters": radius,
        "count": len(ranked),
        "places": ranked,
    }
