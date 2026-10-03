import React from "react";

/**
 * BotanicalDivider: Refined, sparse, minimal central ornamental stem.
 * Features a single graceful bezier curve, asymmetrical delicate leaves,
 * two tiny hanging crystal droplets, and a crisp radiant 4-point star node.
 */
export function BotanicalDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 860"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-full w-full max-h-[820px] overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft violet-to-cyan gradient for leaves */}
        <linearGradient id="dividerLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0.5" />
        </linearGradient>

        {/* Luminous crystal pendant gradient */}
        <linearGradient id="dividerCrystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#c7d2fe" />
          <stop offset="60%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>

        {/* Delicate stem stroke gradient */}
        <linearGradient id="dividerStemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.05" />
          <stop offset="20%" stopColor="#818cf8" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.7" />
          <stop offset="80%" stopColor="#818cf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.05" />
        </linearGradient>

        {/* Restrained star glow */}
        <filter id="dividerStarGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ─── Graceful Thin Curved Stem ────────────────────────── */}
      <path
        d="M 50 40 Q 46 250 50 430 Q 53 620 50 820"
        stroke="url(#dividerStemGrad)"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* ─── Asymmetrical Sparse Foliage (Only 6 delicate leaves) ── */}
      {/* 1. Upper left leaf (y ~140) */}
      <path
        d="M 49 140 C 38 130 30 134 26 145 C 36 150 44 146 49 140 Z"
        fill="url(#dividerLeafGrad)"
      />

      {/* 2. Upper right leaf + small hanging tendril with crystal (y ~230) */}
      <path
        d="M 50 230 C 62 218 72 222 76 234 C 66 240 57 236 50 230 Z"
        fill="url(#dividerLeafGrad)"
      />
      {/* Delicate tendril branching right with hanging droplet */}
      <path
        d="M 50 210 Q 64 220 68 245 L 68 255"
        stroke="#818cf8"
        strokeWidth="0.7"
        strokeOpacity="0.45"
      />
      <polygon
        points="68,255 70.5,260 68,266 65.5,260"
        fill="url(#dividerCrystalGrad)"
        opacity="0.85"
      />

      {/* 3. Pre-star left leaf (y ~340) */}
      <path
        d="M 49 340 C 36 332 29 337 25 348 C 35 352 44 347 49 340 Z"
        fill="url(#dividerLeafGrad)"
      />

      {/* ─── Central Four-Point Starburst Node (y = 430) ────────── */}
      <g filter="url(#dividerStarGlow)">
        {/* Soft aura */}
        <circle cx="50" cy="430" r="10" fill="#38bdf8" fillOpacity="0.1" />
        
        {/* Crisp 4-point star */}
        <polygon
          points="50,414 53,427 66,430 53,433 50,446 47,433 34,430 47,427"
          fill="#ffffff"
        />
        {/* Micro center glint */}
        <circle cx="50" cy="430" r="1.2" fill="#ffffff" />
      </g>

      {/* 4. Post-star right leaf (y ~520) */}
      <path
        d="M 50 520 C 60 510 68 514 72 525 C 62 530 55 526 50 520 Z"
        fill="url(#dividerLeafGrad)"
      />

      {/* 5. Lower left tendril with small hanging crystal (y ~630) */}
      <path
        d="M 50 630 C 37 640 28 636 24 625 C 34 620 43 624 50 630 Z"
        fill="url(#dividerLeafGrad)"
      />
      <path
        d="M 50 650 Q 36 660 32 680 L 32 690"
        stroke="#818cf8"
        strokeWidth="0.7"
        strokeOpacity="0.45"
      />
      <polygon
        points="32,690 34.5,695 32,701 29.5,695"
        fill="url(#dividerCrystalGrad)"
        opacity="0.85"
      />

      {/* 6. Bottom right leaf (y ~740) */}
      <path
        d="M 50 740 C 62 750 71 746 75 735 C 65 730 56 734 50 740 Z"
        fill="url(#dividerLeafGrad)"
      />
    </svg>
  );
}
export default BotanicalDivider;
