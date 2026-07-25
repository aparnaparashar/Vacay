import asyncio
import logging
from serpapi import GoogleSearch
from app.config import settings
from app.providers.flight_provider import FlightProvider
from typing import Dict, Any

logger = logging.getLogger(__name__)

CITY_TO_AIRPORT = {
    "delhi": "DEL",
    "mumbai": "BOM",
    "bangalore": "BLR",
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

class SerpApiFlightProvider(FlightProvider):
    def __init__(self):
        self.api_key = settings.serpapi_api_key

    def get_iata(self, city_name: str) -> str:
        city = city_name.lower().strip()
        return CITY_TO_AIRPORT.get(city, city.upper() if len(city) == 3 else "DEL")

    async def search(self, origin: str, destination: str, date: str, adults: int = 1) -> Dict[str, Any]:
        if not self.api_key:
            return {"status": "error", "message": "SERPAPI_API_KEY is missing", "data": []}

        origin_iata = self.get_iata(origin)
        dest_iata = self.get_iata(destination)

        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                loop = asyncio.get_running_loop()
                
                params = {
                    "engine": "google_flights",
                    "departure_id": origin_iata,
                    "arrival_id": dest_iata,
                    "outbound_date": date,
                    "currency": "INR",
                    "hl": "en",
                    "api_key": self.api_key,
                    "type": "2", # One way
                    "adults": adults
                }

                def _do_search():
                    search = GoogleSearch(params)
                    return search.get_dict()

                results_dict = await loop.run_in_executor(None, _do_search)

                if "error" in results_dict:
                    err_msg = str(results_dict["error"]).lower()
                    if "invalid" in err_msg or "past" in err_msg or "date" in err_msg or "not found" in err_msg:
                        return {"status": "no_flights", "message": f"Invalid search: {results_dict['error']}", "data": []}
                    else:
                        raise Exception(results_dict["error"])

                best_flights = results_dict.get("best_flights", [])
                other_flights = results_dict.get("other_flights", [])
                all_flights = best_flights + other_flights

                if not all_flights:
                    return {"status": "no_flights", "message": f"No flights found from {origin_iata} to {dest_iata} on {date}.", "data": []}

                parsed_results = []
                for idx, f in enumerate(all_flights[:5]):
                    flights_info = f.get("flights", [{}])[0]
                    airline = flights_info.get("airline", "Unknown")
                    
                    dep_time_full = flights_info.get("departure_airport", {}).get("time", "")
                    arr_time_full = flights_info.get("arrival_airport", {}).get("time", "")
                    
                    dep_iso = dep_time_full.replace(" ", "T") if dep_time_full else ""
                    arr_iso = arr_time_full.replace(" ", "T") if arr_time_full else ""

                    parsed_results.append({
                        "id": f"serpapi_{idx}",
                        "airline": airline,
                        "price": f"INR {f.get('price', 'Unknown')}",
                        "departure": dep_iso,
                        "arrival": arr_iso,
                        "stops": len(f.get("flights", [])) - 1
                    })
                
                return {
                    "status": "success",
                    "message": "Flights retrieved successfully.",
                    "data": parsed_results
                }

            except Exception as e:
                error_str = str(e).lower()
                
                if "rate limit" in error_str or "429" in error_str or "500" in error_str:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"SerpApi rate limit/error. Retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                
                return {
                    "status": "error",
                    "message": f"SerpApi Error: {e}",
                    "data": []
                }
