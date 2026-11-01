import { z } from "zod";
import { CalendarCapacitySchema, CalendarReservationSchema, CalendarAllocationSchema, usableStudyWindows } from "../foundation/calendar";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts/envelope";
import {
  DateV2Schema, DigestV2Schema, LocalIdV2Schema, SummaryV2Schema, TimeboxV2Schema,
  TimezoneV2Schema, VersionV2Schema, issue, unique,
} from "../../contracts/primitives";

const minutes = z.number().int().nonnegative();
const targetRefs = z.array(LocalIdV2Schema).min(1).max(E.targets);
const deadline = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NONE") }),
  z.strictObject({ kind: z.literal("FIXED"), date: DateV2Schema, examDayStudyAllowed: z.boolean() }),
  z.strictObject({ kind: z.literal("SOFT"), date: DateV2Schema }),
]);

/** A bounded detailed window is independent of the student's goal deadline. */
export const SchedulingEnvelopeSchema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  timezone: TimezoneV2Schema,
  today: DateV2Schema,
  window: z.strictObject({ start: DateV2Schema, end: DateV2Schema }),
  capacityDigest: DigestV2Schema,
  calendar: z.strictObject({ schemaVersion: z.literal(1), snapshot: CalendarCapacitySchema, reservations: z.array(CalendarReservationSchema).max(4000) }).optional(),
  basis: z.enum(["CONFIRMED_AVAILABILITY", "DISCLOSED_PROVISIONAL_CEILING"]),
  weeklyCeilingMinutes: z.number().int().min(0).max(E.weeklyCapacityMinutes),
  recoveryPercent: z.number().min(0).max(50),
  targets: z.array(z.strictObject({
    planRef: LocalIdV2Schema, deadline,
    perGoalWeeklyCeilingMinutes: z.number().int().min(0).max(E.weeklyCapacityMinutes).nullable(),
  })).min(1).max(E.targets),
  days: z.array(z.strictObject({
    date: DateV2Schema, ceilingMinutes: z.number().int().min(0).max(E.dailyCapacityMinutes),
    otherCommittedMinutes: minutes, protectedTargetMinutes: minutes, recoveryMinutes: minutes,
    calendarAvailableMinutes: minutes.optional(),
    availableMinutes: z.number().int().min(0).max(E.dailyCapacityMinutes),
    excluded: z.boolean(),
  })).max(E.scopeNodes),
  protectedExecution: z.array(z.strictObject({
    planRef: LocalIdV2Schema, activityRef: LocalIdV2Schema, contentDigest: DigestV2Schema,
    executionVersion: minutes, actualSeconds: minutes, remainingMinutes: minutes,
    state: z.enum(["UNSTARTED", "RUNNING", "PAUSED", "ENDED_INCOMPLETE", "COMPLETED"]),
    remainingDisposition: z.enum(["OPEN", "WITHDRAWN", "COMPLETED"]), date: DateV2Schema,
  })).max(E.outstandingActivitiesPerPlan * E.targets),
  timeboxRange: z.strictObject({ minMinutes: TimeboxV2Schema, maxMinutes: TimeboxV2Schema }),
}).superRefine((envelope, ctx) => {
  const geometry = envelope.calendar && usableStudyWindows(envelope.calendar.snapshot, Date.parse(envelope.calendar.snapshot.capturedAt));
  if (geometry && (geometry.status !== "KNOWN" || envelope.calendar!.snapshot.timezone !== envelope.timezone)) issue(ctx, ["calendar"], "CALENDAR_NOT_CURRENT");
  unique(envelope.targets.map(target => target.planRef), ctx, ["targets"]);
  unique(envelope.days.map(day => day.date), ctx, ["days"]);
  unique(envelope.protectedExecution.map(task => `${task.planRef}/${task.activityRef}`), ctx, ["protectedExecution"]);
  if (envelope.window.start < envelope.today || envelope.window.end < envelope.window.start) issue(ctx, ["window"], "INVALID_DETAILED_WINDOW");
  if (envelope.timeboxRange.maxMinutes < envelope.timeboxRange.minMinutes) issue(ctx, ["timeboxRange"], "INVALID_TIMEBOX_RANGE");
  envelope.days.forEach((day, i) => {
    if (day.date < envelope.window.start || day.date > envelope.window.end) issue(ctx, ["days", i], "DATE_OUTSIDE_DETAILED_WINDOW");
    const available = day.excluded ? 0 : Math.min(day.calendarAvailableMinutes ?? Infinity, Math.max(0, day.ceilingMinutes - day.otherCommittedMinutes - day.protectedTargetMinutes - day.recoveryMinutes));
    if (!!envelope.calendar !== (day.calendarAvailableMinutes !== undefined)) issue(ctx, ["days", i], "CALENDAR_CAPACITY_VERSION_REQUIRED");
    if (geometry?.status === "KNOWN") {
      const free = geometry.days.find(d => d.date === day.date);
      const remaining = Math.max(0, Math.floor((free?.windows ?? []).reduce((n, w) => n + (w.end - w.start) / 60000, 0)) - envelope.calendar!.reservations.filter(t => t.date === day.date).reduce((n, t) => n + t.minutes, 0) - day.recoveryMinutes);
      if (!free || day.calendarAvailableMinutes !== remaining) issue(ctx, ["days", i], "CALENDAR_GEOMETRY_MISMATCH");
    }
    if (available !== day.availableMinutes) issue(ctx, ["days", i, "availableMinutes"], "CAPACITY_ACCOUNTING_MISMATCH");
  });
  const plans = new Set(envelope.targets.map(target => target.planRef));
  envelope.protectedExecution.forEach((task, i) => {
    if (!plans.has(task.planRef)) issue(ctx, ["protectedExecution", i], "UNKNOWN_TARGET");
    if (task.state === "UNSTARTED" && task.actualSeconds !== 0) issue(ctx, ["protectedExecution", i], "UNSTARTED_EXECUTION_MISMATCH");
    if (task.state !== "UNSTARTED" && task.executionVersion === 0) issue(ctx, ["protectedExecution", i], "STARTED_EXECUTION_REQUIRES_VERSION");
    if ((task.state === "COMPLETED") !== (task.remainingDisposition === "COMPLETED")) issue(ctx, ["protectedExecution", i], "COMPLETION_DISPOSITION_MISMATCH");
    if ((task.state === "RUNNING" || task.state === "UNSTARTED") && task.remainingDisposition !== "OPEN") issue(ctx, ["protectedExecution", i], "OPEN_EXECUTION_REQUIRED");
    if (task.remainingDisposition === "OPEN" ? task.remainingMinutes === 0 : task.remainingMinutes !== 0) issue(ctx, ["protectedExecution", i], "REMAINING_DISPOSITION_MISMATCH");
  });
}));

