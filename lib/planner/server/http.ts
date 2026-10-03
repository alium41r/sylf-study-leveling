import "server-only";
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
import { LIMITS } from "../contracts";
import { PlannerError, PlannerValidationError } from "../errors";
import { DurablePlannerError } from "../v2/server/database";
import { PLANNER_V2_ENVELOPE, plannerSerializedBytes } from "../v2/contracts";

export async function readBody(request: Request, maximumBytes: number = LIMITS.payloadBytes): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new PlannerError(400, "INVALID_BODY");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        if (maximumBytes === PLANNER_V2_ENVELOPE.serializedBytes) throw new DurablePlannerError("PAYLOAD_TOO_LARGE", "This request exceeds the Planner transport limit.", "INTAKE");
        throw new PlannerError(400, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(chunk.value);
    }
    const merged = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged));
  } catch (err) { if (err instanceof PlannerError || err instanceof DurablePlannerError) throw err; throw new PlannerError(400, "INVALID_BODY"); }
  finally { reader.releaseLock(); }
}
/**
 * Planner validation codes that describe a user-facing limit rather than an
 * internal rule. Everything else collapses to INVALID_DRAFT so no validator,
 * critic or provider detail is exposed.
 */
const REPORTABLE_VALIDATION_CODES = new Set([
  "INVALID_COMPLETION_CRITERIA",
  "HARD_SESSION_LIMIT_EXCEEDED",
  "HARD_UNAVAILABLE_DAY_USED",
  "HARD_WEEKLY_LIMIT_EXCEEDED",
]);
export async function plannerRoute(request: Request, action: (userId: number) => Promise<unknown>): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) throw new PlannerError(401, "UNAUTHORIZED");
    const result = await action(session.userId);
    if (result instanceof Response) return result;
    if (plannerSerializedBytes(result) > PLANNER_V2_ENVELOPE.serializedBytes) throw new DurablePlannerError("PAYLOAD_TOO_LARGE", "This response exceeds the Planner transport limit. Request a smaller page.");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof DurablePlannerError) {
      const code = err.detail.code;
      const status = code === "PLAN_NOT_FOUND" || code === "REFERENCE_NOT_OWNED" ? 404
        : code === "PAYLOAD_TOO_LARGE" ? 413 : code === "INVALID_OUTPUT" ? 422
        : ["WORKER_UNAVAILABLE", "SAVE_FAILED", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT"].includes(code) ? 503 : 409;
      return Response.json({ error: { code }, detail: err.detail }, { status, headers: { "Cache-Control": "private, no-store" } });
    }
    const status = err instanceof PlannerError ? err.status : err instanceof z.ZodError ? 400 : err instanceof PlannerValidationError ? 422 : 503;
    const code = err instanceof PlannerError ? err.code : err instanceof z.ZodError ? "INVALID_REQUEST" : err instanceof PlannerValidationError && REPORTABLE_VALIDATION_CODES.has(err.message) ? err.message : err instanceof PlannerValidationError ? "INVALID_DRAFT" : "PLANNER_UNAVAILABLE";
    // Never log request, snapshots, provider errors, or raw database exceptions.
    // A bounded, explicitly-attached payload (the flexible-edit findings) travels under
    // `findings`; it is the only extra field any error response may carry.
    const details = err instanceof PlannerError ? err.details : undefined;
    return Response.json(
      { error: { code }, ...(details ? { findings: details } : {}) },
      { status, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
