"""
Shared geocoding helper for the chatbot tool layer.

Tools receive place *names* from the model ("Kyoto", "Shibuya station") but the
underlying services need coordinates. Nominatim is free and needs no key; a
small in-process cache keeps us inside its 1 req/sec usage policy.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Wandr-AI-Travel-Planner/1.0 (vacay chatbot)"

_CACHE_TTL_SECONDS = 24 * 3600
_cache: dict[str, tuple[float, Optional[dict]]] = {}
_lock = asyncio.Lock()
_last_call_at = 0.0
_MIN_INTERVAL = 1.1  # Nominatim allows ~1 request/second.


async def geocode(place: str) -> Optional[dict]:
    """
    Resolve a free-text place name to {name, latitude, longitude}.
    Returns None when the place cannot be resolved.
    """
    if not place or not place.strip():
        return None

    key = place.strip().lower()
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    global _last_call_at
    async with _lock:
        # Respect the public API's rate limit without blocking the event loop.
        wait = _MIN_INTERVAL - (time.time() - _last_call_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call_at = time.time()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    NOMINATIM_URL,
                    params={"q": place, "format": "json", "limit": 1},
                    headers={"User-Agent": USER_AGENT},
                )
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning("Geocoding failed for %r: %s", place, e)
            return None

    if not data:
        _cache[key] = (time.time(), None)
        return None

    top = data[0]
    try:
        result = {
            "name": top.get("display_name", place).split(",")[0],
            "display_name": top.get("display_name", place),
            "latitude": float(top["lat"]),
            "longitude": float(top["lon"]),
        }
    except (KeyError, TypeError, ValueError):
        _cache[key] = (time.time(), None)
        return None

    _cache[key] = (time.time(), result)
    return result


async def resolve_point(
    location: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    fallback: Optional[tuple[float, float]] = None,
) -> Optional[tuple[float, float, str]]:
    """
    Work out the coordinates a tool should operate on.

    Priority: explicit lat/lng > geocoded `location` name > caller fallback
    (usually the user's live position or their trip destination).
    Returns (latitude, longitude, label) or None.
    """
    if latitude is not None and longitude is not None:
        return float(latitude), float(longitude), location or "your location"

    if location:
        hit = await geocode(location)
        if hit:
            return hit["latitude"], hit["longitude"], hit["name"]

    if fallback:
        return fallback[0], fallback[1], location or "your location"

    return None
