"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudySessionTransitionV2Schema = exports.StudySessionExecutionV2Schema = void 0;
const zod_1 = require("zod");
const primitives_1 = require("./primitives");
/** Execution overlay on the existing StudySession, preserving its actual-time ledger. */
exports.StudySessionExecutionV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema, sessionId: primitives_1.EntityIdV2Schema, ownerId: primitives_1.EntityIdV2Schema,
    questId: primitives_1.EntityIdV2Schema.nullable(), state: zod_1.z.enum(["RUNNING", "PAUSED", "ENDED"]),
    executionVersion: zod_1.z.number().int().positive(), acceptedFocusSeconds: zod_1.z.number().int().nonnegative(),
    acceptedBreakSeconds: zod_1.z.number().int().nonnegative(), startedAt: primitives_1.InstantV2Schema,
    endedAt: primitives_1.InstantV2Schema.nullable(), actualCivilDate: primitives_1.DateV2Schema, timezone: primitives_1.TimezoneV2Schema,
}).superRefine((session, ctx) => {
    if ((session.state === "ENDED") !== (session.endedAt !== null))
        (0, primitives_1.issue)(ctx, ["endedAt"], "Only ended sessions have an ended timestamp");
    if (session.endedAt && Date.parse(session.endedAt) < Date.parse(session.startedAt))
        (0, primitives_1.issue)(ctx, ["endedAt"], "Session end cannot precede its start");
});
/** Transition envelope; user ownership/time clamping and writer admission remain server checks. */
exports.StudySessionTransitionV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema, sessionId: primitives_1.EntityIdV2Schema, expectedExecutionVersion: zod_1.z.number().int().positive(),
    idempotencyKey: zod_1.z.string().min(8).max(100), action: zod_1.z.enum(["PROGRESS", "PAUSE", "RESUME", "END", "STOP_OTHER_DEVICE"]),
    cumulativeFocusSeconds: zod_1.z.number().int().nonnegative(), cumulativeBreakSeconds: zod_1.z.number().int().nonnegative(),
});
