"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessageText } from "@/components/ChatMessage";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi there! I'm Wandr, your travel chatbot. Ask me anything about destinations, weather, restaurants, or your trip plans."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/chat/public/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversation_history: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Chat service unavailable.");
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      console.error(err);
      setError("The chat service is unavailable. Please try again in a moment.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't complete that request right now. Please try again later."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-900 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 rounded-4xl border border-slate-200 bg-white/90 p-8 shadow-lg shadow-slate-200/40 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight">Wandr Chatbot</h1>
              <p className="mt-3 max-w-2xl text-gray-600">Ask travel questions naturally and get personalized, context-aware recommendations powered by Wandr's AI assistant.</p>
            </div>
            <div className="rounded-3xl bg-slate-900/95 px-5 py-4 text-white shadow-md shadow-slate-900/20">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Try prompts like</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>What should I do in Kyoto if it rains?</li>
                <li>Find affordable restaurants near me.</li>
                <li>I have 5 hours before my train — what now?</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Live Travel Chat</h2>
                <p className="text-sm text-slate-500">Your conversational travel assistant is ready to help.</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-primary text-sm font-semibold">Chat Only</span>
            </div>

            <div className="mb-6 max-h-180 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-inner" style={{ minHeight: '520px' }}>
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-primary text-white rounded-br-lg' : 'bg-white text-slate-900 rounded-bl-lg border border-slate-200'}`}>
                      <ChatMessageText text={message.content} role={message.role} />
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center rounded-3xl bg-white px-5 py-4 text-sm text-slate-900 shadow-sm border border-slate-200 gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-primary/80 animate-pulse delay-150"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-primary/60 animate-pulse delay-300"></span>
                      Wandr is thinking...
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-3xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="chat-input" className="sr-only">Type a message</label>
              <input
                id="chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask me anything about your trip..."
                className="min-h-14 flex-1 rounded-full border border-slate-200 bg-white px-5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="inline-flex h-14 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Sending…' : 'Send'}
              </button>
            </form>
          </section>

          <aside className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
            <h3 className="text-xl font-bold">Why Wandr Chat?</h3>
            <div className="mt-4 space-y-4 text-sm text-slate-600">
              <p>Wandr's chatbot is designed to answer travel questions with context-aware suggestions, weather-aware plans, and personalized recommendations.</p>
              <p>Use it to find restaurants, discover nearby attractions, or ask for a budget-friendly itinerary suggestion.</p>
              <div className="rounded-3xl bg-slate-50 p-4 border border-slate-200">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold">Chatbot uses</p>
                <ul className="mt-3 list-disc space-y-2 pl-4 text-slate-700">
                  <li>Destination guidance</li>
                  <li>Weather-aware recommendations</li>
                  <li>Restaurant and local tips</li>
                  <li>Trip planning questions</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
