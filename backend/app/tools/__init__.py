"""
Tool layer for the Vacay Chatbot — spec Section 16 (Intelligent Tool Selection).

Exposes Gemini function declarations plus a single async dispatcher. Gemini
decides which tool to call; `execute_tool` runs it and returns a plain dict
that is fed straight back to the model.

Every tool wraps an existing service or provider — no new external APIs.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from google.genai import types

from app.tools.budget_tool import plan_budget_day
from app.tools.places_tool import VALID_CATEGORIES, get_nearby_attractions, search_places
from app.tools.restaurant_tool import search_restaurants
from app.tools.route_tool import VALID_MODES, get_route
from app.tools.weather_tool import get_weather

logger = logging.getLogger(__name__)

_STR = types.Type.STRING
_NUM = types.Type.NUMBER
_INT = types.Type.INTEGER
_BOOL = types.Type.BOOLEAN
_OBJ = types.Type.OBJECT


def _schema(properties: dict, required: Optional[list[str]] = None) -> types.Schema:
    return types.Schema(type=_OBJ, properties=properties, required=required or [])


FUNCTION_DECLARATIONS: list[types.FunctionDeclaration] = [
    types.FunctionDeclaration(
        name="get_weather",
        description=(
            "Get the weather forecast for a destination. Call this before "
            "recommending outdoor activities, or whenever the user asks about "
            "weather, rain, temperature, or what to do today."
        ),
        parameters=_schema(
            {
                "location": types.Schema(
                    type=_STR,
                    description="City or place name, e.g. 'Kyoto'. Omit to use the user's current location.",
                ),
                "latitude": types.Schema(type=_NUM, description="Optional exact latitude."),
                "longitude": types.Schema(type=_NUM, description="Optional exact longitude."),
            }
        ),
    ),
    types.FunctionDeclaration(
        name="search_places",
        description=(
            "Search for places, attractions or landmarks by free-text query, "
            "e.g. 'heritage temples in Kyoto'. Use for destination "
            "recommendations when the user names what they are looking for."
        ),
        parameters=_schema(
            {
                "query": types.Schema(type=_STR, description="What to search for."),
                "location": types.Schema(
                    type=_STR, description="City or area to search within."
                ),
            },
            required=["query"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_nearby_attractions",
        description=(
            "Find points of interest near a location by category. Use for "
            "'what's interesting near me', hidden gems, museums, parks, sights."
        ),
        parameters=_schema(
            {
                "category": types.Schema(
                    type=_STR,
                    description="One of: " + ", ".join(VALID_CATEGORIES),
                    enum=list(VALID_CATEGORIES),
                ),
                "location": types.Schema(type=_STR, description="Place name to search around."),
                "latitude": types.Schema(type=_NUM),
                "longitude": types.Schema(type=_NUM),
                "radius_meters": types.Schema(
                    type=_INT, description="Search radius, 200-20000. Default 3000."
                ),
            },
            required=["category"],
        ),
    ),
    types.FunctionDeclaration(
        name="search_restaurants",
        description=(
            "Find restaurants, cafés or bars near a location. Use whenever the "
            "user asks where to eat or drink."
        ),
        parameters=_schema(
            {
                "location": types.Schema(type=_STR, description="Place name to search around."),
                "latitude": types.Schema(type=_NUM),
                "longitude": types.Schema(type=_NUM),
                "cuisine": types.Schema(
                    type=_STR, description="Preferred cuisine, e.g. 'italian', 'vegetarian'."
                ),
                "venue_type": types.Schema(
                    type=_STR,
                    description="restaurant, cafe or bar. Default restaurant.",
                    enum=["restaurant", "cafe", "bar"],
                ),
                "radius_meters": types.Schema(type=_INT, description="200-10000. Default 1500."),
                "max_price_level": types.Schema(
                    type=_INT, description="Price ceiling 1 (cheap) to 4 (expensive)."
                ),
            }
        ),
    ),
    types.FunctionDeclaration(
        name="get_route",
        description=(
            "Get travel time and distance between two places. Use for "
            "'how do I get to X', airport transfers, or journey planning."
        ),
        parameters=_schema(
            {
                "origin": types.Schema(type=_STR, description="Starting place name or address."),
                "destination": types.Schema(type=_STR, description="Destination place or address."),
                "mode": types.Schema(
                    type=_STR,
                    description="Travel mode. Default driving.",
                    enum=list(VALID_MODES),
                ),
            },
            required=["origin", "destination"],
        ),
    ),
    types.FunctionDeclaration(
        name="plan_budget_day",
        description=(
            "Split a daily budget into per-slot spending ceilings (meals, "
            "activities, transport). Call this first when the user gives a "
            "budget for the day, then recommend options that fit each ceiling."
        ),
        parameters=_schema(
            {
                "total_budget": types.Schema(type=_NUM, description="Total money available today."),
                "currency": types.Schema(type=_STR, description="Currency code, e.g. USD, INR."),
                "num_people": types.Schema(type=_INT, description="How many travellers. Default 1."),
                "style": types.Schema(
                    type=_STR,
                    description="budget, balanced or comfort. Default balanced.",
                    enum=["budget", "balanced", "comfort"],
                ),
                "include_transport": types.Schema(
                    type=_BOOL, description="Reserve part of the budget for local transport."
                ),
            },
            required=["total_budget"],
        ),
    ),
]

GEMINI_TOOLS = [types.Tool(function_declarations=FUNCTION_DECLARATIONS)]

# Which data source each tool represents, surfaced in the response `sources`.
TOOL_SOURCES = {
    "get_weather": "weather_api",
    "search_places": "places_api",
    "get_nearby_attractions": "places_api",
    "search_restaurants": "places_api",
    "get_route": "maps_api",
    "plan_budget_day": "budget_planner",
}

# Coarse intent label per tool, reported back to the client (spec Section 15).
TOOL_INTENTS = {
    "get_weather": "weather",
    "search_places": "recommendation",
    "get_nearby_attractions": "recommendation",
    "search_restaurants": "recommendation",
    "get_route": "transportation",
    "plan_budget_day": "day_planning",
}


async def execute_tool(
    name: str,
    args: dict[str, Any],
    *,
    preferences: Optional[list[str]] = None,
    user_point: Optional[tuple[float, float]] = None,
    weather_condition: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run one tool call.

    `preferences`, `user_point` and `weather_condition` are injected by the chat
    service — they come from conversation context, not from the model, so they
    are deliberately not part of the function declarations.
    """
    args = dict(args or {})
    logger.info("Executing tool %s with args %s", name, args)

    try:
        if name == "get_weather":
            return await get_weather(
                location=args.get("location"),
                latitude=args.get("latitude"),
                longitude=args.get("longitude"),
                fallback=user_point,
            )

        if name == "search_places":
            return await search_places(
                query=args.get("query", ""),
                location=args.get("location"),
                preferences=preferences,
                fallback=user_point,
                weather_condition=weather_condition,
            )

        if name == "get_nearby_attractions":
            return await get_nearby_attractions(
                category=args.get("category", "sights"),
                location=args.get("location"),
                latitude=args.get("latitude"),
                longitude=args.get("longitude"),
                radius_meters=args.get("radius_meters"),
                preferences=preferences,
                fallback=user_point,
                weather_condition=weather_condition,
            )

        if name == "search_restaurants":
            return await search_restaurants(
                location=args.get("location"),
                latitude=args.get("latitude"),
                longitude=args.get("longitude"),
                cuisine=args.get("cuisine"),
                venue_type=args.get("venue_type", "restaurant"),
                radius_meters=args.get("radius_meters"),
                max_price_level=args.get("max_price_level"),
                preferences=preferences,
                fallback=user_point,
            )

        if name == "get_route":
            return await get_route(
                origin=args.get("origin", ""),
                destination=args.get("destination", ""),
                mode=args.get("mode", "driving"),
            )

        if name == "plan_budget_day":
            return plan_budget_day(
                total_budget=args.get("total_budget", 0),
                currency=args.get("currency", "USD"),
                num_people=args.get("num_people", 1),
                style=args.get("style", "balanced"),
                include_transport=args.get("include_transport", True),
            )

        return {"ok": False, "error": f"Unknown tool '{name}'."}

    except Exception as e:
        # A tool failure must never break the conversation — hand the model an
        # error it can explain to the user instead (spec Section 18: be honest).
        logger.exception("Tool %s failed", name)
        return {"ok": False, "error": f"The {name} lookup failed: {e}"}


__all__ = [
    "FUNCTION_DECLARATIONS",
    "GEMINI_TOOLS",
    "TOOL_SOURCES",
    "TOOL_INTENTS",
    "execute_tool",
]
