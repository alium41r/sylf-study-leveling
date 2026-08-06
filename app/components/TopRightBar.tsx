"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function TopRightBar() {
  const { user, token } = useAuth();
  const [justExtendedStreak, setJustExtendedStreak] = useState(false);
  const [testAnimation, setTestAnimation] = useState(false);
  const [prevStreak, setPrevStreak] = useState<number | null>(null);
  const pathname = usePathname();

  // Check for streak extension animation
  useEffect(() => {
    if (user && prevStreak !== null && user.streakDays > prevStreak) {
      setJustExtendedStreak(true);
      setTimeout(() => setJustExtendedStreak(false), 3000);
    }
    if (user) {
      setPrevStreak(user.streakDays);
    }
  }, [user?.streakDays]);

  const ALLOWED_PATHS = ["/dashboard", "/inventory"];
  if (!user || !ALLOWED_PATHS.includes(pathname)) return null;

  const handleTestAnimation = () => {
    setTestAnimation(true);
    setTimeout(() => setTestAnimation(false), 2000);
  };

  const isAnimating = justExtendedStreak || testAnimation;
  const isDashboard = pathname === "/dashboard" || pathname === "/home";

  return (
    <div 
      className={`fixed top-6 right-6 z-40 flex flex-row items-center gap-4 transition-opacity duration-300 opacity-100`}
    >
      
      {/* ─── Sylph Badge ───────────────────────────────────── */}
      <div 
        title="Sylph (System Currency)"
        className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-black/40 backdrop-blur-md shadow-[0_0_8px_rgba(6,182,212,0.1)] transition-all hover:border-cyan-400/50 hover:shadow-[0_0_12px_rgba(6,182,212,0.3)]"
      >
        <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center drop-shadow-[0_0_6px_rgba(6,182,212,0.8)] shrink-0">
          <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
        </div>
        <span className="text-lg font-bold font-['Rajdhani'] tracking-wide text-cyan-400">
          {user.sylph || 0}
        </span>
      </div>

      {/* ─── Streak Badge (Only on Dashboard) ───────────────── */}
      {pathname === "/dashboard" && (
        <div 
          onClick={handleTestAnimation}
          title="Click to test animation!"
          className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-full border bg-black/40 backdrop-blur-md shadow-lg transition-all ${
            isAnimating ? "animate-streak-bounce border-yellow-400/80 shadow-yellow-500/50" : "border-white/10 hover:border-yellow-400/50 hover:shadow-lg"
          }`}
        >
          <svg 
            className={`w-5 h-5 ${user.streakDays > 0 || isAnimating ? "text-yellow-400" : "text-gray-500"} ${isAnimating ? "drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" : ""}`} 
            fill="currentColor" 
            viewBox="0 0 24 24"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className={`font-bold font-['Rajdhani'] tracking-wide ${user.streakDays > 0 ? "text-yellow-400" : "text-gray-400"}`}>
            {user.streakDays}
          </span>
        </div>
      )}
    </div>
  );
}
