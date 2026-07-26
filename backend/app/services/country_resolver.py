"""
Shared country-name → ISO-3166-1 alpha-2 code resolver.

Used by both TuGo and Travel Risk API services.
"""

from __future__ import annotations

import re
from typing import Optional

# ── Country name / city → ISO-3166-1 alpha-2 mapping ──────────────────────
COUNTRY_NAME_TO_ISO: dict[str, str] = {
    # A
    "afghanistan": "AF", "albania": "AL", "algeria": "DZ", "argentina": "AR",
    "australia": "AU", "austria": "AT",
    # B
    "bahamas": "BS", "bahrain": "BH", "bali": "ID", "bangladesh": "BD",
    "barbados": "BB", "belgium": "BE", "belize": "BZ", "bhutan": "BT",
    "bolivia": "BO", "brazil": "BR", "brunei": "BN", "bulgaria": "BG",
    # C
    "cambodia": "KH", "canada": "CA", "chile": "CL", "china": "CN",
    "colombia": "CO", "costa rica": "CR", "croatia": "HR", "cuba": "CU",
    "cyprus": "CY", "czech republic": "CZ", "czechia": "CZ",
    # D
    "denmark": "DK", "dominican republic": "DO", "dubai": "AE",
    # E
    "ecuador": "EC", "egypt": "EG", "el salvador": "SV", "england": "GB",
    "estonia": "EE", "ethiopia": "ET",
    # F
    "fiji": "FJ", "finland": "FI", "france": "FR",
    # G
    "germany": "DE", "ghana": "GH", "greece": "GR", "guatemala": "GT",
    "goa": "IN",
    # H
    "hawaii": "US", "honduras": "HN", "hong kong": "HK", "hungary": "HU",
    # I
    "iceland": "IS", "india": "IN", "indonesia": "ID", "iran": "IR",
    "iraq": "IQ", "ireland": "IE", "israel": "IL", "italy": "IT",
    # J
    "jamaica": "JM", "japan": "JP", "jordan": "JO",
    # K
    "kenya": "KE", "south korea": "KR", "korea": "KR", "kuwait": "KW",
    # L
    "laos": "LA", "latvia": "LV", "lebanon": "LB", "lithuania": "LT",
    "luxembourg": "LU",
    # M
    "macau": "MO", "malaysia": "MY", "maldives": "MV", "malta": "MT",
    "mauritius": "MU", "mexico": "MX", "monaco": "MC", "mongolia": "MN",
    "montenegro": "ME", "morocco": "MA", "mumbai": "IN", "myanmar": "MM",
    # N
    "nepal": "NP", "netherlands": "NL", "new zealand": "NZ", "nigeria": "NG",
    "norway": "NO",
    # O
    "oman": "OM",
    # P
    "pakistan": "PK", "panama": "PA", "paris": "FR", "peru": "PE",
    "philippines": "PH", "poland": "PL", "portugal": "PT", "phuket": "TH",
    # Q
    "qatar": "QA",
    # R
    "romania": "RO", "russia": "RU", "rwanda": "RW",
    # S
    "saudi arabia": "SA", "scotland": "GB", "senegal": "SN", "serbia": "RS",
    "singapore": "SG", "slovakia": "SK", "slovenia": "SI", "south africa": "ZA",
    "spain": "ES", "sri lanka": "LK", "sweden": "SE", "switzerland": "CH",
    "sydney": "AU",
    # T
    "taiwan": "TW", "tanzania": "TZ", "thailand": "TH", "tokyo": "JP",
    "tunisia": "TN", "turkey": "TR", "türkiye": "TR",
    # U
    "uganda": "UG", "ukraine": "UA", "united arab emirates": "AE",
    "uae": "AE", "united kingdom": "GB", "uk": "GB",
    "united states": "US", "usa": "US", "united states of america": "US",
    "america": "US", "the united states": "US", "u.s.": "US", "u.s.a.": "US",
    "uruguay": "UY", "uzbekistan": "UZ",
    # V
    "vietnam": "VN",
    # Z
    "zambia": "ZM", "zimbabwe": "ZW",
    # Popular cities mapped to countries
    "amsterdam": "NL", "athens": "GR", "bangkok": "TH", "barcelona": "ES",
    "beijing": "CN", "berlin": "DE", "bogota": "CO", "budapest": "HU",
    "buenos aires": "AR", "cairo": "EG", "cape town": "ZA",
    "bangalore": "IN", "casablanca": "MA", "chennai": "IN", "delhi": "IN",
    "new delhi": "IN", "pune": "IN",
    "florence": "IT", "hanoi": "VN", "havana": "CU", "helsinki": "FI",
    "ho chi minh": "VN", "hyderabad": "IN", "istanbul": "TR",
    "jakarta": "ID", "kolkata": "IN", "kuala lumpur": "MY",
    "kyoto": "JP", "lima": "PE", "lisbon": "PT", "london": "GB",
    "los angeles": "US", "madrid": "ES", "manila": "PH", "marrakech": "MA",
    "melbourne": "AU", "milan": "IT", "montreal": "CA", "moscow": "RU",
    "nairobi": "KE", "new york": "US", "osaka": "JP", "prague": "CZ",
    "reykjavik": "IS", "rio de janeiro": "BR", "rome": "IT",
    "san francisco": "US", "santorini": "GR", "sao paulo": "BR",
    "seoul": "KR", "shanghai": "CN", "stockholm": "SE",
    "toronto": "CA", "vancouver": "CA", "venice": "IT", "vienna": "AT",
    "warsaw": "PL", "zurich": "CH",
}


