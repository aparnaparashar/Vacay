"""
Weather tool — spec Section 4.6.

Wraps the existing weather_service (Open-Meteo, no API key required) and adds
geocoding so the model can pass a place name instead of coordinates.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.services.weather_service import weather_service
from app.tools.geocode import resolve_point

logger = logging.getLogger(__name__)

MAX_DAYS = 7


async def get_weather(
    location: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    *,
    fallback: Optional[tuple[float, float]] = None,
) -> dict[str, Any]:
    """
    Return a multi-day forecast for a place.

    Shape is deliberately small and flat — it is fed straight back into the
    model, so verbosity costs tokens and adds nothing.
    """
    point = await resolve_point(location, latitude, longitude, fallback)
    if not point:
        return {
            "ok": False,
            "error": "Could not determine which location to check the weather for.",
        }

    lat, lng, label = point

    try:
        forecast = await weather_service.get_forecast(lat, lng)
    except Exception as e:
        logger.error("Weather lookup failed for %s: %s", label, e)
        return {"ok": False, "error": "Weather data is temporarily unavailable."}

    days = []
    for day in (forecast.get("days") or [])[:MAX_DAYS]:
        hourly = day.get("hourly") or []
        precip_values = [
            h.get("precip_prob")
            for h in hourly
            if isinstance(h.get("precip_prob"), (int, float))
        ]
        days.append(
            {
                "date": day.get("date"),
                "condition": day.get("condition"),
                "temp_max_c": day.get("temp_max"),
                "temp_min_c": day.get("temp_min"),
                "wind_kmh": day.get("wind_speed"),
                "max_precip_probability": max(precip_values) if precip_values else None,
                "sunrise": day.get("sunrise"),
                "sunset": day.get("sunset"),
            }
        )

    if not days:
        return {"ok": False, "error": f"No forecast available for {label}."}

    today = days[0]
    return {
        "ok": True,
        "location": label,
        "latitude": lat,
        "longitude": lng,
        "today": today,
        "days": days,
        # Convenience flag so the model doesn't have to reason about codes.
        "is_wet_today": str(today.get("condition", "")).lower()
        in {"rain", "drizzle", "thunderstorm", "snow", "rain showers"},
    }
