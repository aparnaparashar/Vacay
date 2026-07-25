import uuid
import logging

import requests

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.olamaps.io"


class OlaMapsProvider:
    """Provider for Ola Maps APIs (geocoding, places, routing)."""

    def __init__(self):
        self.api_key = settings.ola_maps_api_key

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict:
        """Return common request headers."""
        return {"X-Request-Id": str(uuid.uuid4())}

    def _check_key(self) -> bool:
        """Return True if the API key is configured, else log a warning."""
        if not self.api_key:
            logger.warning("OLA_MAPS_API_KEY is not set. Skipping request.")
            return False
        return True

    # ------------------------------------------------------------------
    # 1. Forward geocoding
    # ------------------------------------------------------------------

    def geocode(self, address: str) -> dict | None:
        """Forward-geocode an address string.

        Returns ``{lat, lng, formatted_address}`` on success, else ``None``.
        """
        if not self._check_key():
            return None

        try:
            resp = requests.get(
                f"{BASE_URL}/places/v1/geocode",
                params={"address": address, "api_key": self.api_key},
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            results = data.get("geocodingResults", [])
            if not results:
                return None

            first = results[0]
            geometry = first.get("geometry", {}).get("location", {})
            return {
                "lat": geometry.get("lat"),
                "lng": geometry.get("lng"),
                "formatted_address": first.get("formatted_address", ""),
            }
        except Exception as exc:
            logger.error("OlaMaps geocode error: %s", exc)
            return None

    # ------------------------------------------------------------------
    # 2. Reverse geocoding
    # ------------------------------------------------------------------

    def reverse_geocode(self, lat: float, lng: float) -> str | None:
        """Reverse-geocode coordinates to a formatted address string."""
        if not self._check_key():
            return None

        try:
            resp = requests.get(
                f"{BASE_URL}/places/v1/reverse-geocode",
                params={"latlng": f"{lat},{lng}", "api_key": self.api_key},
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            results = data.get("results", [])
            if not results:
                return None

            return results[0].get("formatted_address", "")
        except Exception as exc:
            logger.error("OlaMaps reverse_geocode error: %s", exc)
            return None

    # ------------------------------------------------------------------
    # 3. Autocomplete
    # ------------------------------------------------------------------

    def autocomplete(
        self, input_text: str, lat: float = None, lng: float = None
    ) -> list:
        """Return place-autocomplete suggestions.

        If *lat* and *lng* are provided the results are location-aware.
        """
        if not self._check_key():
            return []

        try:
            params: dict = {"input": input_text, "api_key": self.api_key}
            if lat is not None and lng is not None:
                params["location"] = f"{lat},{lng}"

            resp = requests.get(
                f"{BASE_URL}/places/v1/autocomplete",
                params=params,
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            return data.get("predictions", [])
        except Exception as exc:
            logger.error("OlaMaps autocomplete error: %s", exc)
            return []

    # ------------------------------------------------------------------
    # 4. Nearby search
    # ------------------------------------------------------------------

    def nearby_search(
        self, lat: float, lng: float, type: str, radius: int = 1000
    ) -> list:
        """Search for nearby points of interest by *type* within *radius* metres."""
        if not self._check_key():
            return []

        try:
            resp = requests.get(
                f"{BASE_URL}/places/v1/nearbysearch",
                params={
                    "location": f"{lat},{lng}",
                    "types": type,
                    "radius": radius,
                    "api_key": self.api_key,
                },
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            predictions = data.get("predictions", [])
            
            # Map predictions to a standard format with name
            results = []
            for p in predictions:
                name = p.get("structured_formatting", {}).get("main_text", "")
                if not name:
                    name = p.get("description", "")
                results.append({
                    "name": name,
                    "place_id": p.get("place_id"),
                    "types": p.get("types", [])
                })

            return results
        except Exception as exc:
            logger.error("OlaMaps nearby_search error: %s", exc)
            return []

    # ------------------------------------------------------------------
    # 5. Place details
    # ------------------------------------------------------------------

    def place_details(self, place_id: str) -> dict | None:
        """Fetch detailed information for a place.

        Returns ``{name, address, rating, photos, opening_hours}`` on success.
        """
        if not self._check_key():
            return None

        try:
            resp = requests.get(
                f"{BASE_URL}/places/v1/details",
                params={"place_id": place_id, "api_key": self.api_key},
                headers=self._headers(),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()

            result = data.get("result", {})
            if not result:
                return None

            return {
                "name": result.get("name", ""),
                "address": result.get("formatted_address", ""),
                "rating": result.get("rating"),
                "photos": result.get("photos", []),
                "opening_hours": result.get("opening_hours", {}),
                "location": {
                    "lat": result.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": result.get("geometry", {}).get("location", {}).get("lng"),
                }
            }
        except Exception as exc:
            logger.error("OlaMaps place_details error: %s", exc)
            return None

    # ------------------------------------------------------------------
    # 6. Directions / routing
    # ------------------------------------------------------------------

    def directions(
        self,
        origin_lat: float,
        origin_lng: float,
        dest_lat: float,
        dest_lng: float,
        mode: str = "driving",
    ) -> dict | None:
        """Get routing directions between two points.

        *mode* can be ``'driving'``, ``'walking'``, ``'bike'``, or ``'auto'``.

        Returns ``{distance_km, duration_min, steps, mode}`` on success.
        """
        if not self._check_key():
            return None

        try:
            resp = requests.post(
                f"{BASE_URL}/routing/v1/directions",
                params={
                    "origin": f"{origin_lat},{origin_lng}",
                    "destination": f"{dest_lat},{dest_lng}",
                    "mode": mode,
                    "steps": "true",
                    "alternatives": "false",
                    "api_key": self.api_key,
                },
                headers=self._headers(),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            routes = data.get("routes", [])
            if not routes:
                return None

            leg = routes[0].get("legs", [{}])[0]
            distance_m = leg.get("distance", 0)
            duration_s = leg.get("duration", 0)

            steps_raw = leg.get("steps", [])
            steps = [
                {
                    "instruction": s.get("html_instructions", ""),
                    "distance": s.get("distance", 0),
                    "duration": s.get("duration", 0),
                }
                for s in steps_raw
            ]

            return {
                "distance_km": round(distance_m / 1000, 2),
                "duration_min": round(duration_s / 60, 2),
                "steps": steps,
                "mode": mode,
            }
        except Exception as exc:
            logger.error("OlaMaps directions error: %s", exc)
            return None
