import "server-only";
// The model gateway: the single owner of every planner call to deepseek-flash (DeepSeek V4.1 Flash). It owns mode and effort, schema enforcement
// (strict function calling on the beta endpoint with a named tool, falling back to a named tool without strict mode), streaming of tool arguments,
// deadlines, retries, hedging, a circuit breaker, privacy (an HMAC of the user id isolates DeepSeek's prefix cache) and metering through Sylf's
// existing dispatch telemetry. It has exactly one model. Its fallbacks are a lower budget and the deterministic path, never another model.
import { createHmac } from "node:crypto";
import { DEEPSEEK_MODELS, PROVIDER_ENDPOINTS } from "@/lib/ai/config";
import { cleanDeepSeekApiKey } from "@/lib/ai/providers/deepseek";
import { openAIUsage } from "@/lib/ai/providers/usage";
import type { LLMUsage } from "@/lib/ai/providers/types";
import { aiSignal, observeAiDispatch } from "@/lib/ai/telemetry-runtime";
import { StreamingArrayParser } from "../kernel";

export type ProfileName = "intent.parse" | "goal.decompose" | "syllabus.map" | "syllabus.identify" | "syllabus.verify" | "plan.critique" | "copy.brief" | "copy.explain" | "assistant.answer";
interface Profile { maxTokens: number; deadlineMs: number; hedgeMs: number | null; thinking: "disabled" | "enabled"; effort?: "low" | "high" }
export const PROFILES: Record<ProfileName, Profile> = {
  "intent.parse": { maxTokens: 700, deadlineMs: 15_000, hedgeMs: 2_500, thinking: "disabled" },
  "goal.decompose": { maxTokens: 3_400, deadlineMs: 45_000, hedgeMs: 2_500, thinking: "disabled" },
  "syllabus.map": { maxTokens: 5_000, deadlineMs: 70_000, hedgeMs: 2_500, thinking: "disabled" },
  "syllabus.identify": { maxTokens: 300, deadlineMs: 15_000, hedgeMs: 2_500, thinking: "disabled" },
  "syllabus.verify": { maxTokens: 3_000, deadlineMs: 55_000, hedgeMs: null, thinking: "disabled" },
  "plan.critique": { maxTokens: 1_000, deadlineMs: 20_000, hedgeMs: null, thinking: "disabled" },
  "copy.brief": { maxTokens: 220, deadlineMs: 10_000, hedgeMs: 2_500, thinking: "disabled" },
  "copy.explain": { maxTokens: 160, deadlineMs: 8_000, hedgeMs: 2_500, thinking: "disabled" },
  "assistant.answer": { maxTokens: 420, deadlineMs: 15_000, hedgeMs: 2_500, thinking: "disabled" },
};

export type GatewayErrorCode = "unavailable" | "timeout" | "invalid" | "rate_limited" | "circuit_open" | "cancelled";
export class GatewayError extends Error {
  constructor(readonly code: GatewayErrorCode, message: string, readonly status: number | null = null) { super(message); }
}

export interface WireMessage { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string }
export interface ToolSpec { name: string; description: string; parameters: object }
export interface CallStats { model: string; usage?: LLMUsage; latencyMs: number; firstTokenMs: number | null; finish: string | null; attempts: number; hedged: boolean; strict: boolean }
export interface ToolResult<T> extends CallStats { args: T; raw: string; partial: boolean; callId: string }

let strictAvailable = true;
let userIdAccepted = true;
const breaker = { failures: [] as number[], openUntil: 0 };
const BREAKER_WINDOW = 60_000; const BREAKER_LIMIT = 5; const BREAKER_COOLDOWN = 30_000;

export function gatewayHealth() { return { open: Date.now() < breaker.openUntil, strict: strictAvailable }; }
/** Test seam: resets in-process adaptive state. */
export function resetGatewayState() { strictAvailable = true; userIdAccepted = true; breaker.failures = []; breaker.openUntil = 0; }

function recordFailure() {
  const now = Date.now();
  breaker.failures = breaker.failures.filter((t) => now - t < BREAKER_WINDOW).concat(now);
  if (breaker.failures.length >= BREAKER_LIMIT) breaker.openUntil = now + BREAKER_COOLDOWN;
}
function recordSuccess() { breaker.failures = []; }

export function hashedUser(userId: number): string {
  const secret = process.env.SYLF_PLANNER_USER_HASH_KEY || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || process.env.DEEPSEEK_API_KEY || "sylf-planner";
  return `sylf-${createHmac("sha256", secret).update(`planner:${userId}`).digest("hex").slice(0, 32)}`;
}

const base = () => PROVIDER_ENDPOINTS.deepseek.replace(/[^\x20-\x7E]/g, "").trim().replace(/\/+$/, "");
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

