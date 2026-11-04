// The seven study modes, once, for every client. Their definitions moved here unchanged from web's Modes screen, and their phase rules from web's
// Focus screen, so a Pomodoro is the same thing everywhere. Pure: no React, no storage, no clock. Time stays in lib/timer-engine.ts, and each client
// applies these answers to its own snapshot with `transitionSnapshot`. Settings live on the device, in `study_mode_config` on web.
import type { TimerPhase } from "./timer-engine";

export type StudyModeId = "freeflow" | "pomodoro" | "5217" | "animedoro" | "deepwork" | "sprint" | "flowtime";

export interface ModeSettingDefinition {
  key: string;
  label: string;
  type: "toggle" | "range" | "select";
  value: boolean | number | string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface StudyModeDefinition {
  id: StudyModeId;
  name: string;
  description: string;
  bestFor: string;
  color: string;
  settings: ModeSettingDefinition[];
}

export const STUDY_MODES: readonly StudyModeDefinition[] = [
  {
    id: "freeflow" as StudyModeId,
    name: "Free Flow",
    description:
      "Open-ended, unconstrained study session. Start when you're ready, pause as needed, and stop whenever you want.",
    bestFor: "Study at your own pace",
    color: "#10b981",
    settings: [],
  },
  {
    id: "pomodoro" as StudyModeId,
    name: "Pomodoro",
    description:
      "Classic time-boxing: focus blocks with short breaks, plus a long break every few rounds.",
    bestFor: "Build momentum",
    color: "#ef4444",
    settings: [
      {
        key: "focusDuration",
        label: "Focus Block Duration",
        type: "range",
        value: 25,
        min: 5,
        max: 90,
        unit: " min",
      },
      {
        key: "shortBreak",
        label: "Short Break Duration",
        type: "range",
        value: 5,
        min: 1,
        max: 15,
        unit: " min",
      },
      {
        key: "longBreak",
        label: "Long Recovery Break",
        type: "range",
        value: 15,
        min: 5,
        max: 30,
        unit: " min",
      },
      {
        key: "sessionsBeforeLong",
        label: "Rounds Before Long Break",
        type: "range",
        value: 4,
        min: 2,
        max: 8,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Break Timers",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Focus Round",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "5217" as StudyModeId,
    name: "52/17 Rhythm",
    description:
      "Longer focus blocks with generous breaks to recover between rounds.",
    bestFor: "Settle into dense material",
    color: "#3b82f6",
    settings: [
      {
        key: "workDuration",
        label: "Work Block",
        type: "range",
        value: 52,
        min: 40,
        max: 70,
        unit: " min",
      },
      {
        key: "breakDuration",
        label: "Recovery Break",
        type: "range",
        value: 17,
        min: 10,
        max: 25,
        unit: " min",
      },
      {
        key: "cycles",
        label: "Target Cycles",
        type: "range",
        value: 3,
        min: 2,
        max: 6,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Recovery Breaks",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Cycle",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "animedoro" as StudyModeId,
    name: "Animedoro",
    description:
      "Long focus blocks rewarded with a guilt-free fun break — watch an episode, scroll, or nap.",
    bestFor: "Focus with a reward",
    color: "#ec4899",
    settings: [
      {
        key: "focusDuration",
        label: "Focus Marathon",
        type: "range",
        value: 45,
        min: 30,
        max: 60,
        unit: " min",
      },
      {
        key: "rewardBreak",
        label: "Episode Reward Break",
        type: "range",
        value: 20,
        min: 10,
        max: 30,
        unit: " min",
      },
      {
        key: "cycles",
        label: "Rounds Planned",
        type: "range",
        value: 3,
        min: 2,
        max: 6,
        unit: "",
      },
      {
        key: "autoStartBreaks",
        label: "Auto-start Reward Break",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartFocus",
        label: "Auto-start Next Work Round",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "deepwork" as StudyModeId,
    name: "Deep Work",
    description:
      "One long, protected marathon block — optionally fullscreen — followed by a proper recovery break.",
    bestFor: "Protect uninterrupted time",
    color: "#a855f7",
    settings: [
      {
        key: "sessionLength",
        label: "Protected Block Length",
        type: "range",
        value: 90,
        min: 30,
        max: 180,
        unit: " min",
      },
      {
        key: "breakLength",
        label: "Post-Session Recovery",
        type: "range",
        value: 20,
        min: 5,
        max: 30,
        unit: " min",
      },
      {
        key: "autoFullscreen",
        label: "Force Fullscreen Mode",
        type: "toggle",
        value: true,
      },
      {
        key: "endChime",
        label: "Session Complete Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "sprint" as StudyModeId,
    name: "Sprint Mode",
    description:
      "Short, intense bursts with micro-rests — cycle after cycle until the set is complete.",
    bestFor: "Quick drills and reviews",
    color: "#f59e0b",
    settings: [
      {
        key: "sprintDuration",
        label: "Sprint Duration",
        type: "range",
        value: 10,
        min: 5,
        max: 25,
        unit: " min",
      },
      {
        key: "restDuration",
        label: "Micro-Rest Duration",
        type: "range",
        value: 2,
        min: 1,
        max: 5,
        unit: " min",
      },
      {
        key: "totalSprints",
        label: "Set Quantity",
        type: "range",
        value: 6,
        min: 3,
        max: 12,
        unit: "",
      },
      {
        key: "intensity",
        label: "Audio Intensity Accent",
        type: "select",
        value: "High",
        options: ["Medium", "High", "Extreme"],
      },
      {
        key: "autoStartRests",
        label: "Auto-trigger Rest Intervals",
        type: "toggle",
        value: true,
      },
      {
        key: "autoStartSprints",
        label: "Auto-trigger Next Sprint",
        type: "toggle",
        value: false,
      },
      {
        key: "endChime",
        label: "Sprint End Chime",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    id: "flowtime" as StudyModeId,
    name: "Flowtime",
    description:
      "No fixed blocks. Focus until you naturally slow down, then take a break sized to how long you lasted.",
    bestFor: "Follow your natural rhythm",
    color: "#06b6d4",
    settings: [
      {
        key: "reminderInterval",
        label: "Check-in Posture Reminder",
        type: "range",
        value: 45,
        min: 15,
        max: 90,
        unit: " min",
      },
      {
        key: "autoScaleBreak",
        label: "Proportional Break Calculation",
        type: "toggle",
        value: true,
      },
      {
        key: "defaultBreak",
        label: "Baseline Break Length",
        type: "range",
        value: 10,
        min: 5,
        max: 20,
        unit: " min",
      },
      {
        key: "maxBreak",
        label: "Ceiling Recovery Break",
        type: "range",
        value: 20,
        min: 10,
        max: 30,
        unit: " min",
      },
      { key: "endChime", label: "Interval Chime", type: "toggle", value: true },
    ],
  },
];

export const isStudyModeId = (value: unknown): value is StudyModeId => STUDY_MODES.some((mode) => mode.id === value);
export const studyMode = (id: StudyModeId) => STUDY_MODES.find((mode) => mode.id === id)!;

/** A mode's settings by key. A missing key reads as each rule's own fallback, exactly as web always has. Start from `defaultModeSettings`. */
export type ModeSettings = Readonly<Record<string, boolean | number | string>>;

export const defaultModeSettings = (id: StudyModeId): Record<string, boolean | number | string> => Object.fromEntries(studyMode(id).settings.map((setting) => [setting.key, setting.value]));

export function modeSetting(_id: StudyModeId, settings: ModeSettings, key: string, fallback: number | boolean | string = 0): number | boolean | string {
  return key in settings ? settings[key] : fallback;
}
const minutes = (id: StudyModeId, settings: ModeSettings, key: string, fallback: number) => Number(modeSetting(id, settings, key, fallback));

/** Where a session in this mode starts: its first focus block, how many rounds it has, and the words a timer shows. Null seconds is open-ended. */
export interface ModeStart { phase: "focus"; seconds: number | null; label: string; round: number; rounds: number }

export function modeStart(id: StudyModeId, settings: ModeSettings): ModeStart {
  const get = (key: string, fallback: number) => minutes(id, settings, key, fallback);
  switch (id) {
    case "pomodoro": { const rounds = get("sessionsBeforeLong", 4); return { phase: "focus", seconds: get("focusDuration", 25) * 60, label: `FOCUS 1/${rounds}`, round: 1, rounds }; }
    case "5217": { const rounds = get("cycles", 3); return { phase: "focus", seconds: get("workDuration", 52) * 60, label: `52/17 FOCUS 1/${rounds}`, round: 1, rounds }; }
    case "animedoro": { const rounds = get("cycles", 3); return { phase: "focus", seconds: get("focusDuration", 45) * 60, label: `ANIMEDORO FOCUS 1/${rounds}`, round: 1, rounds }; }
    case "deepwork": return { phase: "focus", seconds: get("sessionLength", 90) * 60, label: "DEEP WORK", round: 1, rounds: 1 };
    case "sprint": { const rounds = get("totalSprints", 6); return { phase: "focus", seconds: get("sprintDuration", 10) * 60, label: `SPRINT 1/${rounds}`, round: 1, rounds }; }
    case "flowtime": return { phase: "focus", seconds: null, label: "FLOW", round: 1, rounds: 1 };
    case "freeflow":
    default: return { phase: "focus", seconds: null, label: "FREE FLOW", round: 1, rounds: 1 };
  }
}

/**
 * What follows when a phase's countdown ends. `pause` means the next phase waits for the person, because they turned its auto-start off or
 * because an open-ended focus must never resume by itself after a break. `chime` says whether the mode wants a sound. Null means nothing follows:
 * the mode has no countdown here, so a client keeps going as it is.
 */
export interface ModeStep { phase: TimerPhase; seconds: number | null; label: string; round: number; pause: boolean; pauseReason: "manual" | "break-over"; chime: boolean }

export function modeNext(id: StudyModeId, settings: ModeSettings, phase: TimerPhase, round: number, rounds: number): ModeStep | null {
  const get = (key: string, fallback: number) => minutes(id, settings, key, fallback);
  const chime = modeSetting(id, settings, "endChime", true) !== false;
  const waits = (auto: string) => modeSetting(id, settings, auto, true) === false;
  const step = (next: Omit<ModeStep, "chime" | "pauseReason"> & { pauseReason?: ModeStep["pauseReason"] }): ModeStep => ({ pauseReason: "manual", chime, ...next });
  const done = step({ phase: "done", seconds: null, label: "SESSION COMPLETE", round, pause: false });
  switch (id) {
    case "pomodoro":
      if (phase === "focus") return round >= get("sessionsBeforeLong", 4)
        ? step({ phase: "long-break", seconds: get("longBreak", 15) * 60, label: "LONG BREAK", round, pause: waits("autoStartBreaks") })
        : step({ phase: "short-break", seconds: get("shortBreak", 5) * 60, label: "SHORT BREAK", round, pause: waits("autoStartBreaks") });
      { const next = phase === "long-break" ? 1 : round + 1; return step({ phase: "focus", seconds: get("focusDuration", 25) * 60, label: `FOCUS ${next}/${rounds}`, round: next, pause: waits("autoStartFocus") }); }
    case "5217":
      if (phase === "focus") return step({ phase: "short-break", seconds: get("breakDuration", 17) * 60, label: "RECOVERY BREAK", round, pause: waits("autoStartBreaks") });
      return round >= rounds ? done : step({ phase: "focus", seconds: get("workDuration", 52) * 60, label: `52/17 FOCUS ${round + 1}/${rounds}`, round: round + 1, pause: waits("autoStartFocus") });
    case "animedoro":
      if (phase === "focus") return step({ phase: "long-break", seconds: get("rewardBreak", 20) * 60, label: "REWARD BREAK", round, pause: waits("autoStartBreaks") });
      return round >= rounds ? done : step({ phase: "focus", seconds: get("focusDuration", 45) * 60, label: `ANIMEDORO FOCUS ${round + 1}/${rounds}`, round: round + 1, pause: waits("autoStartFocus") });
    case "sprint":
      if (phase === "focus") return round >= rounds ? { ...done, label: "SPRINTS COMPLETE" } : step({ phase: "rest", seconds: get("restDuration", 2) * 60, label: "REST", round, pause: waits("autoStartRests") });
      return step({ phase: "focus", seconds: get("sprintDuration", 10) * 60, label: `SPRINT ${round + 1}/${rounds}`, round: round + 1, pause: waits("autoStartSprints") });
    case "deepwork":
      return phase === "focus" ? step({ phase: "long-break", seconds: get("breakLength", 20) * 60, label: "BREAK", round, pause: false }) : done;
    case "flowtime":
    case "freeflow":
      // A break taken on demand has ended. Open-ended focus never resumes by itself, or the break would bleed into study time.
      return step({ phase: "focus", seconds: null, label: "BREAK OVER", round, pause: true, pauseReason: "break-over" });
    default:
      return null;
  }
}

/** Free Flow and Flowtime take breaks when the person asks. Every other mode's breaks are scheduled. */
export const takesBreaksOnDemand = (id: StudyModeId) => id === "flowtime" || id === "freeflow";

/** How long an on-demand break is, from how long this person has been focusing. Flowtime: about a tenth, within its own bounds. Free Flow: 5 to 20 minutes. */
export function onDemandBreak(id: StudyModeId, settings: ModeSettings, focusSeconds: number): { seconds: number; label: string } {
  const focusMinutes = Math.max(1, Math.round(focusSeconds / 60));
  if (id === "flowtime") {
    const autoScale = modeSetting(id, settings, "autoScaleBreak", true) !== false;
    const scaled = Math.max(5, Math.round(focusMinutes * 0.1));
    const breakMinutes = Math.max(1, Math.min(minutes(id, settings, "maxBreak", 20), autoScale ? scaled : minutes(id, settings, "defaultBreak", 10)));
    return { seconds: breakMinutes * 60, label: "FLOW BREAK" };
  }
  return { seconds: Math.max(5, Math.min(20, Math.round(focusMinutes * 0.1) || 5)) * 60, label: "BREAK" };
}

/** Flowtime's posture check, in minutes, or 0 for none. */
export const reminderMinutes = (id: StudyModeId, settings: ModeSettings) => (id === "flowtime" ? minutes(id, settings, "reminderInterval", 45) : 0);

/** The whole pattern of a mode, for drawing its rhythm before a session begins. Open-ended modes draw one open block. */
export function modePattern(id: StudyModeId, settings: ModeSettings): { phase: TimerPhase; seconds: number | null }[] {
  const start = modeStart(id, settings);
  const pattern: { phase: TimerPhase; seconds: number | null }[] = [{ phase: start.phase, seconds: start.seconds }];
  if (start.seconds === null) return pattern;
  let phase: TimerPhase = start.phase; let round = start.round;
  for (let guard = 0; guard < 40; guard++) {
    const next = modeNext(id, settings, phase, round, start.rounds);
    if (!next || next.phase === "done") break;
    if (id === "pomodoro" && next.phase === "focus" && phase === "long-break") break;
    pattern.push({ phase: next.phase, seconds: next.seconds });
    phase = next.phase; round = next.round;
  }
  return pattern;
}
