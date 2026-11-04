// Tells the server this person is here, so friends see them online. One beat on the way in and one a minute after that, while the app is in front
// and someone is signed in. Nothing beats in the background, and a failed beat is forgotten: the next one says the same thing.
// On a native session the server only records the time. It never charges HP from here (ADR 0017).
const BEAT_MS = 60_000;

export interface Presence { update(signedIn: boolean): void; setForeground(active: boolean): void; stop(): void }

export function createPresence(beat: () => Promise<unknown>, { intervalMs = BEAT_MS }: { intervalMs?: number } = {}): Presence {
  let signedIn = false;
  let foreground = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const run = () => {
    clear();
    if (!signedIn || !foreground) return;
    beat().catch(() => undefined);
    timer = setTimeout(run, intervalMs);
  };
  return {
    update(next) { if (next === signedIn) return; signedIn = next; run(); },
    setForeground(active) { if (active === foreground) return; foreground = active; run(); },
    stop() { signedIn = false; clear(); },
  };
}
