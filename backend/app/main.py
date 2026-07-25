"""
Wandr — AI Travel Planner Backend
FastAPI application entry point with CORS, SSE, and API routing.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api import chat, destinations, itinerary, weather, health, logistics, orchestration, trips, explore, maps, users, vacay, files
from app.db.database import engine, Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup DB connection on shutdown
    await engine.dispose()

app = FastAPI(
    title="Wandr Backend",
    description="Backend API for Wandr - AI Travel Planner",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
frontend_url = settings.frontend_url.rstrip('/')
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    frontend_url
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes

app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(health.router, prefix="/api/health", tags=["health"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(destinations.router, prefix="/api/destinations", tags=["destinations"])
app.include_router(trips.router, prefix="/api/trips", tags=["trips"])
app.include_router(itinerary.router, prefix="/api/itinerary", tags=["itinerary"])
app.include_router(weather.router, prefix="/api/weather", tags=["weather"])
app.include_router(logistics.router, prefix="/api/logistics", tags=["logistics"])
app.include_router(orchestration.router, prefix="/api/orchestration", tags=["orchestration"])
app.include_router(vacay.router, prefix="/api/vacay", tags=["vacay"])
app.include_router(explore.router, prefix="/api", tags=["explore"])
app.include_router(maps.router, prefix="/api/maps", tags=["maps"])
app.include_router(files.router, prefix="/api/trips/{trip_id}/files", tags=["files"])

@app.get("/")
async def root():
    return {
        "name": "Wandr API",
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
    }
