from abc import ABC, abstractmethod
from typing import List, Dict, Any

class FlightProvider(ABC):
    @abstractmethod
    async def search(self, origin: str, destination: str, date: str, adults: int = 1) -> Dict[str, Any]:
        """
        Returns a structured dictionary:
        {
            "status": "success" | "no_flights" | "error",
            "message": str,
            "data": List[Dict] # list of flights
        }
        """
        pass
