// The one piece between the study session and the journal (ADR 0010, and handoff Phase 12 §2). The session model owns the time, TimerSync owns
// delivery, and this only copies what happened from one to the other and carries the answer back. It computes nothing: the server decides what
// is credited, and a record becomes `saved` only because the server accepted it.
//
// The rules it keeps. Only a session stamped with the signed-in account is ever written, so an ownerless session and another person's session
// stay off the journal. Everything it writes is replayable: `journaled` says what has been handed over, a crash between the two writes hands
// one operation over again, and SessionProtocolV2 absorbs it. Sign-out loses nothing: undelivered work waits for its owner.
import { reconcileSessionSnapshot, type TimerSync, type TimerSyncAccepted } from "@sylf/shared/backend";
import type { ActiveSession, EndedSession, StudySessionModel } from "@sylf/spaces";
import type { AuthModel } from "./auth-model";
import type { Connectivity } from "./connectivity";
import type { ResourceStore } from "./resources";
import type { TimerDelivery } from "./timer-delivery";

export interface SessionSyncState {
  /** Who the journal currently belongs to. */
  ownerId: number | null;
  /** Operations waiting for the server. */
  pending: number;
  offline: boolean;
  /** Why delivery is stuck, in words for a person. */
  error: string | null;
  /** Raised each time the server accepts the end of a session. */
  savedCount: number;
  lastSaved: EndedSession | null;
}

export interface SessionBridge {
  state(): SessionSyncState;
  subscribe(listener: () => void): () => void;
  /** Tries to reach the server now, and stops waiting after `timeoutMs`. Used before signing out, so a finished session usually arrives first. */
  flush(timeoutMs: number): Promise<void>;
  /** Adds ownerless sessions to the signed-in person's record, once and for good. */
  claim(clientKeys: string[]): void;
  /** Leaves them on this device. */
  decline(clientKeys: string[]): void;
  dispose(): void;
}

const INVALIDATED_BY_A_SESSION = ["sessions", "progress", "today", "traveller"] as const;
/** Time the server can legitimately be ahead of this device before its total is worth adopting. */
const FOCUS_TOLERANCE_SECONDS = 5;

