import React from "react";
import VacayMonthCard from "./VacayMonthCard";

interface VacayCalendarProps {
  year: number;
  entries: any[];
  tripDates?: Record<string, { gradient: string, destination: string }>;
  users: any[];
  onToggleEntry: (dateStr: string) => void;
}

export default function VacayCalendar({ year, entries, tripDates = {}, users, onToggleEntry }: VacayCalendarProps) {
  
  // Pre-process entries into a map for fast lookup O(1) inside cells
  const entryMap: Record<string, any[]> = {};
  entries.forEach(e => {
    if (!entryMap[e.date]) entryMap[e.date] = [];
    entryMap[e.date].push(e);
  });
  
  // Render 12 months
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pb-20">
      {Array.from({ length: 12 }, (_, i) => (
        <VacayMonthCard 
          key={`${year}-${i}`} 
          year={year} 
          month={i}
          entryMap={entryMap}
          tripDates={tripDates}
          users={users}
          onToggleEntry={onToggleEntry}
        />
      ))}
    </div>
  );
}
