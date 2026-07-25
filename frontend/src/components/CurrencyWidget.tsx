"use client";
import { useState, useEffect } from "react";

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

function guessUserCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Europe/London")) return "GBP";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return "INR";
    if (tz.startsWith("Asia/Tokyo")) return "JPY";
    if (tz.startsWith("Australia/")) return "AUD";
    if (tz.startsWith("America/Toronto") || tz.startsWith("America/Vancouver") || tz.startsWith("America/Montreal")) return "CAD";
    if (tz.startsWith("Europe/Zurich")) return "CHF";
    if (tz.startsWith("Asia/Shanghai") || tz.startsWith("Asia/Chongqing")) return "CNY";
    if (tz.startsWith("Asia/Bangkok")) return "THB";
    if (tz.startsWith("Asia/Singapore")) return "SGD";
    if (tz.startsWith("Europe/")) return "EUR";
    if (tz.startsWith("America/")) return "USD";
  } catch (e) {}
  
  try {
    const locale = navigator.language || "";
    if (locale.includes("-GB")) return "GBP";
    if (locale.includes("-IN")) return "INR";
    if (locale.includes("-JP")) return "JPY";
    if (locale.includes("-AU")) return "AUD";
    if (locale.includes("-CA")) return "CAD";
    if (locale.includes("-CH")) return "CHF";
    if (locale.includes("-CN")) return "CNY";
    if (locale.includes("-TH")) return "THB";
    if (locale.includes("-SG")) return "SGD";
    if (locale.match(/-(DE|FR|IT|ES|NL|BE|AT|GR|PT|FI|IE)$/)) return "EUR";
  } catch (e) {}
  
  return "USD";
}

export default function CurrencyWidget() {
  const [amount, setAmount] = useState<number>(100);
  const [fromCurrency, setFromCurrency] = useState<string>("USD");
  const [toCurrency, setToCurrency] = useState<string>("EUR");
  const [result, setResult] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const currencies = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF", "CNY", "THB", "SGD"];

  useEffect(() => {
    const savedFrom = localStorage.getItem("currency_widget_from");
    const savedTo = localStorage.getItem("currency_widget_to");
    
    let initialFrom = "USD";
    if (savedFrom && currencies.includes(savedFrom)) {
      initialFrom = savedFrom;
      setFromCurrency(savedFrom);
    } else {
      const guessed = guessUserCurrency();
      if (currencies.includes(guessed)) {
        initialFrom = guessed;
        setFromCurrency(guessed);
      }
    }
    
    if (savedTo && currencies.includes(savedTo)) {
      setToCurrency(savedTo);
    } else {
      if (initialFrom === "EUR") setToCurrency("USD");
      else setToCurrency("EUR");
    }

    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    
    localStorage.setItem("currency_widget_from", fromCurrency);
    localStorage.setItem("currency_widget_to", toCurrency);

    const fetchConversion = async () => {
      if (fromCurrency === toCurrency) {
        setResult(amount);
        setRate(1);
        return;
      }
      
      const cacheKey = `exchange_rate_${fromCurrency}_${toCurrency}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          if (Date.now() - parsedCache.timestamp < CACHE_DURATION_MS) {
            setRate(parsedCache.rate);
            setResult(amount * parsedCache.rate);
            return;
          }
        } catch (e) {
          // ignore cache error and fetch
        }
      }

      setLoading(true);
      try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${fromCurrency}&symbols=${toCurrency}`);
        const data = await res.json();
        if (data.rates && data.rates[toCurrency]) {
          const newRate = data.rates[toCurrency];
          setResult(amount * newRate);
          setRate(newRate);
          
          localStorage.setItem(cacheKey, JSON.stringify({
            rate: newRate,
            timestamp: Date.now()
          }));
        }
      } catch (e) {
        console.error("Currency fetch failed", e);
      } finally {
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(() => {
      fetchConversion();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [amount, fromCurrency, toCurrency, isInitialized]);

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 border border-gray-100">
      <div className="flex justify-between items-center mb-6 text-gray-500 text-xs font-bold tracking-widest">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">currency_exchange</span>
          CURRENCY
        </div>
        <span className="material-symbols-outlined text-[16px] cursor-pointer hover:text-gray-900" onClick={() => setAmount(100)}>sync</span>
      </div>

      <div className="flex items-center gap-3 relative">
        <div className="flex-1 bg-[#F9F9F9] rounded-[24px] p-4 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1">FROM</p>
          <input 
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="text-3xl font-bold text-gray-900 mb-2 w-full bg-transparent outline-none"
          />
          <div className="flex items-center justify-between text-sm font-semibold text-gray-900 border border-gray-200 bg-white rounded-lg px-2 py-1">
            <select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} className="bg-transparent outline-none w-full appearance-none">
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="material-symbols-outlined text-[16px] text-gray-400 pointer-events-none">expand_more</span>
          </div>
        </div>
        
        <div onClick={swapCurrencies} className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#1C1C1E] rounded-full flex items-center justify-center text-white shadow-md z-10 border-2 border-white cursor-pointer hover:scale-110 transition-transform">
          <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
        </div>

        <div className="flex-1 bg-[#F9F9F9] rounded-[24px] p-4 border border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-1">TO</p>
          <p className="text-3xl font-bold text-gray-900 mb-2 overflow-hidden text-ellipsis">
            {loading ? "..." : (result ? result.toFixed(2) : "0.00")}
          </p>
          <div className="flex items-center justify-between text-sm font-semibold text-gray-900 border border-gray-200 bg-white rounded-lg px-2 py-1">
            <select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} className="bg-transparent outline-none w-full appearance-none">
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="material-symbols-outlined text-[16px] text-gray-400 pointer-events-none">expand_more</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] font-medium text-gray-500 mt-4 text-center">
        {rate ? `1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}` : "Live Exchange Rates"}
      </p>
    </div>
  );
}
