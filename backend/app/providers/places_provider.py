import asyncio
import logging
import requests
import urllib.parse
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Curated fallback images by category (direct working Unsplash URLs)
CATEGORY_FALLBACK_IMAGES = {
    "restaurant": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
    "cafe": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80",
    "meal": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
    "snack": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80",
    "museum": "https://images.unsplash.com/photo-1565060299509-2e82b3acde48?auto=format&fit=crop&w=400&q=80",
    "temple": "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=400&q=80",
    "market": "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=400&q=80",
    "park": "https://images.unsplash.com/photo-1585938389612-a552a28c9bc9?auto=format&fit=crop&w=400&q=80",
    "hotel": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
    "beach": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80",
    "monument": "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=400&q=80",
    "default": "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=400&q=80",
}

# Mapping from itinerary activity types to Overpass amenity/tourism tags
CATEGORY_TO_OSM_TAGS = {
    "restaurant": '["amenity"="restaurant"]',
    "cafe": '["amenity"="cafe"]',
    "meal": '["amenity"="restaurant"]',
    "snack": '["amenity"="fast_food"]',
    "museum": '["tourism"="museum"]',
    "temple": '["amenity"="place_of_worship"]',
    "market": '["shop"="mall"]',
    "park": '["leisure"="park"]',
    "hotel": '["tourism"="hotel"]',
    "bar": '["amenity"="bar"]',
    "beach": '["natural"="beach"]',
    "monument": '["historic"="monument"]',
    "zoo": '["tourism"="zoo"]',
    "viewpoint": '["tourism"="viewpoint"]',
}


