"""
Route tool — spec Section 4.7 ("How do I get to the airport?").

Uses the existing Google Distance Matrix wrapper when a Maps key is present,
and falls back to the free OSRM router (via geocoding) otherwise, so the tool
still answers without a key or when quota is exhausted.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import settings
from app.services.distance_service import distance_service
from app.tools.geocode import geocode

logger = logging.getLogger(__name__)

VALID_MODES = ("driving", "walking", "bicycling", "transit")

# FOSSGIS runs one OSRM instance per profile. The *host* segment and the *path*
# segment are NOT the same word — e.g. routed-car serves /route/v1/driving.
# (Same mapping the frontend routeCalculator.ts uses.)
_OSRM_PROFILE = {
    "driving": ("car", "driving"),
    "walking": ("foot", "foot"),
    "bicycling": ("bike", "bike"),
    "transit": ("car", "driving"),  # OSRM has no transit; driving is the closest proxy.
}
_OSRM_URL = "https://routing.openstreetmap.de/routed-{instance}/route/v1/{profile}/{coords}"


def _humanize(seconds: float, meters: float) -> tuple[str, str]:
    minutes = int(round(seconds / 60))
    if minutes >= 60:
        hours, rem = divmod(minutes, 60)
        duration = f"{hours} h {rem} min" if rem else f"{hours} h"
    else:
        duration = f"{max(1, minutes)} min"
    km = meters / 1000.0
    distance = f"{km:.1f} km" if km >= 1 else f"{int(meters)} m"
    return distance, duration


async def _osrm_route(
    origin: tuple[float, float], destination: tuple[float, float], mode: str
) -> Optional[dict]:
    instance, profile = _OSRM_PROFILE.get(mode, ("car", "driving"))
    # OSRM expects lng,lat order.
    coords = f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
    url = _OSRM_URL.format(instance=instance, profile=profile, coords=coords)
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, params={"overview": "false"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("OSRM routing failed: %s", e)
        return None

    routes = data.get("routes") or []
    if not routes:
        return None
    route = routes[0]
    distance_text, duration_text = _humanize(route.get("duration", 0), route.get("distance", 0))
    return {
        "distance_text": distance_text,
        "duration_text": duration_text,
        "distance_meters": int(route.get("distance", 0)),
        "duration_seconds": int(route.get("duration", 0)),
        "source": "osrm",
    }


async def get_route(
    origin: str,
    destination: str,
    mode: str = "driving",
) -> dict[str, Any]:
    """Travel time and distance between two places."""
    if not origin or not destination:
        return {"ok": False, "error": "Both an origin and a destination are required."}

    mode = (mode or "driving").strip().lower()
    if mode not in VALID_MODES:
        mode = "driving"

    # 1. Google Distance Matrix — handles named places and transit directly.
    if settings.google_maps_api_key:
        try:
            result = await distance_service.get_travel_time(origin, destination, mode)
            if result.get("status") == "OK":
                return {
                    "ok": True,
                    "origin": origin,
                    "destination": destination,
                    "mode": mode,
                    "distance_text": result.get("distance_text"),
                    "duration_text": result.get("duration_text"),
                    "distance_meters": result.get("distance_meters"),
                    "duration_seconds": result.get("duration_seconds"),
                    "source": "google_distance_matrix",
                }
            logger.info(
                "Distance Matrix returned %s for %s -> %s",
                result.get("status"), origin, destination,
            )
        except Exception as e:
            logger.warning("Distance Matrix failed: %s", e)

    # 2. Free fallback: geocode both ends, then route with OSRM.
    start = await geocode(origin)
    end = await geocode(destination)
    if not start or not end:
        return {
            "ok": False,
            "error": f"Could not locate {'origin' if not start else 'destination'}.",
        }

    routed = await _osrm_route(
        (start["latitude"], start["longitude"]),
        (end["latitude"], end["longitude"]),
        mode,
    )
    if not routed:
        return {"ok": False, "error": "No route could be calculated between those points."}

    return {
        "ok": True,
        "origin": start["name"],
        "destination": end["name"],
        "mode": mode,
        **routed,
        "note": (
            "Public-transport routing is unavailable; this is a road-based estimate."
            if mode == "transit"
            else None
        ),
    }
