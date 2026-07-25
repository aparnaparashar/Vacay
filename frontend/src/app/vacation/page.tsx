"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import VacayCalendar from "@/components/VacayCalendar";
import Link from "next/link";
import { TopNav as Navigation } from "@/components/Navigation";

export default function VacayPage() {
  const { token, isAuthenticated } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [tripDates, setTripDates] = useState<Record<string, { gradient: string, destination: string }>>({});
  const [userTrips, setUserTrips] = useState<any[]>([]);
  
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    async function fetchData() {
      try {
        const planRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/vacay/plan`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!planRes.ok) throw new Error("Failed to load plan");
        const planData = await planRes.json();
        setPlan(planData.plan);
        setUsers(planData.users);
        
        // Find current user id from JWT or users list
        const currentUser = planData.users[0]; // Simplification: owner is usually first
        setSelectedUserId(currentUser?.id);

        const entRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/vacay/entries?year=${selectedYear}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const entData = await entRes.json();
        setEntries(entData.entries);

        // Fetch user's generated trips to highlight them on the calendar
        const tripsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (tripsRes.ok) {
          const tripsData = await tripsRes.json();
          const trips = tripsData.data || [];
          setUserTrips(trips);
          const colors = [
            "bg-gradient-to-br from-[#FF8F71] to-[#D5A233]",
            "bg-gradient-to-br from-[#F66BAF] to-[#7C365C]",
            "bg-gradient-to-br from-[#4CA1AF] to-[#2C3E50]",
            "bg-gradient-to-br from-[#56CCF2] to-[#2F80ED]",
          ];
          
          const tDates: Record<string, { gradient: string, destination: string }> = {};
          trips.forEach((trip: any, idx: number) => {
            const bgGradient = colors[idx % colors.length];
            if (trip.departure_date && trip.arrival_date) {
              const start = new Date(trip.departure_date + 'T00:00:00');
              const end = new Date(trip.arrival_date + 'T00:00:00');
              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                if (d.getFullYear() === selectedYear) {
                  const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  tDates[dStr] = { gradient: bgGradient, destination: trip.destination };
                }
              }
            }
          });
          setTripDates(tDates);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token, isAuthenticated, selectedYear]);

  const toggleEntry = async (dateStr: string) => {
    // Optimistic UI update
    const exists = entries.find(e => e.date === dateStr && e.user_id === selectedUserId);
    if (exists) setEntries(prev => prev.filter(e => !(e.date === dateStr && e.user_id === selectedUserId)));
    else setEntries(prev => [...prev, { date: dateStr, user_id: selectedUserId }]);

    await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/vacay/entries/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ date: dateStr, user_id: selectedUserId })
    });
  };

  if (!isAuthenticated && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl font-bold mb-4">Please log in to manage your team's vacation days.</p>
        <SignInButton mode="modal" forceRedirectUrl="/vacation">
          <button className="px-6 py-2 bg-primary text-white rounded-full">Login</button>
        </SignInButton>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-24 px-8 pb-12 max-w-[1600px] mx-auto">
      <Navigation />
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vacation Planner</h1>
          <p className="text-gray-500">Plan and manage vacation days for your travel group</p>
        </div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-medium text-gray-700 shadow-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">settings</span>
            Settings
          </button>
        </div>
      </div>

      <div className="flex gap-8 items-start">
        {/* Left Sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          
          {/* Year Selector */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-between">
             <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 w-full text-left">Year</div>
             <div className="flex items-center justify-between w-full">
               <button onClick={() => setSelectedYear(y => y-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                 <span className="material-symbols-outlined">chevron_left</span>
               </button>
               <span className="text-3xl font-bold text-gray-900">{selectedYear}</span>
               <button onClick={() => setSelectedYear(y => y+1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                 <span className="material-symbols-outlined">chevron_right</span>
               </button>
             </div>
          </div>

          {/* Persons List */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
             <div className="flex justify-between items-center mb-4">
               <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Persons</div>
               <button className="text-primary"><span className="material-symbols-outlined text-[18px]">person_add</span></button>
             </div>
             <div className="flex flex-col gap-2">
               {users.map(u => (
                 <div 
                  key={u.id} 
                  onClick={() => setSelectedUserId(u.id)}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${selectedUserId === u.id ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                 >
                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: u.color }}></div>
                   <span className="font-medium text-sm text-gray-700">{u.name} {selectedUserId === u.id && '(you)'}</span>
                 </div>
               ))}
             </div>
          </div>

          {/* Legend */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
             <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Legend</div>
             <div className="flex flex-col gap-3">
               <div className="flex items-center gap-2"><div className="w-4 h-3 rounded bg-red-200"></div><span className="text-xs text-gray-500">Public Holiday</span></div>
               <div className="flex items-center gap-2"><div className="w-4 h-3 rounded bg-gray-100"></div><span className="text-xs text-gray-500">Weekend</span></div>
             </div>
          </div>
          
          {/* Your Trips */}
          {userTrips.length > 0 && (
            <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
               <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Your Trips</div>
               <div className="flex flex-col gap-3">
                 {userTrips.map((trip, idx) => {
                   const colors = [
                     "bg-gradient-to-br from-[#FF8F71] to-[#D5A233]",
                     "bg-gradient-to-br from-[#F66BAF] to-[#7C365C]",
                     "bg-gradient-to-br from-[#4CA1AF] to-[#2C3E50]",
                     "bg-gradient-to-br from-[#56CCF2] to-[#2F80ED]",
                   ];
                   return (
                     <div key={trip.id} className="flex items-center gap-2">
                       <div className={`w-4 h-3 rounded ${colors[idx % colors.length]}`}></div>
                       <span className="text-xs text-gray-500 font-medium">
                         {trip.destination} ({new Date(trip.departure_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})})
                       </span>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}
          
        </div>

        {/* Main Grid */}
        <div className="flex-1 min-w-0">
          <VacayCalendar 
            year={selectedYear} 
            entries={entries} 
            tripDates={tripDates}
            users={users}
            onToggleEntry={toggleEntry}
          />
        </div>

      </div>
    </div>
  );
}
