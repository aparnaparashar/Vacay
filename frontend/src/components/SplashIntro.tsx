"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SplashIntro({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasSeenSplash = sessionStorage.getItem("vacay_splash_seen");
    
    if (prefersReducedMotion || hasSeenSplash) {
      setShowSplash(false);
      return;
    }

    sessionStorage.setItem("vacay_splash_seen", "true");

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200); // Hold for 1.2s

    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) return null;

  // When splash is true, we render the splash overlay.
  // When false, we render the children.
  // Because the splash logo and nav logo share layoutId="nav-logo", 
  // Framer Motion automatically tweens the logo from center to top-left!

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash-overlay"
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none bg-transparent"
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <motion.img
              layoutId="nav-logo"
              src="/assets/favicon.png"
              alt="Vacay Logo"
              initial={{ opacity: 0, scale: 0.9, filter: "drop-shadow(0 0 0px rgba(0,0,0,0))" }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.15))"
              }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="w-48 h-48 md:w-64 md:h-64 object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!showSplash && (
        <motion.div
          ref={contentRef}
          key="main-content"
          initial={{ opacity: 0, y: 15, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          onAnimationComplete={() => {
            if (contentRef.current) {
              contentRef.current.style.transform = 'none';
              contentRef.current.style.filter = 'none';
            }
          }}
          className="w-full min-h-screen"
        >
          {children}
        </motion.div>
      )}
    </>
  );
}
