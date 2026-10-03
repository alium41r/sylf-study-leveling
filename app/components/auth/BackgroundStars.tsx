import React from "react";
import styles from "./AuthLayout.module.css";

/**
 * BackgroundStars: Thoughtfully positioned 4-point stars, delicate sparkles,
 * and ambient cosmic radial glows that balance the composition across all four quadrants.
 * 
 * Specifically fills:
 * - Arrow 1 (Top-Left under header)
 * - Arrow 2 (Top-Center void above/between form and divider)
 * - Arrow 3 (Upper-Right celestial sky)
 * - Arrow 4 (Lower-Right space below island platform)
 */
export function BackgroundStars() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0"
      aria-hidden="true"
    >
      {/* ─── Ambient Cosmic Radial Glows ────────────────────────── */}
      <div className={styles.ambientGlowLeft} />
      <div className={styles.ambientGlowRight} />

      {/* ─── Zone 1: Top-Left (Arrow 1) ─────────────────────────── */}
      <span
        className={styles.star}
        style={{ top: "8%", left: "15%", animationDelay: "0s" }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "16%", left: "11%", animationDelay: "1.6s" }}
      >
        <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#c7d2fe" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "11%", left: "25%", animationDelay: "2.5s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#a5b4fc" />
        </svg>
      </span>

      {/* ─── Zone 2: Top-Center Sky & Divider Crown (Arrow 2) ───── */}
      <span
        className={styles.star}
        style={{ top: "6%", left: "44%", animationDelay: "1.1s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#ffffff" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "14%", left: "38%", animationDelay: "2.1s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "21%", left: "47%", animationDelay: "0.5s" }}
      >
        <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#c7d2fe" />
        </svg>
      </span>

      {/* Mid/Lower Left Region */}
      <span
        className={styles.star}
        style={{ top: "42%", left: "7%", animationDelay: "1.9s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#818cf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "78%", left: "9%", animationDelay: "2.7s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>

      {/* ─── Zone 3: Upper-Right Celestial Sky (Arrow 3) ────────── */}
      <span
        className={styles.star}
        style={{ top: "7%", right: "26%", animationDelay: "0.7s" }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "15%", right: "17%", animationDelay: "2.3s" }}
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#ffffff" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "23%", right: "6%", animationDelay: "1.4s" }}
      >
        <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#a5b4fc" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "31%", right: "15%", animationDelay: "0.2s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#c7d2fe" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "37%", right: "25%", animationDelay: "1.8s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>

      {/* ─── Zone 4: Lower-Right Scaffolding Area (Arrow 4) ─────── */}
      <span
        className={styles.star}
        style={{ top: "67%", right: "17%", animationDelay: "1.5s" }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "75%", right: "26%", animationDelay: "2.6s" }}
      >
        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#c7d2fe" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "83%", right: "11%", animationDelay: "0.9s" }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#38bdf8" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "89%", right: "21%", animationDelay: "2.1s" }}
      >
        <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#ffffff" />
        </svg>
      </span>
      <span
        className={styles.star}
        style={{ top: "93%", right: "31%", animationDelay: "1.3s" }}
      >
        <svg width="7" height="7" viewBox="0 0 14 14" fill="none">
          <polygon points="7,0 8.2,5.2 14,7 8.2,8.8 7,14 5.8,8.8 0,7 5.8,5.2" fill="#a5b4fc" />
        </svg>
      </span>

      {/* Subtle circular ambient dust motes */}
      <div className="absolute top-[9%] left-[21%] w-1 h-1 rounded-full bg-cyan-400/45" />
      <div className="absolute top-[18%] left-[42%] w-1.5 h-1.5 rounded-full bg-indigo-300/35" />
      <div className="absolute top-[65%] left-[38%] w-1.5 h-1.5 rounded-full bg-indigo-300/30" />
      <div className="absolute top-[12%] right-[12%] w-1 h-1 rounded-full bg-cyan-300/40" />
      <div className="absolute top-[48%] right-[32%] w-1 h-1 rounded-full bg-cyan-300/35" />
      <div className="absolute top-[78%] right-[16%] w-1.5 h-1.5 rounded-full bg-cyan-400/40" />
      <div className="absolute top-[85%] right-[27%] w-1 h-1 rounded-full bg-indigo-300/35" />
    </div>
  );
}

export default BackgroundStars;
