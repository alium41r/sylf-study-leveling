/**
 * ============================================================================
 * SYLF MOTION FOUNDATION — Standardized Motion Tokens & Variants
 * ============================================================================
 * A centralized, lightweight motion foundation for Sylf.
 *
 * Design Language: "High-end game UI + modern productivity app"
 *  - Fast, confident, intentional, low floatiness
 *  - Physical transforms + opacity only (GPU accelerated)
 *  - Smooth springs with calibrated damping to prevent bouncing
 *  - Full prefers-reduced-motion accessibility support
 * ============================================================================
 */

import type { Transition, Variants } from "framer-motion";

/* ─── Easing Curves ──────────────────────────────────────────────────────── */

export const MOTION_EASE = {
  /** The Sylf Standard: Crisp acceleration, smooth confident settlement */
  sylf: [0.16, 1, 0.3, 1] as const,
  /** Fast out for responsive entry */
  outQuad: [0.25, 0.46, 0.45, 0.94] as const,
  /** Smooth crossfade ease */
  inOut: [0.4, 0, 0.2, 1] as const,
  /** Swift acceleration for clean exits */
  exit: [0.4, 0, 1, 1] as const,
};

/* ─── Standard Durations (seconds) ───────────────────────────────────────── */

export const MOTION_DURATION = {
  instant: 0,
  micro: 0.12,
  fast: 0.18,
  normal: 0.24,
  moderate: 0.32,
  slow: 0.45,
};

/* ─── Standard Spring Transitions ────────────────────────────────────────── */

export const MOTION_SPRING = {
  /** Snappy feedback for buttons, chips, tabs, micro-interactions */
  snappy: {
    type: "spring" as const,
    stiffness: 440,
    damping: 32,
    mass: 0.75,
  },
  /** Standard dialog / popover / modal emergence */
  modal: {
    type: "spring" as const,
    stiffness: 380,
    damping: 28,
    mass: 0.85,
  },
  /** Smooth sliding drawers (sidebars, bottom sheets) */
  drawer: {
    type: "spring" as const,
    stiffness: 340,
    damping: 32,
    mass: 0.9,
  },
  /** Quick dropdown popovers and tooltips */
  popover: {
    type: "spring" as const,
    stiffness: 420,
    damping: 29,
    mass: 0.7,
  },
  /** Bouncy highlight indicator (e.g. active tab pill) */
  pill: {
    type: "spring" as const,
    stiffness: 460,
    damping: 34,
    mass: 0.7,
  },
} satisfies Record<string, Transition>;

/* ─── Standard Linear / Tween Transitions ────────────────────────────────── */

export const MOTION_TWEEN = {
  fade: {
    duration: MOTION_DURATION.fast,
    ease: "easeOut",
  },
  backdrop: {
    duration: MOTION_DURATION.fast,
    ease: "easeOut",
  },
  crossfade: {
    duration: MOTION_DURATION.normal,
    ease: MOTION_EASE.sylf,
  },
} satisfies Record<string, Transition>;

/* ─── Shared Variants ────────────────────────────────────────────────────── */

/** Modal backdrop fade */
export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  closed: { opacity: 0 },
  animate: { opacity: 1 },
  open: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: "easeOut" } },
};

/** Center modal dialog (scale + y slide from correct visual plane) */
export const modalDialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: MOTION_SPRING.modal },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: MOTION_DURATION.micro, ease: "easeIn" },
  },
};

/** Bottom sheet dialog for mobile */
export const bottomSheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: MOTION_SPRING.drawer },
  exit: { y: "100%", transition: { duration: MOTION_DURATION.fast, ease: "easeIn" } },
};

/** Left-side off-canvas navigation drawer */
export const leftDrawerVariants: Variants = {
  initial: { x: "-100%", opacity: 0.7 },
  animate: { x: 0, opacity: 1, transition: MOTION_SPRING.drawer },
  exit: {
    x: "-100%",
    opacity: 0.7,
    transition: { duration: MOTION_DURATION.fast, ease: "easeIn" },
  },
};

/** Dropdown popover menu */
export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: MOTION_SPRING.popover },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -6,
    transition: { duration: MOTION_DURATION.micro, ease: "easeIn" },
  },
};

/** Centered top toast feedback (with safe x: -50% centering invariance) */
export const topToastVariants: Variants = {
  initial: { opacity: 0, y: -20, x: "-50%", scale: 0.96 },
  hidden: { opacity: 0, y: -20, x: "-50%", scale: 0.96 },
  animate: { opacity: 1, y: 0, x: "-50%", scale: 1, transition: MOTION_SPRING.modal },
  visible: { opacity: 1, y: 0, x: "-50%", scale: 1, transition: MOTION_SPRING.modal },
  exit: {
    opacity: 0,
    y: -16,
    x: "-50%",
    scale: 0.96,
    transition: { duration: MOTION_DURATION.fast, ease: "easeIn" },
  },
};

/** Corner toast (e.g. SessionInviteToast in bottom-right) */
export const cornerToastVariants: Variants = {
  initial: { opacity: 0, x: 40, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1, transition: MOTION_SPRING.modal },
  exit: {
    opacity: 0,
    x: 40,
    scale: 0.95,
    transition: { duration: MOTION_DURATION.fast, ease: "easeIn" },
  },
};

/** Tab content container crossfade */
export const tabContentVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.normal, ease: MOTION_EASE.sylf } },
  exit: { opacity: 0, y: -6, transition: { duration: MOTION_DURATION.micro, ease: "easeIn" } },
};

/** Simple clean fade */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: MOTION_DURATION.fast } },
  exit: { opacity: 0, transition: { duration: MOTION_DURATION.micro } },
};

/** Stagger list container helper */
export function createStaggerContainer(staggerSeconds: number = 0.035, delayChildren: number = 0): Variants {
  return {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerSeconds,
        delayChildren,
      },
    },
  };
}

/** Stagger child item */
export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.normal, ease: MOTION_EASE.sylf } },
  exit: { opacity: 0, y: 4, transition: { duration: MOTION_DURATION.micro } },
};

/* ─── Micro-Interaction Helpers ──────────────────────────────────────────── */

export const tapPress = {
  scale: 0.97,
  transition: { duration: 0.08 },
};

export const hoverSubtle = {
  scale: 1.015,
  transition: { duration: 0.15 },
};
