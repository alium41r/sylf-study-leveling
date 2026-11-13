// View models composed from Home's authenticated backend reads.
export type DayEntryKind = "session" | "class" | "deadline";
export type DayEntryState = "past" | "next" | "later";

/** Planner items and calendar events for the local day: PlannerRevision, CalendarEvent. */
export interface DayEntry { id: string; startsAt: number; title: string; detail: string; kind: DayEntryKind; state: DayEntryState; minutes?: number }

/** The day's goals and quests: Goal, Quest. */
export interface Objective { id: string; title: string; detail: string; done: boolean; questId?: number; subject?: string | null; subjectId?: number | null; minutes?: number; completion?: { id: number; plannedMinutes?: number | null; executionVersion?: number } }

/** Today's study against the student's own target. On a rest day there is no target to meet. */
export interface DayTarget { studied: number; goal: number; rest: boolean }

export interface TodayView {
  entries: DayEntry[];
  objectives: Objective[];
  /** Events with no time of day. They have no place on the line. */
  allDay?: string[];
  /** The day in one sentence, when the server's data says more than the entries do. */
  summary?: string;
  target?: DayTarget;
}

/** A finished StudySession, named after its quest or subject. */
export interface RecentSession { id: string; title: string; detail: string; minutes: number }
/** Session lengths are not here: they belong to the one study session, in @sylf/spaces. */
export interface FocusView { recent: RecentSession[] }

/** /api/friends: online, studying, and when the session began. It does not say what a friend is studying, so neither does Home. */
export interface CirclePerson { id: string; username: string; name: string; status: string; detail?: string; presence?: "online" | "focusing" }
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