export function createSessionBridge({ session, delivery, auth, resources, connectivity, now = Date.now }: { session: StudySessionModel; delivery: TimerDelivery; auth: AuthModel; resources: ResourceStore; connectivity: Connectivity; now?: () => number }): SessionBridge {
  const listeners = new Set<() => void>();
  let attached: TimerSync | null = null;
  let detach: (() => void) | undefined;
  let lastOwner = auth.getSnapshot().userId;
  let snapshot: SessionSyncState = { ownerId: null, pending: 0, offline: false, error: null, savedCount: 0, lastSaved: null };

  const publish = (changes: Partial<SessionSyncState>) => {
    const next = { ...snapshot, ...changes };
    if ((Object.keys(next) as (keyof SessionSyncState)[]).every((key) => next[key] === snapshot[key])) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const report = () => { const status = attached?.status(); publish({ ownerId: attached?.ownerId ?? null, pending: status?.pending ?? 0, error: status?.error ?? null, offline: connectivity.state() === "offline" }); };

  /** Hands over whatever this owner's records hold that the journal does not. Safe to run at any moment. Returns whether anything was written. */
  function pump(sync: TimerSync): boolean {
    const { active, ended } = session.state();
    const owned = [...(active ? [active] : []), ...ended].filter((item: ActiveSession | EndedSession) => item.ownerId === sync.ownerId && !("saved" in item && item.saved));
    let wrote = false;
    for (const record of owned) {
      const meta = sync.journal(record.clientKey);
      if (meta?.settled && meta.sessionId) { session.settleAccepted(record.clientKey, { serverId: meta.sessionId, focusSeconds: meta.endedFocusSeconds ?? ("focusSeconds" in record ? record.focusSeconds : 0), breakSeconds: "breakSeconds" in record ? record.breakSeconds : 0, endedAt: meta.endedAt }); continue; }
      if (!meta) {
        sync.create({ ownerId: sync.ownerId, clientKey: record.clientKey, startedAt: new Date(record.startedAt).toISOString(), kind: "study", ...(record.subjectId ? { subjectId: record.subjectId } : {}), ...(record.questId ? { questId: record.questId } : {}) });
        wrote = true;
      }
      const waiting = record.operations.filter((operation) => operation.sequence > record.journaled);
      for (const operation of waiting) {
        if (operation.action === "END") sync.finish(record.clientKey, operation.focus, operation.breaks, false, operation.at);
        else sync.enqueue(record.clientKey, operation.action, operation.focus, operation.breaks, operation.at);
        wrote = true;
      }
      if (waiting.length) session.noteJournaled(record.clientKey, waiting[waiting.length - 1].sequence);
    }
    return wrote;
  }

  /** `drain` joins a run already going, which may have read the journal before this write. The second call picks up anything it missed, and costs nothing otherwise. */
  const deliver = (sync: TimerSync) => { void sync.drain(true).then(() => sync.drain(true)); };

  function accepted(value: TimerSyncAccepted) {
    const { active, ended } = session.state();
    const isActive = active?.clientKey === value.clientKey;
    const closed = value.execution?.state === "ENDED" || Boolean(value.endedAt);
    if (closed) {
      if (!isActive && !ended.some((item) => item.clientKey === value.clientKey && !item.saved)) return;
      if (!session.settleAccepted(value.clientKey, { serverId: value.sessionId, focusSeconds: value.focus, breakSeconds: value.breaks, endedAt: value.endedAt ?? value.execution?.endedAt })) return;
      publish({ savedCount: snapshot.savedCount + 1, lastSaved: session.state().ended.find((item) => item.clientKey === value.clientKey) ?? null });
      INVALIDATED_BY_A_SESSION.forEach((tag) => resources.invalidate(tag));
      return;
    }
    // Accepted state wins, but only once nothing from this device is on its way, and only when the two really disagree.
    if (!isActive || !active || !value.authoritative || !value.execution) return;
    const { execution } = value;
    const paused = active.snapshot.isPaused;
    const local = session.readout().focusSeconds;
    const disagrees = execution.state === "PAUSED" ? !paused || local !== execution.acceptedFocusSeconds : paused || execution.acceptedFocusSeconds > local + FOCUS_TOLERANCE_SECONDS;
    if (disagrees) session.applyAccepted(active.clientKey, reconcileSessionSnapshot(active.snapshot, execution, now()));
  }

  function attach() {
    const sync = delivery.current();
    if (sync === attached) return;
    detach?.();
    attached = sync;
    detach = undefined;
    if (sync) {
      const stopStatus = sync.subscribe(report);
      const stopAccepted = sync.onAccepted(accepted);
      detach = () => { stopStatus(); stopAccepted(); };
      if (pump(sync)) deliver(sync);
    }
    report();
  }

  function followAuth() {
    const { status, userId } = auth.getSnapshot();
    const { active } = session.state();
    // Nobody is here to study any more. The session stays its owner's, stopped at this moment, so the time after it can never be claimed.
    if (status === "signed-out" && active?.ownerId !== null && active?.ownerId !== undefined) session.pause();
    // Another person is at the keys. Their predecessor's session closes, and waits for its owner in the journal's terms: nothing about it stays on screen.
    if (status === "signed-in" && active && active.ownerId !== null && active.ownerId !== userId) session.end();
    if (lastOwner !== null && lastOwner !== userId) session.setPlan(null);
    lastOwner = userId;
    attach();
  }

  const stopAuth = auth.subscribe(followAuth);
  const stopConnectivity = connectivity.subscribe(report);
  const stopSession = session.subscribe(() => { if (attached && pump(attached)) deliver(attached); report(); });
  followAuth();

  return {
    state: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async flush(timeoutMs) {
      const sync = attached;
      if (!sync) return;
      pump(sync);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([sync.drain(true).then(() => sync.drain(true)).catch(() => undefined), new Promise<void>((done) => { timer = setTimeout(done, timeoutMs); })]);
      clearTimeout(timer);
    },
    claim(clientKeys) {
      const { userId } = auth.getSnapshot();
      if (userId !== null) session.assignOwner(clientKeys, userId);
    },
    decline(clientKeys) { session.declineOwner(clientKeys); },
    dispose() { stopAuth(); stopConnectivity(); stopSession(); detach?.(); },
  };
}
