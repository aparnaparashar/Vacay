"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth as useClerkAuth, useUser } from "@clerk/nextjs";

interface User {
  id?: string;
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSignedIn) {
      getToken().then(setToken);
      interval = setInterval(() => {
        getToken().then(setToken);
      }, 30000); // refresh token every 30 seconds
    } else {
      setToken(null);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSignedIn, getToken]);

  const user = clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    name: clerkUser.fullName || "",
  } : null;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login: () => {}, 
      logout: () => signOut(), 
      isAuthenticated: !!isSignedIn 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
