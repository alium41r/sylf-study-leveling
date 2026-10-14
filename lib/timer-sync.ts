import { z } from "zod";
import { apiFetch, fetchWithTimeout } from "./api-transport";
import { SessionProtocolV2, SessionProtocolConflict, type SessionExecutionV2, type SessionActionV2 } from "./planner/v2/session-client";
import { StudySessionTransitionV2Schema } from "./planner/v2/contracts/session";

// One journal for creation, checkpoints, boundaries and completion. Each intent
// has its own key: acknowledging an old request cannot overwrite a newer one.
const prefix = "sylf_timer_journal_v1:";
const metaSchema = z.object({
  ownerId: z.number().int().positive(), clientKey: z.string().min(8),
  startedAt: z.string().datetime(), subjectId: z.number().int().positive().optional(),
  questId: z.number().int().positive().optional(), sessionId: z.number().int().positive().optional(),
  endedAt: z.string().datetime().optional(), settled: z.boolean().optional(),
  confirmedAt: z.string().datetime().optional(),
  kind: z.enum(["study", "party"]).optional(), partyId: z.number().int().positive().optional(),
  participationJoinedAt: z.string().datetime().optional(), endedFocusSeconds: z.number().int().nonnegative().optional(),
});
export type TimerJournal = z.infer<typeof metaSchema>;
const operationSchema = z.object({
  id: z.string(), action: z.enum(["PROGRESS", "PAUSE", "RESUME", "END", "COMPLETE"]),
  sequence: z.number().int().nonnegative().default(0),
  focus: z.number().int().nonnegative(), breaks: z.number().int().nonnegative(), at: z.string().datetime(),
});
type Operation = z.infer<typeof operationSchema>;
type JournalStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
class TimerSyncError extends Error {}
export const TIMER_SYNC_EVENT = "sylf:timer-sync";
export interface TimerSyncStatus { pending: number; error: string | null }
export interface TimerSyncAccepted { clientKey: string; sessionId: number; focus: number; breaks: number; execution?: SessionExecutionV2; authoritative?: boolean; endedAt?: string | null }

