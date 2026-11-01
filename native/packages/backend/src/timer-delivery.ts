// TimerSync, running on Sylf Native. This owns only its lifetime: one instance per signed-in owner, started and stopped with the session,
// and woken when it could make progress. Journal, identities, replay and settlement all stay in lib/timer-sync.ts, unchanged.
//
// `createSessionBridge` is what writes to the journal. This keeps it trying: on a short delay while it can reach the server, and through
// connectivity's growing ping while it cannot, so an idle app with an empty journal schedules nothing.
import { TimerSync, type JournalStorage } from "@sylf/shared/backend";
import type { AuthModel } from "./auth-model";
import type { BackendClient } from "./client";
import type { Connectivity } from "./connectivity";

export interface TimerDelivery {
  /** The journal of whoever is signed in, or null. */
  current(): TimerSync | null;
  /** Foreground, or anything else that means it is worth trying now. */
  wake(): void;
  dispose(): void;
}

const RETRY_MS = 5_000;

export function createTimerDelivery({ auth, client, storage, connectivity }: { auth: AuthModel; client: BackendClient; storage: JournalStorage; connectivity: Connectivity }): TimerDelivery {
  const instances = new Map<number, TimerSync>();
  let active: TimerSync | null = null;
  let unsubscribe: (() => void) | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let endWait: (() => void) | undefined;

  const stopWaiting = () => { endWait?.(); endWait = undefined; };
  const stopRetry = () => { if (retry !== undefined) { clearTimeout(retry); retry = undefined; } stopWaiting(); };
  /** TimerSync backs off by itself, and asks to be called again. Nothing is scheduled with an empty journal. */
  const scheduleRetry = () => {
    stopRetry();
    if (!active || active.status().pending === 0) return;
    if (connectivity.state() === "offline") { endWait = connectivity.wait(); return; }
    const owner = active;
    retry = setTimeout(() => { retry = undefined; void owner.drain(); }, RETRY_MS);
  };

  const follow = () => {
    const { status, userId } = auth.getSnapshot();
    const wanted = status === "signed-in" ? userId : null;
    if ((active?.ownerId ?? null) === wanted) return;
    unsubscribe?.(); unsubscribe = undefined; stopRetry();
    active?.stop();
    active = null;
    if (wanted === null) return;
    let instance = instances.get(wanted);
    if (!instance) { instance = new TimerSync(wanted, storage, client.fetch); instances.set(wanted, instance); }
    active = instance;
    unsubscribe = instance.subscribe(scheduleRetry);
    instance.start();
  };

  const stopAuth = auth.subscribe(follow);
  const stopConnectivity = connectivity.subscribe(() => { if (connectivity.state() === "online") active?.wake(); else scheduleRetry(); });
  follow();

  return {
    current: () => active,
    wake() { active?.wake(); },
    dispose() { stopAuth(); stopConnectivity(); unsubscribe?.(); stopRetry(); active?.stop(); active = null; },
  };
}
