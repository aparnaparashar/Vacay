import os
from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # API Keys
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    google_maps_api_key: str = Field(default="", alias="GOOGLE_MAPS_API_KEY")
    openweather_api_key: str = Field(default="", alias="OPENWEATHER_API_KEY")
    serpapi_api_key: str = Field(default="", alias="SERPAPI_API_KEY")
    duffel_api_key: str = Field(default="", alias="DUFFEL_API_KEY")
    foursquare_api_key: str = Field(default="", alias="FOURSQUARE_API_KEY")
    ola_maps_api_key: str = Field(default="", alias="OLA_MAPS_API_KEY")
    tugo_api_key: str = Field(default="", alias="TUGO_API_KEY")
    travel_risk_api_key: str = Field(default="", alias="TRAVEL_RISK_API_KEY")

    # Travel Guide (TuGo + Travel Risk Intelligence)
    tugo_api_base_url: str = Field(
        default="https://api.tugo.com/v1/travelsafe/countries", alias="TUGO_API_BASE_URL"
    )
    travel_risk_api_base_url: str = Field(
        default="https://travelriskapi.com/api/v1", alias="TRAVEL_RISK_API_BASE_URL"
    )
    travel_guide_cache_ttl_hours: int = Field(default=12, alias="TRAVEL_GUIDE_CACHE_TTL_HOURS")

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    debug: bool = Field(default=True, alias="DEBUG")

    # Database
    database_url: str = Field(default="postgresql+asyncpg://vacay:vacay_password@localhost:5432/vacay_db", alias="DATABASE_URL")

    # Email (SMTP)
    smtp_username: str = Field(default="", alias="GMAIL_USER")
    smtp_password: str = Field(default="", alias="GMAIL_APP_PASSWORD")
    

    # CORS
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
