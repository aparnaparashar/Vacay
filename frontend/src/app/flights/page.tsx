"use client";

import { useTripData } from "@/context/TripContext";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

export default function FlightsPage() {
  const { tripData } = useTripData();
  const flights = tripData.flights || [];
  const [selectedFlight, setSelectedFlight] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [directOnly, setDirectOnly] = useState(false);

  const visibleFlights = useMemo(() => {
    const parsePrice = (price: any) => {
      if (typeof price === "number") return price;
      const normalized = String(price ?? "")
        .replace(/,/g, "")
        .replace(/[^0-9.]/g, "");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };

    const filtered = flights.filter((flight: any) =>
      directOnly ? Number(flight.stops || 0) === 0 : true,
    );

    return [...filtered].sort((left: any, right: any) => {
      const leftPrice = parsePrice(left.price);
      const rightPrice = parsePrice(right.price);
      return sortDirection === "asc"
        ? leftPrice - rightPrice
        : rightPrice - leftPrice;
    });
  }, [directOnly, flights, sortDirection]);

  const openBookingSearch = (flight: any) => {
    const queryParts = [tripData.origin, tripData.destination, tripData.departureDate]
      .filter(Boolean)
      .join(" ");
    const url =
      flight.booking_url ||
      flight.website ||
      `https://www.google.com/travel/flights?q=${encodeURIComponent(queryParts)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (flights.length === 0) {
    return (
      <div className="max-w-5xl mx-auto w-full animate-fade-in">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-24 h-24 rounded-full bg-primary-fixed/30 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-primary text-5xl">
              flight
            </span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">
            No Flights Found
          </h2>
          <p className="text-on-surface-variant max-w-md">
            Generate a trip first from the home page. Once your trip is planned,
            available flights will appear here.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm transition-transform active:scale-95 hover:opacity-90"
          >
            <span className="material-symbols-outlined text-sm">explore</span>
            Plan a Trip
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8 animate-fade-in pt-[136px] px-8 pb-12">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">Flights</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            {tripData.origin || "Origin"} → {tripData.destination || "Destination"} •{" "}
            {flights.length} option{flights.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-2"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
          >
            <span className="material-symbols-outlined text-sm">sort</span>
            Sort by Price {sortDirection === "asc" ? "↑" : "↓"}
          </button>
          <button 
            className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-2"
            onClick={() => setDirectOnly((current) => !current)}
          >
            <span className="material-symbols-outlined text-sm">
              filter_list
            </span>
            {directOnly ? "Direct Only" : "Filter"}
          </button>
        </div>
      </div>

      {/* Flight Cards */}
      <div className="space-y-4">
        {visibleFlights.map((flight: any, index: number) => {
          const isSelected = selectedFlight === index;
          const departureTime = flight.departure
            ? new Date(flight.departure).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—";
          const arrivalTime = flight.arrival
            ? new Date(flight.arrival).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—";
          const departureDate = flight.departure
            ? new Date(flight.departure).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
            : "";
          const arrivalDate = flight.arrival
            ? new Date(flight.arrival).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
            : "";

          return (
            <div
              key={index}
              onClick={() => setSelectedFlight(isSelected ? null : index)}
              className={`animate-slide-up bg-surface-container-lowest rounded-[24px] border shadow-sm overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${
                isSelected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-outline-variant/50"
              }`}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="p-6">
                <div className="flex items-center justify-between gap-6">
                  {/* Airline Info */}
                  <div className="flex items-center gap-4 min-w-[160px]">
                    <div className="w-12 h-12 rounded-xl bg-primary-fixed/40 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary">
                        airlines
                      </span>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-on-surface">
                        {flight.airline}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {flight.stops === 0
                          ? "Direct"
                          : flight.stops
                          ? `${flight.stops} Stop(s)`
                          : "Direct"}
                      </p>
                    </div>
                  </div>

                  {/* Flight Path Graphic */}
                  <div className="flex-1 flex items-center gap-3 px-4">
                    {/* Departure */}
                    <div className="text-center min-w-[80px]">
                      <p className="text-xl font-bold text-on-surface">
                        {departureTime}
                      </p>
                      <p className="text-[11px] text-on-surface-variant font-medium uppercase tracking-wide">
                        {tripData.origin || "DEP"}
                      </p>
                      {departureDate && (
                        <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
                          {departureDate}
                        </p>
                      )}
                    </div>

                    {/* Path Line */}
                    <div className="flex-1 flex items-center relative py-4">
                      <div className="w-3 h-3 rounded-full border-2 border-primary bg-surface-container-lowest shrink-0 z-10" />
                      <div className="flex-1 h-[2px] bg-gradient-to-r from-primary via-primary-container to-primary relative">
                        <span className="material-symbols-outlined text-primary absolute left-1/2 -translate-x-1/2 -top-[14px] text-[20px]">
                          flight
                        </span>
                      </div>
                      <div className="w-3 h-3 rounded-full border-2 border-primary bg-primary shrink-0 z-10" />
                    </div>

                    {/* Arrival */}
                    <div className="text-center min-w-[80px]">
                      <p className="text-xl font-bold text-on-surface">
                        {arrivalTime}
                      </p>
                      <p className="text-[11px] text-on-surface-variant font-medium uppercase tracking-wide">
                        {tripData.destination || "ARR"}
                      </p>
                      {arrivalDate && (
                        <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
                          {arrivalDate}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Price & Action */}
                  <div className="text-right min-w-[140px] flex flex-col items-end gap-2">
                    <p className="text-2xl font-bold text-on-surface">
                      {flight.price}
                    </p>
                    <span className="text-[10px] text-on-surface-variant">
                      per person
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openBookingSearch(flight);
                      }}
                      className="mt-1 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center gap-2 transition-all hover:opacity-90 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-sm">
                        check_circle
                      </span>
                      Book Flight
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isSelected && (
                <div className="border-t border-outline-variant/30 bg-surface-container-low/50 px-6 py-4 animate-fade-in">
                  <div className="flex items-center gap-6 text-xs text-on-surface-variant">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">
                        luggage
                      </span>
                      Cabin baggage included
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">
                        restaurant
                      </span>
                      In-flight meal
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">
                        electrical_services
                      </span>
                      USB charging
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">
                        event_seat
                      </span>
                      Standard seat
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/50 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-container p-2 bg-primary-fixed rounded-lg">
            info
          </span>
          <p className="text-sm text-on-surface-variant">
            Prices are indicative and may change. Book early for the best deals.
          </p>
        </div>
        <button
          className="text-xs font-bold text-primary hover:underline"
          onClick={() => {
            if (visibleFlights.length > 0) {
              setSelectedFlight(0);
              openBookingSearch(visibleFlights[0]);
            }
          }}
        >
          Compare all
        </button>
      </div>
    </div>
  );
}
