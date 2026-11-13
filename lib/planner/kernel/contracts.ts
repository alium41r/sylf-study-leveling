// The planning kernel's contracts: the work model the language model edits, the snapshot of the student's world that the solver reads, and the blocks the
// solver writes. Pure types and constants, shared by the server and Sylf Native through @sylf/shared. Every value is plain JSON so a plan version can
// store it unchanged and a device can re-solve from exactly what the server saw.

export const KERNEL_VERSION = "kernel-1.3.0";
export const SOLVER_VERSION = "solver-1.2.0";
export const STRATEGY_VERSION = "strategy-1.1.0";
/** The study-path compiler that turns a syllabus into sessions (curriculum.ts). */
export const PATH_VERSION = "path-2.1.0";

export type DateKey = string;
export type ItemKind = "learn" | "practice" | "review" | "produce" | "admin";
export const ITEM_KINDS: readonly ItemKind[] = ["learn", "practice", "review", "produce", "admin"];
export type Method =
  | "diagnostic" | "learn" | "worked_examples" | "retrieval" | "spaced_review" | "problem_solving" | "timed_paper" | "error_log"
  | "reading" | "research" | "outline" | "drafting" | "revising" | "final_check" | "practice" | "notes" | "admin";
export const METHODS: readonly Method[] = [
  "diagnostic", "learn", "worked_examples", "retrieval", "spaced_review", "problem_solving", "timed_paper", "error_log",
  "reading", "research", "outline", "drafting", "revising", "final_check", "practice", "notes", "admin",
];
export type GoalType = "exam" | "essay" | "project" | "problem_set" | "reading" | "skill" | "general";
export const GOAL_TYPES: readonly GoalType[] = ["exam", "essay", "project", "problem_set", "reading", "skill", "general"];
export type Priority = 1 | 2 | 3;
export type Load = 1 | 2 | 3;
export type Source = "model" | "student" | "template" | "import" | "system";

export interface KGoal {
  key: string;
  /** Sylf `Goal.id` once the goal exists in Sylf. */
  ref: number | null;
  title: string;
  type: GoalType;
  due: DateKey | null;
  priority: Priority;
  subject: number | null;
  status: "active" | "done" | "dropped";
  /** Built on assumptions the student has not confirmed. */
  draft: boolean;
  source: Source;
  /** What the goal covers, topic by topic. Exams planned from a syllabus carry one; its sessions are compiled from it (curriculum.ts). */
  syllabus?: Syllabus | null;
  /** How the plan is shaped (curriculum.ts). Absent on goals made before presets, which plan as their type implies. */
  preset?: PlanPreset | null;
  /** The student's own pacing: minutes a day, or days a week and minutes a session for open-ended practice, and a start date. */
  pace?: Pace | null;
  /** What the student is aiming for, in their words: "A*", "hold a 10-minute conversation". Shown, and given to the model. */
  target?: string | null;
  /** Which plan the student is asked "Is this plan right?" about: a re-check starts a new round. */
  review?: { round: number } | null;
}

/** Which official syllabus an outline is: what makes two students' requests the same syllabus. */
export interface SyllabusIdentity {
  board: string | null;
  qualification: string | null;
  subject: string | null;
  code: string | null;
  component: string | null;
  /** The edition the outline follows, e.g. "2025–2027". */
  edition: string | null;
}

/** How a plan is shaped. `auto` is a request, never stored: the model (or a keyword rule) picks one of the others. */
export type PlanPreset = "exam" | "course" | "mastery" | "skill" | "assignment" | "reading";
export const PLAN_PRESETS: readonly PlanPreset[] = ["exam", "course", "mastery", "skill", "assignment", "reading"];
export interface Pace {
  minutesPerDay?: number | null;
  daysPerWeek?: number | null;
  sessionMinutes?: number | null;
  start?: DateKey | null;
}

/** How sure the student is of a topic. Weak topics get more time and an extra practice session; strong ones a short check. */
export type Confidence = "weak" | "okay" | "strong";
export const CONFIDENCES: readonly Confidence[] = ["weak", "okay", "strong"];

/** One topic of a syllabus: a chapter-sized unit with the key points a student must be able to do. */
export interface SyllabusUnit {
  /** Stable within the goal: `u1`, `u2`… */
  key: string;
  /** A plain syllabus name, at most 40 characters: "Quadratics", "Circular measure". */
  title: string;
  /** Three to seven key points, each a short phrase a student can check themselves against. */
  points: string[];
  /** Share of the paper: 1 small, 2 typical, 3 large. */
  weight: 1 | 2 | 3;
  /** 1 straightforward, 2 typical, 3 hard. */
  difficulty: 1 | 2 | 3;
  /** The student's own rating, or null when they have not said. */
  confidence: Confidence | null;
  /** False when the student says the exam leaves it out. */
  included: boolean;
  /** `SubjectNode.id` when the topic matches one of the student's syllabus nodes. */
  topic: number | null;
}

