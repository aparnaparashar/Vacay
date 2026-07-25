"""
Pydantic models for all Wandr API request/response schemas.

Covers: Chat, Destinations, Weather, Itinerary, Budget, and Collections.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Chat
# ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single message in a conversation."""
    role: str = Field(..., description="'user' or 'model'")
    content: str = Field(..., description="Message text")


class ChatRequest(BaseModel):
    """Incoming chat request from the frontend."""
    message: str = Field(..., min_length=1, description="User's message")
    conversation_history: list[ChatMessage] = Field(
        default_factory=list,
        description="Previous messages for context",
    )


class ChatResponse(BaseModel):
    """Chat response returned to the frontend."""
    reply: str = Field(..., description="AI-generated reply")
    sources: list[str] = Field(default_factory=list, description="Optional source references")


# ──────────────────────────────────────────────
# Destinations
# ──────────────────────────────────────────────

class Destination(BaseModel):
    """Lightweight destination summary used in search results."""
    place_id: str
    name: str
    formatted_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rating: Optional[float] = None
    user_rating_count: Optional[int] = None
    types: list[str] = Field(default_factory=list)
    photo_url: Optional[str] = None


class DestinationSearchResult(BaseModel):
    """Wrapper for a list of destination search results."""
    results: list[Destination] = Field(default_factory=list)
    query: str = ""


class OpeningHours(BaseModel):
    """Opening hours for a place."""
    weekday_text: list[str] = Field(default_factory=list)
    open_now: Optional[bool] = None


class Review(BaseModel):
    """A user review for a place."""
    author: str = ""
    rating: Optional[float] = None
    text: str = ""
    time: Optional[str] = None


class DestinationDetail(BaseModel):
    """Full details for a single destination."""
    place_id: str
    name: str
    formatted_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rating: Optional[float] = None
    user_rating_count: Optional[int] = None
    types: list[str] = Field(default_factory=list)
    phone_number: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[OpeningHours] = None
    reviews: list[Review] = Field(default_factory=list)
    photo_urls: list[str] = Field(default_factory=list)
    editorial_summary: Optional[str] = None
    price_level: Optional[str] = None


class PopularDestination(BaseModel):
    """A curated popular destination entry."""
    name: str
    state: str
    tagline: str
    category: str = Field(..., description="e.g. heritage, beach, hill-station, spiritual")
    latitude: float
    longitude: float
    image_url: Optional[str] = None
    place_id: Optional[str] = None


class Collection(BaseModel):
    """A curated travel collection / circuit."""
    id: str
    title: str
    description: str
    cover_image: Optional[str] = None
    destinations: list[PopularDestination] = Field(default_factory=list)
    duration_days: int = Field(..., description="Recommended trip length")
    best_season: str = ""


# ──────────────────────────────────────────────
# Weather
# ──────────────────────────────────────────────

class WeatherDay(BaseModel):
    """Weather summary for a single day."""
    date: str
    temp_min: float
    temp_max: float
    temp_avg: float
    humidity: float
    wind_speed: float
    weather_main: str = Field(..., description="e.g. Clear, Rain, Clouds")
    weather_description: str = ""
    icon: str = ""
    rain_probability: float = 0.0


class WeatherForecast(BaseModel):
    """Multi-day weather forecast."""
    latitude: float
    longitude: float
    city: str = ""
    days: list[WeatherDay] = Field(default_factory=list)


class WeatherSuitabilityLevel(str, Enum):
    OUTDOOR_FRIENDLY = "outdoor_friendly"
    INDOOR_PREFERRED = "indoor_preferred"
    WEATHER_DEPENDENT = "weather_dependent"


class WeatherSuitability(BaseModel):
    """Whether a day is suitable for outdoor activities."""
    date: str
    suitability: WeatherSuitabilityLevel
    reason: str = ""
    weather: Optional[WeatherDay] = None


# ──────────────────────────────────────────────
# Itinerary
# ──────────────────────────────────────────────

class TravelStyle(str, Enum):
    RELAXED = "relaxed"
    MODERATE = "moderate"
    PACKED = "packed"


class TripRequest(BaseModel):
    """Input for itinerary generation."""
    destination: str = Field(..., description="City or region name")
    start_date: date
    end_date: date
    budget: Optional[float] = Field(None, description="Total budget in INR")
    preferences: list[str] = Field(
        default_factory=list,
        description="e.g. ['heritage', 'food', 'adventure']",
    )
    arrival_time: Optional[time] = Field(None, description="HH:MM arrival at destination")
    departure_time: Optional[time] = Field(None, description="HH:MM departure from destination")
    travel_style: TravelStyle = TravelStyle.MODERATE
    num_travelers: int = Field(default=1, ge=1)


