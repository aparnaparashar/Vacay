from fastapi import APIRouter
from app.models.schemas import TripRequest, Itinerary, ItineraryRefineRequest
from app.services.llm_service import llm_service

router = APIRouter()

@router.post("/generate", response_model=Itinerary)
async def generate_itinerary(request: TripRequest):
    prompt = f"Destination: {request.destination}\nDates: {request.start_date} to {request.end_date}\nBudget: {request.budget}\nPreferences: {request.preferences}\nTravel Style: {request.travel_style}\nNumber of travelers: {request.num_travelers}"
    res = await llm_service.generate_itinerary(prompt)
    return Itinerary(**res)

@router.post("/refine", response_model=Itinerary)
async def refine_itinerary(request: ItineraryRefineRequest):
    res = await llm_service.refine_itinerary(request.itinerary.model_dump_json(), request.instruction)
    return Itinerary(**res)
