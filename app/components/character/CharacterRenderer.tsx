"use client";

import { useMemo } from "react";
import { CharacterConfig, getSpriteLayers } from "@/lib/character-traits";

interface CharacterRendererProps {
  config?: CharacterConfig | null;
  seed?: string;
  size?: number; // Size in px (1:1 aspect ratio matching Habitica 140x140 sprite canvas)
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
      style={{ width: size, height: showPedestal ? size + 24 : size }}
    >
      {/* ─── Layer 1: Ambient Glow / Aura Ring (z-0) ────────────── */}
      {showAura && layers.aura && layers.aura.id !== "none" && (
        <div
          className="absolute inset-2 rounded-full pointer-events-none transition-all duration-500 blur-2xl opacity-60 animate-pulse z-0"
          style={{ background: layers.aura.color }}
        />
      )}

      {/* ─── Layer 2: Holographic Pedestal Base (z-1) ─────────── */}
      {showPedestal && (
        <div
          className="absolute bottom-0 w-[90%] h-8 pointer-events-none z-[1] flex items-center justify-center"
        >
          <img
            src={layers.pedestal}
            alt="Pedestal Platform"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* ─── Layered Modular Character Canvas (Centered) ─── */}
      <div
        className="relative z-10 w-full h-full flex items-center justify-center -translate-x-[11.67%]"
        style={{ width: size, height: size }}
      >
        {/* Layer 3: Back Hair (z-2) */}
        {layers.hairBase && (
          <img
            src={layers.hairBase}
            alt="Hair Base"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[2]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Layer 4: Base Body & Skin (z-3) */}
        {layers.body && (
          <img
            src={layers.body}
            alt="Character Body"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[3]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Layer 5: Outfit / Armor / Robes (z-4) */}
        {layers.outfit && (
          <img
            src={layers.outfit}
            alt="Attire"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[4]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Layer 6: Eyewear / Visor (z-5) */}
        {layers.eyewear && (
          <img
            src={layers.eyewear}
            alt="Eyewear"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[5]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Layer 7: Front Hair Bangs (z-6) */}
        {layers.hairBangs && (
          <img
            src={layers.hairBangs}
            alt="Hair Bangs"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[6]"
            style={{ imageRendering: "pixelated" }}
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Layer 8: Headgear & Accessories (z-7) */}
        {layers.accessory && (
          <img
            src={layers.accessory}
            alt="Accessory"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[7]"
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
