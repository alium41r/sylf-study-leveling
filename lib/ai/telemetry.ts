import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { LLMUsage } from "./providers/types";

type Feature = "chat" | "planner" | "syllabus" | "other";
interface Context { userId?: number; feature: Feature; workload: string; rootRequestId: string; sequence: number; pending: Promise<void>[]; signal?: AbortSignal }
const requests = new AsyncLocalStorage<Context>();

/** Server-only execution metadata. Never place prompt text, URLs or user labels here. */
export async function withAiRequest<T>(input: { userId?: number; feature: Feature; workload: string; signal?: AbortSignal }, action: () => Promise<T>): Promise<T> {
  const current = requests.getStore();
  if (current) return action();
  const context: Context = { ...input, rootRequestId: randomUUID(), sequence: 0, pending: [] };
  return requests.run(context, async () => {
    try { return await action(); }
    finally { await Promise.allSettled(context.pending); }
  });
}
export function setAiUser(userId: number) { const context = requests.getStore(); if (context) context.userId = userId; }
export function aiRequestUser() { return requests.getStore()?.userId; }
export function hasAiRequest() { return Boolean(requests.getStore()); }
export function aiRequestSignal() { return requests.getStore()?.signal; }
export function aiSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal {
  if (timeoutMs === undefined && signal && (!aiRequestSignal() || aiRequestSignal() === signal)) return signal;
  const signals = [signal, aiRequestSignal(), ...(!signal || timeoutMs !== undefined ? [AbortSignal.timeout(timeoutMs ?? 90_000)] : [])].filter((s): s is AbortSignal => Boolean(s));
  return AbortSignal.any(signals);
}

export interface DispatchResult { model?: string; usage?: LLMUsage; finishReason?: string; grounding?: boolean }
const modelLabel = (value: string) => /^[a-zA-Z0-9_./:-]{1,128}$/.test(value) ? value : "unreported";

/** One explicit wire dispatch, including failures. SDK retries must be disabled. */
export async function observeAiDispatch<T>(provider: string, requestedModel: string, call: () => Promise<T>, describe: (value: T) => DispatchResult, enabled = true, attempt: { stage?: string; retryIndex?: number } = {}): Promise<T> {
  const context = requests.getStore();
  context?.signal?.throwIfAborted();
  const dispatchIndex = context ? context.sequence++ : 0;
  const requestId = randomUUID();
  const logger = enabled && context?.userId ? await import("./usage-logger").catch(() => null) : null;
  if (logger && context?.userId) await logger.logAiDispatch({
    userId: context.userId, feature: context.feature, workload: context.workload, provider,
    model: modelLabel(requestedModel), requestedModel: modelLabel(requestedModel), requestId,
    rootRequestId: context.rootRequestId, dispatchIndex, retryIndex: attempt.retryIndex ?? 0, stage: attempt.stage ?? context.workload,
    latencyMs: 0, outcome: "DISPATCHED", modelVerified: false, grounding: false,
  }, "start");
  const started = Date.now();
  let result: DispatchResult = {};
  let outcome = "SUCCEEDED";
  try {
    const value = await call();
    result = describe(value);
    return value;
  } catch (error) {
    outcome = context?.signal?.aborted || (error instanceof Error && /abort|timeout/i.test(error.name)) ? "CANCELLED" : "FAILED";
    throw error;
  } finally {
    if (enabled && context?.userId) {
      const metadata = {
        userId: context.userId, feature: context.feature, workload: context.workload,
        provider, model: modelLabel(result.model ?? requestedModel), requestedModel: modelLabel(requestedModel),
        requestId, rootRequestId: context.rootRequestId, dispatchIndex,
        retryIndex: attempt.retryIndex ?? 0, stage: attempt.stage ?? context.workload,
        latencyMs: Math.max(0, Date.now() - started), outcome,
        usage: result.usage, modelVerified: Boolean(result.model), finishReason: result.finishReason,
        grounding: result.grounding ?? false,
      };
      // Awaited at the authenticated boundary; no fire-and-forget ledger writes.
      // Dynamic import keeps database code out of provider-only consumers/tests.
      if (logger) context.pending.push(logger.logAiDispatch(metadata));
    }
  }
}
