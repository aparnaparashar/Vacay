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
      content: "Hi there! I'm Vacay, your travel chatbot. Ask me anything about destinations, weather, restaurants, or your trip plans."
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
    <div className="min-h-screen bg-transparent text-gray-900 pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 rounded-[32px] bg-white border border-gray-100 p-8 shadow-2xl shadow-gray-200/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-tight drop-shadow-sm">Chat with Vacay AI</h1>
              <p className="mt-3 max-w-2xl text-gray-500 font-medium text-sm">Ask travel questions naturally and get personalized, context-aware recommendations powered by Vacay's AI assistant.</p>
            </div>
            <div className="rounded-[24px] bg-[#E67E22] px-5 py-4 text-white shadow-lg">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Try prompts like</p>
              <ul className="mt-2 space-y-1.5 text-xs font-semibold text-white/95">
                <li>• What should I do in Kyoto if it rains?</li>
                <li>• Find affordable restaurants near me.</li>
                <li>• I have 5 hours before my train — what now?</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[32px] bg-white border border-gray-100 shadow-2xl shadow-gray-200/50 p-6 flex flex-col h-[600px] overflow-hidden relative group transition-all">
            <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E67E22] flex items-center justify-center text-white shadow-md shrink-0">
                  <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 drop-shadow-sm leading-tight">Live Travel Chat</h2>
                  <p className="text-[11px] font-medium text-gray-500">Your conversational travel assistant is ready to help.</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pb-4 bg-transparent scrollbar-hide">
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-[20px] p-4 text-sm font-medium leading-relaxed shadow-sm border ${
                      message.role === 'user' 
                        ? 'bg-[#E67E22] text-white rounded-br-[4px] border-[#d6711c]' 
                        : 'bg-[#F9F9F9] text-gray-900 rounded-bl-[4px] border-gray-100'
                    }`}>
                      <ChatMessageText text={message.content} role={message.role} />
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#F9F9F9] border border-gray-100 text-gray-900 rounded-2xl rounded-bl-[4px] p-4 shadow-sm flex gap-1.5 items-center">
                      <span className="w-2 h-2 bg-[#E67E22] rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-[#E67E22] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                      <span className="w-2 h-2 bg-[#E67E22] rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="pt-4 bg-white border-t border-gray-100 flex gap-3 items-center mt-auto z-10">
              <label htmlFor="chat-input" className="sr-only">Type a message</label>
              <input 
                id="chat-input"
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything about your trip..."
                className="flex-1 bg-[#F9F9F9] hover:bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-full px-6 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition-all font-medium"
                disabled={isLoading}
              />
              <button 
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-12 h-12 shrink-0 rounded-full bg-[#E67E22] text-white flex items-center justify-center disabled:opacity-50 hover:bg-[#d6711c] transition-all hover:scale-105 shadow-md active:scale-95"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </form>
          </section>

          <aside className="rounded-[32px] bg-white border border-gray-100 shadow-2xl shadow-gray-200/50 p-6 flex flex-col h-fit">
            <h3 className="text-xl font-black text-gray-900 drop-shadow-sm">Why Vacay Chat?</h3>
            <div className="mt-4 space-y-4 text-sm font-medium text-gray-500">
              <p>Vacay's chatbot is designed to answer travel questions with context-aware suggestions, weather-aware plans, and personalized recommendations.</p>
              <p>Use it to find restaurants, discover nearby attractions, or ask for a budget-friendly itinerary suggestion.</p>
              <div className="rounded-[24px] bg-[#F9F9F9] p-5 border border-gray-100 mt-6">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Chatbot uses</p>
                <ul className="mt-3 space-y-2 text-gray-700 font-semibold text-xs">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#E67E22]"></span> Destination guidance</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#E67E22]"></span> Weather-aware recommendations</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#E67E22]"></span> Restaurant and local tips</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#E67E22]"></span> Trip planning questions</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
