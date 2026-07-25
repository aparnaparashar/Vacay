"""
Merged Travel Guide Service.

Combines data from:
1. TuGo Travel Advisory API      — advisory text, entry requirements, health,
                                   safety, law & culture, climate notes
2. Travel Risk Intelligence API  — composite risk score (1-5), advisory level,
                                   score breakdown, live disaster alerts

Both are called concurrently. Partial failure is expected, not exceptional:
if one source is down the other's data is still returned, and the `sources`
flags tell the frontend which sections it can render.
"""

import asyncio
import logging
import re
from typing import Optional

from app.services.country_resolver import resolve_country_code
from app.services.travel_advisory_service import tugo_advisory_service
from app.services.travel_risk_service import travel_risk_service

logger = logging.getLogger(__name__)

# TuGo advisoryState wording -> our three-level scale. Only used when the
# Travel Risk API (the authoritative source for riskLevel) has no score.
#
# Order matters and "normal" must be tested first: TuGo's low state reads
# "Normal security precautions", and a naive substring test for "caution"
# matches inside "pre-caution-s". Patterns are word-bounded for the same
# reason — \bcaution\b does not match "precautions".
_ADVISORY_STATE_TO_LEVEL = (
    (r"\bnormal\b", "low"),
    (r"\bdo not travel\b", "high"),
    (r"\bavoid\b", "high"),
    (r"\bcaution\b", "medium"),
)


class TravelGuideService:
    async def get_travel_guide(self, destination: str) -> Optional[dict]:
        """
        Fetch and merge travel guide data from both APIs concurrently.

        Returns None only when the destination cannot be resolved to an ISO
        country code — every other failure degrades to partial data.
        """
        country_code = resolve_country_code(destination)
        if not country_code:
            logger.warning(f"Could not resolve country code for: {destination}")
            return None

        # Both services cache per country code, so trips sharing a destination
        # reuse one cached entry and we stay inside the 100 req/day free tier.
        tugo_data, risk_data = await asyncio.gather(
            tugo_advisory_service.get_advisory(country_code),
            travel_risk_service.get_risk_data(country_code),
            return_exceptions=False,
        )

        if not tugo_data and not risk_data:
            logger.info(f"No travel guide data found from any source for {country_code}")
            return self._fallback(country_code, destination)

        return self._merge_data(country_code, destination, tugo_data, risk_data)

    # ── Merge ────────────────────────────────────────────────────────

    def _merge_data(
        self,
        country_code: str,
        destination: str,
        tugo_data: Optional[dict],
        risk_data: Optional[dict],
    ) -> dict:
        """Merge the normalized outputs from both services."""
        country_name = self._pick_country_name(country_code, destination, tugo_data, risk_data)

        # riskLevel/riskScore come primarily from the Travel Risk API — it is
        # purpose-built for this. TuGo's advisoryState is only a fallback.
        risk_level = "unknown"
        risk_score = None
        if risk_data:
            risk_score = risk_data.get("riskScore")
            if risk_data.get("riskLevel") not in (None, "unknown"):
                risk_level = risk_data["riskLevel"]
        if risk_level == "unknown" and tugo_data:
            risk_level = self._level_from_advisory_state(tugo_data.get("advisoryState"))

        # Prefer TuGo's prose advisory; fall back to the Risk API's description
        # or its advisory level label.
        advisory_text = ""
        if tugo_data:
            advisory_text = tugo_data.get("advisoryText") or ""
        if not advisory_text and risk_data:
            advisory_text = (
                risk_data.get("advisoryDescription")
                or risk_data.get("advisoryLevel")
                or ""
            )
        if not advisory_text:
            advisory_text = "No advisory available."

        return {
            "countryIso": country_code,
            "countryName": country_name,
            "riskLevel": risk_level,
            "riskScore": risk_score,
            "riskCalculation": risk_data.get("riskCalculation", []) if risk_data else [],
            "advisoryLevel": risk_data.get("advisoryLevel", "") if risk_data else "",
            "advisoryText": advisory_text,
            "hasAdvisoryWarning": bool(tugo_data.get("hasAdvisoryWarning")) if tugo_data else False,
            "activeAlerts": risk_data.get("activeAlerts", []) if risk_data else [],
            "alertCount": risk_data.get("alertCount", 0) if risk_data else 0,
            "entryRequirements": tugo_data.get("entryRequirements", []) if tugo_data else [],
            "healthNotes": tugo_data.get("healthNotes", []) if tugo_data else [],
            "safetyNotes": tugo_data.get("safetyNotes", []) if tugo_data else [],
            "lawNotes": tugo_data.get("lawNotes", []) if tugo_data else [],
            "climateNote": tugo_data.get("climateNote") if tugo_data else None,
            "lastUpdated": self._pick_last_updated(tugo_data, risk_data),
            "sources": {
                "tugo": tugo_data is not None,
                "travelRisk": risk_data is not None,
            },
        }

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _pick_country_name(
        country_code: str,
        destination: str,
        tugo_data: Optional[dict],
        risk_data: Optional[dict],
    ) -> str:
        """Prefer a real country name from either API over the raw destination."""
        for source in (risk_data, tugo_data):
            if not source:
                continue
            name = (source.get("countryName") or "").strip()
            if name and name.upper() != country_code.upper():
                return name
        return destination.title()

    @staticmethod
    def _pick_last_updated(
        tugo_data: Optional[dict], risk_data: Optional[dict]
    ) -> Optional[str]:
        for source in (risk_data, tugo_data):
            if source and source.get("lastUpdated"):
                return source["lastUpdated"]
        return None

    @staticmethod
    def _level_from_advisory_state(advisory_state) -> str:
        if not advisory_state:
            return "unknown"
        state = str(advisory_state).lower()
        for pattern, level in _ADVISORY_STATE_TO_LEVEL:
            if re.search(pattern, state):
                return level
        return "unknown"

    @staticmethod
    def _fallback(country_code: str, destination: str) -> dict:
        return {
            "countryIso": country_code,
            "countryName": destination.title(),
            "riskLevel": "unknown",
            "riskScore": None,
            "riskCalculation": [],
            "advisoryLevel": "",
            "advisoryText": "No advisory data available.",
            "hasAdvisoryWarning": False,
            "activeAlerts": [],
            "alertCount": 0,
            "entryRequirements": [],
            "healthNotes": [],
            "safetyNotes": [],
            "lawNotes": [],
            "climateNote": None,
            "lastUpdated": None,
            "sources": {
                "tugo": False,
                "travelRisk": False,
            },
        }


travel_guide_service = TravelGuideService()
