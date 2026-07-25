// =============================================================================
// Travel Guide — shared types, risk styling, and a deduped client-side fetcher.
//
// Data is merged server-side from the TuGo Travel Advisory API and the Travel
// Risk Intelligence API. The `sources` flags say which upstream APIs actually
// responded, so the UI renders only the sections it has data for.
// =============================================================================

export interface TravelAlert {
  type: string;
  severity: string;
  location: string;
  description: string;
  eventDate: string;
}

export interface TravelNote {
  category: string;
  description: string;
}

export interface RiskFactor {
  label: string;
  value: string | number;
}

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface TravelGuideData {
  countryIso: string;
  countryName: string;
  riskLevel: RiskLevel;
  riskScore: number | null;
  riskCalculation: RiskFactor[];
  advisoryLevel: string;
  advisoryText: string;
  hasAdvisoryWarning: boolean;
  activeAlerts: TravelAlert[];
  alertCount: number;
  entryRequirements: TravelNote[];
  healthNotes: TravelNote[];
  safetyNotes: TravelNote[];
  lawNotes: TravelNote[];
  climateNote: string | null;
  lastUpdated: string | null;
  sources: {
    tugo: boolean;
    travelRisk: boolean;
  };
}

// -----------------------------------------------------------------------------
// Risk level styling — one source of truth for the badge and the guide page.
// -----------------------------------------------------------------------------

export interface RiskStyle {
  dot: string;
  text: string;
  chip: string;
  ring: string;
  bar: string;
  label: string;
}

export const RISK_STYLES: Record<RiskLevel, RiskStyle> = {
  low: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ring: "ring-emerald-500/20",
    bar: "bg-emerald-500",
    label: "Low risk",
  },
  medium: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    ring: "ring-amber-500/20",
    bar: "bg-amber-500",
    label: "Caution",
  },
  high: {
    dot: "bg-red-500",
    text: "text-red-700",
    chip: "bg-red-50 text-red-700 border-red-200",
    ring: "ring-red-500/20",
    bar: "bg-red-500",
    label: "High risk",
  },
  unknown: {
    dot: "bg-gray-400",
    text: "text-gray-600",
    chip: "bg-gray-50 text-gray-600 border-gray-200",
    ring: "ring-gray-400/20",
    bar: "bg-gray-400",
    label: "Unrated",
  },
};

export function riskStyle(level: RiskLevel | string | undefined): RiskStyle {
  return RISK_STYLES[(level as RiskLevel) ?? "unknown"] ?? RISK_STYLES.unknown;
}

/** True when at least one upstream API returned usable data. */
export function hasAnySource(data: TravelGuideData | null): data is TravelGuideData {
  return !!data && (data.sources?.tugo || data.sources?.travelRisk);
}

export function isTravelGuideEnabled(): boolean {
  // Opt-out flag: the badge is on unless explicitly disabled.
  return process.env.NEXT_PUBLIC_ENABLE_TRAVEL_GUIDE_BADGE !== "false";
}

// -----------------------------------------------------------------------------
// Fetching — cached and deduped by destination.
//
// The dashboard renders one badge per trip card and the Travel Risk API free
// tier allows 100 requests/day, so identical destinations must share a single
// in-flight request and a single cached result.
// -----------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour client-side; backend caches longer.

type CacheEntry = { at: number; data: TravelGuideData | null };

const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<TravelGuideData | null>>();

function cacheKey(destination: string): string {
  return destination.trim().toLowerCase();
}

export async function fetchTravelGuide(
  destination: string,
  signal?: AbortSignal,
): Promise<TravelGuideData | null> {
  const key = cacheKey(destination);
  if (!key) return null;

  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = (async (): Promise<TravelGuideData | null> => {
    try {
      const res = await fetch(
        `${API_BASE}/api/travel-guide/?country=${encodeURIComponent(destination)}`,
        { signal },
      );
      if (!res.ok) return null;

      const data = (await res.json()) as TravelGuideData;
      // Guard against a malformed payload so callers can rely on the shape.
      if (!data || typeof data !== "object" || !data.sources) return null;

      resultCache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Failed to fetch travel guide data:", err);
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