export class TimerSync {
  private active = false;
  private running: Promise<void> | null = null;
  private retryAt = 0;
  private failures = 0;
  private error: string | null = null;
  private nextRead = new Map<string, number>();
  private pruneAfter = 0;
  private listeners = new Set<() => void>();
  private acceptedListeners = new Set<(value: TimerSyncAccepted) => void>();
  constructor(readonly ownerId: number, private readonly storage: JournalStorage,
    private readonly request: typeof fetch = (input, init) => apiFetch(String(input), { credentials: "include", ...init }),
    private readonly lock: <T>(work: () => Promise<T>) => Promise<T | undefined> = async work => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        let entered = false;
        try {
          return await navigator.locks.request(`sylf-timer-journal:${ownerId}`, { ifAvailable: true }, lock => {
            if (!lock) return undefined;
            entered = true; return work();
          });
        } catch (error) {
          if (entered) throw error;
          // Some embedded browsers expose Locks but deny acquisition. The
          // same server receipts/row locks protect this fallback worker.
          return work();
        }
      }
      return work(); // Server receipts/row locks are the fallback authority.
    }) {}
  private base(key: string) { return `${prefix}${this.ownerId}:${key}:`; }
  private metaKey(key: string) { return `${this.base(key)}meta`; }
  private keys() {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) { const key = this.storage.key(i); if (key?.startsWith(`${prefix}${this.ownerId}:`)) keys.push(key); }
    return keys;
  }
  journal(key: string): TimerJournal | null {
    const raw = this.storage.getItem(this.metaKey(key));
    if (!raw) return null;
    const meta = metaSchema.parse(JSON.parse(raw));
    const final = this.storage.getItem(`${this.base(key)}op:END`);
    // END itself is the durable terminal marker, even if a crash/storage fault
    // interrupted the subsequent metadata write.
    const op = final ? operationSchema.parse(JSON.parse(final)) : null;
    return op && !meta.endedAt ? { ...meta, endedAt: op.at, endedFocusSeconds: op.focus } : meta;
  }
  hasUnsettledSubject(subjectId: number): boolean {
    return this.keys().filter(key => key.endsWith(":meta")).some(key => {
      const meta = metaSchema.parse(JSON.parse(this.storage.getItem(key)!));
      return meta.subjectId === subjectId && (!meta.settled || this.operations(meta.clientKey).length > 0);
    });
  }
  private save(meta: TimerJournal) { this.storage.setItem(this.metaKey(meta.clientKey), JSON.stringify(metaSchema.parse(meta))); }
  create(meta: TimerJournal): TimerJournal {
    if (meta.ownerId !== this.ownerId) throw new Error("Timer belongs to another account.");
    const existing = this.journal(meta.clientKey);
    if (existing) return existing;
    this.save(meta); this.changed(); return meta;
  }
  importPending(key: string, raw: string): void {
    const transition = StudySessionTransitionV2Schema.parse(JSON.parse(raw));
    if (transition.sessionId !== this.journal(key)?.sessionId) throw new Error("Invalid timer recovery identity.");
    this.enqueue(key, transition.action === "STOP_OTHER_DEVICE" ? "END" : transition.action,
      transition.cumulativeFocusSeconds, transition.cumulativeBreakSeconds, transition.occurredAt ?? new Date().toISOString());
    this.storage.setItem(`${this.base(key)}transition`, raw);
  }
  private operations(key: string): Operation[] {
    return this.keys().filter(k => k.startsWith(`${this.base(key)}op:`)).map(k => operationSchema.parse(JSON.parse(this.storage.getItem(k)!)))
      .sort((a, b) => a.sequence - b.sequence || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  enqueue(key: string, action: Operation["action"], focus: number, breaks: number, at = new Date().toISOString()): void {
    const meta = this.journal(key);
    if (!meta) throw new Error("Timer has not been saved on this device.");
    if (meta.endedAt && action !== "COMPLETE") return;
    // Deterministic final key makes rapid presses and mirror-tab ends converge.
    const id = action === "END" || action === "COMPLETE" ? action : `${at}:${crypto.randomUUID()}`;
    const sequence = Math.max(0, ...this.operations(key).map(op => op.sequence)) + 1;
    const op = operationSchema.parse({ id, action, focus, breaks, at, sequence });
    this.storage.setItem(`${this.base(key)}op:${id}`, JSON.stringify(op));
    if (action === "END") this.save({ ...meta, endedAt: at, endedFocusSeconds: focus });
    // No network work happens inside the synchronous durability boundary.
    this.changed();
  }
  finish(key: string, focus: number, breaks: number, complete = false, at = new Date().toISOString()): void {
    // Write completion first so an interrupted END cannot lose the user's intent.
    if (complete) this.enqueue(key, "COMPLETE", focus, breaks, at);
    this.enqueue(key, "END", focus, breaks, at);
  }
  status(): TimerSyncStatus {
    try { return { pending: this.keys().filter(k => k.includes(":op:")).length, error: this.error }; }
    catch { return { pending: 0, error: "Timer recovery data could not be read. Free device storage and retry." }; }
  }
  subscribe(callback: () => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
  onAccepted(callback: (value: TimerSyncAccepted) => void) { this.acceptedListeners.add(callback); return () => { this.acceptedListeners.delete(callback); }; }
  private changed() { this.listeners.forEach(fn => { try { fn(); } catch { /* Observers cannot interrupt journal delivery. */ } }); }
  start() { this.active = true; void this.drain(true); }
  stop() { this.active = false; }
  wake() { this.changed(); void this.drain(true); }
  async drain(force = false): Promise<void> {
    if (!this.active || this.running || !force && Date.now() < this.retryAt) return this.running ?? Promise.resolve();
    this.running = this.lock(async () => {
      try {
        const keys = this.keys();
        const pending = new Set(keys.filter(key => key.includes(":op:")).map(key => key.slice(0, key.indexOf(":op:") + 1)));
        const all = keys.filter(k => k.endsWith(":meta")).map(k => metaSchema.parse(JSON.parse(this.storage.getItem(k)!)));
        if (Date.now() >= this.pruneAfter) {
          const referenced = new Set<string>();
          for (let i = 0; i < this.storage.length; i++) {
            const key = this.storage.key(i);
            if (key?.startsWith("runningTimerState_")) {
              try { const cache = JSON.parse(this.storage.getItem(key)!); if (cache.ownerId === this.ownerId && cache.journalKey) referenced.add(cache.journalKey); } catch { /* Preserve unknown recovery data. */ }
            }
          }
          for (const meta of all) if (meta.settled && !pending.has(this.base(meta.clientKey)) && !referenced.has(meta.clientKey)
            && Date.parse(meta.confirmedAt ?? meta.endedAt ?? "") < Date.now() - 7 * 86_400_000) this.storage.removeItem(this.metaKey(meta.clientKey));
          this.pruneAfter = Date.now() + 3_600_000;
        }
        const metas = all.filter(meta => !meta.settled || pending.has(this.base(meta.clientKey))).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        for (const meta of metas) {
          if (!this.active) break;
          if (meta.sessionId && !this.operations(meta.clientKey).length && Date.now() < (this.nextRead.get(meta.clientKey) ?? 0)) continue;
          await this.process(meta); this.nextRead.set(meta.clientKey, Date.now() + 30_000);
        }
        this.error = null; this.failures = 0; this.retryAt = 0;
      } catch (error) {
        this.failures++;
        this.retryAt = Math.max(this.retryAt, Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(this.failures, 6)));
        this.error = error instanceof TimerSyncError || error instanceof SessionProtocolConflict ? error.message : "Your session is saved on this device. Sync will retry automatically.";
      } finally { this.changed(); }
    }).then(() => undefined).finally(() => { this.running = null; });
    return this.running;
  }
  private async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // A stuck request must not strand the worker. Abort is an uncertain result,
    // so the persisted identity is replayed, never replaced.
    const response = await fetchWithTimeout(this.request, input, init);
    if (response.status === 429) {
      const after = Number(response.headers.get("Retry-After"));
      if (Number.isFinite(after) && after > 0) this.retryAt = Date.now() + after * 1000;
    }
    if (!response.ok && ![400, 404, 409].includes(response.status)) {
      throw new TimerSyncError(response.status === 401 ? "Sign in to sync your saved timer sessions." : "Your session is saved on this device. Sync will retry automatically.");
    }
    return response;
  }

  private async json(input: string, init?: RequestInit) {
    const response = await this.fetch(input, init);
    const data = await response.json();
    if (!response.ok) throw new TimerSyncError(data.detail?.message ?? data.message ?? data.error ?? "Your saved session could not sync. Retry after resolving the error.");
    return data;
  }
  private async process(original: TimerJournal) {
    let meta = this.journal(original.clientKey)!;
    if (meta.kind === "party") {
      if (!meta.partyId || !meta.sessionId || !meta.participationJoinedAt) throw new TimerSyncError("This focus room could not be restored. Your saved exit remains on this device.");
      for (const op of this.operations(meta.clientKey)) {
        if (!this.active) return;
        if (op.action !== "END") throw new TimerSyncError("This saved focus room action is unavailable.");
        const result = await this.json(`/api/focus-party/${meta.partyId}/session/timer`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave", sessionId: meta.sessionId, expectedOwnerId: this.ownerId, joinedAt: meta.participationJoinedAt, endedAt: op.at }) });
        if (result.success !== true) throw new TimerSyncError("Your focus room exit is saved and will retry automatically.");
        this.save({ ...this.journal(meta.clientKey)!, endedFocusSeconds: result.accumulatedSeconds ?? op.focus });
        const key = `${this.base(meta.clientKey)}op:${op.id}`;
        const current = this.storage.getItem(key);
        if (current && JSON.stringify(operationSchema.parse(JSON.parse(current))) === JSON.stringify(op)) this.storage.removeItem(key);
        this.emit(meta, result.accumulatedSeconds ?? op.focus, 0, undefined, true, op.at);
      }
      if (!this.operations(meta.clientKey).length) this.save({ ...this.journal(meta.clientKey)!, settled: true, confirmedAt: new Date().toISOString() });
      return;
    }
    let execution: SessionExecutionV2 | undefined;
    if (!meta.sessionId) {
      const data = await this.json("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: meta.subjectId, questId: meta.questId, executionProtocol: 2,
          clientSessionKey: meta.clientKey, startedAt: meta.startedAt, expectedOwnerId: this.ownerId }) });
      if (!Number.isSafeInteger(data.id) || data.id <= 0) throw new Error("Invalid timer start response.");
      meta = { ...this.journal(meta.clientKey)!, sessionId: data.id }; this.save(meta); execution = data.execution;
    }
    if (!this.active) return;
    const sid = meta.sessionId!;
    // Read both legacy and V2 rows; the server chooses the protocol, even when
    // ending before the Quest request has returned.
    const accepted = execution ? { execution } : await this.json(`/api/sessions?id=${sid}&expectedOwnerId=${this.ownerId}`);
    execution = accepted.execution;
    if (execution && execution.ownerId !== this.ownerId) throw new TimerSyncError("Sign in to the original account to sync this saved session.");
    const remoteEnd = accepted.endedAt ?? execution?.endedAt;
    if (remoteEnd && !this.operations(meta.clientKey).length) { meta = { ...meta, endedAt: remoteEnd, settled: true }; this.save(meta); }
    if (this.operations(meta.clientKey).some(op => op.action === "COMPLETE") && !meta.endedAt) {
      const completion = this.operations(meta.clientKey).find(op => op.action === "COMPLETE")!;
      this.enqueue(meta.clientKey, "END", completion.focus, completion.breaks, completion.at);
      meta = this.journal(meta.clientKey)!;
    }
    this.emit(meta, accepted.durationSeconds ?? execution?.acceptedFocusSeconds ?? 0, accepted.breakSeconds ?? execution?.acceptedBreakSeconds ?? 0,
      execution, !this.operations(meta.clientKey).some(op => ["PAUSE", "RESUME", "END"].includes(op.action)), accepted.endedAt ?? execution?.endedAt);
    const protocol = new SessionProtocolV2((input, init) => this.fetch(input, init), this.storage, `${this.base(meta.clientKey)}transition`);
    if (execution) protocol.attach(execution);
    // END must precede COMPLETE regardless of equal timestamps/key ordering.
    const operations = this.operations(meta.clientKey).sort((a, b) => a.action === "COMPLETE" ? 1 : b.action === "COMPLETE" ? -1 : 0);
    for (const op of operations) {
      if (!this.active) return;
      if (op.action === "COMPLETE") {
        if (!this.journal(meta.clientKey)?.endedAt) continue;
        if (meta.questId) {
          const quest = await this.json(`/api/quests/${meta.questId}`);
          if (quest.status !== "COMPLETED") await this.json(`/api/quests/${meta.questId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "COMPLETED", ...(execution ? { executionProtocol: 2, expectedExecutionVersion: quest.executionVersion } : {}) }) });
        }
        this.emit(meta, execution?.acceptedFocusSeconds ?? op.focus, execution?.acceptedBreakSeconds ?? op.breaks, execution);
      } else if (execution) {
        try { execution = await protocol.transition(sid, op.action as SessionActionV2, op.focus, op.breaks, op.at); }
        catch (error) {
          // A rejected stale version has no receipt. Reconcile and retry the
          // SAME durable intent; an ended state is terminal on every client.
          if (!(error instanceof SessionProtocolConflict) || !error.execution) throw error;
          execution = await protocol.transition(sid, op.action as SessionActionV2, op.focus, op.breaks, op.at);
        }
        const laterBoundary = this.operations(meta.clientKey).some(later => later.id !== op.id && later.sequence > op.sequence && ["PAUSE", "RESUME", "END"].includes(later.action));
        this.emit(meta, execution.acceptedFocusSeconds, execution.acceptedBreakSeconds, execution, !laterBoundary);
      } else {
        const result = await this.json("/api/sessions", { method: "PATCH", headers: { "Content-Type": "application/json" }, keepalive: true,
          body: JSON.stringify({ id: sid, durationMinutes: Math.floor(op.focus / 60), durationSeconds: op.focus, breakSeconds: op.breaks,
            questId: meta.questId, final: op.action === "END", endedAt: op.action === "END" ? op.at : undefined, expectedOwnerId: this.ownerId,
            completeQuest: op.action === "END" && operations.some(operation => operation.action === "COMPLETE") }) });
        this.emit(meta, result.durationSeconds ?? op.focus, result.breakSeconds ?? op.breaks);
      }
      if (op.action === "END") this.save({ ...this.journal(meta.clientKey)!, endedAt: op.at });
      const key = `${this.base(meta.clientKey)}op:${op.id}`;
      const current = this.storage.getItem(key);
      if (current && JSON.stringify(operationSchema.parse(JSON.parse(current))) === JSON.stringify(op)) this.storage.removeItem(key);
      this.changed();
    }
    const latest = this.journal(meta.clientKey)!;
    if (latest.endedAt && this.operations(meta.clientKey).length === 0) this.save({ ...latest, settled: true, confirmedAt: new Date().toISOString() });
  }
  private emit(meta: TimerJournal, focus: number, breaks: number, execution?: SessionExecutionV2, authoritative = false, endedAt?: string | null) {
    if (!this.active) return;
    this.acceptedListeners.forEach(fn => { try { fn({ clientKey: meta.clientKey, sessionId: meta.sessionId!, focus, breaks, execution, authoritative, endedAt }); } catch { /* Stats refresh is independent of settlement. */ } });
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TIMER_SYNC_EVENT, { detail: { ownerId: this.ownerId } }));
  }
}

const instances = new Map<number, TimerSync>();
export function getTimerSync(ownerId: number): TimerSync {
  let instance = instances.get(ownerId);
  if (!instance) { instance = new TimerSync(ownerId, localStorage); instances.set(ownerId, instance); }
  return instance;
}
