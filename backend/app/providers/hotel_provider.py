from abc import ABC, abstractmethod
from typing import List, Dict, Any

class HotelProvider(ABC):
    @abstractmethod
    async def search(self, destination: str, check_in: str, check_out: str, adults: int = 1) -> Dict[str, Any]:
        """
        Returns a structured dictionary:
        {
            "status": "success" | "no_hotels" | "error",
            "message": str,
            "data": List[Dict] # list of hotels
        }
        """
        pass
