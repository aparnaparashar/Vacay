import asyncio
import httpx
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class OverpassProvider:
    """
    Provider for querying OpenStreetMap via Overpass API.
    Races 4 public mirrors to bypass 504 errors and high latency.
    """
    
    MIRRORS = [
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter"
    ]
    
    CATEGORY_TAGS = {
        "restaurant": '["amenity"~"restaurant|fast_food"]',
        "cafe": '["amenity"="cafe"]',
        "bar": '["amenity"~"bar|pub|nightclub"]',
        "hotel": '["tourism"~"hotel|hostel|guest_house"]',
        "sights": '["tourism"~"attraction|viewpoint"] ["historic"~"monument|castle|ruins"]',
        "museum": '["tourism"~"museum|gallery|artwork"] ["amenity"="theatre"]',
        "nature": '["leisure"~"park|garden"] ["natural"~"beach|peak"]',
        "activity": '["tourism"~"theme_park|zoo|aquarium"]'
    }

    async def _fetch_from_mirror(self, client: httpx.AsyncClient, url: str, query: str) -> Dict[str, Any]:
        """Fetch from a single mirror."""
        try:
            resp = await client.post(url, data="data=" + query, timeout=15.0)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            # Re-raise to be handled by the race logic
            raise e

    async def explore_category(self, lat: float, lng: float, category: str, radius: int = 2000) -> List[Dict[str, Any]]:
        """
        Query Overpass for a specific category within a radius.
        Races multiple mirrors and returns the fastest successful response.
        """
        tags = self.CATEGORY_TAGS.get(category)
        if not tags:
            return []

        # Split tags if they are multiple independent queries separated by spaces (e.g. sights)
        # Actually, Overpass allows multiple node/way/rel queries in one go.
        # Format: node["amenity"="cafe"](around:2000,lat,lng);
        tag_groups = tags.split("] [")
        if len(tag_groups) > 1:
            # Rejoin properly
            tag_groups = [g + "]" if not g.endswith("]") else g for g in tag_groups]
            tag_groups = ["[" + g if not g.startswith("[") else g for g in tag_groups]
        else:
            tag_groups = [tags]

        query_body = ""
        for tg in tag_groups:
            # Fix split artifacts
            tg = tg.replace("[[", "[").replace("]]", "]")
            query_body += f"node{tg}(around:{radius},{lat},{lng});\n"
            query_body += f"way{tg}(around:{radius},{lat},{lng});\n"

        query = f"""
        [out:json][timeout:15];
        (
          {query_body}
        );
        out center 50;
        """

        async with httpx.AsyncClient() as client:
            tasks = [
                self._fetch_from_mirror(client, url, query) 
                for url in self.MIRRORS
            ]
            
            # Race the mirrors!
            try:
                # Wait for the FIRST successful response
                for completed in asyncio.as_completed(tasks):
                    try:
                        result = await completed
                        if "elements" in result:
                            # We got a valid response! Map it to a clean format.
                            return self._format_results(result["elements"])
                    except Exception as mirror_err:
                        # This mirror failed, try the next one that finishes
                        continue
                
                # If we get here, all mirrors failed
                logger.error(f"All Overpass mirrors failed for category '{category}'.")
                return []
            except Exception as e:
                logger.error(f"Overpass race error: {e}")
                return []

    def _format_results(self, elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results = []
        for el in elements:
            tags = el.get("tags", {})
            name = tags.get("name")
            if not name:
                continue # Skip unnamed POIs
                
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            
            if not lat or not lon:
                continue
                
            results.append({
                "id": el.get("id"),
                "name": name,
                "lat": lat,
                "lng": lon,
                "type": tags.get("amenity") or tags.get("tourism") or tags.get("leisure") or tags.get("historic"),
                "address": tags.get("addr:street", "") + " " + tags.get("addr:city", "")
            })
        return results

overpass_provider = OverpassProvider()
