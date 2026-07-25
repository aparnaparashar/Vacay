from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import List, Optional
from app.services.serpapi_service import serpapi_service
from app.services.holiday_service import holiday_service
import asyncio

router = APIRouter()

class LogisticsRequest(BaseModel):
    origin: str
    destination: str
    date: str
    adults: int = 1

class FlightModel(BaseModel):
    id: str
    airline: str
    price: str
    departure: str
    arrival: str
    stops: int

class HotelModel(BaseModel):
    id: str
    name: str
    chain: Optional[str] = None
    distance: Optional[float] = None
    image_url: Optional[str] = None

class LogisticsResponse(BaseModel):
    flights: List[FlightModel]
    hotels: List[HotelModel]

@router.post("/", response_model=LogisticsResponse)
async def get_logistics(request: LogisticsRequest):
    flights_task = serpapi_service.search_flights(
        request.origin, 
        request.destination, 
        request.date, 
        request.adults
    )
    hotels_task = serpapi_service.search_hotels(
        request.destination,
        request.date,
        request.adults
    )
    
    flights, hotels = await asyncio.gather(flights_task, hotels_task)
    
    return LogisticsResponse(flights=flights, hotels=hotels)

@router.get("/holidays")
async def get_holidays_endpoint(
    destination: str = Query(..., description="Destination name (e.g. 'Japan')"),
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD")
):
    holidays = await holiday_service.get_holidays(destination, start_date, end_date)
    return {"status": "success", "data": holidays}
