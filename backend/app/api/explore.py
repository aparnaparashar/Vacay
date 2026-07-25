from fastapi import APIRouter, Query, HTTPException
from app.providers.overpass_provider import overpass_provider

router = APIRouter()

@router.get("/explore")
async def explore_places(
    lat: float = Query(..., description="Latitude of the center point"),
    lng: float = Query(..., description="Longitude of the center point"),
    category: str = Query(..., description="Category to search for (restaurant, cafe, bar, hotel, sights, museum, nature, activity)"),
    radius: int = Query(2000, description="Search radius in meters")
):
    """
    Explore POIs near a location based on predefined categories.
    Uses Overpass API (OpenStreetMap) racing 4 mirrors for speed and reliability.
    """
    if category not in overpass_provider.CATEGORY_TAGS:
        raise HTTPException(status_code=400, detail="Invalid category. Must be one of: restaurant, cafe, bar, hotel, sights, museum, nature, activity")

    try:
        results = await overpass_provider.explore_category(lat, lng, category, radius)
        return {
            "status": "success",
            "data": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
