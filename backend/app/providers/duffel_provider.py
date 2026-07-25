import asyncio
import logging
from duffel_api import Duffel
from app.config import settings
from app.providers.flight_provider import FlightProvider
from typing import Dict, Any

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

class DuffelProvider(FlightProvider):
    def __init__(self):
        # Explicit token handling as per Phase 1 req
        self.access_token = settings.duffel_api_key
        # Delaying Duffel init until we know key is present
        self.client = Duffel(access_token=self.access_token, api_version="beta") if self.access_token else None

    def get_iata(self, city_name: str) -> str:
        city = city_name.lower().strip()
        return CITY_TO_IATA.get(city, city.upper() if len(city) == 3 else "DEL")

    async def search(self, origin: str, destination: str, date: str, adults: int = 1) -> Dict[str, Any]:
        if not self.client:
            return {
                "status": "error", 
                "message": "DUFFEL_API_KEY is not configured.", 
                "data": []
            }

        origin_iata = self.get_iata(origin)
        dest_iata = self.get_iata(destination)

        # Exponential Backoff with Retry
        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                # Duffel API is synchronous, we run it in a threadpool to not block asyncio
                loop = asyncio.get_running_loop()
                
                # Create Offer Request
                slices = [{"origin": origin_iata, "destination": dest_iata, "departure_date": date}]
                passengers = [{"type": "adult"} for _ in range(adults)]
                
                def _do_search():
                    return self.client.offer_requests.create() \
                        .slices(slices) \
                        .passengers(passengers) \
                        .return_offers() \
                        .execute()

                # Executing in threadpool
                offer_request = await loop.run_in_executor(None, _do_search)

                offers = offer_request.offers
                if not offers:
                    return {
                        "status": "no_flights",
                        "message": f"No flights found from {origin_iata} to {dest_iata} on {date}.",
                        "data": []
                    }

                # Sort by price
                offers.sort(key=lambda x: float(x.total_amount))
                
                results = []
                for offer in offers[:5]:
                    flight = offer.slices[0].segments[0]
                    departing_at = flight.departing_at
                    arriving_at = offer.slices[0].segments[-1].arriving_at
                    
                    dep_str = departing_at[11:16] if isinstance(departing_at, str) else departing_at.strftime("%H:%M")
                    arr_str = arriving_at[11:16] if isinstance(arriving_at, str) else arriving_at.strftime("%H:%M")
                    
                    results.append({
                        "id": offer.id,
                        "airline": flight.operating_carrier.name,
                        "price": f"{offer.total_currency} {offer.total_amount}",
                        "departure": dep_str,
                        "arrival": arr_str,
                        "stops": len(offer.slices[0].segments) - 1
                    })
                
                return {
                    "status": "success",
                    "message": "Flights retrieved successfully.",
                    "data": results
                }

            except Exception as e:
                error_str = str(e).lower()
                
                # "intentionally-bad search (nonexistent airport code, past date) returns defined error shape"
                if "invalid" in error_str or "past" in error_str or "validation" in error_str or "not found" in error_str:
                    return {
                        "status": "no_flights",
                        "message": f"Invalid search parameters: {e}",
                        "data": []
                    }

                # Rate limiting (429) or temporary server errors (500)
                if "rate limit" in error_str or "429" in error_str or "500" in error_str:
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Duffel rate limit/error. Retrying in {delay}s... (Attempt {attempt+1}/{max_retries})")
                        await asyncio.sleep(delay)
                        continue
                
                # Final fallback
                return {
                    "status": "error",
                    "message": f"Duffel API Error: {e}",
                    "data": []
                }
