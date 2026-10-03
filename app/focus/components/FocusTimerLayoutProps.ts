// ============================================================================
// Focus Timer Layout Presentation Contract (Phase 3)
// ============================================================================
// Shared presentational contract consumed by all category timer layouts.
// Layouts remain dumb and presentational: they receive clean display values
// and callbacks from the single authoritative timer engine in FocusContent.
// ============================================================================
import { TimerPhase } from "@/lib/timer-engine";
import {
  FocusBackgroundClient,
  FocusBackgroundCategoryClient,
} from "@/lib/focus-background-client";

export interface FocusQuestPresentation {
  id: number;
  title: string;
  category?: string | null;
}

export interface FocusTimerLayoutProps {
  // ── Formatted & Derived Display Values ──────────────────────
  formattedDisplayTime: string;
  elapsedSeconds: number;
  breakSeconds: number;
  remainingSeconds: number | null;
  isCountdown: boolean;
  isBreak: boolean;
  phase: TimerPhase;
  phaseColor: string;
  phaseLabel: string;
  modeDisplayName: string;
  subjectName: string;
  questData: FocusQuestPresentation | null;

  // ── Cumulative Totals ───────────────────────────────────────
  initialSubjectSeconds: number;
  initialTotalSeconds: number;

  // ── Session Progress (Pomodoro / Animedoro / Sprint dots) ───
  currentSession: number;
  totalSessions: number;
  showSessionDots: boolean;

  // ── State Indicators ────────────────────────────────────────
  isPaused: boolean;
  pauseReason: "manual" | "break-over";
  isEnding: boolean;
  endError: string | null;
  flowNudge: boolean;

  // ── Action Callbacks ────────────────────────────────────────
  onTogglePause: () => void;
  onEndSession: () => void;
  onCompleteQuest?: () => void;
  onTakeFlowBreak?: () => void;
  onSkipFlowBreak?: () => void;

  // ── Active Atmosphere & Layout Metadata ─────────────────────
  background: FocusBackgroundClient | null;
  category: FocusBackgroundCategoryClient;
  layoutKey: string;
  isPreview?: boolean;

  // ── Formatting Helper ───────────────────────────────────────
  formatTime: (seconds: number) => string;
}