const activity = z.strictObject({ planRef: LocalIdV2Schema, activityRef: LocalIdV2Schema, minutes: TimeboxV2Schema });

export const CapacityProofSchema = z.strictObject({
    planRefs: targetRefs, dates: z.array(DateV2Schema).min(1).max(E.scopeNodes),
    requiredMinutes: z.number().int().positive(), availableMinutes: minutes,
    explanation: SummaryV2Schema,
  }).nullable();

/** A mathematical capacity bound proves shortfall; failed heuristic search does not. */
export const AllocationReportSchema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  status: z.enum(["FEASIBLE", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED"]),
  placements: z.array(activity.extend({ date: DateV2Schema })).max(E.outstandingActivitiesPerPlan * E.targets),
  unscheduled: z.array(activity).max(E.outstandingActivitiesPerPlan * E.targets),
  committedMinutes: minutes,
  capacityProof: CapacityProofSchema,
  findings: z.array(z.strictObject({
    findingId: LocalIdV2Schema,
    category: z.enum(["SHORTFALL", "LEARNING_WINDOW", "DENSITY", "SWITCHING", "FINISH", "ESTIMATE_RISK", "ADVISORY_ORDER"]),
    consequential: z.boolean(), planRefs: targetRefs, activityRefs: z.array(LocalIdV2Schema).max(E.newlyDetailedActivities),
    evidence: SummaryV2Schema, consequence: SummaryV2Schema,
  })).max(E.qualityIssues),
  calendarAllocation: CalendarAllocationSchema.optional(),
}).superRefine((report, ctx) => {
  const all = [...report.placements, ...report.unscheduled];
  unique(all.map(task => `${task.planRef}/${task.activityRef}`), ctx, ["placements"]);
  unique(report.findings.map(finding => finding.findingId), ctx, ["findings"]);
  if (all.reduce((sum, task) => sum + task.minutes, 0) !== report.committedMinutes) issue(ctx, ["committedMinutes"], "COMMITTED_MINUTES_MISMATCH");
  if (report.status === "FEASIBLE" && report.unscheduled.length) issue(ctx, ["unscheduled"], "FEASIBLE_REQUIRES_ALL_COMMITTED_WORK");
  if ((report.status === "CAPACITY_SHORTFALL") !== (report.capacityProof !== null)) issue(ctx, ["capacityProof"], "SHORTFALL_REQUIRES_CAPACITY_PROOF");
  if (report.capacityProof) {
    unique(report.capacityProof.planRefs, ctx, ["capacityProof", "planRefs"]);
    unique(report.capacityProof.dates, ctx, ["capacityProof", "dates"]);
    if (report.capacityProof.requiredMinutes <= report.capacityProof.availableMinutes) issue(ctx, ["capacityProof"], "CAPACITY_BOUND_DOES_NOT_PROVE_SHORTFALL");
  }
}));

export type SchedulingEnvelope = z.infer<typeof SchedulingEnvelopeSchema>;
export type AllocationReport = z.infer<typeof AllocationReportSchema>;
