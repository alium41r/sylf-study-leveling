/** Presentation only. Product screens remain the authority for all gameplay. */
export const EXPRESSIONS = [
  "NEUTRAL",
  "HAPPY",
  "EXCITED",
  "CURIOUS",
  "THINKING",
  "SLEEPY",
] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const ACTIONS = [
  "FLOATING",
  "HELLO",
  "READING",
  "USING_TABLET",
  "TIMER_MODE",
  "CELEBRATING",
] as const;
export type Action = (typeof ACTIONS)[number];
export const PRESENTATIONS = {
  IDLE: { expression: "NEUTRAL", action: "FLOATING" },
  GREETING: { expression: "NEUTRAL", action: "HELLO" },
  FOCUSING: { expression: "THINKING", action: "TIMER_MODE" },
  READING: { expression: "THINKING", action: "READING" },
  PLANNING: { expression: "CURIOUS", action: "USING_TABLET" },
  AI_THINKING: { expression: "THINKING", action: "USING_TABLET" },
  DISCOVERING: { expression: "CURIOUS", action: "FLOATING" },
  QUEST_COMPLETE: { expression: "HAPPY", action: "FLOATING" },
  TIMER_COMPLETE: { expression: "EXCITED", action: "CELEBRATING" },
  LEVEL_UP: { expression: "EXCITED", action: "CELEBRATING" },
  REST: { expression: "SLEEPY", action: "FLOATING" },
  ERROR: { expression: "CURIOUS", action: "FLOATING" },
} as const satisfies Record<string, { expression: Expression; action: Action }>;
export type CompanionState = keyof typeof PRESENTATIONS;
export const REACTIONS = {
  GREETING: { duration: 2400, priority: 0 },
  QUEST_COMPLETE: { duration: 2200, priority: 1 },
  TIMER_COMPLETE: { duration: 2800, priority: 2 },
  LEVEL_UP: { duration: 3200, priority: 3 },
} as const;
export type ReactionState = keyof typeof REACTIONS;
export type CompanionReaction = { id: string | number; type: ReactionState };
export const COMPANION_SIZES = {
  MINI: 32,
  SMALL: 48,
  MEDIUM: 96,
  LARGE: 180,
  HERO: 320,
} as const;
export type CompanionSize = keyof typeof COMPANION_SIZES | number;
export function normalizeState(state?: string): CompanionState {
  return state && Object.hasOwn(PRESENTATIONS, state)
    ? (state as CompanionState)
    : "IDLE";
}
export function isReaction(state: CompanionState): state is ReactionState {
  return Object.hasOwn(REACTIONS, state);
}
export function presentationFor(state?: string) {
  return PRESENTATIONS[normalizeState(state)];
}

/** Original palette, sampled visually from the supplied sheet. No palette preference. */
export const ORIGINAL = {
  ivory: "#fff7e8",
  cream: "#f5e9df",
  fold: "#d9cddb",
  foldDeep: "#b1acd1",
  face: "#20243f",
  faceLight: "#353a60",
  body: "#272c4c",
  bodyLight: "#42486e",
  periwinkle: "#8d97f3",
  ribbon: "#b3b6ff",
  lavender: "#d2c7ec",
  blue: "#c8dcff",
  gold: "#f1b58c",
  goldLight: "#ffe4b6",
  goldDeep: "#bc896f",
  eye: "#f7fcff",
  eyeGlow: "#b7c2ff",
} as const;
