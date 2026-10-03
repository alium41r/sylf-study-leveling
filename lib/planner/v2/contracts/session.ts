import { z } from "zod";
import { DateV2Schema, EntityIdV2Schema, InstantV2Schema, TimezoneV2Schema, VersionV2Schema, issue } from "./primitives";

/** Execution overlay on the existing StudySession, preserving its actual-time ledger. */
export const StudySessionExecutionV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema, sessionId: EntityIdV2Schema, ownerId: EntityIdV2Schema,
  questId: EntityIdV2Schema.nullable(), state: z.enum(["RUNNING", "PAUSED", "ENDED"]),
  executionVersion: z.number().int().positive(), acceptedFocusSeconds: z.number().int().nonnegative(),
  acceptedBreakSeconds: z.number().int().nonnegative(), startedAt: InstantV2Schema,
  endedAt: InstantV2Schema.nullable(), actualCivilDate: DateV2Schema, timezone: TimezoneV2Schema,
}).superRefine((session, ctx) => {
  if ((session.state === "ENDED") !== (session.endedAt !== null)) issue(ctx, ["endedAt"], "Only ended sessions have an ended timestamp");
  if (session.endedAt && Date.parse(session.endedAt) < Date.parse(session.startedAt)) issue(ctx, ["endedAt"], "Session end cannot precede its start");
});

/** Transition envelope; user ownership/time clamping and writer admission remain server checks. */
export const StudySessionTransitionV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema, sessionId: EntityIdV2Schema, expectedExecutionVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(100), action: z.enum(["PROGRESS", "PAUSE", "RESUME", "END", "STOP_OTHER_DEVICE"]),
  cumulativeFocusSeconds: z.number().int().nonnegative(), cumulativeBreakSeconds: z.number().int().nonnegative(),
});
