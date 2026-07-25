import asyncio
import json
import hashlib
from datetime import datetime
from typing import AsyncGenerator
from app.agents.base_agent import ADKAgent
from app.agents.flight_agent import FlightAgent
from app.agents.hotel_agent import HotelAgent
from app.agents.itinerary_agent import ItineraryAgent
from app.agents.budget_agent import BudgetAgent
from app.agents.weather_agent import WeatherAgent
from app.agents.packing_agent import PackingAgent

# In-memory cache for Phase 5 (Key: payload hash, Value: list of SSE messages)
# Note: Caching can cause stale data if the underlying agent logic is updated!
_cache = {}

class OrchestratorAgent(ADKAgent):
    def __init__(self):
        super().__init__("OrchestratorAgent")
        self.flight_agent = FlightAgent()
        self.hotel_agent = HotelAgent()
        self.itinerary_agent = ItineraryAgent()
        self.budget_agent = BudgetAgent()
        self.weather_agent = WeatherAgent()
        self.packing_agent = PackingAgent()

    def _generate_cache_key(self, request_payload: dict) -> str:
        payload_str = json.dumps(request_payload, sort_keys=True)
        return hashlib.md5(payload_str.encode()).hexdigest()

    async def stream_plan(self, request_payload: dict, user_id: int = None) -> AsyncGenerator[str, None]:
        yield f"data: {json.dumps({'event': 'orchestrator_started', 'message': 'Starting multi-agent orchestration'})}\n\n"
        
        cache_key = self._generate_cache_key(request_payload)
        
        if cache_key in _cache:
            yield f"data: {json.dumps({'event': 'cache_hit', 'message': 'Serving plan from cache'})}\n\n"
            for step in _cache[cache_key]:
                yield step
                await asyncio.sleep(0.1)
            yield f"data: {json.dumps({'event': 'orchestrator_finished', 'message': 'Orchestration complete'})}\n\n"
            return

        plan_steps = []

        def yield_and_cache(step_data: str):
            plan_steps.append(step_data)
            return step_data

        try:
            # Phase 1: Run Weather, Flights, and Hotels IN PARALLEL (they are independent)
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'WeatherAgent'})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'FlightAgent'})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'HotelAgent'})}\n\n")

            weather_result, flight_result, hotel_result = await asyncio.gather(
                self.send_message(self.weather_agent, request_payload),
                self.send_message(self.flight_agent, request_payload),
                self.send_message(self.hotel_agent, request_payload),
            )

            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'WeatherAgent', 'result': weather_result})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'FlightAgent', 'result': flight_result})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'HotelAgent', 'result': hotel_result})}\n\n")
            
            # Phase 2: Itinerary and Packing Generation (depends on weather, flights, hotels)
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'ItineraryAgent'})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'PackingAgent'})}\n\n")
            
            # Get duration from payload
            duration = request_payload.get("duration", 2)
            dep_date = request_payload.get("date", "")
            
            phase2_payload = {
                **request_payload, 
                "duration": duration,
                "flights": flight_result, 
                "hotels": hotel_result,
                "weather": weather_result
            }
            
            itinerary_result, packing_result = await asyncio.gather(
                self.send_message(self.itinerary_agent, phase2_payload),
                self.send_message(self.packing_agent, phase2_payload)
            )
            
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'ItineraryAgent', 'result': itinerary_result})}\n\n")
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'PackingAgent', 'result': packing_result})}\n\n")
            
            # Phase 3: Budget Check (depends on everything above)
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_running', 'agent': 'BudgetAgent'})}\n\n")
            budget_payload = {**phase2_payload, "itinerary": itinerary_result, "packing": packing_result}
            budget_result = await self.send_message(self.budget_agent, budget_payload)
            yield yield_and_cache(f"data: {json.dumps({'event': 'agent_completed', 'agent': 'BudgetAgent', 'result': budget_result})}\n\n")

            # Store in cache after successful completion
            _cache[cache_key] = plan_steps
            
            # --- AUTO SAVE TRIP TO DB ---
            try:
                from app.db.database import AsyncSessionLocal
                from app.db.models import TripRecord
                
                def safe_int(v, default=1):
                    try:
                        return int(v)
                    except (ValueError, TypeError):
                        return default
                        
                def safe_float(v, default=50000.0):
                    try:
                        return float(v)
                    except (ValueError, TypeError):
                        return default

                async with AsyncSessionLocal() as session:
                    # Calculate arrival date for DB
                    arrival_date_str = ""
                    try:
                        d1 = datetime.strptime(request_payload.get("date", ""), "%Y-%m-%d")
                        import datetime as dt
                        d2 = d1 + dt.timedelta(days=max(0, int(request_payload.get("duration", 2)) - 1))
                        arrival_date_str = d2.strftime("%Y-%m-%d")
                    except Exception:
                        pass
                        
                    db_trip = TripRecord(
                        owner_id=user_id,
                        origin=request_payload.get("origin", ""),
                        destination=request_payload.get("destination", ""),
                        departure_date=request_payload.get("date", ""),
                        arrival_date=arrival_date_str,
                        adults=safe_int(request_payload.get("adults")),
                        budget=safe_float(request_payload.get("budget")),
                        trip_data={
                            "origin": request_payload.get("origin"),
                            "destination": request_payload.get("destination"),
                            "departureDate": request_payload.get("date", ""),
                            "duration": request_payload.get("duration", 2),
                            "adults": safe_int(request_payload.get("adults")),
                            "budget": safe_float(request_payload.get("budget")),
                            "weather": weather_result.get("data") if isinstance(weather_result, dict) else {},
                            "flights": flight_result.get("data") if isinstance(flight_result, dict) else [],
                            "hotels": hotel_result.get("data") if isinstance(hotel_result, dict) else [],
                            "itinerary": itinerary_result.get("data") if isinstance(itinerary_result, dict) else {},
                            "packing": packing_result.get("data") if isinstance(packing_result, dict) else {},
                            "budgetResult": budget_result.get("data") if isinstance(budget_result, dict) else {}
                        }
                    )
                    session.add(db_trip)
                    await session.commit()
                    await session.refresh(db_trip)
                    
                    if user_id:
                        from app.db.models import TripMember
                        member = TripMember(trip_id=db_trip.id, user_id=user_id, role="admin")
                        session.add(member)
                        await session.commit()
            except Exception as e:
                print(f"Failed to auto-save trip: {e}")
            
        except Exception as e:
            yield f"data: {json.dumps({'event': 'orchestrator_error', 'message': str(e)})}\n\n"
        finally:
            yield f"data: {json.dumps({'event': 'orchestrator_finished', 'message': 'Orchestration complete'})}\n\n"
