// ============================================================================
// Focus Timer Dock Presentation Contract
// ============================================================================
// Small, pure presentational contract consumed by all reusable timer dock
// primitives (ClassicTimerDock, AnimeTimerDock, LandscapeTimerDock, FantasyTimerDock).
//
// Key Architectural Boundaries:
//   1. Engine Agnostic: Does NOT depend on Solo Pomodoro, Flowtime, quests,
//      or Focus Party realtime mechanics.
//   2. Solo Adaptation: Solo layouts adapt full timer state into this contract.
//   3. Party Adaptation: FocusPartyTimerPresentationAdapter adapts Party state
//      into this contract.
//   4. Density Aware: density="default" | "compact" controls size/density
//      without embedding external positioning logic inside the dock.
// ============================================================================

export type TimerActionIcon =
  | "play"
  | "pause"
  | "loader"
  | "coffee"
  | "fast-forward"
  | "square"
  | "check";

export interface PrimaryTimerAction {
  label: string;
  icon?: TimerActionIcon;
  onClick: () => void | Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  testId?: string;
}

export interface SecondaryTimerAction {
  label: string;
  icon?: TimerActionIcon;
  onClick: () => void | Promise<void>;
  variant?: "break" | "skip" | "end" | "complete" | "default";
  isLoading?: boolean;
  disabled?: boolean;
  testId?: string;
}

export interface FocusTimerDockProps {
  // Primary Time Display
  formattedDisplayTime: string;

  // Semantic Status & Accent Colors
  phaseColor: string;
  phaseLabel: string;
  isPaused?: boolean;
  pauseReason?: string;
  isFocusing?: boolean;
  isNotStarted?: boolean;

  // Optional Context / Subject / Quest
  title?: string | null;
  subtitle?: string | null;

  // Optional Telemetry / Sub-stats (omitted cleanly if null/undefined)
  elapsedFormatted?: string | null;
  breakFormatted?: string | null;
  dailyTotalFormatted?: string | null;
  subjectTotalFormatted?: string | null;

  // Progress (for circular ring or linear progress bar)
  progressPercent?: number; // 0 - 100
  activeSecond?: number; // 0 - 59 (used for ticks in celestial dial)
  isCountdown?: boolean;

  // Optional Session Dots (Solo Pomodoro)
  sessionDots?: {
    current: number;
    total: number;
  } | null;

  // Optional Stretch Nudge (Solo Flowtime)
  stretchNudge?: {
    message: string;
    onAction: () => void;
  } | null;

  // Actions
  primaryAction?: PrimaryTimerAction;
  secondaryActions?: SecondaryTimerAction[];

  // Density & Layout Context
  density?: "default" | "compact";
  context?: "solo" | "party";

  // Test ID hook
  testId?: string;
}
