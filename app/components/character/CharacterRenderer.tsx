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
  const layers = useMemo(() => {
    return getSpriteLayers(config, seed);
  }, [config, seed]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
      style={{
        width: "var(--character-size, " + size + "px)",
        height: showPedestal
          ? "calc(var(--character-size, " + size + "px) + 24px)"
          : "var(--character-size, " + size + "px)",
      }}
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
          className="absolute bottom-0 w-[90%] h-6 sm:h-8 pointer-events-none z-[10] flex items-center justify-center"
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
        className="relative flex items-center justify-center"
        style={{
          width: "var(--character-size, " + size + "px)",
          height: "var(--character-size, " + size + "px)",
        }}
      >
        {/* ─── Layer 2: Full-Body Character Form (z-[20]) ───────── */}
        {layers.form && (
          <img
            src={layers.form}
            alt="Character Form"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[20]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
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
