"""
Google Places API (New) Service — destination search and details.

Uses the Places API (New) with httpx for async HTTP calls.
Docs: https://developers.google.com/maps/documentation/places/web-service
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://places.googleapis.com/v1/places"


class PlacesService:
    """Async wrapper for Google Places API (New)."""

    def __init__(self) -> None:
        self.api_key = settings.google_maps_api_key

    def _headers(self, field_mask: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }

    # ── Search ────────────────────────────────────────────────────

    async def search_places(
        self,
        query: str,
        location_bias: dict[str, Any] | None = None,
        type_filter: str | None = None,
        max_results: int = 10,
    ) -> list[dict]:
        """
        Text Search (New) — find places matching a free-text query.

        Args:
            query: Search text, e.g. "heritage sites in Jaipur"
            location_bias: Optional circle bias {"center": {"latitude": ..., "longitude": ...}, "radius": meters}
            type_filter: Optional place type, e.g. "tourist_attraction"
            max_results: Max results to return (1-20)
        """
        field_mask = (
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.rating,places.userRatingCount,"
            "places.types,places.photos"
        )

        body: dict[str, Any] = {
            "textQuery": query,
            "maxResultCount": min(max_results, 20),
            "languageCode": "en",
        }
        if location_bias:
            body["locationBias"] = {"circle": location_bias}
        if type_filter:
            body["includedType"] = type_filter

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{BASE_URL}:searchText",
                headers=self._headers(field_mask),
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        places = data.get("places", [])
        return [self._parse_place_summary(p) for p in places]

    # ── Details ───────────────────────────────────────────────────

    async def get_place_details(self, place_id: str) -> dict:
        """
        Place Details (New) — retrieve full information for a place.
        """
        field_mask = (
            "id,displayName,formattedAddress,location,rating,"
            "userRatingCount,types,nationalPhoneNumber,websiteUri,"
            "regularOpeningHours,reviews,photos,editorialSummary,priceLevel"
        )

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{BASE_URL}/{place_id}",
                headers=self._headers(field_mask),
            )
            resp.raise_for_status()
            data = resp.json()

        return self._parse_place_detail(data)

    # ── Photos ────────────────────────────────────────────────────

    def get_place_photo_url(self, photo_name: str, max_width: int = 800) -> str:
        """
        Build a photo URL from a photo resource name.

        photo_name: e.g. "places/PLACE_ID/photos/PHOTO_REF"
        """
        return (
            f"https://places.googleapis.com/v1/{photo_name}/media"
            f"?maxWidthPx={max_width}&key={self.api_key}"
        )

    # ── Parsers ───────────────────────────────────────────────────

    def _parse_place_summary(self, raw: dict) -> dict:
        """Parse a place from Text Search into a clean dict."""
        location = raw.get("location", {})
        photos = raw.get("photos", [])
        photo_url = None
        if photos:
            photo_url = self.get_place_photo_url(photos[0].get("name", ""), max_width=400)

        return {
            "place_id": raw.get("id", ""),
            "name": raw.get("displayName", {}).get("text", ""),
            "formatted_address": raw.get("formattedAddress", ""),
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
            "rating": raw.get("rating"),
            "user_rating_count": raw.get("userRatingCount"),
            "types": raw.get("types", []),
            "photo_url": photo_url,
        }

    def _parse_place_detail(self, raw: dict) -> dict:
        """Parse Place Details into a clean dict."""
        location = raw.get("location", {})
        photos = raw.get("photos", [])
        photo_urls = [
            self.get_place_photo_url(p.get("name", ""), max_width=800)
            for p in photos[:5]
        ]

        # Opening hours
        opening_hours = None
        raw_hours = raw.get("regularOpeningHours")
        if raw_hours:
            opening_hours = {
                "weekday_text": raw_hours.get("weekdayDescriptions", []),
                "open_now": raw_hours.get("openNow"),
            }

        # Reviews
        reviews = []
        for r in raw.get("reviews", [])[:5]:
            reviews.append({
                "author": r.get("authorAttribution", {}).get("displayName", ""),
                "rating": r.get("rating"),
                "text": r.get("text", {}).get("text", ""),
                "time": r.get("publishTime", ""),
            })

        return {
            "place_id": raw.get("id", ""),
            "name": raw.get("displayName", {}).get("text", ""),
            "formatted_address": raw.get("formattedAddress", ""),
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
            "rating": raw.get("rating"),
            "user_rating_count": raw.get("userRatingCount"),
            "types": raw.get("types", []),
            "phone_number": raw.get("nationalPhoneNumber"),
            "website": raw.get("websiteUri"),
            "opening_hours": opening_hours,
            "reviews": reviews,
            "photo_urls": photo_urls,
            "editorial_summary": raw.get("editorialSummary", {}).get("text"),
            "price_level": raw.get("priceLevel"),
        }


# Module-level singleton
places_service = PlacesService()
