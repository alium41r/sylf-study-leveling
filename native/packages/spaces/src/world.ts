// World's flow, with or without a game. Gameplay owns the screen, so the global switcher is only offered at "entry". The World
// controller (world/controller.ts) drives these states from a WorldHost, and a host never sets them itself.
export type WorldPhase = "entry" | "entering" | "playing" | "paused" | "saving" | "saved";
export type WorldEvent = "enter" | "ready" | "pause" | "resume" | "leave" | "saved" | "failed" | "finish";

const TRANSITIONS: Record<WorldPhase, Partial<Record<WorldEvent, WorldPhase>>> = {
  entry: { enter: "entering" },
  entering: { ready: "playing", failed: "entry" },
  playing: { pause: "paused" },
  paused: { resume: "playing", leave: "saving" },
  saving: { saved: "saved", failed: "paused" },
  saved: { finish: "entry" },
};

/** Events that do not apply to the current phase change nothing, so a stale timer or double tap is harmless. */
export function nextWorldPhase(phase: WorldPhase, event: WorldEvent): WorldPhase {
  return TRANSITIONS[phase][event] ?? phase;
}

/** The game's own flow takes priority over global navigation everywhere past the entry environment. */
export const worldHoldsNavigation = (phase: WorldPhase) => phase !== "entry";