# ── ISO-3166-1 alpha-2 → alpha-3 ─────────────────────────────────────────
# The TuGo API keys on alpha-2 codes ("GR") but the Travel Risk Intelligence
# API keys on alpha-3 ("GRC") — requesting alpha-3 endpoints with an alpha-2
# code returns 404 "Country not found". Covers every code this resolver emits.
ISO2_TO_ISO3: dict[str, str] = {
    "AE": "ARE", "AF": "AFG", "AL": "ALB", "AR": "ARG", "AT": "AUT",
    "AU": "AUS", "BB": "BRB", "BD": "BGD", "BE": "BEL", "BG": "BGR",
    "BH": "BHR", "BN": "BRN", "BO": "BOL", "BR": "BRA", "BS": "BHS",
    "BT": "BTN", "BZ": "BLZ", "CA": "CAN", "CH": "CHE", "CL": "CHL",
    "CN": "CHN", "CO": "COL", "CR": "CRI", "CU": "CUB", "CY": "CYP",
    "CZ": "CZE", "DE": "DEU", "DK": "DNK", "DO": "DOM", "DZ": "DZA",
    "EC": "ECU", "EE": "EST", "EG": "EGY", "ES": "ESP", "ET": "ETH",
    "FI": "FIN", "FJ": "FJI", "FR": "FRA", "GB": "GBR", "GH": "GHA",
    "GR": "GRC", "GT": "GTM", "HK": "HKG", "HN": "HND", "HR": "HRV",
    "HU": "HUN", "ID": "IDN", "IE": "IRL", "IL": "ISR", "IN": "IND",
    "IQ": "IRQ", "IR": "IRN", "IS": "ISL", "IT": "ITA", "JM": "JAM",
    "JO": "JOR", "JP": "JPN", "KE": "KEN", "KH": "KHM", "KR": "KOR",
    "KW": "KWT", "LA": "LAO", "LB": "LBN", "LK": "LKA", "LT": "LTU",
    "LU": "LUX", "LV": "LVA", "MA": "MAR", "MC": "MCO", "ME": "MNE",
    "MM": "MMR", "MN": "MNG", "MO": "MAC", "MT": "MLT", "MU": "MUS",
    "MV": "MDV", "MX": "MEX", "MY": "MYS", "NG": "NGA", "NL": "NLD",
    "NO": "NOR", "NP": "NPL", "NZ": "NZL", "OM": "OMN", "PA": "PAN",
    "PE": "PER", "PH": "PHL", "PK": "PAK", "PL": "POL", "PT": "PRT",
    "QA": "QAT", "RO": "ROU", "RS": "SRB", "RU": "RUS", "RW": "RWA",
    "SA": "SAU", "SE": "SWE", "SG": "SGP", "SI": "SVN", "SK": "SVK",
    "SN": "SEN", "SV": "SLV", "TH": "THA", "TN": "TUN", "TR": "TUR",
    "TW": "TWN", "TZ": "TZA", "UA": "UKR", "UG": "UGA", "US": "USA",
    "UY": "URY", "UZ": "UZB", "VN": "VNM", "ZA": "ZAF", "ZM": "ZMB",
    "ZW": "ZWE",
}


def to_alpha3(alpha2: str) -> Optional[str]:
    """Convert an ISO-3166-1 alpha-2 code to alpha-3, or None if unmapped."""
    if not alpha2:
        return None
    return ISO2_TO_ISO3.get(alpha2.strip().upper())


def resolve_country_code(destination: str) -> Optional[str]:
    """
    Resolve a destination string (city, country, or combined) to an ISO country code.
    Examples:
        "Bali" → "ID"
        "Paris, France" → "FR"
        "New York" → "US"
    """
    if not destination:
        return None

    dest = destination.strip().lower()

    # Direct lookup FIRST — names like "uk" are two letters but are not valid
    # ISO-3166-1 alpha-2 codes ("uk" must resolve to "GB", not "UK").
    if dest in COUNTRY_NAME_TO_ISO:
        return COUNTRY_NAME_TO_ISO[dest]

    # If it's already a 2-letter ISO code
    if re.match(r"^[a-z]{2}$", dest):
        return dest.upper()

    # Try splitting "City, Country" format
    parts = [p.strip() for p in dest.split(",")]
    for part in reversed(parts):  # Check country part first (usually last)
        if part in COUNTRY_NAME_TO_ISO:
            return COUNTRY_NAME_TO_ISO[part]

    # Try each word individually (for "New Delhi India" style)
    words = dest.split()
    for i in range(len(words), 0, -1):
        for j in range(len(words) - i + 1):
            phrase = " ".join(words[j:j + i])
            if phrase in COUNTRY_NAME_TO_ISO:
                return COUNTRY_NAME_TO_ISO[phrase]

    return None
