"use client";

import { useMemo, useState, useEffect } from "react";
import { CharacterConfig, getSpriteLayers } from "@/lib/character-traits";

interface CharacterRendererProps {
  config?: CharacterConfig | null;
  seed?: string;
  size?: number; // Size in px (1:1 aspect ratio matching 90x90 sprite canvas)
  className?: string;
  showPedestal?: boolean;
  showAura?: boolean;
}

export function CharacterRenderer({
  config,
  seed = "scholar",
  size = 200,
  className = "",
  showPedestal = false,
  showAura = true,
}: CharacterRendererProps) {
  const [formLoaded, setFormLoaded] = useState(false);
  const [formFailed, setFormFailed] = useState(false);

  const layers = useMemo(() => {
    return getSpriteLayers(config, seed);
  }, [config, seed]);

  // Reset form load state when form source changes
  useEffect(() => {
    setFormLoaded(false);
    setFormFailed(false);
  }, [layers.form]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      style={{ width: size, height: showPedestal ? size + 24 : size }}
    >
      {/* ─── Layer 3: Visual Aura Ring / Energy Field (z-[30]) ─── */}
      {showAura && layers.aura && layers.aura.id !== "none" && (
        <div
          className="absolute inset-2 rounded-full pointer-events-none transition-all duration-500 blur-2xl opacity-60 animate-pulse z-[30]"
          style={{ background: layers.aura.color }}
        />
      )}

      {/* ─── Layer 1: Holographic Pedestal Platform (z-[10]) ───── */}
      {showPedestal && (
        <div
          className="absolute bottom-0 w-[90%] h-8 pointer-events-none z-[10] flex items-center justify-center"
        >
          <img
            src={layers.pedestal}
            alt="Pedestal Platform"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* ─── Unified Character Canvas (Centered) ──────────────── */}
      <div
        className="relative w-full h-full flex items-center justify-center -translate-x-[11.67%]"
        style={{ width: size, height: size }}
      >
        {/* ─── Layer 2: Fallback Arcane Silhouette (z-[20]) ─────── */}
        {(!formLoaded || formFailed) && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-[20] transition-opacity duration-300"
            style={{ width: size, height: size }}
          >
            <svg
              viewBox="0 0 90 90"
              className="w-full h-full text-accent-primary drop-shadow-[0_0_8px_rgba(124,58,237,0.4)]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Head / Hood */}
              <rect x="47" y="24" width="19" height="18" rx="4" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.8" />
              {/* Glowing Eyes */}
              <circle cx="53" cy="33" r="1.5" fill="#38bdf8" />
              <circle cx="60" cy="33" r="1.5" fill="#38bdf8" />
              {/* Torso */}
              <path d="M43 45 H70 V62 H43 Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
              {/* Arms */}
              <rect x="38" y="46" width="4" height="15" rx="2" fill="currentColor" fillOpacity="0.35" />
              <rect x="71" y="46" width="4" height="15" rx="2" fill="currentColor" fillOpacity="0.35" />
              {/* Legs */}
              <rect x="47" y="63" width="6" height="12" rx="1.5" fill="currentColor" fillOpacity="0.4" />
              <rect x="60" y="63" width="6" height="12" rx="1.5" fill="currentColor" fillOpacity="0.4" />
            </svg>
          </div>
        )}

        {/* ─── Layer 2: Full-Body Character Form (z-[20]) ───────── */}
        {layers.form && (
          <img
            src={layers.form}
            alt="Character Form"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[20]"
            style={{ imageRendering: "pixelated" }}
            onLoad={() => {
              setFormLoaded(true);
              setFormFailed(false);
            }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
              setFormFailed(true);
            }}
          />
        )}

        {/* ─── Layer 4: Equipped Off-Hand Relic / Weapon (z-[40]) ── */}
        {layers.relic && (
          <img
            src={layers.relic}
            alt="Equipped Relic"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[40]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}
      </div>
    </div>
  );
}
