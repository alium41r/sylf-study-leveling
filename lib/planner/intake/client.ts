"use client";
import { plannerFetch, postJson, PlannerClientError } from "../transport";
import { resolveApiUrl } from "../../api-transport";
import type { IntakeAction, IntakeMirror, IntakeView } from "./actions";
import { BRIEF_LIMITS, type PlanBriefV1 } from "./brief";

/**
 * The Quick Plan client: create, read, patch and act on a planner intake session.
 *
 * Two rules shape everything here.
 *
 * 1. **The server is the authority.** Nothing in this module computes readiness, a
 *    distribution, or a hard limit. The client sends what the student said and shows
 *    what comes back, because the facts that matter (floating rest dates, existing
 *    Quest load, the account's own schedule) exist only on the server.
 * 2. **Local storage is a cache, never a source of truth.** The mirror below exists so
 *    a refresh paints the student's work immediately instead of flashing an empty
 *    form; the session it points at is then re-read from the server, which wins every
 *    disagreement.
 */

const KEY_PREFIX = "sylf.planner.intake.key.";
const MIRROR_PREFIX = "sylf.planner.intake.mirror.";
/** The mirror is bounded like the brief it caches; a bigger one is simply not kept. */
const MIRROR_MAX_BYTES = BRIEF_LIMITS.briefBytes;

interface StoredMirror extends IntakeMirror {
  brief: PlanBriefV1;
}

const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const storage = (kind: "local" | "session"): Storage | null => {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Private modes and disabled storage are not errors: the intake still works
    // against the server, the student just loses the instant-paint cache.
    return null;
  }
};

/**
 * The idempotency key for this browser's unfinished intake of one mode.
 *
 * It is kept in `localStorage` rather than `sessionStorage` on purpose: a student who
 * closes the tab and comes back should find their half-filled brief, and the server
 * already refuses to merge two writers (`INTAKE_STALE`), so sharing the key between
 * tabs cannot silently combine two people's answers.
 */
export function clientKeyFor(mode: PlanBriefV1["mode"], rotate = false): string {
  const store = storage("local");
  const name = `${KEY_PREFIX}${mode}`;
  const existing = rotate ? null : store?.getItem(name);
  if (existing) return existing;
  const created = uuid().replace(/[^a-zA-Z0-9_-]/g, "");
  try {
    store?.setItem(name, created);
  } catch {
    /* bounded best-effort */
  }
  return created;
}

/** Last-known session for this tab, for instant paint before the server answers. */
export function readMirror(mode: PlanBriefV1["mode"]): StoredMirror | null {
  const raw = storage("session")?.getItem(`${MIRROR_PREFIX}${mode}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredMirror;
    if (!parsed?.id || parsed.mode !== mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMirror(view: IntakeView): void {
  const payload: StoredMirror = {
    id: view.id,
    mode: view.mode,
    version: view.version,
    readiness: view.readiness.state,
    expiresAt: view.expiresAt,
    brief: view.brief,
  };
  const json = JSON.stringify(payload);
  if (json.length > MIRROR_MAX_BYTES) return;
  try {
    storage("session")?.setItem(`${MIRROR_PREFIX}${view.mode}`, json);
  } catch {
    /* bounded best-effort */
  }
}

export function clearMirror(mode: PlanBriefV1["mode"]): void {
  try {
    storage("session")?.removeItem(`${MIRROR_PREFIX}${mode}`);
  } catch {
    /* bounded best-effort */
  }
}

/** Create or resume this browser's intake for a mode. Idempotent by `clientKey`. */
export const createOrResumeIntake = async (
  mode: PlanBriefV1["mode"],
  options: { fresh?: boolean; clientKey?: string } = {}
): Promise<IntakeView> =>
  assertIntakeView(
    await plannerFetch<unknown>("/intake", {
      ...postJson({ schemaVersion: 1, clientKey: options.clientKey ?? clientKeyFor(mode, options.fresh), mode }),
    })
  );

export const readIntake = async (id: string): Promise<IntakeView> =>
  assertIntakeView(await plannerFetch<unknown>(`/intake/${encodeURIComponent(id)}`));

export const patchIntakeBrief = async (
  id: string,
  body: { expectedVersion: number; brief: PlanBriefV1 }
): Promise<IntakeView> =>
  assertIntakeView(
    await plannerFetch<unknown>(`/intake/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, ...body }),
    })
  );

