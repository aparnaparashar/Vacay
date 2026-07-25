from fastapi import APIRouter, Query

from app.services.travel_guide_service import travel_guide_service

router = APIRouter()


@router.get("/")
async def get_travel_guide(
    country: str = Query(
        ..., min_length=2, max_length=100, description="Country name, city, or ISO code"
    )
):
    """
    Combined travel guide for a destination.

    Merges the TuGo Travel Advisory API (advisory text, entry requirements,
    health, safety) with the Travel Risk Intelligence API (composite risk
    score, advisory level, live disaster alerts).

    Always returns the full response shape. The `sources` flags indicate which
    upstream APIs actually responded, so the client can render only the
    sections it has data for instead of showing an error.
    """
    result = await travel_guide_service.get_travel_guide(country)
    if result is None:
        # Destination could not be resolved to an ISO country code.
        return {
            "countryIso": "",
            "countryName": country.title(),
            "riskLevel": "unknown",
            "riskScore": None,
            "riskCalculation": [],
            "advisoryLevel": "",
            "advisoryText": "Could not resolve destination.",
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
    return result
