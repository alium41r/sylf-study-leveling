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

  const ALLOWED_PATHS = ["/dashboard", "/inventory", "/locker", "/shop", "/home"];
  const isAllowed = ALLOWED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?")
  );

  if (!user || !isAllowed) return null;

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
        className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle bg-bg-panel/40 backdrop-blur-md shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 hover:border-accent-primary hover:shadow-[0_0_15px_var(--accent-primary-dim)] cursor-default"
      >
        <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
          <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
        </div>
        <span className="text-lg font-bold font-['Rajdhani'] tracking-wide text-accent-text-light">
          {user.sylph || 0}
        </span>
      </div>

      {/* ─── Weekly Streak Badge (Only on Dashboard) ────────── */}
      {pathname === "/dashboard" && (
        <div 
          onClick={handleTestAnimation}
          title={`Weekly Streak: ${user.streakDays || 0} consecutive week${user.streakDays === 1 ? '' : 's'} hitting the 3h milestone`}
          className={`pointer-events-auto cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-bg-panel/40 backdrop-blur-md shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
            isAnimating ? "animate-streak-bounce border-yellow-400/80 shadow-yellow-500/50" : "border-border-subtle hover:border-yellow-400/50 hover:shadow-lg"
          }`}
        >
          <svg 
            className={`w-4 h-4 ${user.streakDays > 0 || isAnimating ? "text-yellow-400" : "text-text-muted"} ${isAnimating ? "drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" : ""}`} 
            fill="currentColor" 
            viewBox="0 0 24 24"
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className={`font-bold font-['Rajdhani'] tracking-wide text-sm ${user.streakDays > 0 ? "text-yellow-400" : "text-text-secondary"}`}>
            {user.streakDays} <span className="text-[10px] uppercase font-semibold text-text-muted">wks</span>
          </span>
        </div>
      )}
    </div>
  );
}
