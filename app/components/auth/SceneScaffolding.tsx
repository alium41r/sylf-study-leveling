import React from "react";
import styles from "./AuthLayout.module.css";

/**
 * SceneScaffolding: Scene framework and geometry setting the stage for the floating island.
 * 
 * Refinements:
 * - Slender, organic crescent moon with sharp tapering horns, inner highlight stroke, and halo
 * - Upper-right celestial scaffolding (hanging lines, diamond pendants, sweeping guide arcs)
 * - Lower-right orbital expansion (wide tilted rings, diagonal guide rays, lower strata rings)
 * - Vertical celestial axis connecting moon to island center and terminating in hanging crystals
 */
export function SceneScaffolding() {
  return (
    <div className={styles.sceneContainer} aria-hidden="true">
      <svg
        viewBox="0 0 720 780"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.scaffoldingSvg}
      >
        <defs>
          {/* Luminous crescent moon gradient */}
          <linearGradient id="scaffoldMoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#e0e7ff" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#a5b4fc" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.6" />
          </linearGradient>

          {/* Primary island ring stroke gradient */}
          <linearGradient id="scaffoldPrimaryRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="25%" stopColor="#818cf8" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#c7d2fe" stopOpacity="0.95" />
            <stop offset="75%" stopColor="#818cf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.35" />
          </linearGradient>

          {/* Tilted orbital ring gradient */}
          <linearGradient id="scaffoldOrbitalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
            <stop offset="35%" stopColor="#818cf8" stopOpacity="0.45" />
            <stop offset="65%" stopColor="#a5b4fc" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
          </linearGradient>

          {/* Crystal diamond faceted gradient */}
          <linearGradient id="scaffoldCrystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#c7d2fe" />
            <stop offset="75%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          {/* Soft celestial glow filter */}
          <filter id="scaffoldCelestialGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Luminous moon glow filter */}
          <filter id="scaffoldMoonGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ─── 1. Upper Celestial Guide Arcs & Large Orbital Ring ───── */}
        {/* Sweeping constellation guide arc in upper sky */}
        <path
          d="M 120 160 Q 340 50 660 130"
          stroke="#818cf8"
          strokeWidth="0.8"
          strokeDasharray="5 7"
          strokeOpacity="0.25"
        />

        {/* Large faint celestial circular orbit behind companion & moon */}
        <circle
          cx="440"
          cy="270"
          r="160"
          stroke="#818cf8"
          strokeWidth="0.8"
          strokeDasharray="6 8"
          strokeOpacity="0.25"
        />

        {/* ─── 2. Hanging Vertical Ornament Lines (Upper Sky) ────────── */}
        {/* Line 1 (Far left sky, x = 160) */}
        <path d="M 160 30 L 160 210" stroke="#6366f1" strokeWidth="0.75" strokeOpacity="0.4" />
        <polygon points="160,210 163.5,216 160,223 156.5,216" fill="url(#scaffoldCrystalGrad)" opacity="0.85" />
        <circle cx="160" cy="206" r="1.5" fill="#ffffff" />

        {/* Line 2 (Mid-left sky, x = 240) */}
        <path d="M 240 20 L 240 250" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.45" />
        <polygon points="240,250 244.5,258 240,268 235.5,258" fill="url(#scaffoldCrystalGrad)" opacity="0.9" />
        <circle cx="240" cy="245" r="1.5" fill="#ffffff" />

        {/* Line 3 (Mid sky near orbit, x = 480) */}
        <path d="M 480 30 L 480 195" stroke="#6366f1" strokeWidth="0.75" strokeOpacity="0.4" />
        <polygon points="480,195 484,202 480,210 476,202" fill="url(#scaffoldCrystalGrad)" opacity="0.85" />
        <circle cx="480" cy="191" r="1.5" fill="#ffffff" />

        {/* Line 4 (Right of moon, x = 645 - hanging lantern thread) */}
        <path d="M 645 20 L 645 180" stroke="#6366f1" strokeWidth="0.75" strokeOpacity="0.45" />
        <polygon points="645,180 649,188 645,198 641,188" fill="url(#scaffoldCrystalGrad)" opacity="0.9" />
        <circle cx="645" cy="174" r="1.5" fill="#ffffff" />

        {/* ─── 3. Slender Crescent Moon (Upper Right Sky x=555, y=180) ─── */}
        <g transform="translate(555, 180)">
          {/* Luminous crescent moon body */}
          <path
            d="M -12 -32 C -21 -26 -29 -14 -29 -2 C -29 14 -21 29 -1 32 C 11 34 21 30 29 21 C 15 23 1 17 -8 6 C -17 -5 -16 -19 -12 -32 Z"
            fill="url(#scaffoldMoonGrad)"
            filter="url(#scaffoldMoonGlow)"
          />

          {/* Crisp outer edge highlight stroke */}
          <path
            d="M -12 -32 C -21 -26 -29 -14 -29 -2 C -29 14 -21 29 -1 32 C 11 34 21 30 29 21"
            stroke="#ffffff"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeOpacity="0.85"
          />
        </g>

        {/* ─── 4. Vertical Celestial Axis (Island Center x = 360) ───── */}
        {/* Upper guide section approaching island plateau */}
        <path
          d="M 360 360 L 360 450"
          stroke="#818cf8"
          strokeWidth="0.9"
          strokeOpacity="0.4"
        />
        <circle cx="360" cy="380" r="2" fill="#c7d2fe" />
        <circle cx="360" cy="380" r="4.5" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.35" />

        {/* Lower guide section below island platform */}
        <path
          d="M 360 505 L 360 645"
          stroke="#818cf8"
          strokeWidth="0.9"
          strokeOpacity="0.5"
        />

        {/* Suspended cluster of diamond crystal pendants below island */}
        <polygon
          points="360,638 364,644 360,650 356,644"
          fill="#c7d2fe"
          opacity="0.85"
        />
        <path d="M 360 650 L 360 660" stroke="#818cf8" strokeWidth="0.8" />
        <polygon
          points="360,660 366,669 360,680 354,669"
          fill="url(#scaffoldCrystalGrad)"
        />
        <path d="M 360 680 L 360 686" stroke="#38bdf8" strokeWidth="0.8" />
        <polygon
          points="360,686 363.5,691 360,697 356.5,691"
          fill="#38bdf8"
          opacity="0.9"
        />
        <circle cx="360" cy="670" r="1.5" fill="#ffffff" />

        {/* ─── 5. Lower-Right Orbital Expansion (Arrow 4) ──────────── */}
        {/* Wide outer orbital ellipse sweeping deep into lower-right */}
        <ellipse
          cx="360"
          cy="465"
          rx="440"
          ry="112"
          transform="rotate(9 360 465)"
          stroke="url(#scaffoldOrbitalGrad)"
          strokeWidth="0.9"
          strokeDasharray="6 8"
          strokeOpacity="0.38"
        />

        {/* Far secondary outer sweep arc */}
        <ellipse
          cx="360"
          cy="480"
          rx="480"
          ry="128"
          transform="rotate(15 360 480)"
          stroke="#6366f1"
          strokeWidth="0.75"
          strokeDasharray="5 7"
          strokeOpacity="0.22"
        />

        {/* Diagonal celestial guideline ray into lower-right void */}
        <path
          d="M 360 450 L 690 640"
          stroke="#818cf8"
          strokeWidth="0.8"
          strokeDasharray="4 5"
          strokeOpacity="0.35"
        />
        <circle cx="485" cy="522" r="2" fill="#c7d2fe" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.4" />
        <polygon points="595,585 598.5,588.5 595,592 591.5,588.5" fill="#38bdf8" opacity="0.85" />

        {/* Lower-right suspended hanging lines under orbital arcs */}
        <path d="M 550 535 L 550 635" stroke="#6366f1" strokeWidth="0.75" strokeOpacity="0.4" />
        <polygon points="550,635 553.5,641 550,648 546.5,641" fill="url(#scaffoldCrystalGrad)" opacity="0.85" />
        <circle cx="550,632" r="1.5" fill="#ffffff" />

        <path d="M 630 500 L 630 585" stroke="#4f46e5" strokeWidth="0.75" strokeOpacity="0.35" />
        <polygon points="630,585 633,590 630,596 627,590" fill="url(#scaffoldCrystalGrad)" opacity="0.8" />

        {/* Lower floating strata depth rings */}
        <ellipse
          cx="360"
          cy="560"
          rx="180"
          ry="40"
          stroke="#4f46e5"
          strokeWidth="0.8"
          strokeDasharray="3 4"
          strokeOpacity="0.4"
        />
        <ellipse
          cx="360"
          cy="610"
          rx="120"
          ry="28"
          stroke="#6366f1"
          strokeWidth="0.7"
          strokeDasharray="2 3"
          strokeOpacity="0.3"
        />

        {/* ─── 6. Island Guide Geometry (Core Ellipses) ─────────────── */}
        {/* Primary Tilted Orbital Ring (tilted -5 deg) */}
        <ellipse
          cx="360"
          cy="450"
          rx="345"
          ry="80"
          transform="rotate(-5 360 450)"
          stroke="url(#scaffoldOrbitalGrad)"
          strokeWidth="1"
          strokeOpacity="0.4"
        />

        {/* Lower Depth Ellipse (Dotted / Dashed - island root depth) */}
        <ellipse
          cx="360"
          cy="505"
          rx="220"
          ry="48"
          stroke="#4f46e5"
          strokeWidth="1"
          strokeDasharray="3 4"
          strokeOpacity="0.45"
        />

        {/* Tangent Depth Guide Struts */}
        <path
          d="M 145 456 L 145 505"
          stroke="#6366f1"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          strokeOpacity="0.3"
        />
        <path
          d="M 575 456 L 575 505"
          stroke="#6366f1"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          strokeOpacity="0.3"
        />

        {/* Inner Guideline Ellipse */}
        <ellipse
          cx="360"
          cy="450"
          rx="245"
          ry="54"
          stroke="#818cf8"
          strokeWidth="0.8"
          strokeDasharray="5 5"
          strokeOpacity="0.35"
        />

        {/* ─── 7. Main Island Primary Ring (Top Plateau Boundary) ───── */}
        <ellipse
          cx="360"
          cy="450"
          rx="270"
          ry="62"
          stroke="url(#scaffoldPrimaryRingGrad)"
          strokeWidth="1.2"
        />

        {/* Cardinal Guide Diamond Nodes on Primary Island Ring */}
        <polygon
          points="90,446 94,450 90,454 86,450"
          fill="#38bdf8"
          opacity="0.85"
        />
        <polygon
          points="630,446 634,450 630,454 626,450"
          fill="#38bdf8"
          opacity="0.85"
        />
        <circle cx="360" cy="450" r="2.5" fill="#ffffff" />
        <circle cx="360" cy="450" r="5" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.4" />
      </svg>
    </div>
  );
}

export default SceneScaffolding;