export interface SyllabusPaper {
  /** "Paper 1". */
  label: string;
  /** Exam length in minutes, so a timed paper is practised at the real length. */
  minutes: number;
  marks: number | null;
}

export interface Syllabus {
  /**
   * Where the topic list came from. `catalog` is Sylf's checked list; `model` is the AI's knowledge; `student` is what the student typed; `subject`
   * is the student's own syllabus nodes for the goal's subject in Sylf.
   */
  source: "catalog" | "model" | "student" | "subject";
  /** True when the model's list was checked against searched sources. */
  researched?: boolean;
  /** Catalog id, e.g. `caie-9709-p1`. */
  ref: string | null;
  /** "Cambridge International AS & A Level Mathematics (9709), Paper 1: Pure Mathematics 1". */
  name: string;
  papers: SyllabusPaper[];
  units: SyllabusUnit[];
  /** The student has checked the topic list against what their exam covers. */
  checked: boolean;
  /** Pages the topic list was checked against when the model was not sure of the course. URLs come only from the search provider. */
  sources?: { title: string; url: string }[];
  /** Which syllabus this is, when it is a named one. */
  identity?: SyllabusIdentity | null;
  /** The shared library entry it came from or was saved as. */
  library?: { id: string; version: number; trust: "CHECKED" | "UNVERIFIED"; reused: boolean } | null;
}

/** The part a session plays in a study path. */
export type StudyRole = "revise" | "learn" | "practise" | "mixed" | "recall" | "checkpoint" | "paper" | "corrections" | "weak" | "final" | "lesson" | "milestone" | "read";
export const STUDY_ROLES: readonly StudyRole[] = ["revise", "learn", "practise", "mixed", "recall", "checkpoint", "paper", "corrections", "weak", "final", "lesson", "milestone", "read"];

/** What a session is for, shown on the session and written into its quest. */
export interface ItemDetails {
  role: StudyRole;
  /** Syllabus unit keys this session covers. */
  units: string[];
  /** The aim in one sentence: what the student can do at the end. */
  aim: string;
  /** Key points to cover or check. */
  points: string[];
  /** How to spend the session, in one or two sentences. */
  how: string;
}

export interface WorkItem {
  key: string;
  goal: string | null;
  /** At most 60 characters. */
  title: string;
  kind: ItemKind;
  subject: number | null;
  /** `SubjectNode.id`s. */
  topics: number[];
  /** Raw estimate before calibration: p50 and p80 minutes. */
  est: [number, number];
  /** Minimum, ideal and maximum minutes for one sitting. */
  chunk: [number, number, number];
  earliest: DateKey | null;
  due: DateKey | null;
  after: string[];
  load: Load;
  method: Method;
  source: Source;
  confidence: number;
  /** Minutes already studied, from the linked quest. */
  done: number;
  status: "open" | "done" | "dropped";
  questId: number | null;
  /** A concrete if-then first step, written lazily for near-term work. */
  firstStep: string | null;
  /** One short decision note from the planner. Never chain of thought. */
  note: string | null;
  /** The aim, key points and method of a session compiled from a syllabus. */
  details?: ItemDetails | null;
}

/** A recurring cadence such as "Spanish, 20 minutes on weekdays". It expands into one item per matching day. */
export interface Practice {
  key: string;
  goal: string | null;
  title: string;
  subject: number | null;
  minutes: number;
  /** Weekdays, Sunday = 0. */
  days: number[];
  from: DateKey | null;
  until: DateKey | null;
  method: Method;
  status: "active" | "paused";
}

interface ConstraintBase { key: string; hard: boolean; weight: number; provenance: "student" | "inferred" | "default"; label: string }
export type ConstraintSpec =
  | { kind: "daily_cap"; minutes: number; days?: number[] }
  | { kind: "no_study_window"; start: number; end: number; days?: number[]; dates?: DateKey[] }
  | { kind: "preferred_window"; start: number; end: number; subject?: number | null; days?: number[]; until?: DateKey | null }
  | { kind: "study_window"; start: number; end: number; days?: number[] }
  | { kind: "subject_cap"; subject: number; minutes: number }
  /** The most minutes a day one goal's sessions may take, from the student's "hours a day" for that plan. Takes precedence over a subject cap. */
  | { kind: "goal_cap"; goal: string; minutes: number }
  | { kind: "day_off"; dates: DateKey[] }
  | { kind: "subject_weight"; subject: number; weight: number }
  | { kind: "exam_buffer"; days: number }
  /** Extra study time on one date, which also opens a rest day when the student chooses to. */
  | { kind: "extra_time"; date: DateKey; start: number; end: number };
