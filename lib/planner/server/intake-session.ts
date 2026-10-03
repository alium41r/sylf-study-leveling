import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { boundedParse, KeySchema, ModeSchema } from "../contracts";
import { PlannerError } from "../errors";
import { json, ownedPlan, transaction } from "./core";

/**
 * Pre-generation planner intake sessions (UX Phase 1).
 *
 * `PlannerIntakeSession` is the durable home for the working "Plan Brief" a
 * student builds before generation starts. It lives beside the engine — never in
 * a PREPARING revision (a live operation holding a quota lease), never in a
 * sealed revision, never in Quest metadata, and never in the DRAFT plan shell
 * (which is created only when generation starts). One small owner-scoped table
 * is the smallest correct answer, so a page refresh cannot lose a Quick Plan.
 *
 * This module is pure persistence and concurrency. It deliberately does not know
 * what a mode means, how generation works, or the brief's internal shape: the
 * brief is treated as bounded JSON (a 64 KiB envelope), and `mode` is the same
 * closed string set the engine already uses. Every read/write is owner-scoped
 * through `userId`; a foreign or unknown id is NOT_FOUND and never
 * distinguishable from missing.
 *
 * Optimistic concurrency: a successful patch increments `version`; a mutation
 * that carries a stale `expectedVersion` throws INTAKE_STALE and changes nothing.
 * Create is idempotent under `(userId, clientKey)`. Every mutation slides
 * `expiresAt` forward by {@link INTAKE_SESSION_TTL_DAYS} days from the moment it
 * succeeds; a session is expired once that instant has passed (see
 * {@link isExpired}).
 */

/** Sliding lifetime: a session is kept for 30 days from its last mutation. */
export const INTAKE_SESSION_TTL_DAYS = 30;

/** Phase 0 budget: a Plan Brief payload is at most 64 KiB serialized. */
const INTAKE_BRIEF_BYTES = 64 * 1024;

/** Cleanup deletes in bounded batches; a batch this size keeps any one pass short. */
const CLEANUP_BATCH_SIZE = 500;

const TTL_MS = INTAKE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Client-minted idempotency key, bounded exactly like the engine's operation and
 * creation keys (8..100 URL-safe characters) so it is a safe lookup key and can
 * never carry academic content.
 */
const ClientKeySchema = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/);

const CreateSessionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  clientKey: ClientKeySchema,
  mode: ModeSchema,
});

const PatchSessionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  brief: z.unknown(),
});

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + TTL_MS);
}

/**
 * A session is expired once `expiresAt` has been reached. Pure and unit-tested
 * independently of the database; the boundary is inclusive (`<=`) so a session
 * at exactly its expiry instant reads as expired, matching cleanup's predicate.
 */
export function isExpired(session: { expiresAt: Date }, now: Date = new Date()): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

/**
 * Serializes the brief once, enforcing the 64 KiB envelope before any write. The
 * brief's shape is not inspected — only that it is JSON and within budget. A
 * non-serializable value is INVALID_BRIEF; an over-budget one is PAYLOAD_TOO_LARGE.
 */
function boundedBrief(value: unknown): ReturnType<typeof json> {
  let bytes = -1;
  try {
    const serialized = JSON.stringify(value);
    bytes = serialized === undefined ? -1 : new TextEncoder().encode(serialized).byteLength;
  } catch {
    bytes = -1;
  }
  if (bytes < 0) throw new PlannerError(422, "INVALID_BRIEF");
  if (bytes > INTAKE_BRIEF_BYTES) throw new PlannerError(422, "PAYLOAD_TOO_LARGE");
  return json(value);
}

/**
 * Creates a session, or resumes the one already recorded for this
 * `(userId, clientKey)`. Idempotent: a retry with the same key returns the same
 * row (never a duplicate). A retry with the same key but a different mode returns
 * the existing session unchanged and flags the mismatch rather than mutating it.
 */
