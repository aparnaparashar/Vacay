"""
Open-Meteo Service — weather forecasts and outdoor suitability.

Uses the free Open-Meteo API. No API key required.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime

import httpx

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO Weather interpretation codes (WW)
# https://open-meteo.com/en/docs
def map_wmo_code(code: int) -> str:
    if code == 0:
        return "Clear"
    elif code in [1, 2, 3]:
        return "Clouds"
    elif code in [45, 48]:
        return "Fog"
    elif code in [51, 53, 55, 56, 57]:
        return "Drizzle"
    elif code in [61, 63, 65, 66, 67, 80, 81, 82]:
        return "Rain"
    elif code in [71, 73, 75, 77, 85, 86]:
        return "Snow"
    elif code in [95, 96, 99]:
        return "Thunderstorm"
    else:
        return "Clouds" # Fallback

class WeatherService:
    """Async wrapper for Open-Meteo forecast API."""

    def __init__(self) -> None:
        pass

    async def get_forecast(self, lat: float, lon: float) -> dict:
        """
        Fetch forecast from Open-Meteo.
        """
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,precipitation_probability,weather_code",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,wind_speed_10m_max",
            "timezone": "auto",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(FORECAST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        daily = data.get("daily", {})
        hourly = data.get("hourly", {})
        
        days = []
        if "time" in daily:
            for i, day_time in enumerate(daily["time"]):
                # Extract daily info
                day_code = daily["weather_code"][i]
                condition = map_wmo_code(day_code)
                
                # Extract hourly info for this day
                day_hours = []
                if "time" in hourly:
                    for j, h_time in enumerate(hourly["time"]):
                        if h_time.startswith(day_time):
                            hour_code = hourly["weather_code"][j]
                            day_hours.append({
                                "time": h_time.split("T")[1], # e.g. "00:00"
                                "temp": round(hourly["temperature_2m"][j]),
                                "condition": map_wmo_code(hour_code),
                                "precip_prob": hourly["precipitation_probability"][j]
                            })

                sunrise = daily["sunrise"][i].split("T")[1] if daily.get("sunrise") and daily["sunrise"][i] else ""
                sunset = daily["sunset"][i].split("T")[1] if daily.get("sunset") and daily["sunset"][i] else ""
                
                days.append({
                    "date": day_time,
                    "condition": condition,
                    "temp_max": round(daily["temperature_2m_max"][i]),
                    "temp_min": round(daily["temperature_2m_min"][i]),
                    "wind_speed": round(daily["wind_speed_10m_max"][i]),
                    "sunrise": sunrise,
                    "sunset": sunset,
                    "hourly": day_hours
                })

        return {
            "latitude": lat,
            "longitude": lon,
            "city": "Unknown", # Open-Meteo doesn't reverse geocode by default
            "days": days,
        }

    async def get_weather_for_date(
        self,
        lat: float,
        lon: float,
        target_date: date,
    ) -> dict | None:
        """
        Get weather for a specific date.
        """
        forecast = await self.get_forecast(lat, lon)
        target_str = target_date.isoformat()

        for day in forecast.get("days", []):
            if day["date"] == target_str:
                return day
        return None

    def classify_weather(self, weather_day: dict) -> dict:
        """Keep compatibility with WeatherAgent for AI processing"""
        condition = weather_day.get("condition", "Clear")
        
        outdoor_friendly = True
        reason = "Good weather for outdoor activities."
        
        if condition in ["Rain", "Thunderstorm", "Snow"]:
            outdoor_friendly = False
            reason = f"Poor weather conditions ({condition}). Indoor activities recommended."
            
        return {
            "condition": condition,
            "temp": weather_day.get("temp_max"),
            "outdoor_friendly": outdoor_friendly,
            "reason": reason
        }

weather_service = WeatherService()
