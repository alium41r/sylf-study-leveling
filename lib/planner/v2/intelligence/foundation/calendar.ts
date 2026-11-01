import { z } from "zod";
import { DateV2Schema, DigestV2Schema, InstantV2Schema, TimezoneV2Schema } from "../../contracts/primitives";

const interval = z.strictObject({ start: InstantV2Schema, end: InstantV2Schema }).refine(i => Date.parse(i.start) < Date.parse(i.end), "EMPTY_INTERVAL");
/** Read projection of existing expanded personal/shared/external occurrences.
 * No titles, notebook content, provider credentials or duplicate event store. */
export const CalendarCapacitySchema = z.strictObject({
  schemaVersion: z.literal(1), timezone: TimezoneV2Schema,
  intentDigest: DigestV2Schema, acceptedWindowsDigest: DigestV2Schema.nullable(),
  capturedAt: InstantV2Schema, validUntil: InstantV2Schema,
  policy: z.strictObject({ tentative: z.literal("BLOCK"), allDay: z.literal("BLOCK_DATE"), transparent: z.literal("IGNORE"), unavailable: z.literal("NEEDS_DECISION") }),
  sources: z.array(z.strictObject({ ref: z.string().min(1).max(200), versionDigest: DigestV2Schema, includedInPlanning: z.boolean(), complete: z.boolean(), freshUntil: InstantV2Schema })).max(200),
  days: z.array(z.strictObject({ date: DateV2Schema, approved: z.array(interval).max(100), busy: z.array(interval).max(1000), allDayBlocked: z.boolean(), excluded: z.boolean() })).max(500),
}).superRefine((value, ctx) => {
  if (Date.parse(value.validUntil) <= Date.parse(value.capturedAt)) ctx.addIssue({ code: "custom", message: "CALENDAR_FRESHNESS_INVALID" });
  if (new Set(value.days.map(d => d.date)).size !== value.days.length || new Set(value.sources.map(s => s.ref)).size !== value.sources.length) ctx.addIssue({ code: "custom", message: "DUPLICATE_CALENDAR_REFERENCE" });
  for (const day of value.days) for (const i of [...day.approved, ...day.busy]) {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: value.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    if (formatter.format(new Date(i.start)) !== day.date || formatter.format(new Date(Date.parse(i.end) - 1)) !== day.date) ctx.addIssue({ code: "custom", message: "INTERVAL_OUTSIDE_CIVIL_DATE" });
  }
});
export type CalendarCapacity = z.infer<typeof CalendarCapacitySchema>;
export const CalendarReservationSchema = z.strictObject({ key: z.string().min(1).max(250), date: DateV2Schema, minutes: z.number().int().positive(), after: z.array(z.string().min(1).max(250)).max(400) });
export const IntervalWitnessSchema = z.strictObject({ key: z.string().min(1).max(250), start: InstantV2Schema, end: InstantV2Schema });
export const CalendarAllocationSchema = z.strictObject({
  schemaVersion: z.literal(1), status: z.enum(["FEASIBLE", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED"]),
  searchedNodes: z.number().int().nonnegative(),
  tasks: z.array(CalendarReservationSchema).max(4000), witness: z.array(IntervalWitnessSchema).max(4000),
  proof: z.strictObject({ date: DateV2Schema, requiredMinutes: z.number().int().positive(), availableMinutes: z.number().int().nonnegative(), explanation: z.string().min(1).max(1000) }).nullable(),
}).superRefine((v, ctx) => {
  if ((v.status === "CAPACITY_SHORTFALL") !== !!v.proof || v.proof && v.proof.requiredMinutes <= v.proof.availableMinutes || v.status !== "FEASIBLE" && v.witness.length) ctx.addIssue({ code: "custom", message: "INVALID_CALENDAR_ALLOCATION" });
  if (new Set(v.tasks.map(t => t.key)).size !== v.tasks.length) ctx.addIssue({ code: "custom", message: "DUPLICATE_CALENDAR_TASK" });
});
export type CalendarReservation = z.infer<typeof CalendarReservationSchema>;
export type CalendarAllocation = z.infer<typeof CalendarAllocationSchema>;
type Span = { start: number; end: number };
function union(spans: Span[]): Span[] {
  const result: Span[] = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else result.push({ ...span });
  }
  return result;
}
export function usableStudyWindows(raw: CalendarCapacity, now: number): { status: "KNOWN" | "NEEDS_DECISION"; days: { date: string; windows: Span[] }[] } {
  const snapshot = CalendarCapacitySchema.parse(raw);
  if (!snapshot.acceptedWindowsDigest || Date.parse(snapshot.validUntil) <= now || snapshot.sources.some(s => s.includedInPlanning && (!s.complete || Date.parse(s.freshUntil) <= now))) return { status: "NEEDS_DECISION", days: [] };
  return { status: "KNOWN", days: snapshot.days.map(day => {
    let windows = day.excluded || day.allDayBlocked ? [] : union(day.approved.map(i => ({ start: Date.parse(i.start), end: Date.parse(i.end) })));
    for (const busy of union(day.busy.map(i => ({ start: Date.parse(i.start), end: Date.parse(i.end) })))) windows = windows.flatMap(w => busy.end <= w.start || busy.start >= w.end ? [w] : [
      ...(busy.start > w.start ? [{ start: w.start, end: busy.start }] : []), ...(busy.end < w.end ? [{ start: busy.end, end: w.end }] : []),
    ]);
    return { date: day.date, windows };
  }) };
}
/** Validate the allocator's internal joint witness; never publishes clock
 * appointments or searches for a schedule. Existing minute ceilings still apply. */
export function validateIntervalWitness(snapshot: CalendarCapacity, tasks: readonly { key: string; date: string; minutes: number }[], witness: readonly { key: string; start: string; end: string }[], now: number): void {
  const projection = usableStudyWindows(snapshot, now);
  if (projection.status !== "KNOWN" || tasks.length !== witness.length || new Set(tasks.map(t => t.key)).size !== tasks.length || new Set(witness.map(w => w.key)).size !== witness.length) throw new Error("INTERVAL_WITNESS_INCOMPLETE");
  const occupied: Span[] = [];
  for (const task of tasks) {
    const item = witness.find(w => w.key === task.key);
    if (!item || !Number.isSafeInteger(task.minutes) || task.minutes <= 0) throw new Error("INVALID_INTERVAL_TASK");
    const start = Date.parse(item.start), end = Date.parse(item.end);
    if (end - start !== task.minutes * 60000 || !projection.days.find(d => d.date === task.date)?.windows.some(w => start >= w.start && end <= w.end) || occupied.some(w => start < w.end && end > w.start)) throw new Error("INTERVAL_WITNESS_DOES_NOT_FIT");
    occupied.push({ start, end });
  }
}
export function validateCalendarAllocation(snapshot: CalendarCapacity, raw: CalendarAllocation, now: number): CalendarAllocation {
  const value = CalendarAllocationSchema.parse(raw);
  if (value.proof) {
    const free = usableStudyWindows(snapshot, now);
    if (free.status !== "KNOWN") throw new Error("CALENDAR_NOT_CURRENT");
    const windows = free.days.find(d => d.date === value.proof!.date)?.windows ?? [];
    const tasks = value.tasks.filter(t => t.date === value.proof!.date), total = tasks.reduce((n, t) => n + t.minutes, 0);
    const available = Math.floor(windows.reduce((n, w) => n + w.end - w.start, 0) / 60000), largest = Math.floor(Math.max(0, ...windows.map(w => (w.end - w.start) / 60000)));
    if (!(value.proof.requiredMinutes === total && value.proof.availableMinutes === available && total > available) &&
      !tasks.some(t => t.minutes === value.proof!.requiredMinutes && value.proof!.availableMinutes === largest && t.minutes > largest)) throw new Error("CALENDAR_SHORTFALL_NOT_PROVEN");
  }
  if (value.status === "FEASIBLE") {
    validateIntervalWitness(snapshot, value.tasks, value.witness, now);
    for (const task of value.tasks) for (const before of task.after) {
      const prerequisite = value.witness.find(w => w.key === before), own = value.witness.find(w => w.key === task.key)!;
      if (!prerequisite || Date.parse(prerequisite.end) > Date.parse(own.start)) throw new Error("INTERVAL_DEPENDENCY_ORDER");
    }
  }
  return value;
}
