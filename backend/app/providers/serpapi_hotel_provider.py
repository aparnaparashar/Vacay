import asyncio
import logging
from serpapi import GoogleSearch
from app.config import settings
from app.providers.hotel_provider import HotelProvider
from typing import Dict, Any

logger = logging.getLogger(__name__)

class SerpApiHotelProvider(HotelProvider):
    def __init__(self):
        self.api_key = settings.serpapi_api_key

    async def search(self, destination: str, check_in: str, check_out: str, adults: int = 1) -> Dict[str, Any]:
        if not self.api_key:
            return {"status": "error", "message": "SERPAPI_API_KEY is missing", "data": []}

        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                loop = asyncio.get_running_loop()
                
                params = {
                    "engine": "google_hotels",
                    "q": destination,
                    "check_in_date": check_in,
                    "check_out_date": check_out,
                    "adults": str(adults),
                    "currency": "INR",
                    "hl": "en",
                    "api_key": self.api_key
                }

                def _do_search():
                    search = GoogleSearch(params)
                    return search.get_dict()

                results_dict = await loop.run_in_executor(None, _do_search)

                if "error" in results_dict:
                    err_msg = str(results_dict["error"]).lower()
                    if "invalid" in err_msg or "past" in err_msg or "date" in err_msg or "not found" in err_msg:
                        return {"status": "no_hotels", "message": f"Invalid search: {results_dict['error']}", "data": []}
                    else:
                        raise Exception(results_dict["error"])

                properties = results_dict.get("properties", [])
                
                if not properties:
                    return {"status": "no_hotels", "message": f"No hotels found in {destination} for {check_in}.", "data": []}

                parsed_results = []
                for idx, p in enumerate(properties[:5]):
                    price = p.get("rate_per_night", {}).get("lowest", "Unknown")
                    if isinstance(price, (int, float)):
                        price_str = f"INR {price}"
                    else:
                        price_str = str(price)

                    images = p.get("images", [])
                    thumbnail = images[0].get("original_image") if images else None

                    parsed_results.append({
                        "id": p.get("property_token", f"serpapi_hotel_{idx}"),
                        "name": p.get("name", "Unknown Hotel"),
                        "price": price_str,
                        "rating": p.get("overall_rating", "N/A"),
                        "thumbnail": thumbnail,
                        "amenities": p.get("amenities", [])[:3]
                    })
                
                return {
                    "status": "success",
                    "message": "Hotels retrieved successfully.",
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
