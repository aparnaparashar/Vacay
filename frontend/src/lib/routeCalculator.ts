// =============================================================================
// WANDR Route Calculator — Core Route Engine
// Adapted from TREK's RouteCalculator.ts for the WANDR travel planner.
// Uses FOSSGIS OSRM instances for route calculation.
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name?: string;
  type?: string;
}

export interface RouteLeg {
  /** Distance in meters */
  distance: number;
  /** Duration in seconds */
  duration: number;
  distanceText: string;
  durationText: string;
}

export interface RouteResult {
  /** Array of [lat, lng] coordinate pairs for Leaflet polylines */
  coordinates: [number, number][];
  /** Total distance in meters */
  totalDistance: number;
  /** Total duration in seconds */
  totalDuration: number;
  totalDistanceText: string;
  totalDurationText: string;
  legs: RouteLeg[];
}

export type RouteProfile = 'driving' | 'walking' | 'cycling';

export interface RouteOptions {
  signal?: AbortSignal;
}

// -----------------------------------------------------------------------------
// OSRM Endpoint Configuration (FOSSGIS per-profile instances)
// -----------------------------------------------------------------------------

const OSRM_ENDPOINTS: Record<RouteProfile, string> = {
  driving: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
};

// -----------------------------------------------------------------------------
// Client-Side Route Cache
// -----------------------------------------------------------------------------

const CACHE_MAX_SIZE = 200;
const routeCache = new Map<string, RouteResult>();

function getCacheKey(profile: RouteProfile, waypoints: RouteWaypoint[]): string {
  const coordString = waypoints
    .map((wp) => `${wp.lng.toFixed(6)},${wp.lat.toFixed(6)}`)
    .join(';');
  return `${profile}:${coordString}`;
}

function evictCacheIfNeeded(): void {
  if (routeCache.size >= CACHE_MAX_SIZE) {
    // Remove the oldest entry (first inserted key)
    const firstKey = routeCache.keys().next().value;
    if (firstKey !== undefined) {
      routeCache.delete(firstKey);
    }
  }
}

// -----------------------------------------------------------------------------
// Formatting Helpers
// -----------------------------------------------------------------------------

/**
 * Format a distance in meters into a human-readable string.
 * Distances >= 1000 m are shown in km with one decimal place.
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Format a duration in seconds into a human-readable string.
 * Shows days/hours/minutes as appropriate.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);

  if (totalMinutes < 1) {
    return '< 1 min';
  }

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes} min`);

  return parts.join(' ');
}

// -----------------------------------------------------------------------------
// OSRM Route Fetching
// -----------------------------------------------------------------------------

/**
 * Calculate a route between the given waypoints using the FOSSGIS OSRM service.
 *
 * @param waypoints - Array of at least 2 waypoints.
 * @param profile  - Travel mode: 'driving', 'walking', or 'cycling'.
 * @param options  - Optional settings including an AbortSignal for cancellation.
 * @returns A RouteResult with Leaflet-friendly [lat, lng] coordinates.
 */
