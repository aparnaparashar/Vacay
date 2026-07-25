"use client";

import React, { useState } from "react";

interface TripCalendarProps {
  trips: any[];
  colors: string[];
}

export default function TripCalendar({ trips, colors }: TripCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Helper to check if a specific day is in any trip
  const getTripForDay = (day: number) => {
    const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const currD = new Date(currentDayStr);
    
    // Reset time for accurate comparison
    currD.setHours(0,0,0,0);

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      const start = new Date(trip.departure_date);
      const end = new Date(trip.arrival_date);
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
      
      if (currD >= start && currD <= end) {
        return { trip, colorIndex: i % colors.length };
      }
    }
    return null;
  };

  return (
    <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 animate-fade-in w-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{monthNames[month]} {year}</h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined text-gray-600">chevron_left</span>
          </button>
          <button onClick={nextMonth} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined text-gray-600">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {blanks.map(b => (
          <div key={`blank-${b}`} className="h-24 bg-gray-50/50 rounded-2xl border border-transparent"></div>
        ))}
        {days.map(d => {
          const tripMatch = getTripForDay(d);
          const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
          
          return (
            <div key={d} className={`h-24 rounded-2xl p-2 relative overflow-hidden flex flex-col border ${tripMatch ? 'border-transparent shadow-sm' : 'border-gray-100 bg-white hover:border-gray-300'} transition-colors`}>
              {tripMatch && (
                <div className={`absolute inset-0 bg-gradient-to-br ${colors[tripMatch.colorIndex]} opacity-90`}></div>
              )}
              
              <span className={`relative z-10 text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${tripMatch ? 'text-white' : (isToday ? 'bg-primary text-white' : 'text-gray-700')}`}>
                {d}
              </span>
              
              {tripMatch && (
                <div className="relative z-10 mt-auto text-[10px] font-bold text-white uppercase tracking-wider truncate px-1">
                  {tripMatch.trip.destination}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
