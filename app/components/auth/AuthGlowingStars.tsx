import React from "react";
import styles from "./AuthLayout.module.css";

/**
 * AuthGlowingStars: Sparse, restrained glowing sparkles positioned strictly
 * in open celestial dark space, completely avoiding the form area, the center
 * divider lines, and any pre-existing Figma illustration stars.
 */
export function AuthGlowingStars() {
  return (
    <div className={styles.glowingStarsContainer} aria-hidden="true">
      <svg
        viewBox="0 0 1672 941"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.glowingStarsSvg}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="starBloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ─── Far Left Sky (Safely outside form bounding box) ─────── */}
        {/* Star 1: Far top-left high sky */}
        <g transform="translate(140, 110)" className={styles.starPulseA} filter="url(#starBloom)">
          <circle cx="0" cy="0" r="8" fill="#38bdf8" fillOpacity="0.12" />
          <polygon points="0,-5 1,-1 5,0 1,1 0,5 -1,1 -5,0 -1,-1" fill="#ffffff" />
        </g>

        {/* Star 2: Far bottom-left corner */}
        <circle cx="95" cy="850" r="1.8" fill="#c7d2fe" opacity="0.6" className={styles.starPulseB} />

        {/* ─── Upper Sky Margin (High above divider) ────────────────── */}
        {/* Star 3: Quiet high glint */}
        <circle cx="890" cy="115" r="1.6" fill="#818cf8" opacity="0.55" className={styles.starPulseA} />

        {/* ─── Right Celestial Void (Around moon & open sky) ────────── */}
        {/* Star 4: Moon outer celestial aura (below crescent, clear of Figma stars) */}
        <g transform="translate(1390, 310)" className={styles.starPulseA} filter="url(#starBloom)">
          <circle cx="0" cy="0" r="8" fill="#38bdf8" fillOpacity="0.1" />
          <polygon points="0,-5 1,-1 5,0 1,1 0,5 -1,1 -5,0 -1,-1" fill="#c7d2fe" />
        </g>

        {/* Star 5: Far right margin (past standing lantern) */}
        <circle cx="1540" cy="430" r="2" fill="#a5b4fc" opacity="0.65" className={styles.starPulseB} />

        {/* Star 6: Low sky below island crystals */}
        <circle cx="1200" cy="890" r="1.6" fill="#818cf8" opacity="0.5" className={styles.starPulseB} />
      </svg>
    </div>
  );
}

export default AuthGlowingStars;
