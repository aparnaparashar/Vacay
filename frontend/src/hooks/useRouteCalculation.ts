"use client";

// =============================================================================
// useRouteCalculation — React hook for WANDR route calculation
// Wraps the routeCalculator engine with React state management, auto-
// recalculation, abort cleanup, and convenience actions.
// =============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  calculateRoute,
  optimizeRoute,
  generateGoogleMapsUrl,
  type RouteWaypoint,
  type RouteResult,
  type RouteProfile,
} from "@/lib/routeCalculator";

// -----------------------------------------------------------------------------
// Waypoint extraction from activity objects
// -----------------------------------------------------------------------------

/**
 * Extract a RouteWaypoint from an activity's place_details.location,
 * handling both `lat`/`latitude` and `lng`/`longitude` naming variants.
 * Handles coordinates as both numbers and strings (backend inconsistency).
 */
function extractWaypoint(activity: any): RouteWaypoint | null {
  // Try place_details.location first, then activity-level location
  const location = activity?.place_details?.location || activity?.location;
  if (!location) return null;

  // Use Number() to coerce string coordinates (e.g. "12.9716") to numbers
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);

  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // skip null-island

  return {
    lat,
    lng,
    name: activity.title || activity.name || activity.place_details?.name,
    type: activity.type || activity.category,
  };
}

// -----------------------------------------------------------------------------
// Stable key derivation
// -----------------------------------------------------------------------------

/**
 * Derive a stable string key from waypoints so we can detect meaningful
 * changes without triggering spurious recalculations.
 */
function waypointKey(waypoints: RouteWaypoint[]): string {
  return waypoints
    .map((wp) => `${wp.lat.toFixed(6)},${wp.lng.toFixed(6)}`)
    .join("|");
}

// -----------------------------------------------------------------------------
// Route info summary (convenience type)
// -----------------------------------------------------------------------------

export interface RouteInfo {
  totalDistance: number;
  totalDuration: number;
  totalDistanceText: string;
  totalDurationText: string;
  legCount: number;
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

/**
 * React hook for route calculation and optimization.
 *
 * @param activities - Array of activity objects with `place_details.location`.
 * @param profile    - Travel mode (default: 'driving').
 * @param enabled    - Whether to auto-calculate (default: true).
 *
 * @returns An object with route data, loading/error state, and actions.
 */
export function useRouteCalculation(
  activities: any[],
  profile: RouteProfile = "driving",
  enabled: boolean = true,
) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to hold the current AbortController so we can cancel on
  // unmount or when waypoints/profile change.
  const abortRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Extract and memoize waypoints
  // ---------------------------------------------------------------------------

  const waypoints = useMemo<RouteWaypoint[]>(() => {
    const extracted: RouteWaypoint[] = [];
    for (const act of activities) {
      const wp = extractWaypoint(act);
      if (wp) extracted.push(wp);
    }
    return extracted;
  }, [activities]);

  const stableKey = useMemo(() => waypointKey(waypoints), [waypoints]);

  // ---------------------------------------------------------------------------
  // Auto-recalculate when waypoints or profile change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Abort any in-flight request
    abortRef.current?.abort();

    // Need at least 2 waypoints to calculate a route
    if (!enabled || waypoints.length < 2) {
      setRoute(null);
      setRouteInfo(null);
      setIsCalculating(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    const run = async () => {
      setIsCalculating(true);
      setError(null);

      try {
        const result = await calculateRoute(waypoints, profile, {
          signal: controller.signal,
        });

        if (cancelled) return;

        setRoute(result);
        setRouteInfo({
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          totalDistanceText: result.totalDistanceText,
          totalDurationText: result.totalDurationText,
          legCount: result.legs.length,
        });
        setError(null);
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        setError(err?.message || "Route calculation failed.");
        setRoute(null);
        setRouteInfo(null);
      } finally {
        if (!cancelled) {
          setIsCalculating(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // stableKey captures waypoint identity without object-reference churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey, profile, enabled]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Optimize the waypoint order using nearest-neighbor + 2-opt.
   * Returns the reordered waypoints so the caller can update activity order.
   */
  const optimizeOrder = useCallback(
    (startAnchor?: RouteWaypoint, endAnchor?: RouteWaypoint): RouteWaypoint[] => {
      if (waypoints.length < 2) return waypoints;
      return optimizeRoute(waypoints, startAnchor, endAnchor);
    },
    [waypoints],
  );

  /**
   * Open the current waypoints in Google Maps in a new browser tab.
   */
  const openInGoogleMaps = useCallback(() => {
    if (waypoints.length === 0) return;
    const url = generateGoogleMapsUrl(waypoints);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [waypoints]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    /** The full route result with coordinates, legs, and totals. */
    route,
    /** Summary info (distance, duration, leg count). */
    routeInfo,
    /** Whether a route calculation is currently in progress. */
    isCalculating,
    /** Error message if the last calculation failed, otherwise null. */
    error,
    /** Optimize waypoint order and return the reordered array. */
    optimizeOrder,
    /** Open the route in Google Maps in a new tab. */
    openInGoogleMaps,
  };
}