export async function createOrResumeSession(userId: number, raw: unknown) {
  const body = boundedParse(CreateSessionSchema, raw);
  return transaction(userId, async tx => {
    const existing = await tx.plannerIntakeSession.findUnique({
      where: { userId_clientKey: { userId, clientKey: body.clientKey } },
    });
    if (existing) {
      return { ...existing, resumed: true, modeMismatch: existing.mode !== body.mode };
    }
    const session = await tx.plannerIntakeSession.create({
      data: {
        userId,
        clientKey: body.clientKey,
        mode: body.mode,
        brief: json({}),
        expiresAt: expiryFrom(new Date()),
      },
    });
    return { ...session, resumed: false, modeMismatch: false };
  });
}

/** Owner-scoped read. A foreign or unknown id is NOT_FOUND, never distinguishable from missing. */
export async function readSession(userId: number, sessionId: string) {
  KeySchema.parse(sessionId);
  const session = await prisma.plannerIntakeSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new PlannerError(404, "NOT_FOUND");
  return session;
}

/**
 * Applies a new brief only when `expectedVersion` equals the session's current
 * version, then increments the version and slides `expiresAt`. On a mismatch this
 * throws INTAKE_STALE and changes nothing, so a second tab cannot clobber the
 * first. The brief is validated against the 64 KiB envelope before the
 * transaction opens.
 */
export async function patchSession(userId: number, sessionId: string, raw: unknown) {
  KeySchema.parse(sessionId);
  const body = boundedParse(PatchSessionSchema, raw);
  const brief = boundedBrief(body.brief);
  return transaction(userId, async tx => {
    const session = await tx.plannerIntakeSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new PlannerError(404, "NOT_FOUND");
    if (session.version !== body.expectedVersion) throw new PlannerError(409, "INTAKE_STALE");
    return tx.plannerIntakeSession.update({
      where: { id: session.id },
      data: { brief, version: { increment: 1 }, expiresAt: expiryFrom(new Date()) },
    });
  });
}

/**
 * Records the plan this intake generated, verifying the plan belongs to the user
 * (a foreign or unknown plan is NOT_FOUND). `expectedVersion` guards the
 * transition against a stale brief view (INTAKE_STALE on mismatch). Recording the
 * plan does not advance the brief's `version` — the two are independent — but it
 * still slides `expiresAt`, as every successful mutation does.
 */
export async function bindPlan(userId: number, sessionId: string, planId: string, expectedVersion: number) {
  KeySchema.parse(sessionId);
  KeySchema.parse(planId);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new PlannerError(400, "INVALID_REQUEST");
  return transaction(userId, async tx => {
    const session = await tx.plannerIntakeSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new PlannerError(404, "NOT_FOUND");
    await ownedPlan(tx, userId, planId);
    if (session.version !== expectedVersion) throw new PlannerError(409, "INTAKE_STALE");
    return tx.plannerIntakeSession.update({
      where: { id: session.id },
      data: { planId, expiresAt: expiryFrom(new Date()) },
    });
  });
}

/**
 * Owner-scoped delete. Idempotent: deleting an absent (or foreign) session is a
 * no-op, never an error, and never distinguishable from missing. Deleting an
 * intake session never deletes a plan: the planId FK is SetNull on the plan side.
 */
export async function deleteSession(userId: number, sessionId: string) {
  KeySchema.parse(sessionId);
  return transaction(userId, async tx => {
    const { count } = await tx.plannerIntakeSession.deleteMany({ where: { id: sessionId, userId } });
    return { deleted: count > 0 };
  });
}

/**
 * Deletes expired sessions in bounded batches and returns the total removed.
 * Touches nothing else: no PlannerPlan, revision, link or Quest is read or
 * written. Deliberately not owner-scoped and not route-exposed: this is a maintenance
 * pass that must keep reclaiming expired rows even while the planner feature
 * flag is off.
 */
export async function cleanupExpiredSessions(now: Date = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await prisma.plannerIntakeSession.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: CLEANUP_BATCH_SIZE,
    });
    if (batch.length === 0) break;
    await prisma.plannerIntakeSession.deleteMany({ where: { id: { in: batch.map(row => row.id) } } });
    total += batch.length;
    if (batch.length < CLEANUP_BATCH_SIZE) break;
  }
  return total;
}
