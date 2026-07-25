"""
TuGo Travel Advisory Service — travel advisories, entry requirements, health & safety.

Uses the TuGo Travel Advisory API (free REST API).
Docs: https://developer.tugo.com/docs/read/travelsafe/v1/country
Auth: X-Auth-API-Key header
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Failures are cached briefly so a dashboard full of trip cards doesn't retry a
# down upstream on every render, while still recovering quickly.
NEGATIVE_CACHE_SECONDS = 15 * 60

_MISS = object()


class TugoAdvisoryService:
    """Async wrapper for TuGo Travel Advisory API with in-memory caching."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, Optional[dict]]] = {}

    @property
    def _ttl_seconds(self) -> int:
        return max(1, settings.travel_guide_cache_ttl_hours) * 3600

    def _lookup(self, key: str) -> Any:
        """Return the cached value (which may be None), or _MISS."""
        entry = self._cache.get(key)
        if entry is None:
            return _MISS
        timestamp, data = entry
        ttl = self._ttl_seconds if data is not None else NEGATIVE_CACHE_SECONDS
        if time.time() - timestamp < ttl:
            return data
        del self._cache[key]
        return _MISS

    def _set_cache(self, key: str, data: Optional[dict]) -> None:
        self._cache[key] = (time.time(), data)

    async def get_advisory(self, country_code: str) -> Optional[dict]:
        """
        Get travel advisory for a country by ISO alpha-2 code.
        Returns normalized advisory data or None if unavailable.
        """
        cached = self._lookup(country_code)
        if cached is not _MISS:
            return cached

        api_key = settings.tugo_api_key
        if not api_key:
            logger.warning("TUGO_API_KEY not configured, skipping advisory fetch")
            return None

        base_url = settings.tugo_api_base_url.rstrip("/")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{base_url}/{country_code}",
                    headers={
                        "X-Auth-API-Key": api_key,
                        "Accept": "application/json",
                    },
                )
                if resp.status_code == 401:
                    logger.error("TuGo API rejected the API key (401)")
                    return None
                if resp.status_code == 404:
                    logger.info(f"No TuGo advisory data for country: {country_code}")
                    self._set_cache(country_code, None)
                    return None
                if resp.status_code == 429:
                    logger.warning(f"TuGo API rate limited for {country_code}")
                    return None

                resp.raise_for_status()
                data = resp.json()

            if not isinstance(data, dict):
                logger.warning(f"Unexpected TuGo payload type for {country_code}")
                self._set_cache(country_code, None)
                return None

            result = self._normalize(data, country_code)
            self._set_cache(country_code, result)
            return result

        except httpx.HTTPStatusError as e:
            logger.error(f"TuGo API HTTP error for {country_code}: {e}")
            return None
        except httpx.RequestError as e:
            logger.error(f"TuGo API request error for {country_code}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching TuGo advisory for {country_code}: {e}")
            return None

    # ── Normalization ────────────────────────────────────────────────

    @staticmethod
    def _collect_notes(section: Any, list_key: str) -> list[dict]:
        """
        Flatten a TuGo `{ <list_key>: [{category, description}, ...] }` section
        into a simple list of {category, description} dicts.

        TuGo occasionally returns a bare string instead of a list, so both
        shapes are handled.
        """
        notes: list[dict] = []
        if not isinstance(section, dict):
            return notes

        raw = section.get(list_key, [])
        if isinstance(raw, list):
            for item in raw:
                if not isinstance(item, dict):
                    continue
                description = (item.get("description") or "").strip()
                if not description:
                    continue
                notes.append(
                    {
                        "category": item.get("category") or "General",
                        "description": description,
                    }
                )
        elif isinstance(raw, str) and raw.strip():
            notes.append({"category": "General", "description": raw.strip()})

        return notes

    def _normalize(self, data: dict, country_code: str) -> dict:
        """Normalize TuGo API response into the merged-compatible shape."""
        entry_requirements = self._collect_notes(
            data.get("entryExitRequirement"), "requirementInfo"
        )

        health_notes = self._collect_notes(data.get("health"), "healthInfo")
        health = data.get("health")
        if isinstance(health, dict):
            diseases = health.get("diseasesAndVaccinesInfo")
            if isinstance(diseases, str) and diseases.strip():
                health_notes.append(
                    {
                        "category": "Diseases & Vaccines",
                        "description": diseases.strip(),
                    }
                )

        safety_notes = self._collect_notes(data.get("safety"), "safetyInfo")
        law_notes = self._collect_notes(data.get("lawAndCulture"), "lawAndCultureInfo")

        climate_note = None
        climate = data.get("climate")
        if isinstance(climate, dict):
            description = (climate.get("description") or "").strip()
            if description:
                climate_note = description

        return {
            "countryName": data.get("name") or country_code,
            "advisoryState": data.get("advisoryState", ""),
            "advisoryText": (data.get("advisoryText") or "").strip(),
            "hasAdvisoryWarning": bool(data.get("hasAdvisoryWarning", False)),
            "hasRegionalAdvisory": bool(data.get("hasRegionalAdvisory", False)),
            "recentUpdates": (data.get("recentUpdates") or "").strip() or None,
            "entryRequirements": entry_requirements,
            "healthNotes": health_notes,
            "safetyNotes": safety_notes,
            "lawNotes": law_notes,
            "climateNote": climate_note,
            "lastUpdated": data.get("publishedDate") or None,
        }


tugo_advisory_service = TugoAdvisoryService()