export async function calculateRoute(
  waypoints: RouteWaypoint[],
  profile: RouteProfile = 'driving',
  options?: RouteOptions,
): Promise<RouteResult> {
  if (waypoints.length < 2) {
    throw new Error('At least 2 waypoints are required to calculate a route.');
  }

  // Check cache first
  const cacheKey = getCacheKey(profile, waypoints);
  const cached = routeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build OSRM coordinate string — OSRM uses lng,lat order
  const coordString = waypoints
    .map((wp) => `${wp.lng.toFixed(6)},${wp.lat.toFixed(6)}`)
    .join(';');

  const endpoint = OSRM_ENDPOINTS[profile];
  const url = `${endpoint}/${coordString}?overview=full&geometries=geojson&annotations=distance,duration`;

  const response = await fetch(url, {
    signal: options?.signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`OSRM request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'No route found between the given waypoints.');
  }

  const route = data.routes[0];

  // Swap [lng, lat] → [lat, lng] for Leaflet
  const coordinates: [number, number][] = route.geometry.coordinates.map(
    (coord: [number, number]) => [coord[1], coord[0]] as [number, number],
  );

  // Parse per-leg data
  const legs: RouteLeg[] = (route.legs || []).map(
    (leg: { distance: number; duration: number }) => ({
      distance: leg.distance,
      duration: leg.duration,
      distanceText: formatDistance(leg.distance),
      durationText: formatDuration(leg.duration),
    }),
  );

  const totalDistance: number = route.distance;
  const totalDuration: number = route.duration;

  const result: RouteResult = {
    coordinates,
    totalDistance,
    totalDuration,
    totalDistanceText: formatDistance(totalDistance),
    totalDurationText: formatDuration(totalDuration),
    legs,
  };

  // Store in cache
  evictCacheIfNeeded();
  routeCache.set(cacheKey, result);

  return result;
}

// -----------------------------------------------------------------------------
// Route Optimization (Nearest-Neighbor + 2-Opt)
// -----------------------------------------------------------------------------

/**
 * Squared planar distance between two waypoints.
 * Used for comparison only — no need for the sqrt overhead.
 */
function squaredDistance(a: RouteWaypoint, b: RouteWaypoint): number {
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  return dx * dx + dy * dy;
}

/**
 * Compute the total tour length using squared planar distances.
 */
function tourLength(tour: RouteWaypoint[]): number {
  let total = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    total += squaredDistance(tour[i], tour[i + 1]);
  }
  return total;
}

/**
 * Optimize the order of waypoints to minimize total travel distance.
 *
 * Uses a two-phase approach:
 *   1. **Nearest-neighbor construction** — greedy tour starting from
 *      `startAnchor` (or `waypoints[0]` if not provided).
 *   2. **2-opt improvement** — iteratively reverses sub-segments when doing
 *      so shortens the overall tour.
 *
 * @param waypoints   - The waypoints to reorder.
 * @param startAnchor - Optional fixed start point (e.g. hotel departure).
 * @param endAnchor   - Optional fixed end point (e.g. hotel return).
 * @returns A new array of RouteWaypoint in optimized order.
 */
export function optimizeRoute(
  waypoints: RouteWaypoint[],
  startAnchor?: RouteWaypoint,
  endAnchor?: RouteWaypoint,
): RouteWaypoint[] {
  if (waypoints.length <= 2) {
    return [...waypoints];
  }

  // Separate anchors from the pool of reorderable waypoints
  const pool = [...waypoints];
  const result: RouteWaypoint[] = [];

  // Determine the starting point
  let current: RouteWaypoint;
  if (startAnchor) {
    current = startAnchor;
    // Remove start anchor from pool if it's in there
    const idx = pool.findIndex(
      (wp) => wp.lat === startAnchor.lat && wp.lng === startAnchor.lng,
    );
    if (idx !== -1) pool.splice(idx, 1);
    result.push(current);
  } else {
    current = pool.shift()!;
    result.push(current);
  }

  // Remove end anchor from pool if provided (we'll append it at the end)
  let endPoint: RouteWaypoint | undefined;
  if (endAnchor) {
    const idx = pool.findIndex(
      (wp) => wp.lat === endAnchor.lat && wp.lng === endAnchor.lng,
    );
    if (idx !== -1) {
      endPoint = pool.splice(idx, 1)[0];
    } else {
      endPoint = endAnchor;
    }
  }

  // --- Phase 1: Nearest-neighbor greedy construction ---
  while (pool.length > 0) {
    let bestIdx = 0;
    let bestDist = squaredDistance(current, pool[0]);

    for (let i = 1; i < pool.length; i++) {
      const d = squaredDistance(current, pool[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    current = pool.splice(bestIdx, 1)[0];
    result.push(current);
  }

  // Append end anchor
  if (endPoint) {
    result.push(endPoint);
  }

  // --- Phase 2: 2-opt improvement ---
  // Determine the range of indices eligible for reversal (skip fixed anchors)
  const fixedStart = startAnchor ? 1 : 0;
  const fixedEnd = endPoint ? result.length - 1 : result.length;

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = fixedStart; i < fixedEnd - 1; i++) {
      for (let j = i + 1; j < fixedEnd; j++) {
        // Calculate improvement from reversing segment [i, j]
        const currentLen = tourLength(result);
        // Reverse the sub-segment in-place
        const segment = result.slice(i, j + 1).reverse();
        result.splice(i, segment.length, ...segment);
        const newLen = tourLength(result);

        if (newLen < currentLen) {
          improved = true;
        } else {
          // Revert the reversal
          const revert = result.slice(i, j + 1).reverse();
          result.splice(i, revert.length, ...revert);
        }
      }
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Google Maps URL Generation
// -----------------------------------------------------------------------------

/**
 * Generate a Google Maps URL for the given waypoints.
 *
 * - Single waypoint: opens a search/pin at that location.
 * - Multiple waypoints: opens turn-by-turn directions through all points.
 */
export function generateGoogleMapsUrl(waypoints: RouteWaypoint[]): string {
  if (waypoints.length === 0) {
    return 'https://www.google.com/maps';
  }

  if (waypoints.length === 1) {
    const wp = waypoints[0];
    return `https://www.google.com/maps/search/?api=1&query=${wp.lat},${wp.lng}`;
  }

  // Multiple waypoints → directions URL
  const path = waypoints.map((wp) => `${wp.lat},${wp.lng}`).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}