export type Constraint = ConstraintBase & ConstraintSpec;
export type ConstraintKind = ConstraintSpec["kind"];
export const CONSTRAINT_KINDS: readonly ConstraintKind[] = ["daily_cap", "no_study_window", "preferred_window", "study_window", "subject_cap", "goal_cap", "day_off", "subject_weight", "exam_buffer", "extra_time"];

export interface Assumption { key: string; text: string; affects: string[]; confidence: number; ask: boolean }
export interface Question { key: string; text: string; options: string[]; affects: string[] }

export interface WorkModel {
  goals: KGoal[];
  items: WorkItem[];
  practices: Practice[];
  constraints: Constraint[];
  assumptions: Assumption[];
  questions: Question[];
}
export const emptyWorkModel = (): WorkModel => ({ goals: [], items: [], practices: [], constraints: [], assumptions: [], questions: [] });

export type Autonomy = "ASK" | "SMART" | "AUTOPILOT";
export interface StudioSettings {
  /** Local minutes. Study never starts before or ends after these unless a window says otherwise. */
  dayStart: number;
  dayEnd: number;
  /** Most minutes a day the planner may fill. */
  dailyCap: number;
  breakMinutes: number;
  /** Space kept free around fixed commitments. */
  transitionBuffer: number;
  autonomy: Autonomy;
  /** Show work by day only, without times. */
  dayOnly: boolean;
  horizonDays: number;
}
export const DEFAULT_SETTINGS: StudioSettings = { dayStart: 8 * 60, dayEnd: 22 * 60, dailyCap: 240, breakMinutes: 10, transitionBuffer: 10, autonomy: "SMART", dayOnly: false, horizonDays: 14 };

export type BusyKind = "event" | "class" | "exam" | "external" | "work" | "other";
export interface Busy { start: number; end: number; title: string; kind: BusyKind; ref: string | null }
export interface SnapshotDay {
  date: DateKey;
  weekday: number;
  rest: false | "fixed" | "floating";
  /** Base availability, local minutes. Defaults to [dayStart, dayEnd]. */
  windows: [number, number][];
  busy: Busy[];
  allDay: { title: string; kind: BusyKind }[];
  /** Minutes of other quests already on this day (work Sylf knows about but the plan does not own). They count against the day's capacity. */
  otherWork?: number;
}
export interface SnapshotSubject { id: number; name: string; color: string; code: string; board?: string; level?: string }
export interface SnapshotTopic { id: number; subject: number; ref: string; title: string; progress: number; mastered: boolean; difficulty: number }

export interface Calibration {
  /** Ratio of actual to planned minutes, keyed `subject:kind` with `*` as a wildcard. 1 means estimates are right. */
  factors: Record<string, { factor: number; samples: number }>;
  /** Completion propensity by weekday (Sunday = 0) and hour, 0–100. */
  energy: number[][];
  /** Sustainable minutes a day: the rolling p75 of active days plus a small allowance. */
  capacity: number;
  /** Sessions the numbers are based on. */
  samples: number;
}

export interface PlanningSnapshot {
  today: DateKey;
  /** Local minute of the day when the snapshot was taken. Nothing is placed before it today. */
  nowMinute: number;
  timezone: string;
  days: SnapshotDay[];
  subjects: SnapshotSubject[];
  topics: SnapshotTopic[];
  calibration: Calibration;
  settings: StudioSettings;
  /** Minutes already studied today, which count against today's cap. */
  studiedToday: number;
}

export type BlockState = "proposed" | "committed" | "done" | "missed" | "skipped";
export interface Block {
  id: string;
  item: string;
  date: DateKey;
  start: number;
  end: number;
  state: BlockState;
  pinned: boolean;
  questId: number | null;
}
export const blockMinutes = (block: Pick<Block, "start" | "end">) => Math.max(0, block.end - block.start);

export type ReasonCode = "due" | "energy" | "spacing" | "stable" | "preferred" | "pinned" | "capacity" | "dependency" | "practice" | "review" | "fixed";
export interface Reason { code: ReasonCode; text: string }

export interface Shortage {
  /** The deadline the shortage is measured against. */
  due: DateKey;
  needed: number;
  available: number;
  short: number;
  items: string[];
}
export interface DayLoad { date: DateKey; capacity: number; planned: number; sustainable: number; free: number; rest: boolean }
/** Minutes the rolling horizon leaves to a week beyond the detailed days. */
export interface WeekBudget { week: DateKey; item: string; minutes: number }
export type RiskKind = "deadline" | "overload" | "shortage" | "neglected" | "unplaced";
export interface Risk { kind: RiskKind; text: string; goal: string | null; item: string | null; date: DateKey | null; severity: 1 | 2 | 3 }

export interface Health {
  plannedMinutes: number;
  capacityMinutes: number;
  sustainableMinutes: number;
  atRisk: { goal: string; title: string; due: DateKey; short: number }[];
  nextExam: { goal: string; title: string; due: DateKey } | null;
  quality: number;
}
