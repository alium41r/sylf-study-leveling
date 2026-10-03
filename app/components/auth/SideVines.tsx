import React from "react";
import styles from "./AuthLayout.module.css";

/**
 * SideVines: Elegant fantasy vine linework anchored to the left and right
 * viewport edges, now expanded to gracefully frame the upper-left, upper-right,
 * and lower-right zones with thin curving stems, hanging crystals, and minimal buds.
 */
export function SideVines() {
  return (
    <>
      {/* ─── Left Edge Vines ────────────────────────────────────────── */}
      <div className={styles.leftVineWrapper} aria-hidden="true">
        <svg
          viewBox="0 0 240 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="leftStemGrad" x1="0%" y1="100%" x2="70%" y2="0%">
              <stop offset="0%" stopColor="#4338ca" stopOpacity="0.65" />
              <stop offset="35%" stopColor="#6366f1" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#818cf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
            </linearGradient>

            <linearGradient id="leftUpperTendrilGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
            </linearGradient>

            <linearGradient id="vineCrystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#c7d2fe" />
              <stop offset="75%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
          </defs>

          {/* 1. Primary tall curving stem rising from bottom-left */}
          <path
            d="M -10 900 Q 75 720 42 510 Q 15 330 68 180 Q 95 100 35 15"
            stroke="url(#leftStemGrad)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* 2. Secondary branching stem */}
          <path
            d="M -5 760 Q 110 610 58 420 Q 22 280 50 140"
            stroke="url(#leftStemGrad)"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeOpacity="0.65"
          />

          {/* 3. Lower sweeping tendril near bottom */}
          <path
            d="M -10 840 Q 115 765 140 670 Q 150 630 135 600"
            stroke="#6366f1"
            strokeWidth="0.8"
            strokeOpacity="0.45"
            strokeLinecap="round"
          />
          <circle cx="135" cy="600" r="2" fill="#818cf8" fillOpacity="0.75" />

          {/* 4. UPPER-LEFT EXPANSION (Arrow 1): Graceful tendrils sweeping inward beneath logo */}
          <path
            d="M -10 40 Q 70 50 130 90 Q 185 130 160 185"
            stroke="url(#leftUpperTendrilGrad)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M 130 90 Q 180 85 210 120 L 210 132"
            stroke="#818cf8"
            strokeWidth="0.75"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
          {/* Hanging diamond pendant on upper-left tendril */}
          <polygon
            points="210,132 213.5,138 210,145 206.5,138"
            fill="url(#vineCrystalGrad)"
            opacity="0.85"
          />
          <circle cx="210" cy="130" r="1.5" fill="#ffffff" />

          {/* Gentle secondary arch into top-left space */}
          <path
            d="M -5 130 Q 80 160 115 230 Q 130 270 95 310"
            stroke="#6366f1"
            strokeWidth="0.8"
            strokeOpacity="0.4"
            strokeLinecap="round"
          />

          {/* Tiny minimal seed/bud accents (no foliage!) */}
          <ellipse cx="60" cy="648" rx="2" ry="4.5" transform="rotate(25 60 648)" fill="#818cf8" fillOpacity="0.45" />
          <ellipse cx="38" cy="512" rx="1.8" ry="4" transform="rotate(-15 38 512)" fill="#a5b4fc" fillOpacity="0.4" />
          <ellipse cx="25" cy="382" rx="1.8" ry="4.2" transform="rotate(30 25 382)" fill="#818cf8" fillOpacity="0.4" />
          <ellipse cx="48" cy="262" rx="1.6" ry="3.8" transform="rotate(-20 48 262)" fill="#a5b4fc" fillOpacity="0.35" />
          <ellipse cx="75" cy="142" rx="1.5" ry="3.5" transform="rotate(35 75 142)" fill="#818cf8" fillOpacity="0.35" />
          <ellipse cx="150" cy="105" rx="1.5" ry="3.5" transform="rotate(-25 150 105)" fill="#c7d2fe" fillOpacity="0.45" />
        </svg>
      </div>

      {/* ─── Right Edge Vines ───────────────────────────────────────── */}
      <div className={styles.rightVineWrapper} aria-hidden="true">
        <svg
          viewBox="0 0 240 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="rightStemGrad" x1="100%" y1="100%" x2="30%" y2="0%">
              <stop offset="0%" stopColor="#4338ca" stopOpacity="0.65" />
              <stop offset="35%" stopColor="#6366f1" stopOpacity="0.5" />
              <stop offset="70%" stopColor="#818cf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
            </linearGradient>

            <linearGradient id="rightUpperTendrilGrad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* 1. Primary tall curving stem rising along right edge */}
          <path
            d="M 250 900 Q 165 720 198 510 Q 225 330 172 180 Q 145 100 205 15"
            stroke="url(#rightStemGrad)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* 2. Secondary branching stem */}
          <path
            d="M 245 760 Q 130 610 182 420 Q 218 280 190 140"
            stroke="url(#rightStemGrad)"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeOpacity="0.65"
          />

          {/* 3. LOWER-RIGHT EXPANSION (Arrow 4): Sweeping inward into the lower-right void */}
          <path
            d="M 250 840 Q 125 765 100 670 Q 90 610 115 560"
            stroke="#6366f1"
            strokeWidth="0.85"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
          {/* Branching loop extending deeper into lower-right */}
          <path
            d="M 100 670 Q 60 700 75 750 L 75 765"
            stroke="#818cf8"
            strokeWidth="0.75"
            strokeOpacity="0.45"
          />
          <polygon
            points="75,765 78.5,771 75,778 71.5,771"
            fill="url(#vineCrystalGrad)"
            opacity="0.85"
          />
          <circle cx="75" cy="762" r="1.5" fill="#ffffff" />

          {/* 4. UPPER-RIGHT EXPANSION (Arrow 3): Sweeping tendril curving down into upper-right sky */}
          <path
            d="M 250 40 Q 170 50 110 90 Q 55 130 80 185"
            stroke="url(#rightUpperTendrilGrad)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M 110 90 Q 60 85 30 120 L 30 132"
            stroke="#818cf8"
            strokeWidth="0.75"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
          {/* Hanging diamond pendant on upper-right tendril */}
          <polygon
            points="30,132 33.5,138 30,145 26.5,138"
            fill="url(#vineCrystalGrad)"
            opacity="0.85"
          />
          <circle cx="30" cy="130" r="1.5" fill="#ffffff" />

          {/* Gentle secondary arch into upper-right space */}
          <path
            d="M 245 130 Q 160 160 125 230 Q 110 270 145 310"
            stroke="#6366f1"
            strokeWidth="0.8"
            strokeOpacity="0.4"
            strokeLinecap="round"
          />

          {/* Tiny minimal seed/bud accents */}
          <ellipse cx="180" cy="648" rx="2" ry="4.5" transform="rotate(-25 180 648)" fill="#818cf8" fillOpacity="0.45" />
          <ellipse cx="202" cy="512" rx="1.8" ry="4" transform="rotate(15 202 512)" fill="#a5b4fc" fillOpacity="0.4" />
          <ellipse cx="215" cy="382" rx="1.8" ry="4.2" transform="rotate(-30 215 382)" fill="#818cf8" fillOpacity="0.4" />
          <ellipse cx="192" cy="262" rx="1.6" ry="3.8" transform="rotate(20 192 262)" fill="#a5b4fc" fillOpacity="0.35" />
          <ellipse cx="165" cy="142" rx="1.5" ry="3.5" transform="rotate(-35 165 142)" fill="#818cf8" fillOpacity="0.35" />
          <ellipse cx="90" cy="105" rx="1.5" ry="3.5" transform="rotate(25 90 105)" fill="#c7d2fe" fillOpacity="0.45" />
        </svg>
      </div>
    </>
  );
}

export default SideVines;
