"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchTravelGuide,
  hasAnySource,
  isTravelGuideEnabled,
  riskStyle,
  type TravelGuideData,
} from "@/lib/travelGuide";

const POPOVER_WIDTH = 320;
const GAP = 10;
const MARGIN = 12;

type Coords = { top: number; left: number; placement: "top" | "bottom" };

export default function TravelGuideBadge({ destination }: { destination: string }) {
  const [data, setData] = useState<TravelGuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [activeTab, setActiveTab] = useState<"risk" | "entry">("risk");

  const badgeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = isTravelGuideEnabled();

  // ── Data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !destination) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    (async () => {
      const guide = await fetchTravelGuide(destination, controller.signal);
      if (!active) return;
      if (hasAnySource(guide)) {
        setData(guide);
        // Land on the tab that actually has data behind it.
        setActiveTab(guide.sources.travelRisk ? "risk" : "entry");
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [destination, enabled]);

  // ── Positioning ────────────────────────────────────────────────────
  const position = useCallback(() => {
    const badge = badgeRef.current;
    if (!badge) return;

    const rect = badge.getBoundingClientRect();
    const height = popoverRef.current?.offsetHeight ?? 280;

    const fitsAbove = rect.top - height - GAP > MARGIN;
    const top = fitsAbove ? rect.top - height - GAP : rect.bottom + GAP;

    // Left-align to the badge, then clamp inside the viewport.
    const maxLeft = window.innerWidth - POPOVER_WIDTH - MARGIN;
    const left = Math.max(MARGIN, Math.min(rect.left, Math.max(MARGIN, maxLeft)));

    setCoords({ top, left, placement: fitsAbove ? "top" : "bottom" });
  }, []);

  useLayoutEffect(() => {
    if (open) position();
  }, [open, position, activeTab]);

  useEffect(() => {
    if (!open) return;

    // The badge lives inside a scrolling dashboard — reposition rather than
    // letting the popover drift away from its anchor.
    const onScrollOrResize = () => position();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pinnedRef.current = false;
        setOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !badgeRef.current?.contains(target)
      ) {
        pinnedRef.current = false;
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, position]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // ── Interaction ────────────────────────────────────────────────────
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (pinnedRef.current) return;
    cancelClose();
    // Small grace period so the pointer can travel badge -> popover.
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  const openOnHover = () => {
    cancelClose();
    setOpen(true);
  };

  const toggleOnClick = (e: React.MouseEvent) => {
    // The whole trip card is clickable — don't open the trip.
    e.preventDefault();
    e.stopPropagation();
    cancelClose();
    const next = !open || !pinnedRef.current;
    pinnedRef.current = next;
    setOpen(next);
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (!enabled) return null;

  if (loading) {
    return (
      <div
        className="h-[26px] w-[104px] rounded-full bg-white/20 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  // Both sources unavailable — hide silently, no error surfaced to the user.
  if (!data) return null;

  const style = riskStyle(data.riskLevel);
  const alertCount = data.alertCount || data.activeAlerts.length;

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        onClick={toggleOnClick}
        onMouseEnter={openOnHover}
        onMouseLeave={scheduleClose}
        onFocus={openOnHover}
        aria-expanded={open}
        aria-label={`Travel guide for ${data.countryName}: ${style.label}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/35 px-2.5 py-1 backdrop-blur-md shadow-sm transition-colors hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-white">
          {style.label}
        </span>
        {alertCount > 0 && (
          <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[9px] font-bold leading-[14px] text-white">
            {alertCount}
          </span>
        )}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Travel guide for ${data.countryName}`}
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="fixed z-[9999] overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-[0_16px_48px_rgba(16,24,40,0.18)]"
          >
            <GuideCard data={data} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>,
          document.body,
        )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Popover body
// -----------------------------------------------------------------------------

function GuideCard({
  data,
  activeTab,
  onTabChange,
}: {
  data: TravelGuideData;
  activeTab: "risk" | "entry";
  onTabChange: (tab: "risk" | "entry") => void;
}) {
  const style = riskStyle(data.riskLevel);
  const showRisk = data.sources.travelRisk;
  const showEntry = data.sources.tugo;
  // With only one source available there is nothing to switch between.
  const showTabs = showRisk && showEntry;
  const tab = showTabs ? activeTab : showRisk ? "risk" : "entry";

  return (
    <>
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="truncate text-[11px] font-semibold text-gray-500">
            {data.countryName}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-gray-600">{data.advisoryText}</p>
      </div>

      {/* Tabs */}
      {showTabs && (
        <div className="flex border-b border-gray-100">
          <TabButton active={tab === "risk"} onClick={() => onTabChange("risk")}>
            Risk &amp; Alerts
            {data.activeAlerts.length > 0 && (
              <span className="ml-1 text-red-500">({data.activeAlerts.length})</span>
            )}
          </TabButton>
          <TabButton active={tab === "entry"} onClick={() => onTabChange("entry")}>
            Entry &amp; Health
          </TabButton>
        </div>
      )}

      {/* Body */}
      <div className="max-h-[260px] space-y-4 overflow-y-auto px-4 py-3.5">
        {tab === "risk" && showRisk && <RiskSection data={data} compact />}
        {tab === "entry" && showEntry && <EntrySection data={data} compact />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-2">
        <span className="text-[9px] font-medium text-gray-400">
          {[data.sources.travelRisk && "Travel Risk API", data.sources.tugo && "TuGo"]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {data.lastUpdated && (
          <span className="text-[9px] text-gray-400">
            Updated {formatDate(data.lastUpdated)}
          </span>
        )}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-b-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
        active
          ? "border-[#E67E22] bg-[#FFF8F0] text-gray-900"
          : "border-transparent text-gray-400 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Shared sections — reused by the badge popover and the full Guide page.
// -----------------------------------------------------------------------------

export function RiskSection({
  data,
  compact = false,
}: {
  data: TravelGuideData;
  compact?: boolean;
}) {
  const style = riskStyle(data.riskLevel);
  const score = data.riskScore;

  return (
    <div className={compact ? "space-y-3.5" : "space-y-6"}>
      {score !== null && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold text-gray-500">
              Composite risk score
            </span>
            <span className="text-sm font-black text-gray-900">
              {score.toFixed(1)}
              <span className="ml-0.5 text-[10px] font-bold text-gray-400">/ 5.0</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${style.bar}`}
              style={{ width: `${Math.max(4, Math.min(100, (score / 5) * 100))}%` }}
            />
          </div>
          {data.advisoryLevel && (
            <p className="mt-2 text-[11px] font-medium text-gray-500">
              Official advisory: {data.advisoryLevel}
            </p>
          )}
        </div>
      )}

      {data.riskCalculation.length > 0 && (
        <Section title="Score breakdown">
          <dl className={compact ? "space-y-1.5" : "grid grid-cols-2 gap-3"}>
            {data.riskCalculation.map((factor, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-3 border-b border-gray-50 pb-1 last:border-0"
              >
                <dt className="text-[11px] text-gray-500">{factor.label}</dt>
                <dd className="text-[11px] font-bold text-gray-900">{factor.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section
        title={
          data.alertCount > data.activeAlerts.length
            ? `Active alerts · showing ${data.activeAlerts.length} of ${data.alertCount}`
            : "Active alerts"
        }
      >
        {data.activeAlerts.length > 0 ? (
          <ul className="space-y-2">
            {data.activeAlerts.map((alert, i) => (
              <li key={i} className="rounded-lg border border-red-100 bg-red-50/70 p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold capitalize text-red-700">
                    {alert.type}
                  </span>
                  <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                    {alert.severity}
                  </span>
                </div>
                {alert.location && (
                  <p className="mb-0.5 text-[10px] font-semibold text-red-600/80">
                    {alert.location}
                  </p>
                )}
                {alert.description && (
                  <p className="text-[11px] leading-snug text-red-900/70">
                    {alert.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
            No active disaster alerts.
          </p>
        )}
      </Section>
    </div>
  );
}

export function EntrySection({
  data,
  compact = false,
}: {
  data: TravelGuideData;
  compact?: boolean;
}) {
  const groups = [
    { title: "Entry requirements", notes: data.entryRequirements },
    { title: "Health", notes: data.healthNotes },
    { title: "Safety", notes: data.safetyNotes },
    { title: "Local law & culture", notes: data.lawNotes },
  ].filter((g) => g.notes.length > 0);

  if (groups.length === 0 && !data.climateNote) {
    return (
      <p className="py-3 text-center text-[11px] text-gray-400">
        No detailed entry or health information available.
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-3.5" : "space-y-6"}>
      {groups.map((group) => (
        <Section key={group.title} title={group.title}>
          <ul className="space-y-2">
            {group.notes.map((note, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-gray-600">
                <span className="font-bold text-gray-900">{note.category}: </span>
                {note.description}
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {data.climateNote && (
        <Section title="Climate & natural disasters">
          <p className="text-[11px] leading-relaxed text-gray-600">{data.climateNote}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