/** `Omit` that distributes across a discriminated union instead of collapsing it. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * One action as the caller writes it: the action's own fields only.
 *
 * `schemaVersion`, `expectedVersion` and `actionKey` are added by the sender below,
 * so no call site can forget the concurrency guard or the idempotency key.
 */
export type IntakeActionRequest = DistributiveOmit<
  IntakeAction,
  "schemaVersion" | "expectedVersion" | "actionKey"
>;

export const sendIntakeAction = async (
  id: string,
  action: IntakeActionRequest,
  expectedVersion: number,
  actionKey: string = uuid()
): Promise<IntakeView> =>
  assertIntakeView(
    await plannerFetch<unknown>(`/intake/${encodeURIComponent(id)}/action`, {
      ...postJson({ schemaVersion: 1, expectedVersion, actionKey, ...action }),
    })
  );

/**
 * Check the envelope the UI is about to render.
 *
 * A response that is not an intake view would otherwise reach the surface as a
 * truthy object with missing fields, which React renders as a blank page — a whole
 * screen lost to a contract mismatch, with nothing to read. This turns that into a
 * named client error the surface can show, and it never invents a default: a missing
 * readiness is an error, not an empty brief.
 */
function assertIntakeView(value: unknown): IntakeView {
  const candidate = value as Partial<IntakeView> | null;
  const ok =
    candidate &&
    typeof candidate.id === "string" &&
    typeof candidate.version === "number" &&
    typeof candidate.brief === "object" &&
    candidate.brief !== null &&
    typeof candidate.readiness === "object" &&
    candidate.readiness !== null &&
    Array.isArray(candidate.readiness.missing) &&
    Array.isArray(candidate.questions) &&
    Array.isArray(candidate.warnings) &&
    // Phase 3's comparison envelope. Checked here for the same reason readiness is: a
    // missing one would reach the surface as a truthy object with no `units`, and the
    // whole Quick Plan would disappear rather than report a contract mismatch.
    typeof candidate.comparison === "object" &&
    candidate.comparison !== null &&
    Array.isArray(candidate.comparison.units);
  if (!ok) throw new PlannerClientError("INVALID_RESPONSE");
  return candidate as IntakeView;
}

/**
 * Import a syllabus document.
 *
 * Multipart, because a file is not JSON, and it goes to its own route so the size cap
 * and MIME decision live on the server. Everything the route does afterwards is a
 * normal versioned intake mutation, so an import cannot bypass the session's
 * concurrency rules.
 */
export const uploadIntakeSyllabus = async (
  id: string,
  input: { file: File; expectedVersion: number; actionKey?: string }
): Promise<IntakeView & { import: ImportSummary }> => {
  const body = new FormData();
  body.set("schemaVersion", "1");
  body.set("expectedVersion", String(input.expectedVersion));
  body.set("actionKey", input.actionKey ?? uuid());
  body.set("file", input.file);
  const response = await fetch(resolveApiUrl(`/api/planner/intake/${encodeURIComponent(id)}/import`), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    body,
  });
  const payload = (await response.json().catch(() => null)) as
    | (Partial<IntakeView> & { import?: ImportSummary })
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string } } | null;
    throw new PlannerClientError(error?.error?.code ?? "IMPORT_FAILED", undefined, error?.error?.message);
  }
  return { ...assertIntakeView(payload), import: (payload as { import?: ImportSummary }).import! };
};

export interface ImportSummary {
  pages: { from: number; to: number }[];
  partial: boolean;
  partialReason: string | null;
  method: "TEXT" | "VISION" | "PASTE";
}

export type IntakeClientErrorCode =
  | "INTAKE_STALE"
  | "INTAKE_EXPIRED"
  | "BRIEF_NOT_READY"
  | "NOT_AVAILABLE"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_DRAFT"
  | "INVALID_RESPONSE"
  | "PLANNER_UNAVAILABLE";

export const intakeErrorCode = (error: unknown): string =>
  error instanceof PlannerClientError ? error.code : "PLANNER_UNAVAILABLE";
