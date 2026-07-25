import asyncio
from app.agents.base_agent import ADKAgent, A2AMessage
from app.providers.serpapi_flight_provider import SerpApiFlightProvider

class FlightAgent(ADKAgent):
    def __init__(self):
        super().__init__("FlightAgent")
        self.provider = SerpApiFlightProvider()

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        origin = payload.get("origin", "DEL")
        destination = payload.get("destination", "BOM")
        # Use a future date for tests if not provided
        date = payload.get("date", "2026-10-01")
        adults = payload.get("adults", 1)

        result = await self.provider.search(origin, destination, date, adults)
        
        return {
            "status": result["status"],
            "agent": self.name,
            "message": result["message"],
            "data": result["data"]
        }
