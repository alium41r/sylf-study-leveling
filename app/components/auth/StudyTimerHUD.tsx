import React from "react";
import styles from "./StudyIsland.module.css";

/**
 * StudyTimerHUD: Decorative static HUD card hovering above the floating island.
 * Displays '✦ STUDY TIME', '00:16:43', and '🧭 FOCUS MODE'.
 */
export function StudyTimerHUD({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.timerCard} ${className}`} aria-label="Study Timer HUD">
      {/* Header Label */}
      <div className={styles.timerHeader}>
        <span className={styles.timerSparkle}>✦</span>
        <span>STUDY TIME</span>
      </div>

      {/* Static Clock Display */}
      <div className={styles.timerClock}>00:16:43</div>

      {/* Focus Mode Pill */}
      <div className={styles.focusModePill}>
        <svg
          className={styles.focusCompass}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
        </svg>
        <span>FOCUS MODE</span>
      </div>
    </div>
  );
}
export default StudyTimerHUD;
