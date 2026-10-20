import { NotesError } from "./errors";

const sessions = new Set<NotesSession>();
const BARRIER = "sylf_notes_session_barrier_v1";
const CHANNEL = "sylf-notes-session-v1";
const flushers = new Set<{
  ownerId: string;
  flush: () => Promise<void>;
  cancel?: () => void;
}>();
const recoveryChecks = new Set<(ownerId: string) => boolean>();
export function registerNotesRecoveryCheck(
  check: (ownerId: string) => boolean
): () => void {
  recoveryChecks.add(check);
  return () => recoveryChecks.delete(check);
}

export function registerNotesFlush(
  ownerId: string,
  flush: () => Promise<void>,
  cancel?: () => void
): () => void {
  const item = { ownerId, flush, cancel };
  flushers.add(item);
  return () => flushers.delete(item);
}
export function cancelNotesLogout(ownerId: string | null): void {
  for (const item of flushers) if (item.ownerId === ownerId) item.cancel?.();
}
/** Explicit logout drains captured edits first. Failure aborts logout; callers must surface the error. */
export async function prepareNotesLogout(
  ownerId: string | null
): Promise<void> {
  if (!ownerId) return;
  try {
    for (const item of [...flushers])
      if (item.ownerId === ownerId) await item.flush();
    if ([...recoveryChecks].some((check) => check(ownerId)))
      throw new NotesError(
        "CONFLICT",
        "Unacknowledged Notes work needs recovery before logout; keep this tab open."
      );
  } catch (error) {
    cancelNotesLogout(ownerId);
    throw error;
  }
}

/** An access capability, not an authentication or encryption system. Native adapters supply their authenticated owner guard. */
export class NotesSession {
  readonly epoch = crypto.randomUUID();
  readonly signal: AbortSignal;
  private readonly aborter = new AbortController();
  private readonly listeners = new Set<() => void>();
  constructor(
    readonly ownerId: string,
    private readonly currentOwner: () => string | null
  ) {
    if (!ownerId || ownerId.length > 128)
      throw new NotesError(
        "OWNERSHIP",
        "A valid authenticated owner is required."
      );
    this.signal = this.aborter.signal;
    sessions.add(this);
  }
  assert(): void {
    if (this.signal.aborted || this.currentOwner() !== this.ownerId) {
      this.close();
      throw new NotesError(
        "SESSION_ENDED",
        "Notes access ended; pending changes remain on this device."
      );
    }
  }
  onClose(listener: () => void): () => void {
    if (this.signal.aborted) listener();
    else this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    if (this.signal.aborted) return;
    this.aborter.abort();
    sessions.delete(this);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Access must close even if a consumer fails. */
      }
    }
    this.listeners.clear();
  }
}

/** Called by Sylf's existing logout/account-change boundary. Never clears a Notes database. */
export function invalidateNotesAccess(): void {
  for (const session of [...sessions]) session.close();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BARRIER, crypto.randomUUID());
  } catch {
    /* Broadcast is an additional best-effort barrier. */
  }
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("end");
    channel.close();
  } catch {
    /* Storage events are the fallback. */
  }
}

/** Create only after AuthProvider confirms the owner. No offline/unlock entry point is provided. */
export function createBrowserNotesSession(
  ownerId: string,
  isCurrentOwner: () => boolean
): NotesSession {
  if (typeof window === "undefined")
    throw new NotesError(
      "UNSUPPORTED",
      "Browser Notes access requires a browser."
    );
  let barrier: string | null;
  try {
    barrier = window.localStorage.getItem(BARRIER);
    // Reserve the fixed-size barrier before enabling edits. Replacing this value
    // on logout needs no additional storage even when other caches fill their quota.
    if (barrier === null) {
      barrier = crypto.randomUUID();
      window.localStorage.setItem(BARRIER, barrier);
    }
  } catch {
    throw new NotesError(
      "STORAGE",
      "Cross-tab session fencing is unavailable."
    );
  }
  const session = new NotesSession(ownerId, () => {
    try {
      return isCurrentOwner() &&
        window.localStorage.getItem(BARRIER) === barrier
        ? ownerId
        : null;
    } catch {
      return null;
    }
  });
  const check = () => {
    try {
      session.assert();
    } catch {
      /* assert closes and notifies consumers. */
    }
  };
  const storage = (event: StorageEvent) => {
    if (event.key === BARRIER || event.key === null) check();
  };
  window.addEventListener("storage", storage);
  window.addEventListener("pageshow", check);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => session.close();
  } catch {
    /* Synchronous storage check still fences operations. */
  }
  session.onClose(() => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("pageshow", check);
    channel?.close();
  });
  session.assert();
  return session;
}
