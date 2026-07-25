import { useEffect, useState } from "react";
import { 
  Sun, Cloud, CloudRain, CloudDrizzle, CloudLightning, CloudSnow, Wind, Droplets, Sunrise, Sunset, X, ChevronDown, ChevronUp, MapPin
} from "lucide-react";

const WEATHER_ICON_MAP: Record<string, any> = {
  Clear: Sun,
  Clouds: Cloud,
  Rain: CloudRain,
  Drizzle: CloudDrizzle,
  Thunderstorm: CloudLightning,
  Snow: CloudSnow,
  Mist: Wind,
  Fog: Wind,
  Haze: Wind,
};

export default function WeatherWidget({ 
  dayIndex, 
  dateStr, 
  lat, 
  lng, 
  onClose,
  hotelName
}: { 
  dayIndex: number; 
  dateStr: string; 
  lat: number; 
  lng: number; 
  onClose: () => void;
  hotelName?: string;
}) {
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/weather/?lat=${lat}&lon=${lng}`);
        const data = await res.json();
        
        // Find the closest matching day (mocking it for the prototype if dates don't align exactly)
        // Since we are fetching a 7-day forecast, we can just grab the day matching our index
        // Or if index is out of bounds, grab the first day
        const targetDay = data.days[dayIndex] || data.days[0];
        setWeatherData(targetDay);
      } catch (e) {
        console.error("Failed to fetch weather", e);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [lat, lng, dayIndex]);

  if (loading) {
    return (
      <div className="w-[90%] max-w-[800px] bg-white rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] p-8 flex justify-center items-center h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E67E22]"></div>
      </div>
    );
  }

  if (!weatherData) return null;

  const MainIcon = WEATHER_ICON_MAP[weatherData.condition] || Cloud;

  return (
    <div className="w-[95%] max-w-[700px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-gray-200 flex flex-col items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px] text-gray-700">calendar_today</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">Day {dayIndex + 1}</h2>
              <span className="material-symbols-outlined text-[16px] text-gray-400 cursor-pointer">edit</span>
            </div>
            <p className="text-sm text-gray-500 font-medium">{dateStr}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-gray-400">
          <button className="p-2 hover:bg-gray-50 rounded-lg transition-colors"><ChevronDown size={20} /></button>
          <button className="p-2 hover:bg-gray-50 rounded-lg transition-colors" onClick={onClose}><X size={20} /></button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        
        {/* Weather Main */}
        <div className="flex items-center gap-4 mb-5">
          <MainIcon size={32} className="text-gray-700" strokeWidth={1.5} />
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-gray-900">{weatherData.temp_max}°C</span>
            <span className="text-sm font-semibold text-gray-400">
              {weatherData.temp_min}° / {weatherData.temp_max}° <span className="text-gray-600">{weatherData.condition}</span>
            </span>
          </div>
        </div>

        {/* Weather Details row */}
        <div className="flex items-center gap-6 text-sm font-semibold text-gray-500 mb-6">
          <div className="flex items-center gap-1.5">
            <Droplets size={16} strokeWidth={2.5} className="text-gray-400" />
            {weatherData.hourly && weatherData.hourly[0] ? weatherData.hourly[0].precip_prob : 0}%
          </div>
          <div className="flex items-center gap-1.5">
            <Wind size={16} strokeWidth={2.5} className="text-gray-400" />
            {weatherData.wind_speed} km/h
          </div>
          <div className="flex items-center gap-1.5">
            <Sunrise size={16} strokeWidth={2.5} className="text-gray-400" />
            {weatherData.sunrise || "06:00"}
          </div>
          <div className="flex items-center gap-1.5">
            <Sunset size={16} strokeWidth={2.5} className="text-gray-400" />
            {weatherData.sunset || "18:00"}
          </div>
        </div>

        {/* Hourly Timeline */}
        <div className="flex justify-between items-center px-2 mb-6 overflow-x-auto gap-4">
          {weatherData.hourly?.filter((_: any, i: number) => i % 2 === 0).slice(0, 12).map((hour: any, i: number) => {
            const HourIcon = WEATHER_ICON_MAP[hour.condition] || Cloud;
            return (
              <div key={i} className="flex flex-col items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-gray-400">{hour.time.split(":")[0]}</span>
                <HourIcon size={20} className="text-gray-700" strokeWidth={1.5} />
                <span className="text-sm font-bold text-gray-900">{hour.temp}°</span>
              </div>
            )
          })}
        </div>

        {/* Accommodation Section */}
        <div className="pt-5 border-t border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">ACCOMMODATION</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 mb-3">
            <span className="material-symbols-outlined text-[14px]">login</span>
            CHECK-IN & CHECK-OUT
          </div>
          
          <div className="flex bg-[#F8F9FA] rounded-xl border border-gray-100 p-4">
            <div className="w-10 flex items-center justify-center border-r border-gray-200 shrink-0 pr-4">
               <span className="material-symbols-outlined text-gray-400">business</span>
            </div>
            <div className="flex-1 flex justify-between items-center px-6 border-r border-gray-200">
              <div className="text-center">
                <div className="text-sm font-bold text-gray-900 mb-1">00:00</div>
                <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">login</span> Check-in
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-gray-900 mb-1">00:00</div>
                <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">logout</span> Check-out
                </div>
              </div>
            </div>
            <div className="px-6 flex flex-col justify-center text-center">
              <div className="text-sm font-bold text-gray-900 mb-1">TEST-12345</div>
              <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-center gap-1">
                 # Confirmation
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
