"use client";
import { z } from "zod";
import { KeySchema } from "./contracts";
import { resolveApiUrl } from "../api-transport";

/**
 * The single client transport for every Planner Mode.
 *
 * Exam, Roadmap and expansion share one fetch/session/error/progress
 * implementation; only the mode-specific call wrappers differ. Every request is
 * same-origin cookie-authenticated with `credentials: "include"` and `no-store`,
 * and no bearer header, provider credential or persisted draft is ever involved.
 */
export class PlannerClientError<F = unknown> extends Error {
  constructor(
    public code: string,
    public feasibility?: F,
    /**
     * The server's own sentence, when it sent one.
     *
     * Codes are for logic; this is for the student. An import failure means something
     * specific ("that file is larger than 5 MB"), and replacing it with a generic
     * message would throw away the only useful part of the response.
     */
    public serverMessage?: string,
    /**
     * Structured findings the server attached to a refusal, when it attached any.
     *
     * One case has them: a flexible draft edit that needs the student's acknowledgement
     * answers with the tradeoffs the edit makes, because the client could not have known
     * which ones to show. Everything else leaves this undefined.
     */
    public findings?: unknown
  ) {
    super(code);
    this.name = "PlannerClientError";
  }
}

/**
 * The account facts a Planner Modes surface needs before it can render.
 *
 * There is no `enabled` field: Planner Modes are permanent, so availability is not a
 * server state. A failure to read these facts is reported as an HTTP error, not as a
 * silently disabled feature.
 */
export interface PlannerCapabilities {
  today: string;
  timezone: string;
  restDays: number[];
  subjects: { id: number; name: string }[];
}
export interface Recovery {
  planId: string;
  version: number;
  operation: { id: string; state: string; leaseExpiresAt: string | null };
}

export async function plannerFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(resolveApiUrl(`/api/planner${path}`), {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  const body = await response.json();
  if (!response.ok)
    throw new PlannerClientError(
      body?.error?.code ?? "PLANNER_UNAVAILABLE",
      body.feasibility,
      undefined,
      body.findings
    );
  return body as T;
}

export const postJson = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

export const GenerationEventSchema = z.strictObject({
  operationId: KeySchema,
  planId: KeySchema,
  sequence: z.number().int().positive(),
  stage: z.enum([
    "calculating_capacity",
    "generating",
    "validating_proposal",
    "reviewing_plan",
    "repairing_plan",
    "saving_draft",
    "ready",
    "failed",
    "cancelled",
  ]),
  status: z.enum(["complete", "running", "terminal"]),
  items: z.number().int().min(0).max(60).optional(),
  topics: z.number().int().min(0).max(60).optional(),
  periods: z.number().int().min(0).max(53).optional(),
  milestones: z.number().int().min(0).max(60).optional(),
});
export type GenerationEvent = z.infer<typeof GenerationEventSchema>;

/** EOF is never success; recovery always checks durable state, including after ready. */
export async function consumeGeneration(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: GenerationEvent) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    sequence = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (frame.length > 2048 || !frame.startsWith("data: "))
          throw new PlannerClientError("INVALID_PROGRESS");
        const event = GenerationEventSchema.parse(JSON.parse(frame.slice(6)));
        if (event.sequence <= sequence)
          throw new PlannerClientError("INVALID_PROGRESS");
        sequence = event.sequence;
        onEvent(event);
      }
      if (buffer.length > 2048) throw new PlannerClientError("INVALID_PROGRESS");
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * One bounded provider-backed operation. A non-streaming response is an
 * idempotent replay, never a second generation: the caller always resolves the
 * result from durable operation state afterwards.
 */
export async function requestGeneration(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: GenerationEvent) => void
): Promise<void> {
  const response = await fetch(resolveApiUrl(path), {
    credentials: "include",
    cache: "no-store",
    ...postJson(body),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new PlannerClientError(
      payload?.error?.code ?? "PLANNER_UNAVAILABLE",
      payload?.feasibility
    );
  }
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    if (!response.body) throw new PlannerClientError("LOST_RESPONSE");
    await consumeGeneration(response.body, onEvent);
  } else {
    await response.json();
  }
}

/** Re-throws a shared transport error as a mode-specific error type. */
export function asModeError<F, E extends PlannerClientError<F>>(
  error: unknown,
  build: (code: string, feasibility?: F) => E
): E {
  if (error instanceof PlannerClientError)
    return build(error.code, error.feasibility as F | undefined);
  if (error instanceof Error && /^[A-Z_]+$/.test(error.message))
    return build(error.message);
  throw error;
}
