"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTripData } from "@/context/TripContext";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

type ChatMessage = { role: 'user' | 'assistant', content: string };

export default function Home() {
  const router = useRouter();
  const { setTripData, tripData } = useTripData();
  const { token } = useAuth();
  const [origin, setOrigin] = useState("Delhi");
  const [destination, setDestination] = useState("Mumbai");
  const [departureDate, setDepartureDate] = useState("2026-10-01");
  const [arrivalDate, setArrivalDate] = useState("2026-10-04");
  const [adults, setAdults] = useState("1");
  const [budget, setBudget] = useState("50000");
  
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [flights, setFlights] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);
  const [itinerary, setItinerary] = useState<any>(null);
  const [budgetResult, setBudgetResult] = useState<any>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: "Hey! Where are we going today?"
  }]);
  const [chatInput, setChatInput] = useState("");
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [readyToGenerate, setReadyToGenerate] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (readyToGenerate) {
       handleSearch({ preventDefault: () => {} } as React.FormEvent);
       setReadyToGenerate(false);
    }
  }, [readyToGenerate, origin, destination, departureDate, arrivalDate, adults, budget]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatProcessing) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatProcessing(true);
    setFormError(null);

    try {
      const payload = {
        messages: [...chatMessages, { role: 'user', content: userMessage }]
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/chat/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply_to_user }]);

      if (data.is_complete) {
        if (data.origin) setOrigin(data.origin);
        if (data.destination) setDestination(data.destination);
        if (data.departure_date) setDepartureDate(data.departure_date);
        if (data.arrival_date) setArrivalDate(data.arrival_date);
        if (data.adults) setAdults(data.adults.toString());
        if (data.budget) setBudget(data.budget.toString());
        
        setTimeout(() => {
            setReadyToGenerate(true);
        }, 1500);
      }
    } catch(err) {
      toast.error("Wandr AI is currently unavailable.");
    } finally {
      setIsChatProcessing(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation Rules
    if (!origin.trim() || !destination.trim()) {
      setFormError("Origin and Destination cannot be empty.");
      return;
    }

    const start = new Date(departureDate);
    const end = new Date(arrivalDate);
    
    // Set time to midnight for accurate day comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      setFormError("Departure date cannot be in the past.");
      return;
    }
    
    if (end < start) {
      setFormError("Arrival date must be on or after the departure date.");
      return;
    }

    const numericBudget = parseFloat(budget);
    if (isNaN(numericBudget) || numericBudget <= 0) {
      setFormError("Budget must be a valid positive number.");
      return;
    }

    const numAdults = parseInt(adults);
    if (isNaN(numAdults) || numAdults < 1) {
      setFormError("There must be at least 1 adult traveling.");
      return;
    }

    setLoading(true);
    setLogs([]);
    setWeather(null);
    setFlights([]);
    setHotels([]);
    setItinerary(null);
    setBudgetResult(null);
    setTripData({ origin, destination, departureDate, arrivalDate, adults: numAdults, budget: numericBudget });

    const diffTime = Math.abs(end.getTime() - start.getTime());
    // Adding 1 to include both start and end days
    const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1 || 1;

    const payload = {
      origin,
      destination,
      date: departureDate,
      duration: durationDays,
      adults: parseInt(adults),
      budget: parseFloat(budget)
    };

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/orchestration/stream`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      const finalTripData: any = {
        origin, destination, departureDate: departureDate, duration: durationDays, adults: parseInt(adults), budget: parseFloat(budget)
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "");
            try {
              const data = JSON.parse(dataStr);
              
              if (data.event === "error") {
                setFormError(data.message);
                setLoading(false);
                return;
              }

              setLogs((prev) => [...prev, data.event === "agent_running" ? `Running ${data.agent}...` : data.message || `Completed ${data.agent}`]);
              
              if (data.event === "agent_completed") {
                if (data.agent === "WeatherAgent") {
                  setWeather(data.result.data);
                  setTripData({ weather: data.result.data });
                  finalTripData.weather = data.result.data;
                }
                if (data.agent === "FlightAgent") {
                  setFlights(data.result.data || []);
                  setTripData({ flights: data.result.data || [] });
                  finalTripData.flights = data.result.data || [];
                }
                if (data.agent === "HotelAgent") {
                  setHotels(data.result.data || []);
                  setTripData({ hotels: data.result.data || [] });
                  finalTripData.hotels = data.result.data || [];
                }
                if (data.agent === "PackingAgent") {
                  setTripData({ packing: data.result.data });
                  finalTripData.packing = data.result.data;
                }
                if (data.agent === "ItineraryAgent") {
                  setItinerary(data.result.data);
                  setTripData({ itinerary: data.result.data });
                  finalTripData.itinerary = data.result.data;
                }
                if (data.agent === "BudgetAgent") {
                  setBudgetResult(data.result.data);
                  setTripData({ budgetResult: data.result.data });
                  finalTripData.budgetResult = data.result.data;
                }
              }

              if (data.event === "orchestrator_finished") {
                toast.success("Trip generated and saved to your account!");
              }
            } catch (err) {
              console.error("Failed to parse SSE JSON", err);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setLogs((prev) => [...prev, "Connection error occurred."]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen w-full relative -mt-[104px] pt-[104px]"
      style={{ 
        backgroundImage: 'url(/chat-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Dark overlay to ensure text remains readable over bright wallpapers */}
      <div className="absolute inset-0 bg-black/20 z-0 pointer-events-none"></div>

      <div className={`relative z-10 w-full flex gap-8 pt-12 px-8 pb-12 mx-auto ${(!itinerary && !loading) ? 'items-center justify-center min-h-[calc(100vh-104px)]' : 'flex-col xl:flex-row max-w-[1400px]'}`}>
      {/* Dynamic Content Column */}
      <div className={`flex flex-col gap-8 ${(!itinerary && !loading) ? 'w-full max-w-3xl' : 'flex-1 max-w-4xl'}`}>
        
        {/* Wandr AI Chat Interface */}
        {!itinerary && !loading && (
          <div 
            className="rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.2)] border border-white/30 flex flex-col h-[600px] overflow-hidden relative group transition-all bg-white/10 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="bg-white/60 backdrop-blur-lg p-6 border-b border-white/30 flex items-center gap-4 z-10">
              <div className="w-12 h-12 rounded-full bg-primary/90 backdrop-blur-md flex items-center justify-center text-white shadow-md shrink-0 border border-white/20">
                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-900 drop-shadow-sm">Chat with Wandr AI</h2>
                <p className="text-gray-700 font-medium text-sm drop-shadow-sm">Tell me where you want to go and I'll do the rest.</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-[20px] p-4 text-sm font-medium leading-relaxed shadow-md backdrop-blur-md border ${
                    msg.role === 'user' 
                      ? 'bg-primary/90 text-white rounded-br-[4px] border-primary-container/30' 
                      : 'bg-white/80 text-gray-900 rounded-bl-[4px] border-white/50'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatProcessing && (
                <div className="flex justify-start">
                  <div className="bg-white/80 backdrop-blur-md border border-white/50 text-gray-900 rounded-2xl rounded-bl-[4px] p-4 shadow-md flex gap-1.5 items-center">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleChatSubmit} className="p-4 bg-white/60 backdrop-blur-lg border-t border-white/30 flex gap-3 items-center z-10">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="E.g., Plan a 3-day trip to Bali next week for a couple..."
                className="flex-1 bg-white/70 hover:bg-white/90 focus:bg-white text-gray-900 placeholder:text-gray-500 border border-white/50 rounded-full px-6 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-inner transition-all font-medium"
                disabled={isChatProcessing}
                autoFocus
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isChatProcessing}
                className="w-12 h-12 shrink-0 rounded-full bg-primary/90 backdrop-blur-md border border-white/20 text-white flex items-center justify-center disabled:opacity-50 hover:bg-primary transition-all hover:scale-105 shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-95"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>

            {formError && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[90%] p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-3 animate-fade-in border border-error/20 shadow-lg z-10">
                <span className="material-symbols-outlined text-error">error</span>
                <span className="text-sm font-bold flex-1">{formError}</span>
                <button type="button" onClick={() => setFormError(null)} className="ml-auto material-symbols-outlined hover:opacity-70">close</button>
              </div>
            )}
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <div className="flex flex-col gap-8 animate-fade-in">
            <div className="bg-surface-container-low p-6 rounded-[24px] border border-outline-variant/20">
              <h3 className="font-bold text-sm uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined animate-pulse text-xl">psychology</span>
                Agents Thinking...
              </h3>
              <div className="flex flex-col gap-2 font-mono text-xs text-on-surface-variant">
                {logs.map((log, i) => (
                  <div key={i} className="border-l-2 border-primary-fixed pl-2">{log}</div>
                ))}
              </div>
            </div>

            {/* Flight Skeleton */}
            <div>
               <div className="h-6 w-48 bg-surface-variant rounded animate-pulse mb-4"></div>
               <div className="flex gap-4">
                 {[1,2].map(i => (
                   <div key={i} className="min-w-[280px] bg-white p-5 rounded-[24px] border border-outline-variant/30 h-24 animate-pulse"></div>
                 ))}
               </div>
            </div>

            {/* Hotel Skeleton */}
            <div>
               <div className="h-6 w-48 bg-surface-variant rounded animate-pulse mb-4"></div>
               <div className="flex gap-4">
                 {[1,2].map(i => (
                   <div key={i} className="min-w-[300px] h-64 bg-white rounded-[24px] border border-outline-variant/30 animate-pulse"></div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {/* Results Stream */}
        {!loading && (flights.length > 0 || hotels.length > 0) && (
          <div className="flex flex-col gap-8 animate-slide-up bg-white/30 backdrop-blur-2xl p-8 rounded-[32px] border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
            
            {flights.length > 0 && (
              <div>
                <h3 className="text-xl font-black mb-6 text-gray-900 drop-shadow-sm">Recommended Flights</h3>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {flights.map((f, i) => (
                    <div key={i} className="min-w-[280px] bg-white p-5 rounded-[24px] shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-outline-variant/30 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <span className="bg-secondary-fixed text-on-secondary-fixed px-2 py-1 rounded text-xs font-bold">{f.airline}</span>
                        <span className="font-bold text-primary">{f.price}</span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant text-sm">
                        <span>{f.departure}</span>
                        <div className="flex-1 h-px bg-outline-variant relative"><span className="material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-outline bg-white px-1 text-sm">flight_takeoff</span></div>
                        <span>{f.arrival}</span>
                      </div>
                      <button
                        className="w-full py-2 bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface text-sm font-bold rounded-lg border border-outline-variant/30"
                        onClick={() => router.push("/flights")}
                      >
                        Book Flight
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hotels.length > 0 && (
              <div>
                <h3 className="text-xl font-black mb-6 text-gray-900 drop-shadow-sm">Top Hotel Stays</h3>
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {hotels.map((h, i) => (
                    <div key={i} className="min-w-[300px] max-w-[300px] bg-white rounded-[24px] shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-outline-variant/30 overflow-hidden flex flex-col">
                      <div className="h-40 bg-surface-container relative">
                        {h.thumbnail && <img src={h.thumbnail} alt={h.name} className="w-full h-full object-cover" />}
                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded font-bold text-xs flex items-center gap-1 text-on-surface">
                          <span className="material-symbols-outlined text-amber-500" style={{fontSize: "14px"}}>star</span> {h.rating || "New"}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col flex-1 gap-2">
                        <h4 className="font-bold text-on-surface truncate">{h.name}</h4>
                        <p className="text-primary font-bold">{h.price} <span className="text-xs text-on-surface-variant font-normal">/ night</span></p>
                        <div className="flex gap-1 mt-1 mb-2">
                          {h.amenities?.slice(0,2).map((am: string, idx: number) => (
                            <span key={idx} className="text-[10px] bg-surface-container px-2 py-1 rounded text-on-surface-variant truncate">{am}</span>
                          ))}
                        </div>
                        <button
                          className="mt-auto w-full py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors"
                          onClick={() => router.push("/hotels")}
                        >
                          Select Hotel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Itinerary Timeline */}
        {!loading && itinerary && (
          <div className="animate-slide-up mt-4 bg-white/30 backdrop-blur-2xl p-8 rounded-[32px] border border-white/30 shadow-[0_8px_32px_rgba(0,0,0,0.15)]">
            <h3 className="text-2xl font-black mb-8 text-gray-900 drop-shadow-sm border-b border-gray-900/10 pb-4">Daily Itinerary</h3>
            {itinerary.days?.map((day: any, i: number) => (
              <div key={i} className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <span className="bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider">Day {day.day}</span>
                </div>
                
                <div className="relative timeline-line">
                  {day.activities?.map((act: any, j: number) => (
                    <div key={j} className="mb-8 pl-10 relative group">
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center z-10 border-4 border-background">
                        <div className="w-2 h-2 rounded-full bg-on-primary"></div>
                      </div>
                      
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/30 hover:shadow-md transition-shadow relative">
                        {act.travel_info && (
                          <div className="absolute -top-4 right-6 flex items-center gap-1 text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded shadow-sm border border-outline-variant/20 z-20">
                            <span className="material-symbols-outlined text-xs">directions_car</span>
                            {act.travel_info.duration} ({act.travel_info.distance})
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <p className="text-primary font-bold text-xs mb-1">{act.time}</p>
                          <span className="px-2 py-1 bg-surface-container rounded text-[10px] font-bold text-on-surface-variant">{act.type}</span>
                        </div>
                        <h4 className="font-bold text-lg text-on-surface mb-2">{act.title}</h4>
                        
                        {act.place_details && (
                          <div className="mt-4 bg-surface-container-low p-3 rounded-lg flex items-start gap-3 border border-outline-variant/20">
                            {act.place_details.photo_url ? (
                              <img src={act.place_details.photo_url} alt="place" className="w-16 h-16 rounded object-cover flex-shrink-0" />
                            ) : (
                              <span className="material-symbols-outlined text-primary mt-1">location_on</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-on-surface truncate">{act.place_details.name}</p>
                              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed truncate">{act.place_details.address}</p>
                              {act.place_details.rating && <p className="text-xs font-bold text-amber-600 mt-1 flex items-center gap-1"><span className="material-symbols-outlined" style={{fontSize:"14px"}}>star</span> {act.place_details.rating}</p>}
                            </div>
                          </div>
                        )}

                        {act.alternatives && act.alternatives.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-outline-variant/20">
                            <h5 className="text-[10px] font-bold text-on-surface-variant mb-2 uppercase tracking-widest flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">restaurant</span> Alternative Nearby Options
                            </h5>
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                              {act.alternatives.map((alt: any, idx: number) => (
                                <div key={idx} className="flex-shrink-0 w-28 bg-surface-container-lowest rounded-md border border-outline-variant/30 overflow-hidden flex flex-col">
                                  {alt.photo_url ? (
                                    <img src={alt.photo_url} alt={alt.name} className="w-full h-14 object-cover" />
                                  ) : (
                                    <div className="w-full h-14 bg-surface-container flex items-center justify-center">
                                      <span className="material-symbols-outlined text-outline text-lg">restaurant</span>
                                    </div>
                                  )}
                                  <div className="p-1.5 flex flex-col justify-center flex-1">
                                    <p className="text-[9px] font-bold text-on-surface line-clamp-2 leading-tight" title={alt.name}>{alt.name}</p>
                                    {alt.rating && <p className="text-[8px] font-bold text-amber-600 flex items-center mt-0.5"><span className="material-symbols-outlined" style={{fontSize:"10px"}}>star</span> {alt.rating}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Right Sidebar */}
      <aside className="w-80 flex flex-col gap-6 sticky top-24 h-[calc(100vh-120px)]">
        
        {/* Weather Card */}
        {weather && (
          <div className="bg-primary-container text-on-primary-container p-6 rounded-[24px] shadow-sm animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold opacity-80 uppercase tracking-widest">{destination} Weather</span>
              <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="weather icon" className="w-8 h-8 filter brightness-0 invert" />
            </div>
            <div className="flex items-end gap-2">
              <h4 className="text-4xl font-bold leading-none">{weather.temp}°C</h4>
              <span className="text-sm opacity-80 pb-1">{weather.condition}</span>
            </div>
            <p className="mt-4 text-sm opacity-90">{weather.description}</p>
          </div>
        )}

        {/* Budget Card */}
        {budgetResult && (
          <div className={`p-6 rounded-[24px] shadow-sm border animate-fade-in ${budgetResult.feasible ? "bg-primary-container/20 border-primary-container text-on-surface" : "bg-error-container border-error text-on-error-container"}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined">{budgetResult.feasible ? "check_circle" : "warning"}</span>
              <h4 className="font-bold uppercase tracking-wider text-xs">Budget Check</h4>
            </div>
            <p className="text-sm leading-relaxed font-semibold">{budgetResult.suggestion}</p>
          </div>
        )}

      </aside>
      </div>
    </div>
  );
}
