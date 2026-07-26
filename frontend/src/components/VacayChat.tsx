"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTripData } from "@/context/TripContext";
import { useAuth } from "@/context/AuthContext";
import { SignInButton } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const CONVERSATION_STORAGE_KEY = "Vacay_chat_conversation_id";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  sources?: string[];
  /** Set on the newest assistant reply so it types in rather than popping. */
  animate?: boolean;
}

interface VacayChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const GREETING =
  "Hi — I'm Vacay. Ask me what to do today, where to eat, how to get somewhere, or how to spend a budget. If you have a trip loaded I already know the details.";

const SUGGESTIONS = [
  "What should I do today?",
  "Find good places to eat nearby",
  "I only have $40 today. Plan my day.",
  "What's the weather like?",
];

/** Human labels for the `sources` the backend reports. */
const SOURCE_LABELS: Record<string, string> = {
  weather_api: "Weather",
  places_api: "Places",
  maps_api: "Maps",
  budget_planner: "Budget",
};

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Reveals text progressively — the "typing" feel without a streaming API. */
function TypedText({ text, onTick }: { text: string; onTick: () => void }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    let i = 0;
    // Reveal in small chunks so long answers don't take forever.
    const step = Math.max(1, Math.round(text.length / 220));
    const timer = setInterval(() => {
      i += step;
      setShown(text.slice(0, i));
      onTick();
      if (i >= text.length) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [text, onTick]);

  return <>{shown}</>;
}

export default function VacayChat({ isOpen, onClose }: VacayChatProps) {
  const { tripData } = useTripData();
  const { token, isAuthenticated } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyLoadedFor = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // ── Restore the conversation id across refreshes ──────────────────
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (saved) setConversationId(saved);
    } catch {
      /* localStorage unavailable (private mode) — chat still works, just not persisted */
    }
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    try {
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  // ── Replay stored history the first time the panel opens ──────────
  useEffect(() => {
    if (!isOpen || !token || !conversationId) return;
    if (historyLoadedFor.current === conversationId) return;
    historyLoadedFor.current = conversationId;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/chat/conversations/${encodeURIComponent(conversationId)}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        const restored: ChatMessage[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          intent: m.intent ?? undefined,
          sources: m.sources ?? [],
        }));
        if (restored.length) setMessages(restored);
      } catch {
        /* a failed replay is not worth an error banner — start fresh */
      }
    })();
    return () => controller.abort();
  }, [isOpen, token, conversationId]);

  // ── Focus + scroll on open ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [isOpen, messages, isSending, scrollToBottom]);

  // ── Escape to close ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // ── Best-effort geolocation for "near me" questions ───────────────
  useEffect(() => {
    if (!isOpen || location || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      // Denied or unavailable is fine — the assistant falls back to the trip
      // destination, so we never block or nag.
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, [isOpen, location]);

  // ── Send ──────────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || isSending || !token) return;

      setError(null);
      setInput("");
      setMessages((prev) => [...prev, { id: newId(), role: "user", content }]);
      setIsSending(true);

      // The whole trip is sent so Vacay never has to ask about it.
      const tripContext = tripData?.destination
        ? {
            trip_id: tripData.id ?? null,
            origin: tripData.origin || null,
            destination: tripData.destination || null,
            departure_date: tripData.departureDate || null,
            arrival_date: tripData.arrivalDate || null,
            adults: tripData.adults ?? null,
            budget: tripData.budget ?? null,
            weather: tripData.weather ?? null,
            flights: tripData.flights ?? null,
            hotels: tripData.hotels ?? null,
            itinerary: tripData.itinerary ?? null,
            packing: tripData.packing ?? null,
            budget_result: tripData.budgetResult ?? null,
            expenses: tripData.expenses ?? null,
            participants: tripData.participants ?? null,
          }
        : null;

      try {
        const res = await fetch(`${API_BASE}/api/chat/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content,
            conversation_id: conversationId,
            trip_context: tripContext,
            current_location: location,
          }),
        });

        if (!res.ok) {
          let detail = "Vacay couldn't answer that just now. Please try again.";
          try {
            const body = await res.json();
            if (body?.detail) detail = body.detail;
          } catch {
            /* non-JSON error body */
          }
          setError(detail);
          return;
        }

        const data = await res.json();
        if (data.conversation_id) setConversationId(data.conversation_id);
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: data.message || "",
            intent: data.intent,
            sources: data.sources || [],
            animate: true,
          },
        ]);
      } catch {
        setError("Couldn't reach Vacay. Check your connection and try again.");
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending, location, token, tripData],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    historyLoadedFor.current = null;
    try {
      window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const tripLabel = tripData?.destination || null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`Vacay-chat-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={`Vacay-chat-panel ${isOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Vacay Chat"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E67E22] text-white">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">Vacay Chat</p>
            <p className="truncate text-[11px] font-medium text-gray-500">
              {tripLabel ? `Trip to ${tripLabel}` : "Your travel companion"}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startNewChat}
              title="Start a new chat"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <span className="material-symbols-outlined text-[18px]">edit_square</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        {/* Body */}
        {!isAuthenticated ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF3E6]">
              <span className="material-symbols-outlined text-[30px] text-[#E67E22]">lock</span>
            </span>
            <div>
              <p className="text-base font-bold text-gray-900">Sign in to chat</p>
              <p className="mt-1 text-sm text-gray-500">
                Vacay keeps your conversation and preferences with your account.
              </p>
            </div>
            <SignInButton mode="modal">
              <button className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black">
                Sign in
              </button>
            </SignInButton>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto bg-[#FAFAFA] px-5 py-5">
              {messages.length === 0 && (
                <>
                  <ChatBubble role="assistant" content={GREETING} />
                  <div className="space-y-2 pt-1">
                    <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Try asking
                    </p>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="block w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left text-[13px] font-medium text-gray-700 transition-colors hover:border-[#E67E22]/50 hover:bg-[#FFF8F0]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  sources={m.sources}
                  animate={m.animate}
                  onTick={scrollToBottom}
                />
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                  <span className="material-symbols-outlined text-[16px] text-red-500">
                    error
                  </span>
                  <p className="flex-1 text-[12px] font-medium leading-snug text-red-700">
                    {error}
                  </p>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 border-t border-gray-200 bg-white px-4 py-3"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Vacay anything..."
                disabled={isSending}
                className="flex-1 rounded-full border border-gray-200 bg-[#F5F5F5] px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#E67E22] focus:bg-white disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E67E22] text-white transition-all hover:bg-[#d6711c] active:scale-95 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </form>
          </>
        )}
      </aside>
    </>
  );
}

// -----------------------------------------------------------------------------

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#E67E22]/70"
      style={{ animationDelay: delay }}
    />
  );
}

function ChatBubble({
  role,
  content,
  sources,
  animate,
  onTick,
}: {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  animate?: boolean;
  onTick?: () => void;
}) {
  const isUser = role === "user";
  const labels = (sources || [])
    .map((s) => SOURCE_LABELS[s] || s)
    .filter(Boolean);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm ${
          isUser
            ? "rounded-tr-sm bg-[#E67E22] text-white"
            : "rounded-tl-sm border border-gray-200 bg-white text-gray-800"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {animate && !isUser && onTick ? (
            <TypedText text={content} onTick={onTick} />
          ) : (
            content
          )}
        </div>

        {!isUser && labels.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
            {labels.map((l) => (
              <span
                key={l}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500"
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
