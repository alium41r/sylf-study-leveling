import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, KeySchema } from "../contracts";
import { PREFERENCE_TYPES, type PreferenceType } from "../preference-fields";
import { ownedPlan, transaction, type Tx } from "./core";

export { PREFERENCE_TYPES };
export type { PreferenceType };

/**
 * Learned planning preferences (Phase 6).
 *
 * A preference is one bounded, canonical value per (user, plan, type). A NULL
 * planId means the preference applies to the user's planning in general. The
 * value is a closed canonical token — never free text and never academic content
 * (no topic titles, no quest titles).
 *
 * Learning is conservative: observations are recorded as candidates that
 * increment `evidenceCount`, and a preference only becomes ACTIVE once the
 * evidence crosses {@link PREFERENCE_LEARNING_THRESHOLD} or the user confirms it
 * explicitly. A single observation never creates an active preference. This
 * module writes nothing else — no Quest change, no revision change, no quota —
 * and every read/write verifies plan ownership where a plan is involved.
 */

export const PreferenceTypeSchema = z.enum(PREFERENCE_TYPES);

/**
 * Canonical value encodings, one per preference type. Values are small, closed,
 * content-free tokens (matching the database CHECK of length 1..64 and
 * `^[A-Za-z0-9_]+$`):
 *
 *   SESSION_LENGTH       "15".."240" canonical integer minutes (e.g. "45")
 *   DAILY_DENSITY        "0".."100" canonical integer percent (e.g. "80")
 *   DEMANDING_PLACEMENT  EARLY | MIDDAY | LATE
 *   TASK_DETAIL          LOW | MEDIUM | HIGH
 *   BUFFER_STYLE         NONE | BETWEEN_SESSIONS | END_OF_WEEK
 */
const VALUE_SCHEMAS = {
  SESSION_LENGTH: z
    .string()
    .regex(/^\d{2,3}$/)
    .refine((v) => Number(v) >= 15 && Number(v) <= 240, "SESSION_LENGTH minutes out of range"),
  DAILY_DENSITY: z
    .string()
    .regex(/^\d{1,3}$/)
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, "DAILY_DENSITY percent out of range"),
  DEMANDING_PLACEMENT: z.enum(["EARLY", "MIDDAY", "LATE"]),
  TASK_DETAIL: z.enum(["LOW", "MEDIUM", "HIGH"]),
  BUFFER_STYLE: z.enum(["NONE", "BETWEEN_SESSIONS", "END_OF_WEEK"]),
} as const satisfies Record<PreferenceType, z.ZodType<string>>;

/**
 * Conservative learning threshold: the number of independent candidate
 * observations required before a preference is treated as learned (active).
 *
 * A single observation only records a candidate — one data point is as likely
 * coincidence as preference, and silently reshaping a user's plan off one
 * observation would be worse than not learning at all. Three is the smallest
 * count that separates a stable pattern from noise while still being reachable
 * within a handful of planning sessions; it keeps the system from acting on
 * outliers without making the signal impractical to acquire.
 */
export const PREFERENCE_LEARNING_THRESHOLD = 3;

/**
 * 0..100 confidence derived from evidence, saturating at the threshold. An
 * explicitly confirmed preference is fully confident regardless of evidence.
 */
export function preferenceConfidence(evidenceCount: number, confirmed: boolean): number {
  if (confirmed) return 100;
  if (evidenceCount <= 0) return 0;
  return Math.min(100, Math.round((evidenceCount / PREFERENCE_LEARNING_THRESHOLD) * 100));
}

/** A preference is active when it is not ignored and is learned or confirmed. */
export function isPreferenceActive(
  evidenceCount: number,
  lastConfirmedAt: Date | null,
  ignoredAt: Date | null
): boolean {
  if (ignoredAt) return false;
  return lastConfirmedAt !== null || evidenceCount >= PREFERENCE_LEARNING_THRESHOLD;
}

/** An explicitly confirmed preference is reported as CONFIRMED, otherwise OBSERVED. */
export type PreferenceSource = "CONFIRMED" | "OBSERVED";

export interface PreferenceView {
  preferenceType: PreferenceType;
  value: string;
  confidence: number;
  source: PreferenceSource;
}

const RecordPreferenceSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    preferenceType: PreferenceTypeSchema,
    value: z.string().min(1).max(64),
  })
  .superRefine((value, ctx) => {
    const ok = VALUE_SCHEMAS[value.preferenceType].safeParse(value.value);
    if (!ok.success) {
      ctx.addIssue({ code: "custom", message: `invalid ${value.preferenceType} value` });
    }
  });

const PreferenceKeySchema = z.strictObject({
  schemaVersion: z.literal(1),
  preferenceType: PreferenceTypeSchema,
});

/** Verifies plan ownership when a plan is involved; a NULL planId is user-general. */
async function resolveScope(tx: Tx, userId: number, planId: string | null): Promise<void> {
  if (planId !== null) await ownedPlan(tx, userId, planId);
}