class PlacesProvider:
    """
    Places provider using completely free, no-API-key-needed services:
      - Nominatim (OpenStreetMap) for geocoding place names → lat/lng
      - Overpass API for finding nearby POIs (restaurants, cafes, etc.)
      - OSRM for driving distance and duration (already integrated)
    """

    def __init__(self):
        self.nominatim_url = "https://nominatim.openstreetmap.org/search"
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.wikipedia_url = "https://en.wikipedia.org/api/rest_v1/page/summary"
        self.headers = {"User-Agent": "WandrTravelApp/1.0 (travel planner)"}
        self._photo_cache: Dict[str, str] = {}  # Cache Wikipedia photo lookups

    # ── Main Search: Geocode a specific place by name ──────────────

    async def search_places(self, query: str) -> List[Dict[str, Any]]:
        """
        Search for a place by name using Nominatim.
        Returns a list of matching places with real coordinates.
        """
        def _do_search():
            params = {
                "q": query,
                "format": "json",
                "limit": 4,
                "addressdetails": 1,
            }
            import time
            time.sleep(1.2)  # Respect Nominatim's strict 1 req/sec rate limit
            
            response = requests.get(
                self.nominatim_url,
                params=params,
                headers=self.headers,
                timeout=10,
            )
            response.raise_for_status()
            results = response.json()

            places = []
            for item in results:
                name = item.get("name") or item.get("display_name", "").split(",")[0]
                display_name = item.get("display_name", "")
                # Build a cleaner address from the first few parts
                address_parts = display_name.split(",")
                address = ", ".join(p.strip() for p in address_parts[:4])

                lat = float(item.get("lat", 0))
                lon = float(item.get("lon", 0))

                # Use importance (0-1) as a proxy rating scaled to 5
                importance = float(item.get("importance", 0.3))
                rating = round(min(3.5 + importance * 3, 5.0), 1)

                # Try to get a real photo from Wikipedia
                photo_url = self._get_wikipedia_photo_sync(name)
                if not photo_url:
                    photo_url = self._get_category_fallback_image(query)

                places.append({
                    "displayName": {"text": name},
                    "formattedAddress": address,
                    "rating": rating,
                    "location": {"latitude": lat, "longitude": lon},
                    "photos": [{"name": photo_url}],
                })

            return places

        try:
            loop = asyncio.get_running_loop()
            places = await loop.run_in_executor(None, _do_search)
            if places:
                return places
            logger.warning(f"Nominatim returned 0 results for: {query}")
            return self._fallback_places(query)
        except Exception as e:
            logger.error(f"Nominatim Search Error for '{query}': {e}")
            return self._fallback_places(query)

    # ── Nearby Search: Find restaurants/POIs near coordinates ──────

    async def search_nearby(self, lat: float, lon: float, category: str = "restaurant", radius: int = 800) -> List[Dict[str, Any]]:
        """
        Use the Overpass API to find real POIs near a location.
        Used for 'alternative restaurant' suggestions.
        """
        tag = CATEGORY_TO_OSM_TAGS.get(category.lower(), '["amenity"="restaurant"]')

        def _do_overpass():
            query = f'[out:json];node{tag}(around:{radius},{lat},{lon});out 4;'
            response = requests.post(
                self.overpass_url,
                data=query,
                headers=self.headers,
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            places = []
            for elem in data.get("elements", []):
                tags = elem.get("tags", {})
                name = tags.get("name")
                if not name:
                    continue

                # Build address from available tags
                street = tags.get("addr:street", "")
                city = tags.get("addr:city", "")
                postcode = tags.get("addr:postcode", "")
                address_parts = [p for p in [street, city, postcode] if p]
                address = ", ".join(address_parts) if address_parts else "Nearby"

                # Try Wikipedia first, then category fallback
                photo_url = self._get_wikipedia_photo_sync(name) or self._get_category_fallback_image(category)

                places.append({
                    "displayName": {"text": name},
                    "formattedAddress": address,
                    "rating": round(3.5 + (hash(name) % 15) / 10.0, 1),  # deterministic pseudo-rating
                    "location": {"latitude": elem.get("lat", lat), "longitude": elem.get("lon", lon)},
                    "photos": [{"name": photo_url}],
                })

            return places

        try:
            loop = asyncio.get_running_loop()
            places = await loop.run_in_executor(None, _do_overpass)
            return places[:4]  # Cap at 4 alternatives
        except Exception as e:
            logger.error(f"Overpass Nearby Search Error: {e}")
            return []

    # ── OSRM Distance & Time ─────────────────────────────────────

    async def get_distance_and_time(self, origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> dict:
        """Calculate driving distance and time using OSRM (free, no API key)."""
        # Skip if coordinates are identical or zero
        if (abs(origin_lat - dest_lat) < 0.0001 and abs(origin_lng - dest_lng) < 0.0001):
            return {"distance": "0.1 km", "duration": "1 mins"}
        if origin_lat == 0 or dest_lat == 0:
            return {"distance": "N/A", "duration": "N/A"}

        def _do_dist():
            # OSRM requires coordinates in longitude,latitude order
            url = f"http://router.project-osrm.org/route/v1/driving/{origin_lng},{origin_lat};{dest_lng},{dest_lat}?overview=false"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            if data.get("routes") and len(data["routes"]) > 0:
                route = data["routes"][0]
                distance_km = route["distance"] / 1000.0
                duration_mins = route["duration"] / 60.0
                return {
                    "distance": f"{distance_km:.1f} km",
                    "duration": f"{int(duration_mins)} mins"
                }
            return {"distance": "N/A", "duration": "N/A"}

        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _do_dist)
        except Exception as e:
            logger.error(f"OSRM Distance Error: {e}")
            return {"distance": "N/A", "duration": "N/A"}

    # ── Photo URL helper ─────────────────────────────────────────

    def get_photo_url(self, photo_name: str, max_width: int = 400) -> str:
        """Return the photo URL directly (it's already a full URL now)."""
        if not photo_name or photo_name == "places/mocked":
            return CATEGORY_FALLBACK_IMAGES["default"]
        return photo_name

    # ── Wikipedia Photo Fetcher ───────────────────────────────────

    def _get_wikipedia_photo_sync(self, place_name: str) -> Optional[str]:
        """
        Fetch a real photo from Wikipedia for the given place name.
        Returns the thumbnail URL or None if not found.
        Uses an in-memory cache to avoid repeated API calls.
        """
        if not place_name:
            return None

        # Check cache first
        cache_key = place_name.lower().strip()
        if cache_key in self._photo_cache:
            return self._photo_cache[cache_key]

        # Build a list of name variations to try
        names_to_try = []

        # 1. Strip non-ASCII suffixes (e.g. "Gateway of India - गेटवे ऑफ इंडिया" → "Gateway of India")
        import re
        ascii_only = re.sub(r'[^\x00-\x7F]+', '', place_name).strip().rstrip(' -').strip()
        if ascii_only:
            names_to_try.append(ascii_only)

        # 2. Original name
        names_to_try.append(place_name)

        # 3. Before separator (handles "Name - Description" patterns)
        if " - " in place_name:
            names_to_try.append(place_name.split(" - ")[0].strip())

        # 4. Strip city names from end
        cities = ["Mumbai", "Delhi", "Jaipur", "Goa", "Pune", "Kolkata", "Chennai", "Bangalore", "Hyderabad",
                  "Kochi", "Udaipur", "Agra", "Varanasi", "Shimla", "Manali", "Rishikesh"]
        for city in cities:
            for name in list(names_to_try):
                stripped = name.replace(city, "").strip().rstrip(",").strip()
                if stripped and stripped not in names_to_try and len(stripped) > 3:
                    names_to_try.append(stripped)

        # 5. Split on comma and try first part
        if "," in place_name:
            names_to_try.append(place_name.split(",")[0].strip())

        # Deduplicate while preserving order
        seen = set()
        unique_names = []
        for n in names_to_try:
            if n.lower() not in seen and n:
                seen.add(n.lower())
                unique_names.append(n)

        for name_variant in unique_names:
            try:
                wiki_title = name_variant.replace(" ", "_")
                url = f"{self.wikipedia_url}/{urllib.parse.quote(wiki_title)}"
                response = requests.get(url, headers=self.headers, timeout=5)

                if response.status_code == 200:
                    data = response.json()
                    thumbnail = data.get("thumbnail", {})
                    photo_url = thumbnail.get("source")
                    if photo_url:
                        # Upgrade to a larger size (replace /330px- with /600px-)
                        photo_url = photo_url.replace("/330px-", "/600px-")
                        self._photo_cache[cache_key] = photo_url
                        return photo_url

            except Exception as e:
                logger.debug(f"Wikipedia photo lookup failed for '{name_variant}': {e}")
                continue

        self._photo_cache[cache_key] = None
        return None

    def _get_category_fallback_image(self, query_or_category: str) -> str:
        """Return a curated, working fallback image URL based on place category."""
        q = query_or_category.lower()
        for category, url in CATEGORY_FALLBACK_IMAGES.items():
            if category in q:
                return url
        return CATEGORY_FALLBACK_IMAGES["default"]

    # ── Helpers ───────────────────────────────────────────────────

    def _fallback_places(self, query: str) -> List[Dict[str, Any]]:
        """
        If Nominatim returns nothing, generate a minimal fallback 
        using just the query text. This is NOT mock data — it's 
        a graceful degradation that still shows the place name.
        """
        photo_url = self._get_wikipedia_photo_sync(query) or self._get_category_fallback_image(query)
        return [
            {
                "displayName": {"text": query.replace("+", " ").title()},
                "formattedAddress": "Address not available",
                "rating": 4.0,
                "location": {"latitude": 0, "longitude": 0},
                "photos": [{"name": photo_url}],
            }
        ]
