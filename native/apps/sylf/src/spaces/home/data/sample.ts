// Sample content for reviewing the templates. None of it belongs to a real person: the people are invented, and every result
// is marked "sample", so the screens say so. The day is built around the current time, so the timeline always has a next item.
import type { HomeDataScenario } from "../../../shell/links";
import type { DayEntry, HomeDataAdapter, HomeResult, ProgressView, TodayView } from "./contracts";

const MINUTE = 60_000;
const sample = <T,>(data: T): HomeResult<T> => ({ provenance: "sample", data });
const roundToFive = (time: number) => Math.round(time / (5 * MINUTE)) * (5 * MINUTE);

export function sampleToday(now: Date): TodayView {
  const at = (minutes: number) => roundToFive(now.getTime() + minutes * MINUTE);
  const entries: DayEntry[] = [
    { id: "chemistry", startsAt: at(-150), title: "Organic chemistry review", detail: "Session, 40 min", kind: "session", state: "past", minutes: 40 },
    { id: "history", startsAt: at(-65), title: "History seminar", detail: "Class, 1 hr", kind: "class", state: "past" },
    { id: "calculus", startsAt: at(25), title: "Complex numbers", detail: "Session, 45 min. Worked examples, then a past paper", kind: "session", state: "next", minutes: 45 },
    { id: "essay", startsAt: at(120), title: "Essay outline due", detail: "Deadline. Literature", kind: "deadline", state: "later" },
    { id: "physics", startsAt: at(185), title: "Waves and optics", detail: "Session, 30 min", kind: "session", state: "later", minutes: 30 },
  ];
  return {
    entries,
    objectives: [
      { id: "cards", title: "Review 20 chemistry cards", detail: "Finished this morning", done: true },
      { id: "paper", title: "Finish one past paper", detail: "Mathematics", done: false },
      { id: "outline", title: "Outline the essay", detail: "Literature", done: false },
    ],
  };
}

const WEEK = [["Mon", 95], ["Tue", 60], ["Wed", 130], ["Thu", 45], ["Fri", 110], ["Sat", 80], ["Sun", 40]] as const;

/** The week so far: days still to come are empty, and the totals are added up from the same days the chart shows. */
export function sampleProgress(now: Date): ProgressView {
  const todayIndex = (now.getDay() + 6) % 7;
  const week = WEEK.map(([day, minutes], index) => ({ day, minutes: index > todayIndex ? 0 : minutes, today: index === todayIndex }));
  const total = week.reduce((sum, day) => sum + day.minutes, 0);
  return {
    level: 12,
    levelProgress: 0.64,
    rank: "Rank D",
    stats: [{ id: "week", label: "This week", value: (total / 60).toFixed(1), unit: "hr" }, { id: "streak", label: "Current streak", value: String(todayIndex + 1), unit: todayIndex ? "days" : "day" }, { id: "sessions", label: "Sessions this week", value: String(Math.round(total / 35)) }],
    week,
    subjects: [{ id: "maths", name: "Mathematics", share: 0.42 }, { id: "chemistry", name: "Chemistry", share: 0.28 }, { id: "literature", name: "Literature", share: 0.18 }, { id: "physics", name: "Physics", share: 0.12 }],
    achievements: [
      { id: "first", title: "First light", detail: "Finish a first session", earned: true },
      { id: "week", title: "Full week", detail: "Study seven days in a row", earned: true },
      { id: "deep", title: "Deep water", detail: "Stay in one session for 90 minutes", earned: true },
      { id: "circle", title: "Good company", detail: "Finish a study party", earned: false },
      { id: "century", title: "Hundred hours", detail: "Reach 100 study hours", earned: false },
    ],
  };
}

export const sampleHomeData: HomeDataAdapter = {
  today: async (now) => sample(sampleToday(now)),
  focus: async () => sample({
    subject: "Mathematics",
    topic: "Complex numbers",
    desks: [
      { id: "window", name: "Morning window", category: "Bright", art: { kind: "sample", layout: "window" } },
      { id: "lamp", name: "Night lamp", category: "Quiet", art: { kind: "sample", layout: "lamp" } },
      { id: "shelf", name: "Reading room", category: "Quiet", art: { kind: "sample", layout: "shelf" } },
    ],
    recent: [
      { id: "chemistry", title: "Organic chemistry review", detail: "This morning", minutes: 40 },
      { id: "essay", title: "Essay reading", detail: "Yesterday", minutes: 55 },
      { id: "waves", title: "Waves and optics", detail: "Yesterday", minutes: 30 },
    ],
  }),
  circle: async () => sample({
    people: [
      { id: "amara", name: "Amara Osei", status: "Studying, 40 min", presence: "focusing" },
      { id: "jonas", name: "Jonas Lind", status: "Studying, 15 min", presence: "focusing" },
      { id: "mei", name: "Mei Tanaka", status: "Online", presence: "online" },
      { id: "priya", name: "Priya Raman", status: "Studying, 1 hr 5 min", presence: "focusing" },
      { id: "tomas", name: "Tomas Novak", status: "Offline" },
      { id: "lena", name: "Lena Fischer", status: "Offline" },
    ],
    parties: [
      { id: "calculus", name: "Calculus before the exam", members: 3, inSession: true },
      { id: "reading", name: "Quiet reading hour", members: 2, inSession: false },
    ],
  }),
  progress: async (now) => sample(sampleProgress(now)),
};

/** What a person with nothing yet would see. A build without development tools uses this, so it cannot show sample content. */
export const emptyHomeData: HomeDataAdapter = {
  today: async () => ({ provenance: "live", data: null }),
  focus: async () => ({ provenance: "live", data: null }),
  circle: async () => ({ provenance: "live", data: null }),
  progress: async () => ({ provenance: "live", data: null }),
};

/** Delays every answer, to review the loading state. */
export function slowHomeData(adapter: HomeDataAdapter, delayMs: number): HomeDataAdapter {
  const later = <T,>(value: Promise<T>) => new Promise<T>((resolve) => setTimeout(() => resolve(value), delayMs));
  return { today: (now) => later(adapter.today(now)), focus: () => later(adapter.focus()), circle: () => later(adapter.circle()), progress: (now) => later(adapter.progress(now)) };
}

export function homeDataFor(devTools: boolean, scenario: HomeDataScenario | null): HomeDataAdapter {
  if (!devTools || scenario === "empty") return emptyHomeData;
  return scenario === "slow" ? slowHomeData(sampleHomeData, 1800) : sampleHomeData;
}
