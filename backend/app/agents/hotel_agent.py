import asyncio
from datetime import datetime, timedelta
from app.agents.base_agent import ADKAgent, A2AMessage
from app.providers.serpapi_hotel_provider import SerpApiHotelProvider

class HotelAgent(ADKAgent):
    def __init__(self):
        super().__init__("HotelAgent")
        self.provider = SerpApiHotelProvider()

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        destination = payload.get("destination", "Mumbai")
        # Use actual trip dates
        check_in = payload.get("date", "2026-10-01")
        duration = payload.get("duration", 2)
        try:
            date_obj = datetime.strptime(check_in, "%Y-%m-%d")
            check_out = (date_obj + timedelta(days=max(duration, 1))).strftime("%Y-%m-%d")
        except:
            check_out = "2026-10-03"

        adults = payload.get("adults", 1)

        result = await self.provider.search(destination, check_in, check_out, adults)
        
        return {
            "status": result["status"],
            "agent": self.name,
            "message": result["message"],
            "data": result["data"]
        }