interface StreamOutcome { text: string; args: string; callId: string; usage?: LLMUsage; model: string; finish: string | null; firstTokenMs: number | null }

/** One streamed HTTP attempt. `onFirst` fires on the first content or argument characters. */
async function attempt(payload: Record<string, unknown>, url: string, signal: AbortSignal, started: number, onFirst: () => void, onArgs: (chunk: string) => void, onText: (chunk: string) => void): Promise<StreamOutcome> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cleanDeepSeekApiKey(process.env.DEEPSEEK_API_KEY)}` }, body: JSON.stringify(payload), signal });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const code: GatewayErrorCode = response.status === 429 ? "rate_limited" : response.status >= 500 ? "unavailable" : "invalid";
    throw new GatewayError(code, `DeepSeek responded ${response.status}: ${body.slice(0, 200)}`, response.status);
  }
  if (!response.body) throw new GatewayError("unavailable", "DeepSeek returned no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ""; const out: StreamOutcome = { text: "", args: "", callId: "", model: String(payload.model), finish: null, firstTokenMs: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let chunk: { model?: string; usage?: Record<string, unknown>; choices?: { delta?: { content?: string | null; tool_calls?: { id?: string; function?: { arguments?: string } }[] }; finish_reason?: string | null }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.model) out.model = chunk.model;
      if (chunk.usage) out.usage = openAIUsage(chunk.usage);
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) out.finish = choice.finish_reason;
      const call = choice?.delta?.tool_calls?.[0];
      if (call?.id) out.callId = call.id;
      const args = call?.function?.arguments ?? "";
      const text = choice?.delta?.content ?? "";
      if ((args || text) && out.firstTokenMs == null) { out.firstTokenMs = Date.now() - started; onFirst(); }
      if (args) { out.args += args; onArgs(args); }
      if (text) { out.text += text; onText(text); }
    }
  }
  return out;
}

interface RunOptions { userId: number; profile: ProfileName; messages: WireMessage[]; tool?: ToolSpec; signal?: AbortSignal; onArgs?: (chunk: string) => void; onText?: (chunk: string) => void }

async function run(options: RunOptions): Promise<StreamOutcome & CallStats> {
  if (!process.env.DEEPSEEK_API_KEY) throw new GatewayError("unavailable", "DeepSeek is not configured.");
  if (Date.now() < breaker.openUntil) throw new GatewayError("circuit_open", "Planner AI is paused after repeated failures.");
  const profile = PROFILES[options.profile];
  const deadline = aiSignal(options.signal, profile.deadlineMs);
  const model = DEEPSEEK_MODELS.planner;
  const started = Date.now();
  let attempts = 0; let hedged = false;

  const payloadFor = (strict: boolean) => ({
    model, messages: options.messages, stream: true, stream_options: { include_usage: true }, max_tokens: profile.maxTokens,
    thinking: { type: profile.thinking }, ...(profile.effort ? { reasoning_effort: profile.effort } : {}),
    ...(userIdAccepted ? { user_id: hashedUser(options.userId) } : {}),
    ...(options.tool ? { tools: [{ type: "function", function: { name: options.tool.name, description: options.tool.description, parameters: options.tool.parameters, ...(strict ? { strict: true } : {}) } }], tool_choice: { type: "function", function: { name: options.tool.name } } } : {}),
  });

  const once = async (retryIndex: number): Promise<StreamOutcome & { strict: boolean }> => {
    const strict = Boolean(options.tool) && strictAvailable;
    const url = `${base()}${strict ? "/beta" : ""}/chat/completions`;
    // Hedging: a duplicate starts when no first token arrives in time; the first to answer wins and the other is cancelled.
    const controllers = [new AbortController()];
    let winner = -1;
    const launch = (index: number) => {
      attempts++;
      const signal = AbortSignal.any([deadline, controllers[index].signal]);
      return observeAiDispatch("deepseek", model, () => attempt(payloadFor(strict), url, signal, started,
        () => { if (winner < 0) { winner = index; controllers.forEach((c, i) => { if (i !== index) c.abort(new DOMException("Hedge lost", "AbortError")); }); } },
        (chunk) => { if (winner === index) options.onArgs?.(chunk); },
        (chunk) => { if (winner === index) options.onText?.(chunk); },
      ), (value) => ({ model: value.model, usage: value.usage, finishReason: value.finish ?? undefined }), true, { stage: `studio.${options.profile}`, retryIndex: retryIndex + index });
    };
    const runs: Promise<StreamOutcome>[] = [launch(0)];
    if (profile.hedgeMs != null) {
      const hedge = new Promise<StreamOutcome>((resolve, reject) => {
        let launched = false;
        const timer = setTimeout(() => {
          if (winner >= 0 || deadline.aborted) return reject(new GatewayError("cancelled", "Hedge not needed"));
          launched = true; hedged = true; controllers.push(new AbortController());
          launch(1).then(resolve, reject);
        }, profile.hedgeMs!);
        const cancel = () => { if (!launched) { clearTimeout(timer); reject(new GatewayError("cancelled", "Hedge not needed")); } };
        deadline.addEventListener("abort", cancel, { once: true });
        runs[0].then(cancel, cancel);
      });
      runs.push(hedge);
    }
    const settled = await Promise.allSettled(runs);
    const winning = winner >= 0 ? settled[winner] : settled.find((s) => s.status === "fulfilled");
    if (winning?.status === "fulfilled") return { ...winning.value, strict };
    const failure = settled.map((s) => (s.status === "rejected" ? s.reason : null)).find((r) => r && !(r instanceof GatewayError && r.code === "cancelled"));
    throw failure ?? new GatewayError("unavailable", "DeepSeek did not answer.");
  };

  let last: unknown = null;
  for (let retry = 0; retry < 3; retry++) {
    try {
      const outcome = await once(retry);
      recordSuccess();
      return { ...outcome, latencyMs: Date.now() - started, attempts, hedged };
    } catch (error) {
      last = error;
      if (deadline.aborted) break;
      const status = error instanceof GatewayError ? error.status : null;
      const body = error instanceof Error ? error.message : "";
      // Adapt once to what the endpoint accepts, then retry immediately.
      if (status && status >= 400 && status < 500 && status !== 429) {
        if (/user_id/i.test(body) && userIdAccepted) { userIdAccepted = false; continue; }
        if (options.tool && strictAvailable) { strictAvailable = false; continue; }
        break;
      }
      if (retry < 2) await sleep(250 + Math.floor(Math.random() * 600) * (retry + 1), deadline).catch(() => undefined);
    }
  }
  recordFailure();
  if (deadline.aborted && !(options.signal?.aborted)) throw new GatewayError("timeout", "The planner took too long to answer.");
  if (options.signal?.aborted) throw new GatewayError("cancelled", "Cancelled.");
  throw last instanceof GatewayError ? last : new GatewayError("unavailable", last instanceof Error ? last.message : "DeepSeek failed.");
}

/**
 * A schema-locked tool call. With `stream`, each element of the named top-level array is handed over as soon as it is complete, so the solver can
 * start before the model finishes. Truncated output returns whatever complete elements arrived, flagged partial.
 */
export async function callTool<T>(options: { userId: number; profile: ProfileName; messages: WireMessage[]; tool: ToolSpec; signal?: AbortSignal; stream?: { field: string; onElement: (value: unknown, index: number) => void } }): Promise<ToolResult<T>> {
  const parser = options.stream ? new StreamingArrayParser<unknown>(options.stream.field, options.stream.onElement) : null;
  const outcome = await run({ userId: options.userId, profile: options.profile, messages: options.messages, tool: options.tool, signal: options.signal, onArgs: (chunk) => parser?.push(chunk) });
  const raw = outcome.args || outcome.text;
  let args: unknown = null;
  try { args = raw ? JSON.parse(raw) : null; } catch { args = null; }
  const partial = args == null || outcome.finish === "length";
  if (args == null && parser && parser.emitted > 0) {
    // Truncated mid-array: keep the complete elements.
    args = { [options.stream!.field]: [] as unknown[], __partial: true };
  }
  if (args == null) throw new GatewayError("invalid", outcome.finish === "length" ? "The planner's answer was cut off." : "The planner returned an empty or invalid answer.");
  return { args: args as T, raw, partial, callId: outcome.callId || "call_0", model: outcome.model, usage: outcome.usage, latencyMs: outcome.latencyMs, firstTokenMs: outcome.firstTokenMs, finish: outcome.finish, attempts: outcome.attempts, hedged: outcome.hedged, strict: outcome.strict };
}

/** Streamed plain text for briefs and explanations. */
export async function callText(options: { userId: number; profile: ProfileName; system: string; user: string; signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<CallStats & { text: string }> {
  const outcome = await run({ userId: options.userId, profile: options.profile, messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }], signal: options.signal, onText: options.onDelta });
  const text = outcome.text.trim();
  if (!text) throw new GatewayError("invalid", "The planner returned no text.");
  return { text, model: outcome.model, usage: outcome.usage, latencyMs: outcome.latencyMs, firstTokenMs: outcome.firstTokenMs, finish: outcome.finish, attempts: outcome.attempts, hedged: outcome.hedged, strict: outcome.strict };
}
