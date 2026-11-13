// The Planning Studio, as Native reads and asks for it. The server owns the plan: it compiles the snapshot, calls the model, verifies, stores versions
// and projects them into quests. This client reads that state, sends the student's actions with idempotency keys, and streams the workflows that may
// call the model. Drags and what-ifs are previewed on the device with the same kernel (@sylf/shared's `planning`), then sent here to be committed.
//
// Schemas are loose: they check the fields a screen relies on and keep the rest as the kernel's own types, so a server that adds a field never breaks a
// tablet. Nothing here retries a write; a retried action reuses its key and the server answers with the first outcome.
import { z } from "zod";
import type { planning } from "@sylf/shared";
import type { BackendClient } from "./client";
import { BackendError } from "./errors";

type Snapshot = planning.PlanningSnapshot;
type Model = planning.WorkModel;
type Block = planning.Block;

const READ_MS = 30_000;
const WRITE_MS = 30_000;
const STREAM_MS = 120_000;

const proposalSchema = z.object({
  id: z.string(), state: z.string(), workflow: z.string(), source: z.string(), summary: z.string(), baseVersion: z.number(), createdAt: z.string(),
  diff: z.object({ changes: z.array(z.unknown()), counts: z.record(z.string(), z.number()), summary: z.string(), empty: z.boolean() }).loose(),
  verification: z.object({ pass: z.boolean(), quality: z.number(), checks: z.number() }).loose(),
  interpretation: z.string().nullable(), strategy: z.string().nullable(), notes: z.array(z.string()),
  model: z.object({ goals: z.array(z.unknown()), items: z.array(z.unknown()) }).loose(),
  result: z.object({ blocks: z.array(z.unknown()), days: z.array(z.unknown()), reasons: z.record(z.string(), z.unknown()) }).loose(),
}).loose();

export const studioStateSchema = z.object({
  readiness: z.object({ enabled: z.boolean(), ai: z.boolean(), reason: z.string().nullable() }).loose(),
  version: z.number().int(),
  snapshot: z.object({ today: z.string(), nowMinute: z.number(), days: z.array(z.unknown()), subjects: z.array(z.unknown()) }).loose(),
  model: z.object({ goals: z.array(z.unknown()), items: z.array(z.unknown()) }).loose(),
  blocks: z.array(z.object({ id: z.string(), item: z.string(), date: z.string(), start: z.number(), end: z.number(), state: z.string() }).loose()),
  plan: z.object({ blocks: z.array(z.unknown()), days: z.array(z.unknown()), reasons: z.record(z.string(), z.unknown()), health: z.object({ plannedMinutes: z.number() }).loose() }).loose(),
  proposal: proposalSchema.nullable(),
  signals: z.array(z.object({ kind: z.string(), title: z.string() }).loose()),
  history: z.array(z.object({ id: z.string(), summary: z.string() }).loose()),
  lockedGoals: z.array(z.unknown()),
  facts: z.object({ commitments: z.number() }).loose(),
  calibrationNotes: z.record(z.string(), z.string()),
  repaired: z.object({ summary: z.string() }).nullable(),
}).loose();

export interface StudioProposal {
  id: string; state: string; workflow: string; source: string; summary: string; baseVersion: number; createdAt: string;
  diff: planning.PlanDiff;
  verification: { pass: boolean; quality: number; checks: number; failures: number; critics: planning.CriticScore[] };
  interpretation: string | null; strategy: string | null; notes: string[];
  model: Model;
  result: Omit<planning.SolveResult, "demand" | "stats" | "kept">;
}
export interface StudioState {
  readiness: { enabled: boolean; ai: boolean; reason: string | null; model: string };
  version: number;
  settings: planning.StudioSettings;
  snapshot: Snapshot;
  model: Model;
  blocks: Block[];
  plan: Omit<planning.SolveResult, "demand" | "stats" | "kept"> & { quality: number; critics: planning.CriticScore[] };
  proposal: StudioProposal | null;
  signals: planning.Signal[];
  history: { id: string; sequence: number | null; source: string; workflow: string; summary: string; at: string | null }[];
  lockedGoals: { id: number; title: string; targetDate: string | null }[];
  facts: { commitments: number; quests: number; sessions: number; calendarComplete: boolean };
  calibrationNotes: Record<string, string>;
  repaired: { summary: string } | null;
}

export type StudioEvent =
  | { type: "stage"; stage: string; text: string }
  | { type: "interpretation"; text: string; fast: boolean }
  | { type: "strategy"; goal: string; text: string }
  | { type: "item"; goal: string | null; item: planning.WorkItem }
  | { type: "preview"; blocks: Block[]; summary: string; unplaced: number }
  | { type: "text"; delta: string }
  | { type: "proposal"; proposal: StudioProposal }
  | { type: "notice"; text: string }
  | { type: "error"; status: number; code: string; message: string }
  | { type: "done"; result: unknown };

