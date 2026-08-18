"use client";

import React, { useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import { useRouter } from "next/navigation";
import { Store, Lock } from "lucide-react";

export default function ShopPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [token, router]);

  if (!user) {
    return <div className="p-8 text-center text-text-muted">Loading Shop...</div>;
  }

  return (
    <div className="p-4 sm:p-8 pb-20 max-w-5xl mx-auto flex flex-col gap-8 animate-fade-in">
      {/* ─── Header Bar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-2 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs tracking-widest text-accent-text-light font-['Rajdhani'] font-bold uppercase">
            SYSTEM STORE
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-text-primary font-['Rajdhani'] flex items-center gap-3">
            <Store className="w-7 h-7 text-emerald-400" />
            <span>Shop</span>
          </h1>
        </div>

        {/* User Sylph Coin Balance */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-panel/90 border border-white/10 shadow-md">
          <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
            <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
          </div>
          <span className="text-lg font-bold text-text-primary font-['Rajdhani']">
            {user.sylph ?? 0}
          </span>
          <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">Sylph</span>
        </div>
      </div>

      {/* ─── Clean Minimal "Coming Soon" Hero Card ────────────── */}
      <div className="system-card rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl p-8 sm:p-16 relative overflow-hidden flex flex-col items-center text-center gap-6 min-h-[420px] justify-center">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
        <div className="absolute w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none -top-10" />

        {/* Glowing Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            <Store className="w-10 h-10" />
          </div>
          <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-bg-abyss border border-white/10 text-amber-400 shadow-md">
            <Lock className="w-4 h-4" />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold font-['Rajdhani'] text-text-primary tracking-wider uppercase">
            Coming Soon
          </h2>
          <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-400 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 inline-block">
            System Store
          </span>
        </div>
      </div>
    </div>
  );
}
