import asyncio
import requests
from app.agents.base_agent import ADKAgent, A2AMessage

class BudgetAgent(ADKAgent):
    def __init__(self):
        super().__init__("BudgetAgent")

    async def process_message(self, message: A2AMessage) -> dict:
        payload = message.payload
        budget = float(payload.get("budget", 50000.0))
        adults = int(payload.get("adults", 1))
        duration = int(payload.get("duration", 2))
        
        flights = payload.get("flights", {}).get("data", [])
        hotels = payload.get("hotels", {}).get("data", [])

        # 1. Flights (Multiply by adults)
        flight_cost = 0.0
        if flights:
            try:
                price_str = str(flights[0].get("price", "0")).replace("INR", "").replace("₹", "").replace(",", "").strip()
                flight_cost = float(price_str) * adults
            except ValueError:
                pass

        # 2. Hotels (Multiply by nights)
        hotel_cost = 0.0
        if hotels:
            try:
                price_str = str(hotels[0].get("price", "0")).replace("INR", "").replace("₹", "").replace(",", "").strip()
                nights = max(1, duration - 1)
                hotel_cost = float(price_str) * nights
            except ValueError:
                pass

        # 3. Estimated Itinerary Costs (Food, Transit, Activities)
        # Roughly ₹2500 per person per day
        daily_expense_per_person = 2500.0
        itinerary_cost = daily_expense_per_person * adults * duration

        total_cost = flight_cost + hotel_cost + itinerary_cost
        feasible = total_cost <= budget
        remaining = budget - total_cost

        if feasible:
            suggestion = f"Great! Your trip looks feasible. Flights (₹{flight_cost:,.0f}) and Hotels (₹{hotel_cost:,.0f}) take up the bulk, with estimated ₹{itinerary_cost:,.0f} for daily food and activities. You are under budget by ₹{remaining:,.2f}."
        else:
            suggestion = f"Warning: The estimated total (₹{total_cost:,.0f}) exceeds your budget of ₹{budget:,.0f} by ₹{abs(remaining):,.0f}. Try selecting cheaper dates or reducing the duration."

        # 4. Currency conversions via Frankfurter API
        currency_conversions = {}
        try:
            resp = requests.get(
                "https://api.frankfurter.dev/latest",
                params={"from": "INR", "to": "USD,EUR,GBP"},
                timeout=5,
            )
            resp.raise_for_status()
            rates = resp.json().get("rates", {})
            usd_rate = rates.get("USD", 0)
            eur_rate = rates.get("EUR", 0)
            gbp_rate = rates.get("GBP", 0)
            currency_conversions = {
                "USD": round(total_cost * usd_rate, 2),
                "EUR": round(total_cost * eur_rate, 2),
                "GBP": round(total_cost * gbp_rate, 2),
            }
        except Exception:
            currency_conversions = {}

        return {
            "status": "success",
            "agent": self.name,
            "data": {
                "feasible": feasible,
                "total_cost": total_cost,
                "remaining_budget": remaining,
                "suggestion": suggestion,
                "breakdown": {
                    "flights": flight_cost,
                    "hotels": hotel_cost,
                    "daily_expenses": itinerary_cost,
                },
                "currency_conversions": currency_conversions,
            }
        }
