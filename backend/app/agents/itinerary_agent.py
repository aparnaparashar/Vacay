import asyncio
import json
from google import genai
from google.genai import types
from app.config import settings
from app.agents.base_agent import ADKAgent, A2AMessage
from app.providers.places_provider import PlacesProvider
from app.services.holiday_service import holiday_service

class ItineraryAgent(ADKAgent):
    def __init__(self):
        super().__init__("ItineraryAgent")
        self.places = PlacesProvider()
        # Initialize Gemini via ADK / GenAI SDK
        self.gemini_client = genai.Client(api_key=settings.gemini_api_key) if settings.gemini_api_key else None

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        destination = payload.get("destination", "Mumbai")

        duration = payload.get("duration", 2)
        weather_result = payload.get("weather", {})
        weather_data = weather_result.get("data") or {}
        forecast_list = weather_data.get("forecast", [])
        
        # Build day-by-day weather string
        weather_context = ""
        if forecast_list:
            for i in range(min(duration, len(forecast_list))):
                day_weather = forecast_list[i]
                weather_context += f"Day {i+1} ({day_weather['date']}): {day_weather['condition']}, {day_weather['temp']}°C\n"
        else:
            weather_condition = weather_data.get("condition", "Unknown")
            temp = weather_data.get("temp", "Unknown")
            weather_context = f"All days: {weather_condition}, {temp}°C"

        if not self.gemini_client:
            return {"status": "error", "agent": self.name, "message": "GEMINI_API_KEY is missing", "data": {}}

        # Generate dynamic schema based on duration to force the LLM to output all days
        days_schema = ",\n".join([f"""                {{
                    "day": {i},
                    "activities": [
                        {{
                            "time": "09:00 AM",
                            "title": "Breakfast/Activity",
                            "type": "MEAL",
                            "search_query": "Popular spot in {destination}"
                        }}
                    ]
                }}""" for i in range(1, duration + 1)])

        # Fetch holiday warnings
        holiday_context = ""
        if forecast_list:
            start_date = forecast_list[0].get("date")
            end_date = forecast_list[-1].get("date")
            if start_date and end_date:
                try:
                    loop = asyncio.get_running_loop()
                    holiday_warnings = await loop.run_in_executor(
                        None, holiday_service.get_holiday_warnings, destination, start_date, end_date
                    )
                    if holiday_warnings:
                        holiday_context = "\nPUBLIC HOLIDAY WARNINGS:\n" + "\n".join(holiday_warnings) + "\nAdapt the itinerary to account for closures or crowds during these holidays."
                except Exception as e:
                    pass

        # Generate agentic itinerary via Gemini
        prompt = f"""
        You are a highly intelligent travel agent planning a {duration}-day itinerary for {destination}.
        Here is the daily weather forecast for the trip:
        {weather_context}
        {holiday_context}
        
        CRITICAL INSTRUCTIONS:
        1. Adapt the plan to EACH DAY'S weather: if Day 2 is raining/hot, schedule indoor museums, cafes, or malls for Day 2. If Day 3 is clear, schedule outdoor beaches, hikes, or parks for Day 3. You MUST map activities to the specific daily forecast!
        2. Group activities logically by neighborhood to minimize travel distance and traffic time.
        3. Include specific recommendations for quick local snacks, street food, or highly-rated cafes between major sightseeing spots.
        4. ABSOLUTE REQUIREMENT: You MUST provide exactly {duration} days in the itinerary. The "days" array must have exactly {duration} elements, numbered 1 through {duration}.
        
        Return ONLY a JSON object representing the daily plan.
        Do not include markdown backticks like ```json.
        Schema MUST EXACTLY match this structure for all {duration} days:
        {{
            "days": [
{days_schema}
            ]
        }}
        """
        
        loop = asyncio.get_running_loop()
        def _call_gemini():
            return self.gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=8192
                )
            )

        def _call_groq():
            from groq import Groq
            groq_client = Groq(api_key=settings.groq_api_key)
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a JSON-only API. Output ONLY valid JSON without any markdown formatting, no backticks, no explanations. You MUST output ALL requested array items."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            return response.choices[0].message.content
        
        try:
            # 1. Try Gemini First
            response = await loop.run_in_executor(None, _call_gemini)
            response_text = response.text
            itinerary_plan = json.loads(response_text)
        except Exception as gemini_err:
            # 2. Fallback to Groq
            try:
                response_text = await loop.run_in_executor(None, _call_groq)
                # Strip markdown backticks if present
                if response_text.startswith("```"):
                    response_text = response_text.split("```")[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]
                response_text = response_text.strip()
                itinerary_plan = json.loads(response_text)
            except Exception as groq_err:
                return {"status": "error", "agent": self.name, "message": f"Gemini Error: {gemini_err} | Groq Error: {groq_err}", "data": {}}

        # Enrich with real places data via Ola Maps
        for day in itinerary_plan.get("days", []):
            prev_location = None
            for activity in day.get("activities", []):
                query = activity.get("search_query")
                if query:
                    async def _get_place_async():
                        suggs = await self.places.search_places(f"{query} {destination}")
                        if suggs:
                            place = suggs[0]
                            return {
                                "name": place.get("displayName", {}).get("text", query),
                                "address": place.get("formattedAddress", ""),
                                "rating": place.get("rating", 4.0),
                                "location": {"lat": place.get("location", {}).get("latitude"), "lng": place.get("location", {}).get("longitude")},
                                "photos": [place.get("photos", [{}])[0].get("name", "")]
                            }
                        return None

                    top_place = await _get_place_async()

                    if top_place:
                        activity["place_details"] = {
                            "name": top_place.get("name"),
                            "address": top_place.get("address"),
                            "rating": top_place.get("rating"),
                            "location": top_place.get("location")
                        }
                        
                        photos = top_place.get("photos", [])
                        if photos:
                            activity["place_details"]["photo_url"] = photos[0] if isinstance(photos[0], str) else photos[0].get("url", "")
                        
                        curr_location = top_place.get("location")
                        if prev_location and curr_location:
                            prev_lat = prev_location.get("lat", 0)
                            prev_lng = prev_location.get("lng", 0)
                            curr_lat = curr_location.get("lat", 0)
                            curr_lng = curr_location.get("lng", 0)
                            if prev_lat and curr_lat:
                                travel_info = await self.places.get_distance_and_time(prev_lat, prev_lng, curr_lat, curr_lng)
                                activity["travel_info"] = {
                                    "distance": travel_info.get("distance", "N/A"),
                                    "duration": travel_info.get("duration", "N/A"),
                                    "mode": "driving",
                                    "steps": []
                                }
                        prev_location = curr_location

                        # For MEAL activities, find real nearby restaurants via PlacesProvider
                        if activity.get("type") == "MEAL" and curr_location:
                            lat = curr_location.get("lat", 0)
                            lon = curr_location.get("lng", 0)
                            if lat and lon:
                                alt_places = await self.places.search_nearby(lat, lon, "restaurant", 1000)
                                alternatives = []
                                main_name = top_place.get("name", "").lower()
                                for alt in alt_places or []:
                                    alt_name = alt.get("displayName", {}).get("text", "")
                                    if alt_name.lower() != main_name:
                                        alt_data = {
                                            "name": alt_name,
                                            "rating": alt.get("rating", 4.0),
                                        }
                                        alt_photos = alt.get("photos", [])
                                        if alt_photos:
                                            alt_data["photo_url"] = alt_photos[0] if isinstance(alt_photos[0], str) else alt_photos[0].get("name", "")
                                        alternatives.append(alt_data)
                                    if len(alternatives) >= 3:
                                        break
                                if alternatives:
                                    activity["alternatives"] = alternatives

        return {
            "status": "success",
            "agent": self.name,
            "data": itinerary_plan
        }

