import logging
import asyncio
import httpx
from datetime import datetime, timedelta
from app.config import settings

logger = logging.getLogger(__name__)

CITY_TO_IATA = {
    "delhi": "DEL",
    "mumbai": "BOM",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "chennai": "MAA",
    "kolkata": "CCU",
    "hyderabad": "HYD",
    "pune": "PNQ",
    "goa": "GOI",
    "jaipur": "JAI",
    "kochi": "COK",
    "chandigarh": "IXC",
    "ahmedabad": "AMD",
    "lucknow": "LKO"
}

class SerpApiService:
    def __init__(self):
        self.api_key = settings.serpapi_api_key
        self.base_url = "https://serpapi.com/search.json"

    def get_iata(self, city_name: str) -> str:
        return CITY_TO_IATA.get(city_name.lower().strip(), "DEL")

    async def search_flights(self, origin: str, destination: str, departure_date: str, adults: int = 1):
        if not self.api_key:
            return []
            
        params = {
            "engine": "google_flights",
            "departure_id": self.get_iata(origin),
            "arrival_id": self.get_iata(destination),
            "outbound_date": departure_date,
            "type": "2", # one-way
            "adults": adults,
            "api_key": self.api_key
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                flights = []
                best_flights = data.get("best_flights", [])[:5]
                for f in best_flights:
                    flights_arr = f.get("flights", [])
                    if not flights_arr:
                        continue
                    
                    flights.append({
                        "id": flights_arr[0].get("flight_number", "UNKNOWN"),
                        "airline": flights_arr[0].get("airline", "Unknown Airline"),
                        "price": f"₹{f.get('price', 0)}",
                        "departure": flights_arr[0].get("departure_airport", {}).get("time", ""),
                        "arrival": flights_arr[-1].get("arrival_airport", {}).get("time", ""),
                        "stops": len(flights_arr) - 1
                    })
                return flights
        except Exception as e:
            logger.error(f"SerpApi Flight Error: {e}")
            return []

    async def get_hotel_image(self, property_token: str) -> str:
        if not property_token:
            return ""
        params = {
            "engine": "google_hotels_photos",
            "property_token": property_token,
            "api_key": self.api_key
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.base_url, params=params)
                data = response.json()
                photos = data.get("photos", [])
                if photos:
                    return photos[0].get("thumbnail", photos[0].get("original_image", ""))
        except Exception:
            pass
        return ""

    async def search_hotels(self, city_name: str, check_in_date: str, adults: int = 1):
        if not self.api_key:
            return []

        try:
            check_in_dt = datetime.strptime(check_in_date, "%Y-%m-%d")
            check_out_dt = check_in_dt + timedelta(days=2)
            check_out_date = check_out_dt.strftime("%Y-%m-%d")
        except:
            check_out_date = check_in_date

        params = {
            "engine": "google_hotels",
            "q": city_name,
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "adults": adults,
            "currency": "INR",
            "api_key": self.api_key
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                properties = data.get("properties", [])[:5]
                hotels = []
                
                for h in properties:
                    price = h.get("rate_per_night", {}).get("lowest", "N/A")
                    images = h.get("images", [])
                    
                    image_url = ""
                    if images:
                        image_url = images[0].get("thumbnail", images[0].get("original_image", ""))
                        
                    hotels.append({
                        "id": h.get("name", ""),
                        "name": h.get("name", ""),
                        "chain": str(price) if price else "Price info not available",
                        "distance": None,
                        "image_url": image_url
                    })
                
                return hotels
        except Exception as e:
            logger.error(f"SerpApi Hotel Error: {e}")
            return []

serpapi_service = SerpApiService()
