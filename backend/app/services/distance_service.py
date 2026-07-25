"""
Google Distance Matrix Service — travel times between points of interest.

Uses the Distance Matrix API for driving/walking/transit durations.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"


class DistanceService:
    """Async wrapper for Google Distance Matrix API."""

    def __init__(self) -> None:
        self.api_key = settings.google_maps_api_key

    async def get_travel_time(
        self,
        origin: str,
        destination: str,
        mode: str = "driving",
    ) -> dict:
        """
        Get travel time and distance between two points.

        Args:
            origin: Place name, address, or "lat,lng"
            destination: Place name, address, or "lat,lng"
            mode: "driving", "walking", "bicycling", or "transit"

        Returns:
            {
                "origin": str,
                "destination": str,
                "distance_text": str,    # e.g. "11.2 km"
                "distance_meters": int,
                "duration_text": str,     # e.g. "25 mins"
                "duration_seconds": int,
                "mode": str,
                "status": str,           # "OK" or error
            }
        """
        params = {
            "origins": origin,
            "destinations": destination,
            "mode": mode,
            "key": self.api_key,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(DISTANCE_MATRIX_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        return self._parse_single(data, origin, destination, mode)

    async def get_travel_times_batch(
        self,
        origin: str,
        destinations: list[str],
        mode: str = "driving",
    ) -> list[dict]:
        """
        Get travel times from one origin to multiple destinations in a single API call.

        Args:
            origin: Starting point
            destinations: List of destination addresses/coordinates
            mode: Travel mode

        Returns:
            List of travel time dicts (same format as get_travel_time).
        """
        if not destinations:
            return []

        params = {
            "origins": origin,
            "destinations": "|".join(destinations),
            "mode": mode,
            "key": self.api_key,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(DISTANCE_MATRIX_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        rows = data.get("rows", [])
        dest_addresses = data.get("destination_addresses", destinations)

        if rows:
            elements = rows[0].get("elements", [])
            for idx, element in enumerate(elements):
                dest_label = dest_addresses[idx] if idx < len(dest_addresses) else destinations[idx]
                results.append(self._parse_element(element, origin, dest_label, mode))

        return results

    # ── Parsers ───────────────────────────────────────────────────

    @staticmethod
    def _parse_single(data: dict, origin: str, destination: str, mode: str) -> dict:
        """Parse a single-origin, single-destination response."""
        rows = data.get("rows", [])
        if not rows:
            return {
                "origin": origin,
                "destination": destination,
                "distance_text": "",
                "distance_meters": 0,
                "duration_text": "",
                "duration_seconds": 0,
                "mode": mode,
                "status": "NO_RESULTS",
            }

        element = rows[0].get("elements", [{}])[0]
        return DistanceService._parse_element(element, origin, destination, mode)

    @staticmethod
    def _parse_element(element: dict, origin: str, destination: str, mode: str) -> dict:
        """Parse a single element from the Distance Matrix response."""
        status = element.get("status", "UNKNOWN")

        if status != "OK":
            return {
                "origin": origin,
                "destination": destination,
                "distance_text": "",
                "distance_meters": 0,
                "duration_text": "",
                "duration_seconds": 0,
                "mode": mode,
                "status": status,
            }

        distance = element.get("distance", {})
        duration = element.get("duration", {})

        return {
            "origin": origin,
            "destination": destination,
            "distance_text": distance.get("text", ""),
            "distance_meters": distance.get("value", 0),
            "duration_text": duration.get("text", ""),
            "duration_seconds": duration.get("value", 0),
            "mode": mode,
            "status": "OK",
        }


# Module-level singleton
distance_service = DistanceService()
