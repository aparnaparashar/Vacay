"use client";
import { useState, useEffect } from "react";

export default function HolidaysWidget({ destination, startDate, endDate }: { destination?: string, startDate?: string, endDate?: string }) {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!destination || !startDate || !endDate) return;

    const fetchHolidays = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/logistics/holidays?destination=${encodeURIComponent(destination)}&start_date=${startDate}&end_date=${endDate}`);
        const data = await res.json();
        if (data.status === "success") {
          setHolidays(data.data || []);
        }
      } catch (e) {
        console.error("Failed to fetch holidays", e);
      } finally {
        setLoading(false);
      }
    };

    fetchHolidays();
  }, [destination, startDate, endDate]);

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100">
      <div className="flex justify-between items-center mb-6 text-gray-500 text-xs font-bold tracking-widest">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">celebration</span>
          PUBLIC HOLIDAYS
        </div>
        {loading && <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>}
      </div>
      
      {!destination ? (
        <p className="text-sm text-gray-600 font-medium pb-2">Select a trip to see local holidays.</p>
      ) : holidays.length === 0 && !loading ? (
        <p className="text-sm text-gray-600 font-medium pb-2">No public holidays during this trip!</p>
      ) : (
        <div className="flex flex-col gap-4 max-h-40 overflow-y-auto">
          {holidays.map((h, i) => (
            <div key={i} className="flex items-start justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-bold text-gray-900 leading-tight mb-0.5">{h.name}</p>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{h.type || 'Public Holiday'}</p>
              </div>
              <div className="bg-orange-50 text-orange-600 px-2 py-1 rounded text-xs font-bold whitespace-nowrap">
                {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
