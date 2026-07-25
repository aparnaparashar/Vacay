"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "glass-strong shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 group">
            <span className="text-2xl font-bold tracking-tight">
              <span className="gradient-text">W</span>
              <span className="text-white group-hover:text-gray-200 transition-colors">
                andr
              </span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {["Explore", "Plan Trip", "Collections"].map((item) => (
              <Link
                key={item}
                href="#"
                className="text-sm text-gray-400 hover:text-white transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 hover:after:w-full after:bg-amber after:transition-all after:duration-300"
              >
                {item}
              </Link>
            ))}
          </div>

          {/* CTA + Mobile Toggle */}
          <div className="flex items-center gap-3">
            <Link
              href="#"
              className="hidden md:inline-flex items-center gap-2 rounded-full bg-amber px-5 py-2 text-sm font-semibold text-black hover:bg-amber-light transition-all duration-300 hover:shadow-lg hover:shadow-amber/25 active:scale-95"
            >
              Get Started
            </Link>

            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden relative w-8 h-8 flex items-center justify-center"
              aria-label="Toggle menu"
            >
              <div className="flex flex-col gap-[5px]">
                <span
                  className={`block h-[2px] w-5 bg-white transition-all duration-300 origin-center ${
                    mobileOpen
                      ? "rotate-45 translate-y-[7px]"
                      : ""
                  }`}
                />
                <span
                  className={`block h-[2px] w-5 bg-white transition-all duration-300 ${
                    mobileOpen ? "opacity-0 scale-0" : ""
                  }`}
                />
                <span
                  className={`block h-[2px] w-5 bg-white transition-all duration-300 origin-center ${
                    mobileOpen
                      ? "-rotate-45 -translate-y-[7px]"
                      : ""
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-400 ease-out ${
          mobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="glass-strong mx-4 mb-4 rounded-[24px] p-4 space-y-1">
          {["Explore", "Plan Trip", "Collections"].map((item) => (
            <Link
              key={item}
              href="#"
              onClick={() => setMobileOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-all duration-200"
            >
              {item}
            </Link>
          ))}
          <div className="pt-2">
            <Link
              href="#"
              className="block rounded-xl bg-amber px-4 py-3 text-center text-sm font-semibold text-black hover:bg-amber-light transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
