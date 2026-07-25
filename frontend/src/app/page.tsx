"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Map, Zap, Bot, ArrowRight, ArrowLeft, MessageSquare } from "lucide-react";

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
    <div className="min-h-screen w-full relative bg-gray-50 flex flex-col justify-center overflow-hidden selection:bg-orange-200">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-orange-100/40 via-gray-50 to-blue-50/40 -z-10" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-orange-300/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 mix-blend-multiply" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-300/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 mix-blend-multiply" />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 flex flex-col items-center text-center">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100/50 border border-orange-200/60 text-orange-700 text-sm font-medium tracking-wide mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            Welcome to Wandr
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-gray-900 leading-[1.1] tracking-tighter mb-8">
            The Future of <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400">Travel Planning.</span>
          </h1>
          
          <p className="text-lg sm:text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl leading-relaxed font-light">
            Wandr is an intelligent multi-agent AI system. We don't just give you a list of links—we autonomously research flights, verify hotel ratings, check the weather, and weave it all into a perfect daily itinerary.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center w-full sm:w-auto">
            {isSignedIn ? (
              <>
                <Link href="/trips" className="px-8 py-4 bg-white text-gray-900 border border-gray-200 font-semibold rounded-2xl text-lg shadow-sm hover:shadow-md hover:bg-gray-50 transition-all flex items-center justify-center gap-2 group">
                  <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:-translate-x-1 transition-transform" /> Back to My Trips
                </Link>
                <Link href="/plan" className="px-8 py-4 bg-orange-500 text-white font-semibold rounded-2xl text-lg shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group">
                  Start Planning Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </>
            ) : (
              <SignInButton mode="modal" forceRedirectUrl="/plan" fallbackRedirectUrl="/plan" signUpForceRedirectUrl="/plan" signUpFallbackRedirectUrl="/plan">
                <button className="px-8 py-4 bg-orange-500 text-white font-semibold rounded-2xl text-lg shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group w-full sm:w-auto">
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
            color="orange"
            title="Multi-Agent AI"
            description="Four specialized AI agents working together in the background to perfectly synchronize your flights, hotels, and schedule seamlessly."
            delay={0.1}
          />
          <FeatureCard 
            icon={<Map className="w-8 h-8" />}
            color="blue"
            title="Hyper-Personalized"
            description="Just chat naturally. Whether it's a romantic getaway or a budget backpacking trip, Wandr adapts the itinerary to exactly what you want."
            delay={0.2}
          />
          <FeatureCard 
            icon={<Zap className="w-8 h-8" />}
            color="green"
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
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-8 sm:p-12 border border-white/80 shadow-2xl shadow-gray-200/50 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-orange-400 to-amber-400 opacity-70"></div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-10 text-center tracking-tight">Just tell us what you want.</h2>
            
            <div className="w-full bg-white rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm border border-gray-100 group-hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="font-mono text-gray-600 text-sm sm:text-base md:text-lg flex-1 text-left leading-relaxed">
                {typedText}
                <span className="animate-pulse inline-block w-2 h-5 bg-orange-500 ml-1 align-middle"></span>
              </p>
            </div>
            
            <p className="mt-8 text-xs sm:text-sm text-gray-400 font-semibold tracking-[0.2em] uppercase text-center">
              Wandr's intent parser automatically extracts your preferences.
            </p>
          </div>
        </motion.div>

      </main>
    </div>
  );
}

function FeatureCard({ icon, color, title, description, delay = 0 }: { icon: React.ReactNode, color: 'orange' | 'blue' | 'green', title: string, description: string, delay?: number }) {
  const colorMap = {
    orange: 'bg-orange-100 text-orange-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: delay, ease: "easeOut" }}
      className="group bg-white/70 backdrop-blur-lg rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 text-left flex flex-col h-full"
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </motion.div>
  );
}
