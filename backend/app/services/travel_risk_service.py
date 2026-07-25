"""
Travel Risk Intelligence API Service — real-time risk scores and disaster alerts.

API Docs: https://travelriskapi.com/
Auth: X-API-Key header
Free tier: 100 requests/day — results (including failures) are cached per country.

Endpoints used:
  GET /risk-score/{iso3}         -> { iso_code, name, risk_score, advisory_level,
                                      active_alerts, calculation }
  GET /countries/{iso3}          -> { advisory_level, advisory_description,
                                      advisory_date, risk_score, last_updated }
  GET /alerts?country_iso={iso3} -> { total, data: [{ alert_type, severity,
                                      location, description, event_date }] }

NOTE: this API keys on ISO-3166-1 **alpha-3** codes ("GRC"). Passing the
alpha-2 code TuGo uses ("GR") returns 404 "Country not found".
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
import time
from typing import Any, Optional

import httpx

from app.config import settings
from app.services.country_resolver import to_alpha3

logger = logging.getLogger(__name__)

# Failures are cached for a shorter window than successes: long enough to stop
# a dashboard full of trip cards from burning the daily quota, short enough to
# recover quickly once the upstream API is healthy again.
NEGATIVE_CACHE_SECONDS = 15 * 60

# The /alerts endpoint paginates (default limit 50) and busy countries can have
# hundreds — Canada currently reports 188. We keep a readable slice for display
# and carry the true total separately so the badge count stays honest.
MAX_RENDERED_ALERTS = 20

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_MISS = object()


def strip_html(value: Any) -> str:
    """
    The API returns advisory_description as an HTML fragment
    ("<p><b>Advisory Summary</b></p><ul><li>...</li></ul>"). The UI renders
    plain text, so flatten it rather than dumping raw tags on screen.
    """
    if not isinstance(value, str) or not value:
        return ""
    # Every tag becomes a space, not an empty string: the upstream data contains
    # fragments like "precaution<p>in <b>Japan.</b></p>" where dropping the tag
    # outright would run two words together ("precautionin").
    text = _TAG_RE.sub(" ", value)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


class TravelRiskService:
    """Async wrapper for Travel Risk Intelligence API with in-memory caching."""

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

    # ── HTTP helpers ─────────────────────────────────────────────────

    @staticmethod
    async def _get_json(
        client: httpx.AsyncClient,
        url: str,
        label: str,
        params: Optional[dict] = None,
    ) -> Optional[Any]:
        """
        Perform one GET and return parsed JSON, or None on any failure.

        Every documented error code (401/404/429/500) is handled as "no data
        from this endpoint" rather than an exception, so a partial outage never
        takes down the whole travel-guide response.
        """
        try:
            resp = await client.get(url, params=params)
        except httpx.RequestError as e:
            logger.error(f"Travel Risk API {label} request error: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json()
            except ValueError:
                logger.warning(f"Travel Risk API {label} returned non-JSON body")
                return None
        if resp.status_code == 401:
            logger.error("Travel Risk API rejected the API key (401)")
        elif resp.status_code == 429:
            logger.warning(f"Travel Risk API rate limited on {label} (429)")
        elif resp.status_code == 404:
            logger.info(f"Travel Risk API has no data for {label}")
        else:
            logger.warning(f"Travel Risk API {label} returned {resp.status_code}")
        return None

    # ── Public API ───────────────────────────────────────────────────

    async def get_risk_data(self, country_code: str) -> Optional[dict]:
        """
        Get risk score, advisory level, and active alerts for a country.

        `country_code` is the alpha-2 code from the shared resolver; it is
        converted to alpha-3 for the upstream requests.
        Returns normalized data, or None if every endpoint failed.
        """
        cached = self._lookup(country_code)
        if cached is not _MISS:
            return cached

        api_key = settings.travel_risk_api_key
        if not api_key:
            logger.warning("TRAVEL_RISK_API_KEY not configured, skipping risk fetch")
            return None

        iso3 = to_alpha3(country_code)
        if not iso3:
            logger.info(f"No alpha-3 mapping for {country_code}; skipping risk fetch")
            self._set_cache(country_code, None)
            return None

        base_url = settings.travel_risk_api_base_url.rstrip("/")
        headers = {"X-API-Key": api_key, "Accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                risk_data, alerts_payload, country_data = await asyncio.gather(
                    self._get_json(client, f"{base_url}/risk-score/{iso3}", "risk-score"),
                    self._get_json(
                        client,
                        f"{base_url}/alerts",
                        "alerts",
                        params={"country_iso": iso3},
                    ),
                    self._get_json(client, f"{base_url}/countries/{iso3}", "countries"),
                )
        except Exception as e:
            logger.error(f"Unexpected error in TravelRiskService for {iso3}: {e}")
            return None

        alerts_data, alerts_total = self._extract_alerts(alerts_payload)

        if not isinstance(risk_data, dict):
            risk_data = None
        if not isinstance(country_data, dict):
            country_data = None

        # Nothing usable came back from any of the three endpoints.
        if risk_data is None and country_data is None and not alerts_data:
            self._set_cache(country_code, None)
            return None

        result = self._normalize(risk_data, country_data, alerts_data, alerts_total, iso3)
        self._set_cache(country_code, result)
        return result

    # ── Normalization ────────────────────────────────────────────────

    @staticmethod
    def _extract_alerts(payload: Any) -> tuple[list, Optional[int]]:
        """
        The alerts endpoint returns either {total, limit, data: [...]} or a bare
        list. Returns (alerts, total) — `total` is the full server-side count,
        which is larger than len(alerts) whenever the response is paginated.
        """
        if isinstance(payload, dict):
            data = payload.get("data", [])
            data = data if isinstance(data, list) else []
            total = payload.get("total")
            if isinstance(total, bool) or not isinstance(total, int) or total < 0:
                total = None
            return data, total
        if isinstance(payload, list):
            return payload, len(payload)
        return [], None

    @staticmethod
    def _coerce_score(value: Any) -> Optional[float]:
        """risk_score arrives as a number or a numeric string depending on endpoint."""
        if value is None:
            return None
        try:
            score = float(value)
        except (TypeError, ValueError):
            return None
        # Documented range is 1-5; anything outside it is treated as unusable.
        if score < 0 or score > 5:
            return None
        return score

    def _normalize(
        self,
        risk_data: Optional[dict],
        country_data: Optional[dict],
        alerts_data: list,
        alerts_total: Optional[int],
        iso3: str,
    ) -> dict:
        """Normalize the three Travel Risk API responses into one shape."""
        risk_data = risk_data or {}
        country_data = country_data or {}

        # /risk-score is the primary source; /countries is the fallback.
        risk_score = self._coerce_score(risk_data.get("risk_score"))
        if risk_score is None:
            risk_score = self._coerce_score(country_data.get("risk_score"))

        advisory_level = self._format_advisory_level(
            risk_data.get("advisory_level", country_data.get("advisory_level"))
        )
        advisory_description = strip_html(country_data.get("advisory_description")) or None
        country_name = risk_data.get("name") or country_data.get("name") or iso3
        last_updated = (
            country_data.get("last_updated") or country_data.get("advisory_date") or None
        )

        # Score breakdown, surfaced in the "Risk & Alerts" section.
        calculation = risk_data.get("calculation")
        risk_calculation: list[dict] = []
        if isinstance(calculation, dict):
            for key, value in calculation.items():
                if isinstance(value, bool) or value is None:
                    continue
                if isinstance(value, (int, float, str)) and str(value).strip():
                    risk_calculation.append(
                        {"label": str(key).replace("_", " ").strip().title(), "value": value}
                    )

        active_alerts = []
        for alert in alerts_data[:MAX_RENDERED_ALERTS]:
            if not isinstance(alert, dict):
                continue
            active_alerts.append(
                {
                    "type": alert.get("alert_type") or "Alert",
                    "severity": alert.get("severity") or "Unknown",
                    "location": alert.get("location") or "",
                    "description": strip_html(alert.get("description")),
                    "eventDate": alert.get("event_date") or "",
                }
            )

        # The badge count must reflect the server-side total, not the page size:
        # /alerts caps at 50 per response while a country can have far more.
        if alerts_total is not None:
            alert_count = alerts_total
        else:
            alert_count = len(active_alerts)
            # If the alerts endpoint failed entirely, fall back to the count
            # /risk-score reports so the badge still signals that alerts exist.
            if not active_alerts:
                reported = risk_data.get("active_alerts")
                if isinstance(reported, bool):
                    reported = None
                if isinstance(reported, int) and reported > 0:
                    alert_count = reported
                elif isinstance(reported, list):
                    alert_count = len(reported)

        return {
            "riskScore": risk_score,
            "riskLevel": self._score_to_level(risk_score),
            "riskCalculation": risk_calculation,
            "advisoryLevel": advisory_level,
            "advisoryDescription": advisory_description,
            "countryName": country_name,
            "activeAlerts": active_alerts,
            "alertCount": alert_count,
            "lastUpdated": last_updated,
        }

    @staticmethod
    def _format_advisory_level(value: Any) -> str:
        """
        advisory_level comes back as a US State Department level (0-4).
        Render it as a human label rather than a bare digit.
        """
        labels = {
            0: "Level 0: No advisory",
            1: "Level 1: Exercise normal precautions",
            2: "Level 2: Exercise increased caution",
            3: "Level 3: Reconsider travel",
            4: "Level 4: Do not travel",
        }
        if isinstance(value, bool) or value is None:
            return ""
        if isinstance(value, int):
            return labels.get(value, f"Level {value}")
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.isdigit():
                return labels.get(int(stripped), f"Level {stripped}")
            return stripped
        return ""

    @staticmethod
    def _score_to_level(score: Optional[float]) -> str:
        """Map a 1-5 risk score to low/medium/high."""
        if score is None:
            return "unknown"
        if score <= 2.0:
            return "low"
        if score <= 3.5:
            return "medium"
        return "high"


travel_risk_service = TravelRiskService()
