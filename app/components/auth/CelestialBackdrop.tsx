import React from "react";
import styles from "./AuthLayout.module.css";

/**
 * CelestialBackdrop: Lightweight background atmosphere with scattered tiny stars
 * and subtle outer-edge botanical flourishes. Keeps the right side open and spacious.
 */
export function CelestialBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0" aria-hidden="true">
      {/* ─── Ambient Radial Glows ───────────────────────────────── */}
      <div className={styles.ambientGlowLeft} />
      <div className={styles.ambientGlowRight} />

      {/* ─── Edge Botanical SVG (Left outer frame) ─────────────── */}
      <svg
        className="absolute left-0 bottom-0 h-[480px] w-[140px] opacity-25 lg:opacity-40"
        viewBox="0 0 140 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M -20 480 Q 30 350 15 220 Q 5 120 45 40"
          stroke="#4f46e5"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
        {/* Branching leaf clusters */}
        <path
          d="M 15 220 C 35 205 50 215 52 230 C 36 235 22 230 15 220 Z"
          fill="#6366f1"
          fillOpacity="0.35"
        />
        <path
          d="M 22 290 C 44 280 58 290 60 305 C 44 310 30 304 22 290 Z"
          fill="#818cf8"
          fillOpacity="0.3"
        />
        <path
          d="M 10 370 C 32 360 48 370 50 385 C 34 390 18 384 10 370 Z"
          fill="#4f46e5"
          fillOpacity="0.35"
        />
        <path
          d="M 32 150 C 50 138 65 146 66 160 C 52 165 38 160 32 150 Z"
          fill="#818cf8"
          fillOpacity="0.35"
        />
      </svg>

      {/* ─── Edge Botanical SVG (Right outer frame) ────────────── */}
      <svg
        className="absolute right-0 bottom-0 h-[480px] w-[140px] opacity-25 lg:opacity-40"
        viewBox="0 0 140 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 160 480 Q 110 350 125 220 Q 135 120 95 40"
          stroke="#4f46e5"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
        <path
          d="M 125 220 C 105 205 90 215 88 230 C 104 235 118 230 125 220 Z"
          fill="#6366f1"
          fillOpacity="0.35"
        />
        <path
          d="M 118 290 C 96 280 82 290 80 305 C 96 310 110 304 118 290 Z"
          fill="#818cf8"
          fillOpacity="0.3"
        />
        <path
          d="M 130 370 C 108 360 92 370 90 385 C 106 390 122 384 130 370 Z"
          fill="#4f46e5"
          fillOpacity="0.35"
        />
      </svg>

      {/* ─── Scattered Sparkle Stars & Dust Motes ───────────────── */}
      {/* Star 1 - Upper left */}
      <span
        className={styles.star}
        style={{ top: "14%", left: "8%", animationDelay: "0s" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#38bdf8" />
        </svg>
      </span>

      {/* Star 2 - Left mid-high */}
      <span
        className={styles.star}
        style={{ top: "28%", left: "44%", animationDelay: "1.2s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#a5b4fc" />
        </svg>
      </span>

      {/* Star 3 - Lower left */}
      <span
        className={styles.star}
        style={{ top: "78%", left: "12%", animationDelay: "2.4s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#e0e7ff" />
        </svg>
      </span>

      {/* Star 4 - Upper right (near future moon position) */}
      <span
        className={styles.star}
        style={{ top: "12%", right: "14%", animationDelay: "0.8s" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#38bdf8" />
        </svg>
      </span>

      {/* Star 5 - Right mid */}
      <span
        className={styles.star}
        style={{ top: "35%", right: "22%", animationDelay: "2.1s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#a5b4fc" />
        </svg>
      </span>

      {/* Star 6 - Center top */}
      <span
        className={styles.star}
        style={{ top: "8%", left: "51%", animationDelay: "1.7s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#e0e7ff" />
        </svg>
      </span>

      {/* Star 7 - Lower right */}
      <span
        className={styles.star}
        style={{ top: "82%", right: "10%", animationDelay: "2.8s" }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.5,5.5 14,7 8.5,8.5 7,14 5.5,8.5 0,7 5.5,5.5" fill="#38bdf8" />
        </svg>
      </span>

      {/* Small circular ambient dust motes */}
      <div className="absolute top-[20%] left-[22%] w-1 h-1 rounded-full bg-cyan-400/40" />
      <div className="absolute top-[65%] left-[38%] w-1.5 h-1.5 rounded-full bg-indigo-300/30" />
      <div className="absolute top-[48%] right-[32%] w-1 h-1 rounded-full bg-cyan-300/35" />
      <div className="absolute top-[75%] right-[25%] w-1 h-1 rounded-full bg-purple-300/30" />
    </div>
  );
}
export default CelestialBackdrop;
