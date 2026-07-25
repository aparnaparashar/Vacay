from fastapi import APIRouter, Query
from app.services.weather_service import weather_service

router = APIRouter()

@router.get("/")
async def get_weather(lat: float = Query(...), lon: float = Query(...)):
    res = await weather_service.get_forecast(lat, lon)
    return res
