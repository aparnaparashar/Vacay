import asyncio
import logging
import json
from app.agents.base_agent import ADKAgent, A2AMessage
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)

class PackingAgent(ADKAgent):
    def __init__(self):
        super().__init__("PackingAgent")

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        destination = payload.get("destination", "Unknown")
        duration = payload.get("duration", 2)
        adults = payload.get("adults", 1)
        
        weather_result = payload.get("weather", {})
        weather_data = weather_result.get("data") or {}
        
        # Determine general climate
        temp = weather_data.get("temp", 25)
        condition = weather_data.get("condition", "Clear")

        prompt = f"""
        You are a highly intelligent travel assistant generating a smart packing list for a trip to {destination}.
        Trip details:
        - Duration: {duration} days
        - Travelers: {adults} adults
        - Expected Weather: {condition}, {temp}°C

        Generate a structured, categorized packing list based on these details. If the weather is rainy, include umbrellas and waterproof gear. If sunny and hot, include sunscreen, sunglasses, and light clothes.
        Also, suggest quantity guidelines (e.g. {duration} pairs of socks).

        Return ONLY a JSON object representing the packing list.
        Do not include markdown backticks like ```json.
        Schema MUST EXACTLY match this structure:
        {{
            "categories": [
                {{
                    "name": "Clothing",
                    "items": ["3x T-shirts", "1x Light Jacket"]
                }},
                {{
                    "name": "Toiletries",
                    "items": ["Toothbrush", "Sunscreen"]
                }},
                {{
                    "name": "Electronics",
                    "items": ["Phone charger", "Universal Adapter"]
                }},
                {{
                    "name": "Weather Specific",
                    "items": ["Umbrella"]
                }}
            ]
        }}
        """

        try:
            raw_text = await llm_service.chat(prompt)
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()
            
            try:
                packing_data = json.loads(raw_text)
            except json.JSONDecodeError:
                packing_data = {"categories": []}

            return {
                "status": "success",
                "agent": self.name,
                "data": packing_data
            }

        except Exception as e:
            logger.error(f"PackingAgent Error: {e}")
            return {"status": "error", "agent": self.name, "message": str(e), "data": {}}
