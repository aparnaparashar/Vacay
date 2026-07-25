"use client";

import { useTripData } from "@/context/TripContext";
import CurrencyWidget from "@/components/CurrencyWidget";
import HolidaysWidget from "@/components/HolidaysWidget";
import TimezoneWidget from "@/components/TimezoneWidget";
import Link from "next/link";

export default function LogisticsPage() {
  const { tripData } = useTripData();

  if (!tripData) {
    return (
      <div className="min-h-screen pt-32 px-8 flex flex-col items-center max-w-[1200px] mx-auto text-center">
        <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">explore_off</span>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Trip Selected</h2>
        <p className="text-gray-500 mb-6 max-w-md">Please generate a new trip or select an existing one from your dashboard to view its logistics.</p>
        <Link href="/" className="px-6 py-3 bg-primary text-white rounded-full font-bold shadow-sm">
          Plan a Trip
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 px-8 max-w-[1200px] mx-auto">
      <div className="mb-10 animate-slide-up">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Trip Logistics</h1>
        <p className="text-gray-500 font-medium">Holidays, currency exchange, and timezones for {tripData.destination}.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
        <HolidaysWidget 
          destination={tripData.destination} 
          startDate={tripData.departureDate || (tripData as any).departure_date} 
          endDate={tripData.arrivalDate || (tripData as any).arrival_date} 
        />
        
        <CurrencyWidget />

        {/* Timezones Widget */}
        <TimezoneWidget destination={tripData.destination} />
      </div>
    </div>
  );
}
