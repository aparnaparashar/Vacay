"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTripData } from "@/context/TripContext";
import { useAuth } from "@/context/AuthContext";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import InviteBuddyModal from "@/components/InviteBuddyModal";
// TripCalendar removed since we use /vacation now

export default function MyTripsDashboard() {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activeTrip, setActiveTrip] = useState<{ id: number; destination: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"Planned" | "Completed" | "Archived">("Planned");
  const router = useRouter();
  const { setTripData } = useTripData();
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    async function fetchTrips() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setTrips(data.data || []);
        } else if (res.status === 401 || res.status === 403) {
          router.push("/");
        }
      } catch (err) {
        console.error("Error fetching trips:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrips();
  }, [token, router]);

  const loadTrip = (trip: any) => {
    if (trip.trip_data) {
      setTripData({ ...trip.trip_data, id: trip.id });
      router.push("/itinerary");
    }
  };

  const openInviteModal = (e: React.MouseEvent, tripId: number, destination: string) => {
    e.stopPropagation();
    setActiveTrip({ id: tripId, destination });
    setInviteModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, tripId: number) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this trip?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setTrips(trips.filter(t => t.id !== tripId));
      }
    } catch (err) {}
  };

  const handleArchive = async (e: React.MouseEvent, tripId: number, is_archived: boolean) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripId}/archive`, {
        method: "PATCH",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ is_archived })
      });
      if (res.ok) {
        setTrips(trips.map(t => t.id === tripId ? { ...t, is_archived } : t));
      }
    } catch (err) {}
  };

  const colors = [
    "from-[#FF8F71] to-[#D5A233]", // Orange to Gold
    "from-[#F66BAF] to-[#7C365C]", // Pink to Dark Purple
    "from-[#4CA1AF] to-[#2C3E50]", // Cyan to Navy
    "from-[#56CCF2] to-[#2F80ED]", // Light Blue to Deep Blue
  ];

  // Dynamic calculations
  const totalTrips = trips.length;
  
  const totalPlaces = trips.reduce((acc, trip) => {
    const days = trip.trip_data?.itinerary?.days || [];
    const activitiesCount = days.reduce((dAcc: number, day: any) => dAcc + (day.activities?.length || 0), 0);
    return acc + activitiesCount;
  }, 0);

  const totalDays = trips.reduce((acc, trip) => {
    const depDate = new Date(trip.departure_date);
    const arrDate = new Date(trip.arrival_date);
    const daysDiff = Math.max(1, Math.ceil((arrDate.getTime() - depDate.getTime()) / (1000 * 3600 * 24)));
    return acc + daysDiff;
  }, 0);

  const estimatedKm = totalPlaces * 24;

  if (!isAuthenticated && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-xl font-bold mb-4">Please log in to view your trips.</p>
        <SignInButton mode="modal" forceRedirectUrl="/trips">
          <button className="px-6 py-2 bg-primary text-white rounded-full">Login</button>
        </SignInButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 text-[#111827] pt-24 px-8 pb-12 max-w-[1400px] mx-auto">
      {/* Main Content Split */}
      <div className="flex gap-10">
        
        {/* Left Side: Hero + Stats + Trips List */}
        <div className="flex-1 flex flex-col gap-8">
          
          {/* AI Orchestration Hero Banner */}
          <div className="relative rounded-[32px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:-translate-y-2 hover:shadow-[0_30px_60px_rgba(0,0,0,0.4)] transition-all duration-500 flex group min-h-[320px]">
            {/* Background Image with Overlay */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: "url('/images/valley_hero.jpg')" }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900/95 via-gray-900/70 to-transparent"></div>
            
            {/* Content */}
            <div className="relative z-10 p-12 flex flex-col justify-center w-full max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-[10px] font-bold tracking-widest uppercase w-max mb-6 shadow-sm">
                <span className="material-symbols-outlined text-[14px] text-yellow-300">psychology</span>
                Powered by Wandr AI
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
                Don't just plan. <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Orchestrate.</span>
              </h2>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-8 max-w-md">
                Hand off the heavy lifting to your personal swarm of AI travel agents. We crunch flights, hotels, and itineraries in seconds.
              </p>
              <Link href="/plan" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-gray-900 rounded-full font-bold shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] transition-all hover:scale-105 active:scale-95 duration-200 w-max group/btn">
                <span className="material-symbols-outlined text-[20px] group-hover/btn:rotate-12 transition-transform duration-300 text-primary">magic_button</span>
                Generate Itinerary
              </Link>
            </div>

            {/* Decorative Glass Cards on the right */}
            <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-5 pointer-events-none" style={{ perspective: "1000px" }}>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-[24px] p-5 w-64 transform rotate-6 translate-x-8 shadow-2xl transition-transform duration-700 group-hover:rotate-12 group-hover:translate-x-4">
                <div className="flex items-center justify-between text-white/90 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><span className="material-symbols-outlined text-sm text-cyan-300">flight_takeoff</span> Flight Search</span>
                  <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full w-3/4 mb-2"></div>
                <div className="h-1.5 bg-white/20 rounded-full w-1/2"></div>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-[24px] p-5 w-64 transform -rotate-3 -translate-x-4 shadow-2xl transition-transform duration-700 group-hover:-rotate-6 group-hover:-translate-x-8">
                <div className="flex items-center justify-between text-white/90 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><span className="material-symbols-outlined text-sm text-amber-300">hotel</span> Hotel Match</span>
                  <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full w-full mb-2"></div>
                <div className="h-1.5 bg-white/20 rounded-full w-2/3"></div>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-[24px] p-5 w-64 transform rotate-2 translate-x-6 shadow-2xl transition-transform duration-700 group-hover:rotate-6 group-hover:translate-x-10">
                <div className="flex items-center justify-between text-white/90 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"><span className="material-symbols-outlined text-sm text-purple-300">map</span> Smart Itinerary</span>
                  <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full w-5/6 mb-2"></div>
                <div className="h-1.5 bg-white/20 rounded-full w-4/6"></div>
              </div>
            </div>
          </div>

          {/* Top Stats Row (Moved here) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#1C1C1E] text-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between h-40">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-bold tracking-tight">{totalTrips}</h2>
                  <span className="text-gray-400 font-medium text-sm">trips planned</span>
                </div>
              </div>
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-red-600 border-2 border-[#1C1C1E] z-10 flex items-center justify-center text-[10px]">📍</div>
                <div className="w-8 h-8 rounded-full bg-white border-2 border-[#1C1C1E] z-0 flex items-center justify-center text-[10px]">🌍</div>
              </div>
            </div>
            
            <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col justify-between h-40 relative overflow-hidden">
              <div>
                <h2 className="text-5xl font-bold tracking-tight text-gray-900">{totalPlaces}</h2>
                <span className="text-gray-500 font-medium text-sm mt-1 block">places mapped</span>
              </div>
              <svg className="absolute bottom-4 right-4 w-16 h-8 text-gray-400" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M0 30 L20 35 L40 20 L60 25 L80 10 L100 5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col justify-between h-40 relative overflow-hidden">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-bold tracking-tight text-gray-900">{totalDays}</h2>
                  <span className="text-gray-500 font-medium text-lg">days</span>
                </div>
                <span className="text-gray-500 font-medium text-sm mt-1 block">across all trips</span>
              </div>
              <svg className="absolute bottom-4 right-4 w-20 h-8 text-gray-400" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M0 35 L30 30 L60 25 L80 15 L100 10" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col justify-between h-40 relative overflow-hidden">
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-bold tracking-tight text-gray-900">{estimatedKm}</h2>
                  <span className="text-gray-500 font-medium text-lg">km</span>
                </div>
                <span className="text-gray-500 font-medium text-[10px] mt-1 block w-2/3 leading-tight">≈ {(estimatedKm / 40075).toFixed(4)}× around equator</span>
              </div>
              <div className="absolute bottom-4 right-6 w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 transform -rotate-45"></div>
            </div>
          </div>

          {/* Header Row */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Trips</h1>
            
            <div className="flex items-center gap-6">
              <div className="flex bg-[#f9f9f9] border border-gray-200 rounded-full p-1 shadow-sm hidden md:flex">
                <button onClick={() => setActiveTab("Planned")} className={`px-5 py-1.5 rounded-full font-semibold text-sm transition-colors ${activeTab === 'Planned' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Planned</button>
                <button onClick={() => setActiveTab("Completed")} className={`px-5 py-1.5 rounded-full font-semibold text-sm transition-colors ${activeTab === 'Completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Completed</button>
                <button onClick={() => setActiveTab("Archived")} className={`px-5 py-1.5 rounded-full font-semibold text-sm transition-colors ${activeTab === 'Archived' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Archived</button>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Link 
                  href="/vacation"
                  title="Vacation Planner"
                  className="material-symbols-outlined transition-colors text-[20px] hover:text-gray-900"
                >
                  calendar_today
                </Link>
                <button 
                  className="material-symbols-outlined transition-colors text-[20px] text-primary"
                >
                  format_list_bulleted
                </button>
              </div>
            </div>
          </div>

          {/* Main View Area (List) */}
          <div className="grid grid-cols-2 gap-6">
              
              {/* Real Trips from DB */}
              {(() => {
                const now = new Date();
                const filteredTrips = trips.filter(trip => {
                  const arrDate = new Date(trip.arrival_date);
                  if (activeTab === "Archived") return trip.is_archived;
                  if (trip.is_archived) return false;
                  if (activeTab === "Planned") return arrDate >= now;
                  if (activeTab === "Completed") return arrDate < now;
                  return true;
                });
                
                if (filteredTrips.length === 0) {
                  return (
                    <div className="col-span-2 py-16 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-[24px]">
                      <span className="material-symbols-outlined text-4xl mb-2">luggage</span>
                      <p>No trips found in this category.</p>
                    </div>
                  );
                }
                
                return filteredTrips.map((trip, idx) => {
                const bgGradient = colors[idx % colors.length];
                const depDate = new Date(trip.departure_date);
                const arrDate = new Date(trip.arrival_date);
                const daysDiff = Math.max(1, Math.ceil((arrDate.getTime() - depDate.getTime()) / (1000 * 3600 * 24)));
                
                // Calculate days until trip
                const daysUntil = Math.ceil((depDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const inDaysText = daysUntil > 0 ? `IN ${daysUntil} DAYS` : daysUntil === 0 ? "TODAY" : "PAST TRIP";
                
                // Calculate actual number of places for this trip
                const tripPlacesCount = trip.trip_data?.itinerary?.days?.reduce((acc: number, day: any) => acc + (day.activities?.length || 0), 0) || 0;

                return (
                  <div 
                    key={trip.id} 
                    onClick={() => loadTrip(trip)}
                    className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group flex flex-col h-72"
                  >
                    <div className={`flex-1 bg-gradient-to-br ${bgGradient} p-5 relative flex items-end`}>
                      <div className="absolute top-4 left-4 bg-white/20 backdrop-blur-md rounded-full px-3 py-1 flex items-center gap-1.5 border border-white/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-300"></div>
                        <span className="text-[10px] font-bold text-white tracking-widest">{inDaysText}</span>
                      </div>
                      {/* Hover Actions & Add Buddy */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          {activeTab === "Archived" ? (
                            <button onClick={(e) => handleArchive(e, trip.id, false)} className="w-10 h-10 bg-white/20 backdrop-blur-md hover:bg-white/40 border border-white/30 rounded-full flex items-center justify-center text-white shadow-sm transition-colors" title="Unarchive Trip">
                              <span className="material-symbols-outlined text-[18px]">unarchive</span>
                            </button>
                          ) : (
                            <button onClick={(e) => handleArchive(e, trip.id, true)} className="w-10 h-10 bg-white/20 backdrop-blur-md hover:bg-white/40 border border-white/30 rounded-full flex items-center justify-center text-white shadow-sm transition-colors" title="Archive Trip">
                              <span className="material-symbols-outlined text-[18px]">archive</span>
                            </button>
                          )}
                          <button onClick={(e) => handleDelete(e, trip.id)} className="w-10 h-10 bg-red-500/20 backdrop-blur-md hover:bg-red-500/40 border border-red-500/30 rounded-full flex items-center justify-center text-white shadow-sm transition-colors" title="Delete Trip">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                        <button 
                          onClick={(e) => openInviteModal(e, trip.id, trip.destination)}
                          className="w-10 h-10 bg-white/20 backdrop-blur-md hover:bg-white/40 border border-white/30 rounded-full flex items-center justify-center transition-colors text-white shadow-sm"
                          title="Invite Buddy"
                        >
                          <span className="material-symbols-outlined text-[20px]">person_add</span>
                        </button>
                      </div>

                      <h3 className="text-3xl font-bold text-white leading-tight tracking-tight shadow-sm z-10 w-3/4">
                        {trip.destination}
                      </h3>
                    </div>
                    
                    <div className="h-32 p-5 flex flex-col justify-between">
                      <div className="flex items-center justify-center gap-4 text-xs font-semibold text-gray-500 border-b border-gray-100 pb-3">
                        <span>{depDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        <span className="material-symbols-outlined text-[14px] text-gray-300">arrow_forward</span>
                        <span>{arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between text-center pt-2">
                        <div>
                          <p className="text-lg font-bold text-gray-900">{daysDiff}</p>
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Days</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-900">{tripPlacesCount}</p>
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Places</p>
                        </div>
                        <div 
                          className="group/buddy cursor-pointer hover:bg-gray-50 rounded-lg -m-2 p-2 transition-colors relative"
                          onClick={(e) => openInviteModal(e, trip.id, trip.destination)}
                          title="Add Buddy"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-lg font-bold text-gray-900 group-hover/buddy:text-primary transition-colors">{trip.adults}</p>
                            <span className="material-symbols-outlined text-[16px] text-gray-400 opacity-0 group-hover/buddy:opacity-100 group-hover/buddy:text-primary transition-all -ml-2 group-hover/buddy:ml-0">add</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase group-hover/buddy:text-primary transition-colors">Buddy</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            </div>
        </div>
      </div>
      
      {/* Floating New Trip Button */}
      <div className="fixed bottom-8 right-32 z-50">
        <Link href="/" className="bg-white/30 backdrop-blur-2xl border border-white/50 text-gray-900 px-6 py-4 rounded-full font-bold shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 hover:bg-white/40 transition-all hover:scale-105 active:scale-95 duration-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
          <span className="material-symbols-outlined text-[18px] text-primary">add</span>
          New Trip
        </Link>
      </div>

      {activeTrip && (
        <InviteBuddyModal 
          tripId={activeTrip.id} 
          destination={activeTrip.destination} 
          isOpen={inviteModalOpen} 
          onClose={() => setInviteModalOpen(false)} 
        />
      )}
    </div>
  );
}
