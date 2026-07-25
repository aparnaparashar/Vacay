from fastapi import APIRouter, Query
from app.models.schemas import DestinationSearchResult, DestinationDetail
from app.services.places_service import places_service

router = APIRouter()

@router.get("/search", response_model=DestinationSearchResult)
async def search_destinations(q: str = Query(..., description="Search query")):
    results = await places_service.search_places(q)
    return DestinationSearchResult(results=results, query=q)

@router.get("/{place_id}", response_model=DestinationDetail)
async def get_destination(place_id: str):
    return await places_service.get_place_details(place_id)
