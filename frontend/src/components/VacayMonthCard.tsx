"use client";

import React from "react";

interface VacayMonthCardProps {
  year: number;
  month: number;
  entryMap: Record<string, any[]>;
  tripDates?: Record<string, { gradient: string, destination: string }>;
  users: any[];
  onToggleEntry: (dateStr: string) => void;
}

export default function VacayMonthCard({ year, month, entryMap, tripDates = {}, users, onToggleEntry }: VacayMonthCardProps) {
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // Monday start

  // Get number of days and the starting day of week
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() gives 0=Sun, 1=Mon. We want Mon=0, Sun=6
  let firstDay = new Date(year, month, 1).getDay() - 1;
  if (firstDay === -1) firstDay = 6;

  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Helper to get hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    if (!hex) return `rgba(156, 163, 175, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const renderOverlays = (dateEntries: any[]) => {
    if (!dateEntries || dateEntries.length === 0) return null;
    
    // Map entries to user colors
    const colors = dateEntries.map(e => {
      const u = users.find(user => user.id === e.user_id);
      return u ? hexToRgba(u.color, 0.4) : 'rgba(156,163,175,0.4)';
    });

    if (colors.length === 1) {
      return <div className="absolute inset-0" style={{ backgroundColor: colors[0] }} />;
    }
    if (colors.length === 2) {
      return (
        <div className="absolute inset-0" style={{ 
          background: `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`
        }} />
      );
    }
    if (colors.length === 3) {
      return (
        <div className="absolute inset-0 flex">
          <div className="w-1/2 h-full" style={{ backgroundColor: colors[0] }} />
          <div className="w-1/2 h-full flex flex-col">
            <div className="h-1/2 w-full" style={{ backgroundColor: colors[1] }} />
            <div className="h-1/2 w-full" style={{ backgroundColor: colors[2] }} />
          </div>
        </div>
      );
    }
    if (colors.length >= 4) {
      return (
        <div className="absolute inset-0 flex flex-wrap">
          <div className="w-1/2 h-1/2" style={{ backgroundColor: colors[0] }} />
          <div className="w-1/2 h-1/2" style={{ backgroundColor: colors[1] }} />
          <div className="w-1/2 h-1/2" style={{ backgroundColor: colors[2] }} />
          <div className="w-1/2 h-1/2" style={{ backgroundColor: colors[3] }} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-semibold text-gray-800">{monthName}</h3>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dayNames.map((d, i) => (
          <div key={d} className={`text-center py-1.5 text-[10px] font-bold uppercase tracking-wider ${i >= 5 ? 'text-gray-300' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 p-1 gap-1">
        {blanks.map(b => (
          <div key={`blank-${b}`} className="h-[28px]"></div>
        ))}
        {days.map(d => {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          
          // is weekend? (Mon=0, Sun=6 grid, so col index is (firstDay + d - 1) % 7)
          const colIndex = (firstDay + d - 1) % 7;
          const isWeekend = colIndex === 5 || colIndex === 6;
          const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
          const tripData = tripDates[dateStr];
          const tripGradient = tripData?.gradient;
          const tripDestination = tripData?.destination;
          
          const dateEntries = entryMap[dateStr] || [];

          return (
            <div 
              key={d} 
              title={tripDestination ? `${tripDestination} Trip` : undefined}
              onClick={() => onToggleEntry(dateStr)}
              className={`
                relative h-[28px] rounded-md cursor-pointer flex items-center justify-center text-xs overflow-hidden
                ${isWeekend ? 'bg-gray-50/80 text-gray-400' : 'text-gray-700 hover:bg-gray-50'}
                ${tripGradient ? `${tripGradient} text-white font-bold opacity-80 shadow-sm border border-black/10` : ''}
              `}
            >
              {/* Overlays for vacations */}
              {renderOverlays(dateEntries)}

              {/* Day Number */}
              <span className={`relative z-10 font-medium ${isToday ? 'bg-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full shadow-sm text-[11px]' : ''}`}>
                {d}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
