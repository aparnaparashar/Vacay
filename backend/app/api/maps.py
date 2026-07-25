from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import httpx
from urllib.parse import unquote

from app.config import settings

router = APIRouter()

class MapSearchRequest(BaseModel):
    query: str
    region: Optional[str] = None

class PlaceResult(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    rating: Optional[float] = None
    source: str
    website: Optional[str] = None
    maps_uri: Optional[str] = None

@router.post("/search")
async def search_places(req: MapSearchRequest):
    query = req.query.lower()
    in_india = req.region == "IN" or "india" in query or "delhi" in query or "mumbai" in query or "bengaluru" in query
    
    # 1. Ola Maps (India-region queries)
    if in_india and settings.ola_maps_api_key:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    f"https://api.olamaps.io/places/v1/autocomplete?input={req.query}&api_key={settings.ola_maps_api_key}"
                )
                if res.status_code == 200:
                    data = res.json()
                    preds = data.get("predictions", [])
                    results = []
                    for p in preds[:5]:
                        results.append({
                            "name": p.get("structured_formatting", {}).get("main_text", req.query),
                            "address": p.get("description", ""),
                            "latitude": p.get("geometry", {}).get("location", {}).get("lat", 0),
                            "longitude": p.get("geometry", {}).get("location", {}).get("lng", 0),
                            "source": "ola",
                        })
                    if results:
                        return {"results": results}
        except Exception:
            pass # fallback to Google

    # 2. Google Places API (New)
    if settings.google_maps_api_key:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    headers={
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": settings.google_maps_api_key,
                        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.rating,places.websiteUri,places.googleMapsUri,places.internationalPhoneNumber,places.types"
                    },
                    json={"textQuery": req.query}
                )
                if res.status_code == 200:
                    data = res.json()
                    places = data.get("places", [])
                    results = []
                    for p in places:
                        results.append({
                            "name": p.get("displayName", {}).get("text", ""),
                            "address": p.get("formattedAddress", ""),
                            "latitude": p.get("location", {}).get("latitude", 0),
                            "longitude": p.get("location", {}).get("longitude", 0),
                            "rating": p.get("rating"),
                            "website": p.get("websiteUri"),
                            "maps_uri": p.get("googleMapsUri"),
                            "source": "google"
                        })
                    return {"results": results}
        except Exception:
            pass # fallback to Nominatim

    # 3. Nominatim OSM (Ultimate Free Fallback)
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": req.query, "format": "json", "limit": 5},
                headers={"User-Agent": "Wandr-AI-Travel-Planner/1.0"}
            )
            if res.status_code == 200:
                data = res.json()
                results = []
                for p in data:
                    name_parts = p.get("display_name", "").split(",")
                    results.append({
                        "name": name_parts[0] if name_parts else req.query,
                        "address": p.get("display_name", ""),
                        "latitude": float(p.get("lat", 0)),
                        "longitude": float(p.get("lon", 0)),
                        "source": "openstreetmap"
                    })
                return {"results": results}
    except Exception:
        pass
        
    return {"results": []}


@router.post("/resolve-url")
async def resolve_map_url(req: MapSearchRequest):
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            res = await client.get(req.query)
            final_url = str(res.url)
            
            if "@" in final_url:
                parts = final_url.split("@")[1].split(",")
                lat = float(parts[0])
                lng = float(parts[1])
                
                name = "Shared Place"
                if "/place/" in final_url:
                    name_part = final_url.split("/place/")[1].split("/")[0]
                    name = unquote(name_part).replace("+", " ")
                
                return {
                    "results": [{
                        "name": name,
                        "address": "Resolved from Maps URL",
                        "latitude": lat,
                        "longitude": lng,
                        "source": "google_url_resolved",
                        "maps_uri": final_url
                    }]
                }
    except Exception:
        pass
        
    return {"error": "Could not resolve URL", "results": []}