class ItineraryActivity(BaseModel):
    """A single activity within a day."""
    time_slot: str = Field(..., description="e.g. '09:00 - 11:00'")
    title: str
    description: str = ""
    place_name: Optional[str] = None
    place_id: Optional[str] = None
    category: str = Field(default="sightseeing", description="sightseeing, food, adventure, transit, rest")
    estimated_cost: Optional[float] = None
    travel_time_from_prev: Optional[str] = Field(None, description="e.g. '15 min drive'")
    weather_note: Optional[str] = Field(None, description="Weather-aware tip")
    indoor: bool = False


class ItineraryDay(BaseModel):
    """A single day in the itinerary."""
    day_number: int
    date: str
    title: str = Field(..., description="Day theme, e.g. 'Heritage Walk & Local Cuisine'")
    weather_summary: Optional[str] = None
    activities: list[ItineraryActivity] = Field(default_factory=list)
    daily_budget: Optional[float] = None


class BudgetBreakdown(BaseModel):
    """Estimated cost breakdown for the trip."""
    accommodation: float = 0.0
    food: float = 0.0
    transport: float = 0.0
    activities: float = 0.0
    miscellaneous: float = 0.0
    total: float = 0.0
    currency: str = "INR"


class Itinerary(BaseModel):
    """Complete generated itinerary."""
    destination: str
    start_date: str
    end_date: str
    num_days: int
    travel_style: str = "moderate"
    days: list[ItineraryDay] = Field(default_factory=list)
    budget: Optional[BudgetBreakdown] = None
    tips: list[str] = Field(default_factory=list, description="Local travel tips")
    packing_suggestions: list[str] = Field(default_factory=list)


class ItineraryRefineRequest(BaseModel):
    """Request to refine an existing itinerary."""
    itinerary: Itinerary
    instruction: str = Field(..., description="What to change, e.g. 'add more food stops on day 2'")


# ──────────────────────────────────────────────
# Vacay Chatbot
# ──────────────────────────────────────────────

class GeoLocation(BaseModel):
    """A user's current coordinates."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class TripContextPayload(BaseModel):
    """
    Full active-trip snapshot sent by the frontend with every chat message.

    Mirrors the client-side TripContext so the assistant knows the whole trip
    without the user having to re-explain anything. Every field is optional so
    a partially built trip still works.
    """
    trip_id: Optional[int] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    departure_date: Optional[str] = None
    arrival_date: Optional[str] = None
    adults: Optional[int] = None
    budget: Optional[float] = None
    weather: Optional[Any] = None
    flights: Optional[Any] = None
    hotels: Optional[Any] = None
    itinerary: Optional[Any] = None
    packing: Optional[Any] = None
    budget_result: Optional[Any] = None
    expenses: Optional[Any] = None
    participants: Optional[Any] = None


class TravellersContext(BaseModel):
    type: Optional[str] = None   # solo | couple | family | group
    count: Optional[int] = None


class TripDatesContext(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None


class BudgetContext(BaseModel):
    currency: Optional[str] = None
    daily_limit: Optional[float] = None
    total: Optional[float] = None


class TravelContext(BaseModel):
    """Structured travel context maintained per conversation (spec Section 8)."""
    destination: Optional[str] = None
    country: Optional[str] = None
    trip_dates: TripDatesContext = Field(default_factory=TripDatesContext)
    travellers: TravellersContext = Field(default_factory=TravellersContext)
    budget: BudgetContext = Field(default_factory=BudgetContext)
    preferences: list[str] = Field(default_factory=list)
    current_location: Optional[GeoLocation] = None
    weather_context: Optional[Any] = None
    visited_places: list[str] = Field(default_factory=list)


class UserPreferences(BaseModel):
    """Long-term traveller preferences (spec Section 7)."""
    travel_style: Optional[str] = None
    food_preferences: list[str] = Field(default_factory=list)
    activity_preferences: list[str] = Field(default_factory=list)
    travel_pace: Optional[str] = None


class VacayChatRequest(BaseModel):
    """Incoming message for the Vacay Chatbot (spec Section 15)."""
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    trip_context: Optional[TripContextPayload] = None
    current_location: Optional[GeoLocation] = None


class VacayChatResponse(BaseModel):
    """Assistant reply (spec Section 15)."""
    message: str
    conversation_id: str
    intent: str = "chat"
    sources: list[str] = Field(default_factory=list)


class ChatHistoryMessage(BaseModel):
    id: str
    role: str
    content: str
    intent: Optional[str] = None
    sources: list[str] = Field(default_factory=list)
    created_at: Optional[str] = None


class ChatHistoryResponse(BaseModel):
    conversation_id: str
    messages: list[ChatHistoryMessage] = Field(default_factory=list)