function viewOf(row: {
  preferenceType: string;
  value: string;
  confidence: number;
  lastConfirmedAt: Date | null;
}): PreferenceView {
  return {
    preferenceType: PreferenceTypeSchema.parse(row.preferenceType),
    value: row.value,
    confidence: row.confidence,
    source: row.lastConfirmedAt ? "CONFIRMED" : "OBSERVED",
  };
}

/**
 * Records one candidate observation, incrementing evidence inside a transaction.
 *
 * A single observation creates only a CANDIDATE row (evidenceCount 1 < threshold)
 * and is not returned by the active reads. Repeated observations of the same
 * canonical value accumulate evidence on the one (user, plan, type) row — never
 * duplicates — until the threshold is crossed.
 */
export async function recordCandidateObservation(
  userId: number,
  planId: string | null,
  raw: unknown
) {
  if (planId !== null) KeySchema.parse(planId);
  const body = boundedParse(RecordPreferenceSchema, raw);
  return transaction(userId, async tx => {
    await resolveScope(tx, userId, planId);
    const existing = await tx.plannerPreference.findFirst({
      where: { userId, planId, preferenceType: body.preferenceType },
    });
    const confirmed = existing?.lastConfirmedAt != null;
    const evidenceCount = (existing?.evidenceCount ?? 0) + 1;
    const confidence = preferenceConfidence(evidenceCount, confirmed);
    const row = existing
      ? await tx.plannerPreference.update({
          where: { id: existing.id },
          data: { value: body.value, evidenceCount, confidence },
        })
      : await tx.plannerPreference.create({
          data: {
            userId,
            planId,
            preferenceType: body.preferenceType,
            value: body.value,
            evidenceCount,
            confidence,
          },
        });
    return { ...row, active: isPreferenceActive(row.evidenceCount, row.lastConfirmedAt, row.ignoredAt) };
  });
}

/**
 * Explicitly confirms a preference: it becomes active immediately (confidence 100,
 * lastConfirmedAt set) regardless of evidence, and any prior ignore is cleared.
 */
export async function confirmPreference(
  userId: number,
  planId: string | null,
  raw: unknown
) {
  if (planId !== null) KeySchema.parse(planId);
  const body = boundedParse(RecordPreferenceSchema, raw);
  return transaction(userId, async tx => {
    await resolveScope(tx, userId, planId);
    const existing = await tx.plannerPreference.findFirst({
      where: { userId, planId, preferenceType: body.preferenceType },
    });
    const row = existing
      ? await tx.plannerPreference.update({
          where: { id: existing.id },
          data: { value: body.value, confidence: 100, lastConfirmedAt: new Date(), ignoredAt: null },
        })
      : await tx.plannerPreference.create({
          data: {
            userId,
            planId,
            preferenceType: body.preferenceType,
            value: body.value,
            evidenceCount: 0,
            confidence: 100,
            lastConfirmedAt: new Date(),
          },
        });
    return { ...row, active: true };
  });
}

/**
 * Ignores a preference (for the one plan when planId is set, globally when NULL).
 * Idempotent: ignoring an absent preference is a no-op.
 */
export async function ignorePreference(
  userId: number,
  planId: string | null,
  raw: unknown
) {
  if (planId !== null) KeySchema.parse(planId);
  const body = boundedParse(PreferenceKeySchema, raw);
  return transaction(userId, async tx => {
    await resolveScope(tx, userId, planId);
    const existing = await tx.plannerPreference.findFirst({
      where: { userId, planId, preferenceType: body.preferenceType },
    });
    if (!existing) return { ignored: false, preferenceType: body.preferenceType, planId };
    await tx.plannerPreference.update({
      where: { id: existing.id },
      data: { ignoredAt: new Date() },
    });
    return { ignored: true, preferenceType: body.preferenceType, planId };
  });
}

/**
 * Deletes a preference entirely. Idempotent: deleting an absent preference is a
 * no-op, so reset never surfaces a missing-record error.
 */
export async function resetPreference(
  userId: number,
  planId: string | null,
  raw: unknown
) {
  if (planId !== null) KeySchema.parse(planId);
  const body = boundedParse(PreferenceKeySchema, raw);
  return transaction(userId, async tx => {
    await resolveScope(tx, userId, planId);
    await tx.plannerPreference.deleteMany({
      where: { userId, planId, preferenceType: body.preferenceType },
    });
    return { reset: true, preferenceType: body.preferenceType, planId };
  });
}

/** Active (non-ignored, learned or confirmed) general preferences for a user. */
export async function activePreferencesForUser(userId: number): Promise<PreferenceView[]> {
  return readActive(userId, null);
}

/** Active (non-ignored, learned or confirmed) plan-scoped preferences for a plan. */
export async function activePreferencesForPlan(
  userId: number,
  planId: string
): Promise<PreferenceView[]> {
  KeySchema.parse(planId);
  await ownedPlan(prisma, userId, planId);
  return readActive(userId, planId);
}

async function readActive(userId: number, planId: string | null): Promise<PreferenceView[]> {
  const rows = await prisma.plannerPreference.findMany({
    where: { userId, planId },
    orderBy: { preferenceType: "asc" },
  });
  return rows
    .filter(row => isPreferenceActive(row.evidenceCount, row.lastConfirmedAt, row.ignoredAt))
    .map(viewOf);
}
