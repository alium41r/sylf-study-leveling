import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Authentic Solo Leveling System Quest Emblem.
 * Minimalist geometric quest rhombus with tactical cross-aperture.
 * Canonical icon for all Quests across the entire application.
 */
export function QuestEmblemIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Outer System quest rhombus */}
      <polygon points="12 2.5 21 12 12 21.5 3 12" />
      {/* Internal tactical aperture & mission core */}
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * System Tactical Objective Target.
 * Precision concentric crosshairs with cardinal HUD notches.
 * Canonical icon for Objectives & Goals across the entire application.
 * Replaces misplaced lightning bolts and generic concentric circles.
 */
export function ObjectiveTargetIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Outer precision targeting ring */}
      <circle cx="12" cy="12" r="8.5" />
      {/* Inner objective focus ring */}
      <circle cx="12" cy="12" r="4.25" />
      {/* Four cardinal alignment ticks */}
      <line x1="12" y1="1.5" x2="12" y2="4.75" />
      <line x1="12" y1="19.25" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="4.75" y2="12" />
      <line x1="19.25" y1="12" x2="22.5" y2="12" />
      {/* Central bullseye objective focal point */}
      <circle cx="12" cy="12" r="1.3" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * Modern, simplistic Streak Momentum Flame.
 * Razor-sharp stylized flame replacing bulbous generic clip-art.
 * Canonical icon for Streaks, Weekly consistency, and study momentum.
 */
export function StreakFlameIcon({ size = 13, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Clean outer flame contour */}
      <path d="M12 2C13.5 5 15.5 7.5 17 9.8C18.8 12.6 19 14.8 19 16C19 19.5 16 22 12 22C8 22 5 19.5 5 16C5 13.5 6.5 11 8.5 8.5C8.8 10.5 10 11.5 11 11.5C10 8 10.5 5 12 2Z" />
      {/* Minimalist inner core ember */}
      <path d="M12 18C13 18 13.8 17.2 13.8 16.2C13.8 15 13 14 12 13C11 14 10.2 15 10.2 16.2C10.2 17.2 11 18 12 18Z" />
    </svg>
  );
}

/**
 * Modern, simplistic Scholar Level & Rank Insignia.
 * Ascending chevron vector replacing generic AI sparkles.
 */
export function LevelInsigniaIcon({ size = 16, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Upper ascension chevron */}
      <path d="M5 9.5L12 4L19 9.5" />
      {/* Lower tier chevron */}
      <path d="M5 15.5L12 10L19 15.5" />
      {/* Foundation anchor pip */}
      <circle cx="12" cy="19.5" r="0.8" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * Modern, simplistic Daily Quota Checkpoint Gauge.
 * 300° completion track with precision checkpoint check.
 * Replaces generic concentric bullseye for quotas.
 */
export function DailyQuotaIcon({ size = 16, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Open radial track gauge */}
      <path d="M7 19.5A9 9 0 1 1 17 19.5" />
      {/* Precision interior completion check */}
      <path d="M9 12L11.2 14.2L15.5 9.5" />
    </svg>
  );
}

/**
 * Sylvie Telemetry & Insights Scanner Aperture.
 * Holographic scanning lens replacing maritime compass needle.
 */
export function SystemInsightsIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Sleek outer scanning telemetry aperture */}
      <path d="M2.5 12C4.5 7.5 8 5 12 5C16 5 19.5 7.5 21.5 12C19.5 16.5 16 19 12 19C8 19 4.5 16.5 2.5 12Z" />
      {/* Analytical scanning pupil */}
      <circle cx="12" cy="12" r="3.5" />
      {/* Precision telemetry focus dot */}
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * Modern, simplistic Tactical Warning Delta.
 * Crisp alert triangle replacing generic round exclamation point.
 */
export function SystemWarningIcon({ size = 11, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Clean warning delta */}
      <path d="M12 3.5L21.5 20H2.5L12 3.5Z" />
      {/* Alert beam */}
      <line x1="12" y1="9.5" x2="12" y2="14" />
      {/* Alert pip */}
      <circle cx="12" cy="17.2" r="0.8" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * Modern, simplistic System Transmission / Briefing Beacon.
 * Holographic broadcast indicator.
 */
export function SystemBriefingIcon({ size = 16, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Outer transmission wave arc */}
      <path d="M4.9 6.5A10 10 0 0 1 19.1 6.5" />
      {/* Mid transmission wave arc */}
      <path d="M8.2 10A5.5 5.5 0 0 1 15.8 10" />
      {/* Central transmission pulse core */}
      <circle cx="12" cy="15.5" r="2" />
      <path d="M12 17.5v3.5" />
    </svg>
  );
}

/**
 * Modern, simplistic Focus Duration Clock.
 * Clean vector replacing stopwatch emojis.
 */
export function FocusClockIcon({ size = 13, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

/**
 * Modern, simplistic Scholar Grimoire / Subject Discipline Tome.
 * Clean geometric tome replacing generic clip-art books.
 * Canonical icon for Subjects & Academic Disciplines across the application.
 */
export function SubjectGrimoireIcon({ size = 18, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Left tome wing */}
      <path d="M4 19.5V5.5C4 4.4 4.9 3.5 6 3.5H11C11.6 3.5 12 3.9 12 4.5V20.5C12 19.9 11.6 19.5 11 19.5H6C4.9 19.5 4 20.4 4 21.5" />
      {/* Right tome wing */}
      <path d="M20 19.5V5.5C20 4.4 19.1 3.5 18 3.5H13C12.4 3.5 12 3.9 12 4.5V20.5C12 19.9 12.4 19.5 13 19.5H18C19.1 19.5 20 20.4 20 21.5" />
      {/* Central discipline diamond marker */}
      <polygon points="12 6.5 13.5 8.5 12 10.5 10.5 8.5" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}
