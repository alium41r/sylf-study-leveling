import { StudySessionExecutionV2Schema, StudySessionTransitionV2Schema } from "./contracts/session";
import { pauseSnapshot, type TimerSnapshot } from "../../timer-engine";
export type SessionExecutionV2 = ReturnType<typeof StudySessionExecutionV2Schema.parse>;
export type SessionActionV2 = ReturnType<typeof StudySessionTransitionV2Schema.parse>["action"];
type Transition = ReturnType<typeof StudySessionTransitionV2Schema.parse>;
export class SessionProtocolConflict extends Error {
  constructor(message: string, readonly execution: SessionExecutionV2 | null) { super(message); }
}
/** Accepted pause/end wins over browser storage. Running epoch derivation stays
 * in the timer engine and retains legitimate unflushed time for server clamping. */
export function reconcileSessionSnapshot(snapshot: TimerSnapshot, execution: SessionExecutionV2, now = Date.now()): TimerSnapshot {
  if (execution.state === "RUNNING") {
    const banked = pauseSnapshot(snapshot, now);
    return { ...banked, focusMs: Math.max(banked.focusMs, execution.acceptedFocusSeconds * 1000),
      breakMs: Math.max(banked.breakMs, execution.acceptedBreakSeconds * 1000),
      runningSinceMs: now, isPaused: false, timestamp: now };
  }
  const paused = pauseSnapshot(snapshot, now);
  return { ...paused, focusMs: execution.acceptedFocusSeconds * 1000, breakMs: execution.acceptedBreakSeconds * 1000,
    phase: execution.state === "ENDED" ? "done" : paused.phase };
}

/** Shared web/mobile transport. Epoch accounting and timer leadership stay in their existing owners. */
export class SessionProtocolV2 {
  private execution: SessionExecutionV2 | null = null;
  private pending: Transition | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly request: typeof fetch;
  constructor(request: typeof fetch = fetch, private readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">, private readonly storageKey?: string) {
    // Native browser fetch rejects the protocol instance as its receiver.
    this.request = (input, init) => request(input, init);
  }
  attach(execution: SessionExecutionV2) {
    this.execution = StudySessionExecutionV2Schema.parse(execution);
    const raw = this.storage?.getItem(this.key(execution.sessionId));
    if (raw) this.pending = StudySessionTransitionV2Schema.parse(JSON.parse(raw));
  }
  accepted(): SessionExecutionV2 | null { return this.execution ? structuredClone(this.execution) : null; }
  private key(sessionId: number) { return this.storageKey ?? `sylf_session_transition_v2_${sessionId}`; }
  private remember(transition: Transition | null, sessionId: number): void {
    try { if (transition) this.storage?.setItem(this.key(sessionId), JSON.stringify(transition)); else this.storage?.removeItem(this.key(sessionId)); } catch { /* Server receipts remain authoritative when storage is unavailable. */ }
  }
  async restore(sessionId: number): Promise<SessionExecutionV2> {
    const response = await this.request(`/api/sessions?id=${sessionId}`);
    if (!response.ok) throw new Error("The timer could not be restored. Reload its accepted state.");
    const data = await response.json(); this.execution = StudySessionExecutionV2Schema.parse(data.execution);
    if (!this.execution || this.execution.sessionId !== sessionId) throw new Error("Invalid timer restoration.");
    let saved: string | null | undefined;
    try { saved = this.storage?.getItem(this.key(sessionId)); } catch { saved = null; }
    if (saved) {
      try { const pending = StudySessionTransitionV2Schema.parse(JSON.parse(saved)); if (pending.sessionId === sessionId) this.pending = pending; else this.remember(null, sessionId); }
      catch { this.remember(null, sessionId); }
    }
    return this.execution;
  }
  transition(sessionId: number, action: SessionActionV2, focus: number, breaks: number, occurredAt?: string): Promise<SessionExecutionV2> {
    const run = this.queue.then(() => this.perform(sessionId, action, focus, breaks, occurredAt));
    this.queue = run.then(() => undefined, () => undefined); return run;
  }
  private async perform(sessionId: number, action: SessionActionV2, focus: number, breaks: number, occurredAt?: string): Promise<SessionExecutionV2> {
    if (this.execution?.sessionId !== sessionId) await this.restore(sessionId);
    if (this.pending) {
      const pending = this.pending; const recovered = await this.send(pending);
      if (pending.action === action && focus <= pending.cumulativeFocusSeconds && breaks <= pending.cumulativeBreakSeconds) return recovered;
    }
    const execution = this.execution!;
    if (execution.state === "ENDED") return execution;
    if (action === "PAUSE" && execution.state === "PAUSED" || action === "RESUME" && execution.state === "RUNNING") return execution;
    const transition = StudySessionTransitionV2Schema.parse({ schemaVersion: 2, sessionId, action, expectedExecutionVersion: execution.executionVersion,
      idempotencyKey: crypto.randomUUID(), cumulativeFocusSeconds: focus, cumulativeBreakSeconds: breaks, ...(occurredAt ? { occurredAt } : {}) });
    this.pending = transition; this.remember(transition, sessionId);
    return this.send(transition);
  }
  private async send(transition: Transition): Promise<SessionExecutionV2> {
    const response = await this.request("/api/sessions", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionTransition: transition, expectedOwnerId: this.execution?.ownerId }), keepalive: true });
    const data = await response.json();
    if (!response.ok) {
      const message = data.detail?.message ?? data.message ?? "The timer changed. Reload its accepted state.";
      if ([400, 404, 409].includes(response.status)) {
        this.pending = null; this.remember(null, transition.sessionId);
        let accepted: SessionExecutionV2 | null = null;
        try { accepted = await this.restore(transition.sessionId); } catch { /* The local timer stays frozen until authoritative recovery. */ }
        throw new SessionProtocolConflict(message, accepted);
      }
      throw new Error(message);
    }
    const accepted = StudySessionExecutionV2Schema.parse(data.execution);
    if (accepted.sessionId !== transition.sessionId) throw new Error("Invalid accepted timer state.");
    const newer = this.execution?.sessionId === accepted.sessionId && this.execution.executionVersion > accepted.executionVersion;
    this.pending = null; this.remember(null, transition.sessionId);
    // Receipt replay is historical evidence. Another device may already have
    // advanced the session beyond that receipt; never roll the client back.
    if (newer) return this.restore(transition.sessionId);
    this.execution = accepted;
    return this.execution!;
  }
}