export type BlockEdit = { kind: "move"; block: string; date: string; start: number } | { kind: "pin" | "unpin" | "skip" | "restore"; block: string };
export type StudioWorkflow =
  | { workflow: "command"; key: string; text: string }
  | { workflow: "add_goal"; key: string; title?: string; type?: string; due?: string | null; subjectId?: number | null; priority?: number; notes?: string; goalKey?: string }
  | { workflow: "answer"; key: string; question: string; answer: string }
  | { workflow: "brief" }
  | { workflow: "question"; text: string }
  | { workflow: "explain"; block: string };

const stateOf = (value: unknown) => studioStateSchema.parse(value) as unknown as StudioState;
const withState = z.object({ state: studioStateSchema }).loose();

/** A key the server stores to recognise a repeated action: `^[A-Za-z0-9_:.-]{8,120}$`. Not a secret. */
export function newStudioKey(random: () => number = Math.random, now: () => number = Date.now): string {
  const part = () => Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `s${now().toString(36)}${part()}${part()}`;
}

/** Splits a newline-delimited JSON stream into events, across arbitrary chunk boundaries. */
export function ndjsonReader(onEvent: (event: StudioEvent) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { onEvent(JSON.parse(line) as StudioEvent); } catch { /* a malformed line is skipped, never shown */ }
      }
    },
    flush() { const rest = buffer.trim(); buffer = ""; if (rest) { try { onEvent(JSON.parse(rest) as StudioEvent); } catch { /* ignored */ } } },
  };
}

export function createStudioReads(client: BackendClient) {
  const post = async (body: unknown, signal?: AbortSignal) => client.send("POST", "/api/planner/studio", { body, timeoutMs: WRITE_MS, ...(signal ? { signal } : {}) });
  return {
    newKey: newStudioKey,
    /** Stored state, without repairing anything. */
    state: async (signal: AbortSignal) => stateOf(await client.get("/api/planner/studio", z.unknown(), { signal, timeoutMs: READ_MS })),
    /** Opening the Studio senses what changed and repairs what the autonomy setting allows. */
    open: async (signal?: AbortSignal) => stateOf(await post({ action: "open" }, signal)),
    accept: async (proposalId: string, key: string) => {
      const value = withState.parse(await post({ action: "accept", proposalId, key })) as { state: unknown; committed: { version: number; summary: string; replayed: boolean } | null; rebased: StudioProposal | null };
      return { state: stateOf(value.state), committed: value.committed, rebased: value.rebased };
    },
    discard: async (proposalId: string) => stateOf((withState.parse(await post({ action: "discard", proposalId })) as { state: unknown }).state),
    undo: async (key: string) => {
      const value = withState.parse(await post({ action: "undo", key })) as { state: unknown; committed: { summary: string } };
      return { state: stateOf(value.state), summary: value.committed?.summary ?? "" };
    },
    direct: async (key: string, edits: BlockEdit[]) => {
      const value = withState.parse(await post({ action: "direct", key, edits })) as { state: unknown; committed: { summary: string } };
      return { state: stateOf(value.state), summary: value.committed?.summary ?? "" };
    },
    whatIf: async (key: string, whatIf: planning.WhatIf) => {
      const value = withState.parse(await post({ action: "whatif", key, whatIf })) as { state: unknown; proposal: StudioProposal | null };
      return { state: stateOf(value.state), proposal: value.proposal };
    },
    settings: async (settings: Partial<planning.StudioSettings>) => stateOf((withState.parse(await post({ action: "settings", settings })) as { state: unknown }).state),
    explain: async (block: string) => (await post({ action: "explain", block })) as { reasons: planning.Reason[]; sentence: string | null; calibration: string | null },
    /** Runs a workflow and hands over its events as they arrive. Resolves with the final result; a failure arrives as an `error` event and a rejection. */
    run: async (workflow: StudioWorkflow, onEvent: (event: StudioEvent) => void, signal?: AbortSignal): Promise<unknown> => {
      let result: unknown = null; let failure: StudioEvent | null = null;
      const reader = ndjsonReader((event) => {
        if (event.type === "done") result = event.result;
        if (event.type === "error") failure = event;
        onEvent(event);
      });
      await client.stream("/api/planner/studio/stream", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify(workflow), timeoutMs: STREAM_MS, ...(signal ? { signal } : {}) }, (chunk) => reader.push(chunk));
      reader.flush();
      if (failure) {
        const f = failure as Extract<StudioEvent, { type: "error" }>;
        throw new BackendError(f.status === 409 ? "conflict" : f.status === 429 ? "rate-limited" : f.status >= 500 ? "server" : f.status === 404 ? "not-found" : "invalid", f.message, { status: f.status, code: f.code });
      }
      return result;
    },
  };
}
export type StudioReads = ReturnType<typeof createStudioReads>;
