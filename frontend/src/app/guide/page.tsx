"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTripData } from "@/context/TripContext";
import {
  EntrySection,
  RiskSection,
  formatDate,
} from "@/components/TravelGuideBadge";
import {
  fetchTravelGuide,
  hasAnySource,
  riskStyle,
  type TravelGuideData,
} from "@/lib/travelGuide";

export default function TravelGuidePage() {
  const { tripData } = useTripData();
  const destination = tripData.destination;

  const [data, setData] = useState<TravelGuideData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!destination) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);

    (async () => {
      const guide = await fetchTravelGuide(destination, controller.signal);
      if (!active) return;
      setData(hasAnySource(guide) ? guide : null);
      setLoading(false);
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [destination]);

  // ── Empty state: no trip loaded ──────────────────────────────────
  if (!destination) {
    return (
      <div className="mx-auto w-full max-w-5xl px-8 pt-[136px] pb-12">
        <EmptyState
          icon="travel_explore"
          title="No trip selected"
          body="Load a trip from your dashboard to see entry requirements, health notes, and live risk alerts for its destination."
          action={
            <Link
              href="/trips"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-on-primary transition-transform active:scale-95 hover:opacity-90"
            >
              <span className="material-symbols-outlined text-sm">luggage</span>
              Go to My Trips
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl animate-fade-in space-y-8 px-8 pt-[136px] pb-12">
      {/* Page header — matches the other trip sub-pages */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">Travel Guide</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Advisory, entry requirements, and live risk alerts for{" "}
            {data?.countryName || destination}
          </p>
        </div>
        {data && <RiskPill data={data} />}
      </div>

      {loading ? (
        <GuideSkeleton />
      ) : !data ? (
        <EmptyState
          icon="cloud_off"
          title="Guide unavailable"
          body={`We couldn't load travel guidance for ${destination} right now. This usually means the destination couldn't be matched to a country, or both data sources are temporarily unreachable.`}
        />
      ) : (
        <>
          {/* Advisory summary */}
          <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">
                campaign
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
                Current advisory
              </h3>
              {data.hasAdvisoryWarning && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Warning in effect
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-on-surface">{data.advisoryText}</p>
          </section>

          {/* Two sources, side by side — each renders only if it responded */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            {data.sources.travelRisk && (
              <Panel title="Risk & Alerts" icon="crisis_alert" source="Travel Risk API">
                <RiskSection data={data} />
              </Panel>
            )}
            {data.sources.tugo && (
              <Panel title="Entry & Health" icon="health_and_safety" source="TuGo">
                <EntrySection data={data} />
              </Panel>
            )}
          </div>

          <p className="text-center text-xs text-on-surface-variant/70">
            {data.lastUpdated
              ? `Last updated ${formatDate(data.lastUpdated)} · `
              : ""}
            Guidance is indicative — always confirm with your government's official
            travel advisory before booking.
          </p>
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Presentational helpers
// -----------------------------------------------------------------------------

function RiskPill({ data }: { data: TravelGuideData }) {
  const style = riskStyle(data.riskLevel);
  const alertCount = data.alertCount || data.activeAlerts.length;

  return (
    <div
      className={`flex shrink-0 items-center gap-2.5 rounded-full border px-4 py-2.5 shadow-sm ${style.chip}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
      <div className="leading-tight">
        <p className="text-xs font-bold">{style.label}</p>
        {data.riskScore !== null && (
          <p className="text-[10px] font-semibold opacity-70">
            Score {data.riskScore.toFixed(1)} / 5.0
          </p>
        )}
      </div>
      {alertCount > 0 && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
          {alertCount}
        </span>
      )}
    </div>
  );
}

function Panel({
  title,
  icon,
  source,
  children,
}: {
  title: string;
  icon: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/40 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">
            {icon}
          </span>
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
          {source}
        </span>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function GuideSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-2xl border border-outline-variant/40 bg-surface-container" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl border border-outline-variant/40 bg-surface-container" />
        <div className="h-72 animate-pulse rounded-2xl border border-outline-variant/40 bg-surface-container" />
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/60 px-8 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed/30">
        <span className="material-symbols-outlined text-4xl text-primary">{icon}</span>
      </div>
      <h3 className="mb-2 text-xl font-bold text-on-surface">{title}</h3>
      <p className="max-w-md text-sm text-on-surface-variant">{body}</p>
      {action}
    </div>
  );
}
