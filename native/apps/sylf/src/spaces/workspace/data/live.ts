// Workspace over the real backend. Planner, Calendar and Audio's catalog read real data here, and Sylvie reads hers in her own tool. Notes, PDFs,
// Whiteboard and Resources belong to Phase 14: there is no server list of them by design, so they say what is true instead of showing an empty shelf.
import type { Backend, CalendarEvent, Goal, Quest, ResourceDefinition } from "@sylf/backend";
import type { CalendarEntry, PlannerView, SoundTrack, ToolResult, WorkspaceDataAdapter } from "./contracts";
import { localDay, questMinutes } from "../../home/data/live";
import { formatMinutes } from "../../home/format";

const clock = (time: string) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function mapPlanner(events: CalendarEvent[], quests: Quest[], goals: Goal[], now: Date): PlannerView {
  const day = localDay(now);
  const timed = events.filter((event) => !event.allDay && event.startsAt && localDay(new Date(event.startsAt)) === day).sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  return {
    items: [...events.filter((event) => event.allDay).map((event) => ({ id: event.id, time: "All day", title: event.title, detail: "Event" })), ...timed.map((event) => ({ id: event.id, time: clock(event.startsAt!), title: event.title, detail: "Event" }))],
    objectives: [...quests.filter((quest) => quest.status !== "COMPLETED"), ...quests.filter((quest) => quest.status === "COMPLETED")].map((quest) => {
      const minutes = questMinutes(quest);
      return { id: `quest-${quest.id}`, title: quest.title, detail: [quest.subject?.name, minutes ? formatMinutes(minutes) : null].filter(Boolean).join(", ") || "Quest", questId: quest.id, subject: quest.subject?.name ?? null, subjectId: quest.subjectId, done: quest.status === "COMPLETED", completion: { id: quest.id, plannedMinutes: quest.plannedMinutes, executionVersion: quest.executionVersion } };
    }),
    goals: goals.filter((goal) => goal.status === undefined || goal.status === "ACTIVE").map((goal) => {
      const quests_ = goal.quests ?? [];
      return { id: String(goal.id), title: goal.title, detail: quests_.length ? `${quests_.filter((quest) => quest.status === "COMPLETED").length} of ${quests_.length} quests done` : "No quests yet" };
    }),
  };
}

export function mapCalendar(events: CalendarEvent[]): CalendarEntry[] {
  return events.flatMap((event) => {
    const id = event.occurrenceDate ? `${event.id}:${event.occurrenceDate}` : event.id;
    if (!event.allDay && event.startsAt) return [{ id, day: localDay(new Date(event.startsAt)), time: clock(event.startsAt), title: event.title, startsAt: Date.parse(event.startsAt) }];
    // An all-day event's end date is exclusive, as the Calendar contract defines it.
    const days: CalendarEntry[] = [];
    for (let day = new Date(`${event.startDate}T12:00:00`); localDay(day) < event.endDate && days.length < 62; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12)) days.push({ id: `${id}:${localDay(day)}`, day: localDay(day), time: "All day", title: event.title });
    return days;
  }).sort((a, b) => a.day.localeCompare(b.day) || (a.startsAt ?? 0) - (b.startsAt ?? 0));
}

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

export function monthRange(shown: Date) {
  return { start: localDay(new Date(shown.getFullYear(), shown.getMonth(), 1)), end: localDay(new Date(shown.getFullYear(), shown.getMonth() + 1, 1)) };
}

export type LiveToolView = keyof WorkspaceDataAdapter;

export function liveToolResource(backend: Backend, view: "planner" | "calendar" | "sounds", param?: string) {
  const { reads } = backend;
  const definitions: { planner: () => ResourceDefinition<PlannerView>; calendar: () => ResourceDefinition<CalendarEntry[]>; sounds: () => ResourceDefinition<SoundTrack[]> } = {
    planner: () => ({
      key: "tool-planner", tags: ["today", "planner"], ttlMs: 60_000,
      async load(signal) {
        const now = new Date();
        const [quests, goals, calendar] = await Promise.all([reads.questsToday(signal), reads.goals(signal), reads.calendar(localDay(now), localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), signal)]);
        return mapPlanner(calendar.events, quests, goals, new Date());
      },
    }),
    calendar: () => {
      const [start, end] = (param ?? "").split("/");
      return { key: `tool-calendar-${start}`, tags: ["calendar", "today"], ttlMs: 60_000, load: async (signal) => mapCalendar((await reads.calendar(start, end, signal)).events) };
    },
    // A fixed catalog, public on the server, so it can stay for the whole session.
    sounds: () => ({ key: "tool-sounds", ttlMs: 30 * 60_000, load: async (signal) => (await reads.sounds(signal)).tracks.map((track) => ({ id: String(track.id), name: track.title, detail: titleCase(track.category) })) }),
  };
  return definitions[view]() as ResourceDefinition<unknown>;
}

/** Tools later work owns. Each sentence is true of today, for someone signed in. */
export const LIMITED_TOOLS: Partial<Record<LiveToolView, ToolResult<never>>> = {
  notes: { provenance: "live", data: null, limited: "Your notes live on the device you wrote them on, in Sylf for the web. Opening them here arrives with the Notes editor." },
  pdfs: { provenance: "live", data: null, limited: "PDFs live in Notes, on the device that added them. Reading them here arrives with the Notes editor." },
  boards: { provenance: "live", data: null, limited: "Whiteboards are Notes drawings. Drawing here arrives with native ink." },
  resources: { provenance: "live", data: null, limited: "The Resource Shelf points at your notes and PDFs, so it arrives with the Notes editor." },
};
