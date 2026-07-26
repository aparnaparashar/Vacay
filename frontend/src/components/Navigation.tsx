"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTripData } from "@/context/TripContext";
import { useAuth as useCustomAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { SignInButton, Show, UserButton } from "@clerk/nextjs";
import { motion } from "framer-motion";


export function TopNav() {
  const pathname = usePathname();
  const { tripData } = useTripData();
  const { isAuthenticated } = useCustomAuth(); // Note: This will be replaced by Clerk later
  const [profileOpen, setProfileOpen] = useState(false);

  // Hide TopNav completely on auth pages
  if (pathname === "/login" || pathname === "/signup") {
    return null;
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Trip link copied to clipboard!");
    } catch {
      toast.error("Copy failed. Please copy the URL manually.");
    }
  };

  const globalNavLinks = isAuthenticated ? [
    { name: "My Trips", href: "/trips", icon: "luggage" },
    { name: "Time Off", href: "/vacation", icon: "event_available" },
    { name: "Plan", href: "/plan", icon: "explore" },
    { name: "Chat", href: "/chat", icon: "chat_bubble" }
  ] : [
    { name: "About", href: "/", icon: "info" }
  ];

  const isTripView = ["/itinerary", "/flights", "/hotels", "/guide", "/budget", "/lists", "/logistics", "/files"].includes(pathname);

  // When inside a trip view, render the specific trip header and subheader
  if (isTripView) {
    const tripNavLinks = [
      { name: "Plan", href: "/itinerary", icon: "event_note" },
      { name: "Transports", href: "/flights", icon: "directions_car" },
      { name: "Book", href: "/hotels", icon: "hotel" },
      { name: "Guide", href: "/guide", icon: "travel_explore" },
      { name: "Logistics", href: "/logistics", icon: "local_shipping" },
      { name: "Lists", href: "/lists", icon: "list_alt" },
      { name: "Costs", href: "/budget", icon: "payments" },
      { name: "Files", href: "/files", icon: "folder" }
    ];

    return (
      <>
      {/* Above the chat backdrop (z-90) so the Chat toggle stays clickable. */}
      <div className="fixed top-0 left-0 right-0 z-[95] bg-[#F8F9FA]">
        {/* Top Header */}
        <header className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
          {/* Left: Logo & Title */}
          <div className="flex items-center gap-3">
            <Link href="/trips" className="flex items-center transition-transform hover:scale-105">
              <motion.img layoutId="nav-logo" src="/assets/logo.png" alt="Vacay" className="h-[48px] w-auto object-contain" />
            </Link>
            <div className="h-5 w-px bg-gray-300"></div>
            <span className="text-gray-900 font-bold text-base tracking-wide">
              {tripData?.destination || "New Trip"}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4 text-gray-500">
            <button 
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 text-gray-700 transition-colors bg-white"
              onClick={copyShareLink}
            >
              <span className="material-symbols-outlined text-[16px]">group_add</span>
              Share
            </button>
            <button 
              className="material-symbols-outlined text-[20px] hover:text-black transition-colors"
              onClick={() => toast.success(tripData?.destination ? `${tripData.destination} trip is loaded.` : "No active trip loaded.")}
            >
              notifications
            </button>

            <div className="relative flex items-center gap-2 ml-2">
              <Show when="signed-out">
                <SignInButton mode="modal" forceRedirectUrl="/trips" fallbackRedirectUrl="/trips" signUpForceRedirectUrl="/trips" signUpFallbackRedirectUrl="/trips">
                  <button className="px-4 py-1.5 bg-black text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors">
                    Login
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}>
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="About"
                      labelIcon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>}
                      href="/"
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </Show>
            </div>

          </div>
        </header>

        {/* Sub Header Navigation */}
        <div className="h-12 border-b border-gray-200 flex items-center justify-center bg-white">
          <nav className="flex gap-2">
            {tripNavLinks.map((link) => {
              const isActive = pathname === link.href || (pathname === "/" && link.href === "/");
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                    isActive
                      ? "bg-[#E67E22] text-white shadow-sm"
                      : "text-gray-500 hover:text-black hover:bg-gray-100"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {link.icon}
                  </span>
                  {link.name}
                </Link>
              );
            })}

          </nav>
        </div>
      </div>
      </>
    );
  }

  // Global Header is standard light-mode dashboard styling across all pages
  return (
    <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-50 transition-colors duration-300 bg-white border-b border-gray-200">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center">
          <motion.img layoutId="nav-logo" src="/assets/logo.png" alt="Vacay" className="h-[56px] w-auto object-contain" />
        </Link>
      </div>

      {/* Center Pill Nav */}
      <nav className="flex rounded-full p-1 transition-colors duration-300 bg-gray-50 border border-gray-200">
        {globalNavLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                isActive
                  ? "bg-gray-100 text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {link.icon}
              </span>
              {link.name}
            </Link>
          );
        })}
        {/* No Chat entry here — chat lives only in the trip sub-nav. */}
      </nav>

      {/* Right Controls */}
      <div className="flex items-center gap-4 transition-colors text-gray-500">
        <button 
          className="material-symbols-outlined text-[20px] transition-colors hover:text-black"
          onClick={() => toast.success(tripData?.destination ? `${tripData.destination} trip is loaded.` : "No active trip loaded.")}
        >
          notifications
        </button>

            <div className="relative flex items-center gap-2 ml-2">
              <Show when="signed-out">
                <SignInButton mode="modal" forceRedirectUrl="/trips" fallbackRedirectUrl="/trips" signUpForceRedirectUrl="/trips" signUpFallbackRedirectUrl="/trips">
                  <button className="px-4 py-1.5 bg-black text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors">
                    Login
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton appearance={{ elements: { userButtonAvatarBox: "w-8 h-8" } }}>
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="About"
                      labelIcon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>}
                      href="/"
                    />
                  </UserButton.MenuItems>
                </UserButton>
              </Show>
            </div>

      </div>
    </header>
  );
}
