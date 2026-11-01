// What Home needs to draw, shaped as view models and not as server records. Everything here has an existing owner in Sylf's
// backend, named beside it: Home adds no server concept. Phase 11 checks these against the real contracts and Phase 13 replaces
// the adapter, so screens do not change when real data arrives. Every result says where it came from: screens show the
// sample notice from `provenance`, and never decide it themselves.
import type { LiveStatus } from "../../../shell/live-result";

export type Provenance = "sample" | "live";

export interface HomeResult<T> { provenance: Provenance; data: T | null; live?: LiveStatus }

export type DayEntryKind = "session" | "class" | "deadline";
export type DayEntryState = "past" | "next" | "later";

/** Planner items and calendar events for the local day: PlannerRevision, CalendarEvent. */
export interface DayEntry { id: string; startsAt: number; title: string; detail: string; kind: DayEntryKind; state: DayEntryState; minutes?: number }

/** The day's goals and quests: Goal, Quest. */
export interface Objective { id: string; title: string; detail: string; done: boolean; questId?: number; subject?: string | null; subjectId?: number | null; minutes?: number }

export interface TodayView {
  entries: DayEntry[];
  objectives: Objective[];
  /** Events with no time of day. They have no place on the line. */
  allDay?: string[];
  /** The day in one sentence, when the server's data says more than the entries do. */
  summary?: string;
}

/** A desk is a focus background from the existing catalog (FocusBackground, UserFocusBackground), not a new kind of thing. */
export interface StudyDesk { id: string; name: string; category: string; art: { kind: "image"; url: string } | { kind: "sample"; layout: "window" | "lamp" | "shelf" } }
/** A finished StudySession, named after its quest or subject. */
export interface RecentSession { id: string; title: string; detail: string; minutes: number }
/** Session lengths are not here: they belong to the one study session, in @sylf/spaces. */
export interface FocusView { subject: string; topic: string; desks: StudyDesk[]; recent: RecentSession[] }

/** /api/friends: online, studying, and when the session began. It does not say what a friend is studying, so neither does Home. */
export interface CirclePerson { id: string; name: string; status: string; detail?: string; presence?: "online" | "focusing" }
/** /api/focus-party: parties exist now and have members. There is no schedule and no seat limit to show. */
export interface StudyParty { id: string; name: string; members: number; inSession: boolean }
export interface CircleView {
  people: CirclePerson[];
  parties: StudyParty[];
  /** Invitations into a study party. Joining one stays on the web for now. */
  invites?: { id: string; name: string; from: string }[];
  requests?: { id: number; name: string }[];
}

/** UserStats and the game engine for level, rank and streak, StudySession for time, and UserAchievement for achievements. */
export interface StudyDay { day: string; minutes: number; today: boolean }
export interface SubjectShare { id: string; name: string; share: number }
export interface Achievement { id: string; title: string; detail: string; earned: boolean; claimable?: boolean }
export interface ProgressView {
  level: number;
  levelProgress: number;
  levelDetail?: string;
  rank: string;
  stats: { id: string; label: string; value: string; unit?: string }[];
  week: StudyDay[];
  subjects: SubjectShare[];
  achievements: Achievement[];
}

export interface HomeDataAdapter {
  today(now: Date): Promise<HomeResult<TodayView>>;
  focus(): Promise<HomeResult<FocusView>>;
  circle(): Promise<HomeResult<CircleView>>;
  progress(now: Date): Promise<HomeResult<ProgressView>>;
}
