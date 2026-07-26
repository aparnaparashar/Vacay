"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Map, Zap, Bot, ArrowRight, ArrowLeft, MessageSquare, Compass, Sparkles } from "lucide-react";

const featuredDestinations = [
  {
    name: "Santorini",
    country: "Greece",
    tagline: "Cliffside suites, blue domes, and sunset dinners.",
    rating: "4.9",
    price: "From $980",
    image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Kyoto",
    country: "Japan",
    tagline: "Lantern-lit streets and serene temple mornings.",
    rating: "4.8",
    price: "From $860",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Marrakech",
    country: "Morocco",
    tagline: "Markets, riads, and desert escapes all in one trip.",
    rating: "4.7",
    price: "From $760",
    image: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=900&q=80",
  },
];

export default function AboutPage() {
  const { isSignedIn } = useAuth();
  const [typedText, setTypedText] = useState("");
  const fullText = "Plan a 3-day trip from Delhi to Bali next week for a couple, budget 50000...";
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.substring(0, i));
      i++;
      if (i > fullText.length) {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [fullText]);

  return (
    <div className="min-h-screen w-full relative bg-transparent flex flex-col justify-center overflow-hidden selection:bg-gray-200 text-black">
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 flex flex-col items-center text-center">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-black/10 text-black text-sm font-medium tracking-wide mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-40"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-black"></span>
            </span>
            Welcome to Vacay
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-black leading-[1.1] tracking-tighter mb-8">
            The Future of <br className="hidden sm:block" />
            <span className="text-black">Travel Planning.</span>
          </h1>
          
          <p className="text-lg sm:text-xl md:text-2xl text-black mb-12 max-w-3xl leading-relaxed font-light">
            Vacay is an intelligent multi-agent AI system. We don't just give you a list of links—we autonomously research flights, verify hotel ratings, check the weather, and weave it all into a perfect daily itinerary.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center w-full sm:w-auto">
            {isSignedIn ? (
              <>
                <Link href="/trips" className="px-8 py-4 bg-white text-black border border-black font-semibold rounded-2xl text-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 group">
                  <ArrowLeft className="w-5 h-5 text-black group-hover:-translate-x-1 transition-transform" /> Back to My Trips
                </Link>
                <Link href="/plan" className="px-8 py-4 bg-black text-white font-semibold rounded-2xl text-lg shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group">
                  Start Planning Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </>
            ) : (
              <SignInButton mode="modal" forceRedirectUrl="/plan" fallbackRedirectUrl="/plan" signUpForceRedirectUrl="/plan" signUpFallbackRedirectUrl="/plan">
                <button className="px-8 py-4 bg-black text-white font-semibold rounded-2xl text-lg shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group w-full sm:w-auto">
                  Start Planning Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </SignInButton>
            )}
          </div>
        </motion.div>

        {/* 3D Features Grid */}
        <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 w-full max-w-6xl mx-auto">
          <FeatureCard 
            icon={<Bot className="w-8 h-8" />}
            title="Multi-Agent AI"
            description="Four specialized AI agents working together in the background to perfectly synchronize your flights, hotels, and schedule seamlessly."
            delay={0.1}
          />
          <FeatureCard 
            icon={<Map className="w-8 h-8" />}
            title="Hyper-Personalized"
            description="Just chat naturally. Whether it's a romantic getaway or a budget backpacking trip, Vacay adapts the itinerary to exactly what you want."
            delay={0.2}
          />
          <FeatureCard 
            icon={<Zap className="w-8 h-8" />}
            title="Seamless Flow"
            description="No infinite forms. Just one conversational prompt turns into a beautiful, bookable dashboard in less than 30 seconds."
            delay={0.3}
          />
        </div>

        {/* Interactive Prompt Demo */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mt-32 w-full max-w-4xl"
        >
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-8 sm:p-12 border border-black/10 shadow-2xl shadow-black/5 relative overflow-hidden group">
            <h2 className="text-3xl sm:text-4xl font-bold text-black mb-10 text-center tracking-tight">Just tell us what you want.</h2>
            
            <div className="w-full bg-white rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm border border-black/10 group-hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-black/5 text-black flex items-center justify-center shrink-0 border border-black/10">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="font-mono text-black text-sm sm:text-base md:text-lg flex-1 text-left leading-relaxed">
                {typedText}
                <span className="animate-pulse inline-block w-2 h-5 bg-black ml-1 align-middle"></span>
              </p>
            </div>
            
            <p className="mt-8 text-xs sm:text-sm text-black font-semibold tracking-[0.2em] uppercase text-center opacity-60">
              Vacay's intent parser automatically extracts your preferences.
            </p>
          </div>
        </motion.div>

        {/* Featured Destinations */}
        <section className="mt-32 w-full max-w-6xl">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between text-left">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-sm font-medium text-black backdrop-blur-sm shadow-sm">
                <Sparkles className="h-4 w-4 text-black" /> Featured Destinations
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-black">Inspiration for your next escape</h2>
            </div>
            <Link href="/plan" className="inline-flex items-center gap-2 text-sm font-semibold text-black transition-colors hover:underline">
              Start planning <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featuredDestinations.map((destination, index) => (
              <motion.article
                key={destination.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="group relative overflow-hidden rounded-[28px] border border-black/10 bg-white/60 shadow-sm"
              >
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${destination.image})` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                <div className="relative flex min-h-[320px] flex-col justify-end p-6 text-left">
                  <div className="mb-4 flex items-center justify-between text-sm text-white">
                    <span className="rounded-full border border-white/20 bg-white/20 px-3 py-1 backdrop-blur-sm">{destination.country}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/20 px-3 py-1 backdrop-blur-sm">
                      <Compass className="h-4 w-4" /> {destination.rating}
                    </span>
                  </div>
                  <h3 className="text-2xl font-semibold text-white">{destination.name}</h3>
                  <p className="mt-2 max-w-xs text-sm text-white/90">{destination.tagline}</p>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{destination.price}</span>
                    <Link href="/plan" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/20 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-white/40 backdrop-blur-sm">
                      Plan this trip <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay = 0 }: { icon: React.ReactNode, title: string, description: string, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: delay, ease: "easeOut" }}
      className="group bg-white/70 backdrop-blur-lg rounded-3xl p-8 border border-black/10 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 text-left flex flex-col h-full"
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 bg-black/5 border border-black/10 text-black`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-black mb-4">{title}</h3>
      <p className="text-black/80 leading-relaxed">{description}</p>
    </motion.div>
  );
}
