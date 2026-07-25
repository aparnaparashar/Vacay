"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

interface User {
  id: number;
  email: string;
  name: string;
}

interface InviteBuddyModalProps {
  tripId: number;
  destination: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function InviteBuddyModal({ tripId, destination, isOpen, onClose }: InviteBuddyModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<number | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const searchUsers = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.data || []);
        }
      } catch (err) {
        console.error("Failed to search users", err);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, token]);

  const handleInvite = async (user: User | string) => {
    const targetEmail = typeof user === "string" ? user : user.email;
    setInviting(typeof user === "string" ? 0 : user.id);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ email: targetEmail, role: "editor" })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to invite");
      
      toast.success(data.message);
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInviting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      {/* Glassmorphism Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl w-full max-w-md overflow-hidden animate-fade-in sm:scale-100 scale-95 origin-center">
        {/* Header */}
        <div className="p-6 border-b border-gray-200/50 flex justify-between items-center bg-white/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Add Buddies</h2>
            <p className="text-sm font-medium text-gray-500 mt-1">Trip to {destination}</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="relative mb-6">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input
              type="text"
              className="w-full h-12 pl-12 pr-4 bg-gray-100/80 border-transparent focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl text-gray-900 placeholder:text-gray-400 transition-all font-medium"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="min-h-[200px] max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <span className="material-symbols-outlined animate-spin mb-2">sync</span>
                <p className="text-sm font-medium">Searching explorers...</p>
              </div>
            ) : query.length > 0 && results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[24px]">mail</span>
                </div>
                <p className="text-gray-900 font-bold mb-1">No Wandr users found</p>
                <p className="text-gray-500 text-sm mb-4">But you can still invite them via email!</p>
                <button
                  onClick={() => handleInvite(query)}
                  disabled={inviting === 0}
                  className="px-6 py-2 bg-gray-900 text-white rounded-full text-sm font-bold hover:bg-black transition-colors disabled:opacity-70 flex items-center gap-2"
                >
                  {inviting === 0 ? "Sending Invite..." : `Invite ${query}`}
                  <span className="material-symbols-outlined text-[16px]">send</span>
                </button>
              </div>
            ) : results.length > 0 ? (
              <ul className="space-y-3">
                {results.map((user) => (
                  <li key={user.id} className="flex items-center justify-between p-3 rounded-[24px] hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200/60 group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary text-white flex items-center justify-center font-bold shadow-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500 font-medium">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInvite(user)}
                      disabled={inviting === user.id}
                      className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm disabled:opacity-50"
                      title="Add to trip"
                    >
                      {inviting === user.id ? (
                        <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      ) : (
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">group_add</span>
                <p className="text-sm font-medium">Search for friends to plan together.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
