"use client";

import { useEffect, useState } from "react";

export default function TimezoneWidget({ destination }: { destination: string }) {
  const [localTime, setLocalTime] = useState<string>("--:--");
  const [homeTime, setHomeTime] = useState<string>("--:--");
  const [homeZone, setHomeZone] = useState<string>("Local");
  const [destZone, setDestZone] = useState<string>("...");
  
  useEffect(() => {
    // 1. Set Home Time (Browser's local time)
    const homeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const shortHomeZone = new Date().toLocaleTimeString('en-us',{timeZoneName:'short'}).split(' ')[2] || homeTz.split('/')[1] || "Local";
    setHomeZone(shortHomeZone);

    const updateTimes = (destTzStr: string | null) => {
      const now = new Date();
      // Format home time
      setHomeTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      
      // Format destination time
      if (destTzStr) {
        try {
          const formattedDest = now.toLocaleTimeString("en-US", { 
            timeZone: destTzStr, 
            hour: "2-digit", 
            minute: "2-digit",
            hour12: false 
          });
          setLocalTime(formattedDest);
        } catch (e) {
          setLocalTime("--:--");
        }
      }
    };

    updateTimes(null); // Initial run for home time

    // 2. Fetch destination timezone from Open-Meteo Geocoder
    let destTzStr: string | null = null;
    let interval: NodeJS.Timeout;

    async function fetchTimezone() {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&format=json`);
        const data = await res.json();
        if (data.results && data.results.length > 0 && data.results[0].timezone) {
          destTzStr = data.results[0].timezone;
          // Extract short name like "Paris" from "Europe/Paris"
          setDestZone(destTzStr!.split('/').pop()?.replace('_', ' ') || destination);
          updateTimes(destTzStr);
          
          // Set up a timer to update every minute
          interval = setInterval(() => {
            updateTimes(destTzStr);
          }, 60000);
        } else {
          setDestZone(destination);
        }
      } catch (e) {
        console.error("Failed to fetch timezone:", e);
      }
    }

    fetchTimezone();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [destination]);

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col">
      <div className="flex justify-between items-center mb-6 text-gray-500 text-xs font-bold tracking-widest">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">schedule</span>
          TIMEZONES
        </div>
      </div>

      <div className="flex flex-col gap-6 flex-1 justify-center">
        {/* Destination / Local Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600">L</div>
            <div>
              <p className="text-base font-bold text-gray-900">Local Time</p>
              <p className="text-xs font-semibold text-gray-400 truncate max-w-[100px]">{destZone}</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{localTime}</p>
        </div>

        {/* Home Time */}
        <div className="flex items-center justify-between opacity-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">H</div>
            <div>
              <p className="text-base font-bold text-gray-900">Home</p>
              <p className="text-xs font-semibold text-gray-400">{homeZone}</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{homeTime}</p>
        </div>
      </div>
    </div>
  );
}
