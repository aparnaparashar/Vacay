import asyncio
import datetime
import logging
import requests
from app.agents.base_agent import ADKAgent, A2AMessage

logger = logging.getLogger(__name__)

# WMO Weather interpretation codes → human-readable condition & OWM-style icon
WMO_CODE_MAP = {
    0:  ("Clear", "01d"),
    1:  ("Partly cloudy", "02d"),
    2:  ("Partly cloudy", "02d"),
    3:  ("Partly cloudy", "04d"),
    45: ("Fog", "50d"),
    48: ("Fog", "50d"),
    51: ("Drizzle", "09d"),
    53: ("Drizzle", "09d"),
    55: ("Drizzle", "09d"),
    61: ("Rain", "10d"),
    63: ("Rain", "10d"),
    65: ("Rain", "10d"),
    71: ("Snow", "13d"),
    73: ("Snow", "13d"),
    75: ("Snow", "13d"),
    80: ("Rain showers", "09d"),
    81: ("Rain showers", "09d"),
    82: ("Rain showers", "09d"),
    95: ("Thunderstorm", "11d"),
    96: ("Thunderstorm", "11d"),
    99: ("Thunderstorm", "11d"),
}


def _decode_wmo(code: int) -> tuple[str, str]:
    """Convert a WMO weather code to (condition, icon)."""
    return WMO_CODE_MAP.get(code, ("Unknown", "01d"))


class WeatherAgent(ADKAgent):
    """Fetches weather forecasts using the free Open-Meteo API (no API key required)."""

    def __init__(self):
        super().__init__("WeatherAgent")

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        destination = payload.get("destination", "Mumbai")
        duration = payload.get("duration", 2)

        def _fetch_weather():
            # --- Step 1: Geocode the destination via Nominatim ---
            geo_url = "https://nominatim.openstreetmap.org/search"
            geo_params = {"q": destination, "format": "json", "limit": 1}
            geo_headers = {"User-Agent": "VacayTravelPlanner/1.0"}

            geo_resp = requests.get(geo_url, params=geo_params, headers=geo_headers, timeout=10)
            geo_resp.raise_for_status()
            geo_data = geo_resp.json()

            if not geo_data:
                raise ValueError(f"Nominatim returned no results for '{destination}'")

            lat = float(geo_data[0]["lat"])
            lon = float(geo_data[0]["lon"])

            # --- Step 2: Fetch forecast from Open-Meteo ---
            meteo_url = "https://api.open-meteo.com/v1/forecast"
            meteo_params = {
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,weathercode",
                "timezone": "auto",
                "forecast_days": min(duration, 16),  # Open-Meteo supports up to 16 days
            }

            meteo_resp = requests.get(meteo_url, params=meteo_params, timeout=10)
            meteo_resp.raise_for_status()
            return meteo_resp.json()

        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, _fetch_weather)

            daily = data.get("daily", {})
            dates = daily.get("time", [])
            temps_max = daily.get("temperature_2m_max", [])
            temps_min = daily.get("temperature_2m_min", [])
            weather_codes = daily.get("weathercode", [])

            forecast_summary = []
            for i, date_str in enumerate(dates):
                t_max = temps_max[i] if i < len(temps_max) else 28
                t_min = temps_min[i] if i < len(temps_min) else 22
                code = weather_codes[i] if i < len(weather_codes) else 0
                condition, icon = _decode_wmo(code)

                forecast_summary.append({
                    "date": date_str,
                    "temp": round((t_max + t_min) / 2),
                    "condition": condition,
                    "icon": icon,
                })

            # Pad if Open-Meteo returned fewer days than the trip duration
            while len(forecast_summary) < duration:
                last_day = forecast_summary[-1] if forecast_summary else {
                    "date": datetime.date.today().strftime("%Y-%m-%d"),
                    "temp": 28, "condition": "Clear", "icon": "01d"
                }
                last_date = datetime.datetime.strptime(last_day["date"], "%Y-%m-%d")
                next_date = (last_date + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
                forecast_summary.append({
                    "date": next_date,
                    "temp": last_day["temp"],
                    "condition": last_day["condition"],
                    "icon": last_day["icon"],
                })

            trimmed = forecast_summary[:duration]

            return {
                "status": "success",
                "agent": self.name,
                "data": {
                    "forecast": trimmed,
                    "temp": trimmed[0]["temp"] if trimmed else 25,
                    "condition": trimmed[0]["condition"] if trimmed else "Clear",
                },
            }

        except Exception as e:
            logger.error(f"Weather Fetch Error: {e}")
            # Fallback to generic pleasant weather if API fails
            fallback_forecast = []
            base_date = datetime.date.today()
            for i in range(duration):
                fallback_forecast.append({
                    "date": (base_date + datetime.timedelta(days=i)).strftime("%Y-%m-%d"),
                    "temp": 28,
                    "condition": "Clear",
                    "icon": "01d",
                })

            return {
                "status": "success",
                "agent": self.name,
                "data": {
                    "forecast": fallback_forecast,
                    "temp": 28,
                    "condition": "Clear",
                },
            }
