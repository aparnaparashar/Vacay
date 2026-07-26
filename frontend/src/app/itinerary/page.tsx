"use client";

import { useTripData } from "@/context/TripContext";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import WeatherWidget from "@/components/WeatherWidget";
import toast from "react-hot-toast";
import { useRouteCalculation } from "@/hooks/useRouteCalculation";
import type { RouteProfile, RouteWaypoint } from "@/lib/routeCalculator";

const DynamicMap = dynamic(() => import("@/components/MapComponent"), { ssr: false });

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatIcsDate(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildCalendarIcs(tripData: any, itinerary: any) {
  const startDate = tripData.departureDate ? new Date(tripData.departureDate) : new Date();
  const tripName = tripData.destination || "Trip";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wandr//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  itinerary?.days?.forEach((day: any, index: number) => {
    const eventDate = new Date(startDate);
    eventDate.setDate(eventDate.getDate() + index);
    const activityNames = (day.activities || [])
      .map((activity: any) => activity.title || activity.name || activity.activity)
      .filter(Boolean)
      .slice(0, 4)
      .join(" · ");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:wandr-${index}-${Date.now()}@vacay`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date())}T000000Z`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(eventDate)}`);
    const endDate = new Date(eventDate);
    endDate.setDate(endDate.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(endDate)}`);
    lines.push(`SUMMARY:${escapeIcsText(`${tripName} - Day ${day.day || index + 1}`)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(activityNames || `Planned itinerary for Day ${day.day || index + 1}`)}`,
    );
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function ItineraryPage() {
  const { tripData, setTripData } = useTripData();
  const itinerary = tripData.itinerary;
  const days: any[] = itinerary?.days || [];
  
  const [routeDayIndex, setRouteDayIndex] = useState(0);
  const [weatherDayIndex, setWeatherDayIndex] = useState<number | null>(null);
  const [weatherData, setWeatherData] = useState<any[]>([]);
  const [routeProfile, setRouteProfile] = useState<RouteProfile>('driving');
  const [showRoute, setShowRoute] = useState(true);
  const [undoHistory, setUndoHistory] = useState<Record<number, any[]>>({});
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Maps Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Manual Add Modal State
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualTime, setManualTime] = useState("10:00");
  const [manualType, setManualType] = useState("POI");
  const [manualDescription, setManualDescription] = useState("");

  // Debounced search effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }
      
      setIsSearching(true);
      setShowSearchDropdown(true);
      
      try {
        const isUrl = searchQuery.startsWith("http");
        const endpoint = isUrl ? `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/maps/resolve-url` : `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/maps/search`;
        
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, region: "IN" })
        });
        
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Geocode this trip's destination so the map has a correct centre even when
  // no activity carries coordinates yet.
  useEffect(() => {
    const destination = tripData.destination?.trim();
    if (!destination) {
      setDestinationCoords(null);
      return;
    }

    let active = true;
    setDestinationCoords(null);

    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/maps/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: destination })
        });
        if (!res.ok) return;
        const data = await res.json();
        const match = (data.results || [])[0];
        const dLat = Number(match?.latitude);
        const dLng = Number(match?.longitude);
        if (active && !isNaN(dLat) && !isNaN(dLng) && (dLat !== 0 || dLng !== 0)) {
          setDestinationCoords({ lat: dLat, lng: dLng });
        }
      } catch (err) {
        console.error("Failed to geocode destination", err);
      }
    })();

    return () => { active = false; };
  }, [tripData.destination]);

  const handleAddPlace = (place: any) => {
    if (!tripData.itinerary || !tripData.itinerary.days || tripData.itinerary.days.length === 0) {
      toast.error("Generate a trip first before adding places manually.");
      return;
    }

    // Default to route day, or first day
    const dayIndexToUpdate = routeDayIndex;
    
    const newActivity = {
      title: place.name,
      type: "CUSTOM",
      time: "TBD",
      description: `Added via Maps (${place.source})`,
      place_details: {
        name: place.name,
        address: place.address,
        rating: place.rating,
        location: {
          latitude: place.latitude,
          longitude: place.longitude
        }
      }
    };

    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    if (!updatedItinerary.days[dayIndexToUpdate].activities) {
        updatedItinerary.days[dayIndexToUpdate].activities = [];
    }
    
    updatedItinerary.days[dayIndexToUpdate].activities.push(newActivity);
    
    setTripData({ itinerary: updatedItinerary });
    toast.success(`Added ${place.name} to Day ${dayIndexToUpdate + 1}!`);
    setSearchQuery("");
    setShowSearchDropdown(false);
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this activity?")) return;
    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    updatedItinerary.days[dayIndex].activities.splice(actIndex, 1);
    setTripData({ itinerary: updatedItinerary });
    toast.success("Activity deleted");
  };

  const handleMoveActivity = (dayIndex: number, actIndex: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    const activities = updatedItinerary.days[dayIndex].activities;
    if (direction === 'up' && actIndex > 0) {
      const temp = activities[actIndex - 1];
      activities[actIndex - 1] = activities[actIndex];
      activities[actIndex] = temp;
    } else if (direction === 'down' && actIndex < activities.length - 1) {
      const temp = activities[actIndex + 1];
      activities[actIndex + 1] = activities[actIndex];
      activities[actIndex] = temp;
    }
    setTripData({ itinerary: updatedItinerary });
  };


  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripData.itinerary || !tripData.itinerary.days || tripData.itinerary.days.length === 0) {
      toast.error("Generate a trip first before adding places manually.");
      return;
    }

    const dayIndexToUpdate = routeDayIndex;
    
    const newActivity = {
      title: manualTitle,
      type: manualType,
      time: manualTime,
      description: manualDescription || "Manually added activity",
      place_details: null
    };

    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    if (!updatedItinerary.days[dayIndexToUpdate].activities) {
        updatedItinerary.days[dayIndexToUpdate].activities = [];
    }
    
    updatedItinerary.days[dayIndexToUpdate].activities.push(newActivity);
    
    setTripData({ itinerary: updatedItinerary });
    toast.success(`Added ${manualTitle} to Day ${dayIndexToUpdate + 1}!`);
    
    // Reset form and close
    setManualTitle("");
    setManualTime("10:00");
    setManualType("POI");
    setManualDescription("");
    setShowManualAdd(false);
  };

  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate generic start date for UI
  const startDate = tripData.departureDate ? new Date(tripData.departureDate) : new Date();

  // Get current day activities for route calculation
  const currentDayActivities = useMemo(() => {
    return days[routeDayIndex]?.activities || [];
  }, [days, routeDayIndex]);

  // Route calculation hook — auto-fires when activities or profile change
  const { route, routeInfo, isCalculating, error: routeError, optimizeOrder, openInGoogleMaps } = 
    useRouteCalculation(currentDayActivities, routeProfile, showRoute);

  // Types that are time-sensitive and should stay pinned in their slot
  const TIME_PINNED_TYPES = ['FOOD', 'MEAL', 'BREAKFAST', 'LUNCH', 'DINNER', 'HOTEL', 'CHECK_IN', 'CHECK_OUT', 'TRANSIT', 'FLIGHT'];

  const isTimePinned = (act: any) => {
    const type = (act.type || '').toUpperCase();
    const title = (act.title || act.name || '').toLowerCase();
    if (TIME_PINNED_TYPES.some(t => type.includes(t))) return true;
    // Also catch by title keywords
    if (['breakfast', 'lunch', 'dinner', 'brunch', 'check-in', 'check-out', 'flight'].some(k => title.includes(k))) return true;
    return false;
  };

  // Handle optimize order — time-aware, pins meals/food at their slots
  const handleOptimizeOrder = () => {
    const idx = routeDayIndex;
    const activities = tripData.itinerary?.days?.[idx]?.activities;
    if (!activities?.length) {
      toast.error("No activities to optimize.");
      return;
    }
    
    const optimized = optimizeOrder();
    if (optimized.length < 2) {
      toast("Need at least 2 places with coordinates to optimize.", { icon: "📍" });
      return;
    }

    // Save current order for undo BEFORE changing anything
    setUndoHistory(prev => ({ ...prev, [idx]: JSON.parse(JSON.stringify(activities)) }));

    // Separate pinned (time-sensitive) and flexible activities
    const originalActivities = [...activities];
    const pinnedSlots: { index: number; activity: any }[] = [];
    const flexibleActivities: any[] = [];

    originalActivities.forEach((act, i) => {
      if (isTimePinned(act)) {
        pinnedSlots.push({ index: i, activity: act });
      } else {
        flexibleActivities.push(act);
      }
    });

    // Build optimized order for flexible activities only
    const optimizedFlexible: any[] = [];
    const flexPool = [...flexibleActivities];
    
    for (const wp of optimized) {
      const match = flexPool.find((act: any) => {
        const loc = act.place_details?.location || act.location;
        if (!loc) return false;
        const aLat = Number(loc.latitude || loc.lat);
        const aLng = Number(loc.longitude || loc.lng);
        return Math.abs(aLat - wp.lat) < 0.0001 && Math.abs(aLng - wp.lng) < 0.0001;
      });
      if (match) {
        optimizedFlexible.push(match);
        const matchIdx = flexPool.indexOf(match);
        if (matchIdx !== -1) flexPool.splice(matchIdx, 1);
      }
    }
    // Any flex activities without coordinates go at end
    optimizedFlexible.push(...flexPool);

    // Merge: put pinned activities back at their original positions
    const result: any[] = [];
    let flexIdx = 0;
    for (let i = 0; i < originalActivities.length; i++) {
      const pinned = pinnedSlots.find(p => p.index === i);
      if (pinned) {
        result.push(pinned.activity);
      } else if (flexIdx < optimizedFlexible.length) {
        result.push(optimizedFlexible[flexIdx++]);
      }
    }
    // Append any remaining
    while (flexIdx < optimizedFlexible.length) {
      result.push(optimizedFlexible[flexIdx++]);
    }

    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    updatedItinerary.days[idx].activities = result;
    setTripData({ itinerary: updatedItinerary });

    const pinnedCount = pinnedSlots.length;
    const msg = pinnedCount > 0 
      ? `Route optimized! ${pinnedCount} time-fixed activit${pinnedCount === 1 ? 'y' : 'ies'} (meals, etc.) kept in place.`
      : 'Route optimized! Activities reordered for shortest travel.';
    toast.success(msg);
  };

  // Undo optimization
  const handleUndo = () => {
    const idx = routeDayIndex;
    const prev = undoHistory[idx];
    if (!prev) {
      toast("Nothing to undo.", { icon: "↩️" });
      return;
    }
    const updatedItinerary = JSON.parse(JSON.stringify(tripData.itinerary));
    updatedItinerary.days[idx].activities = prev;
    setTripData({ itinerary: updatedItinerary });
    setUndoHistory(h => { const copy = { ...h }; delete copy[idx]; return copy; });
    toast.success("Reverted to previous order.");
  };

  let firstLat: number | null = null;
  let firstLng: number | null = null;
  const aiMarkers: any[] = [];

  // Find first valid coordinates and collect all markers for the ROUTE day
  const currentDay = days[routeDayIndex];
  if (currentDay?.activities) {
    for (const act of currentDay.activities) {
      const loc = act.place_details?.location;
      if (loc) {
        const mLat = Number(loc.latitude || loc.lat);
        const mLng = Number(loc.longitude || loc.lng);
        if (!isNaN(mLat) && !isNaN(mLng)) {
          if (firstLat === null) {
            firstLat = mLat;
            firstLng = mLng;
          }
          aiMarkers.push({
            lat: mLat,
            lng: mLng,
            title: act.place_details?.name || act.title,
            type: act.type,
            photo: act.place_details?.photo_url
          });
        }
      }
    }
  }

  // Map centre: this trip's own coordinates only — the first activity with
  // real coordinates, otherwise the geocoded trip destination.
  const lat = firstLat ?? destinationCoords?.lat ?? null;
  const lng = firstLng ?? destinationCoords?.lng ?? null;

  // Fetch weather data for the timeline
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/weather?lat=${lat}&lon=${lng}`);
        const data = await res.json();
        setWeatherData(data.days || []);
      } catch (e) {
        console.error("Failed to fetch weather for timeline", e);
      }
    };
    if (days.length > 0 && lat !== null && lng !== null) fetchWeather();
  }, [lat, lng, days.length]);

  const getMaterialIcon = (condition: string) => {
    switch (condition) {
      case 'Clear': return 'sunny';
      case 'Rain': case 'Drizzle': return 'rainy';
      case 'Thunderstorm': return 'thunderstorm';
      case 'Snow': return 'weather_snowy';
      default: return 'cloud';
    }
  };

  const handleCalendarExport = () => {
    const ics = buildCalendarIcs(tripData, itinerary);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(tripData.destination || "trip").toLowerCase().replace(/\s+/g, "-")}-itinerary.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Calendar file downloaded.");
  };
  
  if (!mounted) return null;

  if (!itinerary || days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] text-center text-gray-500 pt-[104px]">
        <span className="material-symbols-outlined text-6xl mb-4 opacity-50">map</span>
        <h2 className="text-xl font-bold text-gray-700">No Itinerary Generated Yet</h2>
        <p className="text-sm mt-2">Go back and generate a trip first.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#E5E3DF]">
      
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        {lat !== null && lng !== null && (
          <DynamicMap
            lat={lat}
            lng={lng}
            destination={tripData.destination || "Destination"}
            aiMarkers={aiMarkers}
            routeCoordinates={showRoute ? route?.coordinates ?? null : null}
            routeLegs={showRoute ? route?.legs ?? null : null}
          />
        )}
      </div>

      {/* Floating UI Container */}
      <div className="absolute top-[104px] bottom-0 left-0 right-0 z-10 flex justify-between p-4 pointer-events-none gap-4">
        
        {/* Left Sidebar: Timeline (Floating) */}
        <div className="w-[380px] max-w-[calc(50%-8px)] shrink bg-white/95 backdrop-blur-xl flex flex-col rounded-[24px] shadow-2xl border border-white/60 overflow-hidden pointer-events-auto h-full">
        {/* Top Actions */}
        <div className="p-4 flex gap-2 border-b border-gray-200 bg-white sticky top-0 z-20">
          <button 
            className="flex items-center gap-1.5 bg-[#E67E22] text-white px-3 py-1.5 rounded-md text-xs font-bold shadow-sm"
            onClick={() => {
              toast.loading("Generating PDF...", { duration: 1500 });
              setTimeout(() => toast.success("PDF exported successfully!"), 1500);
            }}
          >
            <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
            PDF
          </button>
          <button 
            className="flex items-center gap-1.5 bg-[#F3F4F6] text-gray-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-200 border border-gray-200"
            onClick={handleCalendarExport}
          >
            <span className="material-symbols-outlined text-[16px]">event</span>
            ICS
          </button>
          <div className="flex-1"></div>
          <button 
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold border transition-colors ${
              showRoute ? 'bg-[#E67E22] text-white border-[#E67E22] shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
            }`}
            onClick={() => setShowRoute(!showRoute)}
            title={showRoute ? 'Hide route' : 'Show route'}
          >
            <span className="material-symbols-outlined text-[16px]">route</span>
            Route
          </button>
        </div>

        {/* Days List */}
        <div className="flex-1 overflow-y-auto">
          {days.map((day, idx) => {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + idx);
            const dateStr = currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

            return (
              <div key={idx} className="border-b border-gray-100 pb-4">
                {/* Day Header - Click to select for routing */}
                <div 
                  className={`flex gap-3 p-4 sticky top-0 backdrop-blur-sm z-10 cursor-pointer transition-colors ${
                    routeDayIndex === idx 
                      ? 'bg-[#FFF8F0]/90 border-l-[3px] border-l-[#E67E22]' 
                      : 'bg-white/80 hover:bg-gray-50'
                  }`}
                  onClick={() => setRouteDayIndex(idx)}
                >
                  <div 
                    className={`group flex flex-col items-center justify-center w-12 h-14 rounded-lg shadow-sm border shrink-0 cursor-pointer transition-all hover:scale-105 hover:shadow-md ${
                      weatherDayIndex === idx 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setWeatherDayIndex(weatherDayIndex === idx ? null : idx);
                    }}
                    title="Click to view weather forecast"
                  >
                    <span className={`text-sm font-black transition-colors ${weatherDayIndex === idx ? 'text-blue-700' : 'text-gray-900 group-hover:text-blue-600'}`}>{idx + 1}</span>
                    <div className={`w-4 border-t my-1 transition-colors ${weatherDayIndex === idx ? 'border-blue-200' : 'border-gray-200 group-hover:border-blue-200'}`}></div>
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 transition-colors ${weatherDayIndex === idx ? 'text-blue-600' : 'text-gray-500 group-hover:text-blue-500'}`}>
                      <span className="material-symbols-outlined text-[10px]">{weatherData[idx] ? getMaterialIcon(weatherData[idx].condition) : 'cloud'}</span> {weatherData[idx] ? weatherData[idx].temp_max : '--'}°
                    </span>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-lg font-bold text-gray-900">Day {idx + 1}</h3>
                      <span className="text-xs font-semibold text-gray-400">{dateStr}</span>
                    </div>
                    {/* Hotel Indicator */}
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit mt-1 border border-emerald-100">
                      <span className="material-symbols-outlined text-[12px]">bed</span>
                      Hotel {tripData.destination}
                    </div>
                  </div>
                </div>

                {/* Route Info Bar */}
                {showRoute && routeInfo && routeDayIndex === idx && (
                  <div className="mx-4 mb-2 flex items-center gap-2 bg-[#FFF8F0] border border-[#E67E22]/20 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-[#E67E22] text-[16px]">route</span>
                    <span className="text-xs font-bold text-gray-800">{routeInfo.totalDistanceText}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs font-bold text-gray-800">{routeInfo.totalDurationText}</span>
                    <div className="flex-1"></div>
                    <select
                      value={routeProfile}
                      onChange={(e) => setRouteProfile(e.target.value as RouteProfile)}
                      className="text-[10px] font-bold text-gray-600 bg-white border border-gray-200 rounded px-1.5 py-0.5 cursor-pointer"
                    >
                      <option value="driving">🚗 Drive</option>
                      <option value="walking">🚶 Walk</option>
                      <option value="cycling">🚴 Bike</option>
                    </select>
                    <button 
                      onClick={openInGoogleMaps}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
                      title="Open in Google Maps"
                    >
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                      Maps
                    </button>
                  </div>
                )}

                {isCalculating && routeDayIndex === idx && (
                  <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-gray-500">
                    <span className="material-symbols-outlined animate-spin text-[14px] text-[#E67E22]">sync</span>
                    Calculating route...
                  </div>
                )}

                {/* Activities List */}
                <div className="flex flex-col">
                  {day.activities?.map((activity: any, actIdx: number) => {
                    const time = typeof activity.time === "string" ? activity.time.replace(/[^0-9:]/g, '') || "10:00" : "10:00";
                    return (
                      <div key={actIdx} className="flex group hover:bg-white transition-colors py-3 pl-2 pr-4 cursor-pointer relative rounded-lg">
                        {/* Action Buttons (Left) */}
                        <div className="w-8 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                          {actIdx > 0 && (
                            <button onClick={(e) => handleMoveActivity(idx, actIdx, 'up', e)} className="text-gray-400 hover:text-blue-500">
                              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                            </button>
                          )}
                          {actIdx < day.activities.length - 1 && (
                            <button onClick={(e) => handleMoveActivity(idx, actIdx, 'down', e)} className="text-gray-400 hover:text-blue-500">
                              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                            </button>
                          )}
                        </div>
                        
                        {/* Activity Photo */}
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center mr-3 relative z-10 mt-0.5 shadow-sm">
                          {activity.place_details?.photo_url ? (
                            <img 
                              src={activity.place_details.photo_url} 
                              className="w-full h-full object-cover transition-opacity duration-300" 
                              alt={activity.title} 
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <span className={`material-symbols-outlined text-gray-400 text-[18px] ${activity.place_details?.photo_url ? 'hidden absolute' : ''}`}>landscape</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between mb-0.5">
                            <h4 className="text-sm font-bold text-gray-900 leading-tight">
                              {activity.title || activity.activity || activity.name || (activity.place_details && activity.place_details.name)}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">schedule</span> {time}
                              </span>
                              <button onClick={(e) => handleDeleteActivity(idx, actIdx, e)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-tight line-clamp-1">
                            {activity.description || activity.search_query || (activity.place_details && activity.place_details.address) || "Activity description"}
                          </p>
                          
                          {/* Tags */}
                          <div className="flex gap-2 mt-2">
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-[#E8F5E9] text-[#2E7D32] rounded text-[9px] font-bold border border-[#C8E6C9]">
                              <span className="material-symbols-outlined text-[10px]">check_circle</span>
                              Planned
                            </div>
                          </div>
                          {/* Per-leg travel info connector */}
                          {showRoute && route?.legs && routeDayIndex === idx && actIdx < (day.activities.length - 1) && route.legs[actIdx] && (
                            <div className="flex items-center gap-1.5 mt-2 ml-0.5 text-[10px] text-gray-400 font-semibold">
                              <div className="w-[2px] h-3 bg-[#E67E22]/30 ml-1.5"></div>
                              <span className="material-symbols-outlined text-[11px] text-[#E67E22]/60">arrow_downward</span>
                              <span>{route.legs[actIdx].durationText} · {route.legs[actIdx].distanceText}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        
        {/* Floating Weather Widget */}
        {weatherDayIndex !== null && lat !== null && lng !== null && (
          <div className="pointer-events-auto absolute bottom-6 left-[396px] right-[376px] flex justify-center z-50">
            <WeatherWidget 
              dayIndex={weatherDayIndex}
              lat={lat}
              lng={lng}
              dateStr={(() => {
                const d = new Date(startDate);
                d.setDate(d.getDate() + weatherDayIndex);
                return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              })()}
              onClose={() => setWeatherDayIndex(null)}
            />
          </div>
        )}

      {/* Right Sidebar: Atlas / Places (Floating) */}
      <div className="w-[360px] max-w-[calc(50%-8px)] shrink bg-white/95 backdrop-blur-xl flex flex-col rounded-[24px] shadow-2xl border border-white/60 overflow-hidden pointer-events-auto h-full">
        <div className="p-4 bg-transparent border-b border-gray-100 flex flex-col gap-4">
          <button 
            className="w-full bg-[#E67E22] hover:bg-[#d6711c] text-white py-2.5 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors"
            onClick={() => setShowManualAdd(true)}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Place/Activity
          </button>
          
          <div className="flex gap-2">
            <button className="flex-1 bg-[#F9F9F9] border border-gray-200 text-gray-600 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors">
              <span className="material-symbols-outlined text-[14px]">upload_file</span>
              Import file
            </button>
            <button className="flex-1 bg-[#F9F9F9] border border-gray-200 text-gray-600 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors">
              <span className="material-symbols-outlined text-[14px]">list_alt</span>
              List Import
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <button className="flex items-center gap-1.5 bg-[#E67E22] text-white px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              All <span className="bg-white/30 px-1.5 rounded-full text-[10px]">10</span>
            </button>
            <button className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs font-bold hover:bg-gray-50 transition-colors">
              Unplanned <span className="bg-gray-100 text-gray-500 px-1.5 rounded-full text-[10px]">2</span>
            </button>
          </div>

          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
            <input 
              type="text" 
              placeholder="Search places..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if(searchQuery.length >= 3) setShowSearchDropdown(true); }}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="w-full bg-[#F3F4F6] border border-gray-200 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition-shadow"
            />
            {showSearchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                {isSearching ? (
                  <div className="p-3 text-sm text-gray-500 flex items-center justify-center">
                    <span className="material-symbols-outlined animate-spin mr-2 text-[18px]">refresh</span>
                    Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((res, i) => (
                    <div 
                      key={i} 
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 flex flex-col"
                      onClick={() => handleAddPlace(res)}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-gray-900 leading-tight pr-2">{res.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase font-bold tracking-wider whitespace-nowrap shrink-0">{res.source.replace('openstreetmap', 'osm').replace('google_url_resolved', 'g-url')}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 line-clamp-1">{res.address}</span>
                      {res.rating && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600 font-bold">
                          <span className="material-symbols-outlined text-[12px]">star</span>
                          {res.rating}
                        </div>
                      )}
                    </div>
                  ))
                ) : searchQuery.length >= 3 ? (
                  <div className="p-3 text-sm text-gray-500 text-center">No results found</div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <select className="flex-1 bg-white border border-gray-200 rounded-lg py-1.5 px-3 text-xs font-semibold text-gray-700 focus:outline-none appearance-none">
              <option>All Categories</option>
            </select>
            <button className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-gray-500">
              <span className="material-symbols-outlined text-[16px]">check</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-transparent p-4">
          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-4">10 places</p>
          
          <div className="flex flex-col gap-4">
            {/* Flatten all activities for the places list */}
            {days.flatMap(d => d.activities || []).map((activity: any, idx: number) => (
              <div key={idx} className="flex gap-3 group cursor-pointer hover:bg-gray-50 p-2 -mx-2 rounded-lg transition-colors">
                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">
                  {activity.place_details?.photo_url ? (
                    <>
                      <img 
                        src={activity.place_details.photo_url} 
                        className="w-full h-full object-cover transition-opacity duration-300" 
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <span className="hidden absolute material-symbols-outlined text-gray-400">landscape</span>
                    </>
                  ) : (
                    <span className="material-symbols-outlined text-gray-400">landscape</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-gray-900 truncate flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] text-purple-500">location_on</span>
                    {activity.title || activity.activity || activity.name || (activity.place_details && activity.place_details.name)}
                  </h4>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {(activity.place_details && activity.place_details.address) || activity.description || activity.search_query || "Location details"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      </div>

      {/* Manual Add Modal Overlay */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md overflow-hidden animate-fade-in border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#F8F9FA]">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#E67E22]">add_circle</span>
                Add Place/Activity
              </h3>
              <button 
                onClick={() => setShowManualAdd(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            
            <form onSubmit={handleManualAddSubmit} className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Title *</label>
                <input 
                  type="text" 
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Dinner at Seaside"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E22]/50 focus:border-[#E67E22] transition-shadow bg-gray-50"
                />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Time *</label>
                  <input 
                    type="time" 
                    required
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E22]/50 focus:border-[#E67E22] transition-shadow bg-gray-50 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Type *</label>
                  <select 
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E22]/50 focus:border-[#E67E22] transition-shadow bg-gray-50 cursor-pointer"
                  >
                    <option value="POI">Point of Interest</option>
                    <option value="FOOD">Food & Dining</option>
                    <option value="ACTIVITY">Activity</option>
                    <option value="TRANSIT">Transit</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Description (Optional)</label>
                <textarea 
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Any notes, booking references, or details..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E67E22]/50 focus:border-[#E67E22] transition-shadow bg-gray-50 resize-none"
                />
              </div>
              
              <div className="mt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowManualAdd(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-bold text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-[#E67E22] text-white font-bold text-sm rounded-lg hover:bg-[#d6711c] transition-colors shadow-sm"
                >
                  Save Activity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
