"""
Holiday Service — fetches public holidays from the Nager.Date API
and provides warnings for trips that overlap with public holidays.

API: https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
"""

import asyncio
import logging
from datetime import datetime, date
from functools import lru_cache

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Country code mapping for common travel destinations
# ---------------------------------------------------------------------------
COUNTRY_CODES: dict[str, str] = {
    "india": "IN",
    "mumbai": "IN",
    "delhi": "IN",
    "bangalore": "IN",
    "goa": "IN",
    "thailand": "TH",
    "bangkok": "TH",
    "phuket": "TH",
    "japan": "JP",
    "tokyo": "JP",
    "kyoto": "JP",
    "osaka": "JP",
    "singapore": "SG",
    "indonesia": "ID",
    "bali": "ID",
    "jakarta": "ID",
    "malaysia": "MY",
    "kuala lumpur": "MY",
    "sri lanka": "LK",
    "nepal": "NP",
    "united states": "US",
    "usa": "US",
    "new york": "US",
    "los angeles": "US",
    "san francisco": "US",
    "miami": "US",
    "uk": "GB",
    "united kingdom": "GB",
    "london": "GB",
    "france": "FR",
    "paris": "FR",
    "germany": "DE",
    "berlin": "DE",
    "munich": "DE",
    "italy": "IT",
    "rome": "IT",
    "milan": "IT",
    "venice": "IT",
    "spain": "ES",
    "madrid": "ES",
    "barcelona": "ES",
    "australia": "AU",
    "sydney": "AU",
    "melbourne": "AU",
    "canada": "CA",
    "toronto": "CA",
    "vancouver": "CA",
    "uae": "AE",
    "dubai": "AE",
    "abu dhabi": "AE",
    "maldives": "MV",
    "vietnam": "VN",
    "hanoi": "VN",
    "south korea": "KR",
    "seoul": "KR",
    "turkey": "TR",
    "istanbul": "TR",
    "egypt": "EG",
    "cairo": "EG",
    "greece": "GR",
    "athens": "GR",
    "switzerland": "CH",
    "zurich": "CH",
    "netherlands": "NL",
    "amsterdam": "NL",
    "portugal": "PT",
    "lisbon": "PT",
    "brazil": "BR",
    "rio": "BR",
    "mexico": "MX",
    "new zealand": "NZ",
    "auckland": "NZ",
}

NAGER_API_BASE = "https://date.nager.at/api/v3"
REQUEST_TIMEOUT = 10  # seconds


class HolidayService:
    """Fetches public holidays for a destination and date range."""

    # ------------------------------------------------------------------
    # Country code resolution
    # ------------------------------------------------------------------
    @staticmethod
    def get_country_code(destination: str) -> str | None:
        """Fuzzy-match *destination* to an ISO 3166-1 alpha-2 country code.

        Resolution order:
        1. Exact match (case-insensitive) against COUNTRY_CODES keys.
        2. Substring match — check if any key appears inside the
           destination string (e.g. ``"Mumbai, India"`` contains ``"india"``).
        3. Return ``None`` if nothing matches.
        """
        normalized = destination.strip().lower()

        # 1. Exact match
        if normalized in COUNTRY_CODES:
            return COUNTRY_CODES[normalized]

        # 2. Substring / containment match (longest key first for specificity)
        for key in sorted(COUNTRY_CODES, key=len, reverse=True):
            if key in normalized:
                return COUNTRY_CODES[key]

        return None

    # ------------------------------------------------------------------
    # Raw API fetch (sync — wrapped for async below)
    # ------------------------------------------------------------------
    @staticmethod
    @lru_cache(maxsize=128)
    def _fetch_holidays_sync(year: int, country_code: str) -> list[dict]:
        """Call the Nager.Date public-holidays endpoint (blocking)."""
        url = f"{NAGER_API_BASE}/PublicHolidays/{year}/{country_code}"
        try:
            resp = requests.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.warning(
                "Failed to fetch holidays for %s/%s: %s",
                year,
                country_code,
                exc,
            )
            return []

    # ------------------------------------------------------------------
    # Core public methods
    # ------------------------------------------------------------------
    async def get_holidays(
        self,
        destination: str,
        start_date: str,
        end_date: str,
    ) -> list[dict]:
        """Return public holidays that fall within the trip dates.

        Parameters
        ----------
        destination : str
            Free-text destination (e.g. ``"Bali, Indonesia"``).
        start_date, end_date : str
            ISO-format date strings (``YYYY-MM-DD``).

        Returns
        -------
        list[dict]
            Each dict has keys ``date``, ``name``, and ``type``.
        """
        country_code = self.get_country_code(destination)
        if not country_code:
            logger.info("No country code found for destination: %s", destination)
            return []

        try:
            start = self._parse_date(start_date)
            end = self._parse_date(end_date)
        except ValueError as exc:
            logger.warning("Invalid date format: %s", exc)
            return []

        # Determine which years to query (trip may span a year boundary)
        years = sorted(set(range(start.year, end.year + 1)))

        loop = asyncio.get_running_loop()
        all_holidays: list[dict] = []

        for year in years:
            raw = await loop.run_in_executor(
                None, self._fetch_holidays_sync, year, country_code
            )
            all_holidays.extend(raw)

        # Filter to holidays within the trip window
        filtered: list[dict] = []
        for h in all_holidays:
            h_date = self._parse_date(h.get("date", ""))
            if start <= h_date <= end:
                filtered.append(
                    {
                        "date": h["date"],
                        "name": h.get("localName") or h.get("name", "Unknown"),
                        "type": self._classify_type(h),
                    }
                )

        return filtered

    async def get_holiday_warnings(
        self,
        destination: str,
        start_date: str,
        end_date: str,
    ) -> list[str]:
        """Return human-readable warning strings for holidays during the trip.

        Examples
        --------
        - ``'⚠️ Oct 2 (Thu) is Gandhi Jayanti — banks and government offices may be closed'``
        - ``'🎉 Oct 24 (Fri) is Diwali — expect festive crowds and some shop closures'``
        """
        holidays = await self.get_holidays(destination, start_date, end_date)
        warnings: list[str] = []

        for h in holidays:
            h_date = self._parse_date(h["date"])
            day_str = h_date.strftime("%b %-d")  # e.g. "Oct 2"
            weekday = h_date.strftime("%a")  # e.g. "Thu"
            name = h["name"]
            h_type = h.get("type", "public")

            if h_type == "festive":
                emoji = "🎉"
                note = "expect festive crowds and some shop closures"
            elif h_type == "religious":
                emoji = "🙏"
                note = "religious observance — some services may be affected"
            else:
                emoji = "⚠️"
                note = "banks and government offices may be closed"

            warnings.append(f"{emoji} {day_str} ({weekday}) is {name} — {note}")

        return warnings

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_date(date_str: str) -> date:
        """Parse an ISO date string (``YYYY-MM-DD``) into a :class:`date`."""
        return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()

    @staticmethod
    def _classify_type(holiday_raw: dict) -> str:
        """Map the Nager.Date ``types`` list to a simple category string."""
        types = holiday_raw.get("types", [])
        # Nager returns types like "Public", "Optional", "Bank", etc.
        type_set = {t.lower() for t in types}

        if {"observance", "optional"} & type_set:
            return "festive"
        if "bank" in type_set:
            return "bank"
        # Default to public holiday
        return "public"


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------
holiday_service = HolidayService()
