// Runs a WorldHost through a session and turns what happens into World's phases. It is created outside React, as the Spaces store is,
// because Android can recreate the root in the middle of play. It holds no host until someone enters and none after they leave, and
// the host's code is only imported on entry, so nothing of the game exists under Home or Workspace. A slow or broken host cannot
// trap anyone: a load or save has a deadline, a failure comes back to a screen with a way out, and teardown always finishes.
import type { SpacesStore } from "../store";
import { createWorldResourceScope, type WorldHost, type WorldHostContext, type WorldHostKind, type WorldProgress, type WorldResourceScope, type WorldSaveReceipt } from "./host";
import { parseWorldSnapshot, type WorldSnapshot } from "./lobby";

export type WorldFault = { during: "load" | "save"; message: string };
export type WorldDeparture = "saved" | "discarded";

export interface WorldRuntime {
  host: WorldHostKind | null;
  progress: WorldProgress | null;
  fault: WorldFault | null;
  /** How the last leave ended, so the screen never says "saved" when nothing was. */
  departure: WorldDeparture | null;
  /** What the host holds right now. It is empty whenever someone is not in the game. */
  resources: string[];
}

export interface WorldControllerOptions {
  /** Imports the host's code. Called on entry and never before. */
  loadHost(): Promise<WorldHost>;
  window(): { width: number; height: number };
  /** Master plan G1: whatever asks, nobody enters while study time would keep counting. The lobby explains this and offers the way out. */
  entryAllowed?(): boolean;
  log?(event: string, detail?: unknown): void;
  loadTimeoutMs?: number;
  saveTimeoutMs?: number;
  /** How long "saved" stays up. It is the only proof a person gets that their save worked, so it must be long enough to read. */
  savedHoldMs?: number;
}

export interface WorldController {
  getRuntime(): WorldRuntime;
  subscribe(listener: () => void): () => void;
  enter(): Promise<boolean>;
  pause(): void;
  resume(): void;
  leave(options?: { discard?: boolean }): Promise<void>;
  /** The app left or returned to the foreground. Play stops first, and the game menu is waiting on return. */
  setForeground(active: boolean): void;
  snapshot(): WorldSnapshot;
  updateSnapshot(patch: Partial<WorldSnapshot>): void;
}

const NOT_FAULTED = "Something went wrong on the way in. Nothing was changed.";
const SAVE_FAULT = "This visit could not be saved. Nothing has been lost yet.";

/** Rejects if `work` takes longer than the deadline, and leaves the work itself to be cancelled by the caller. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("deadline")), ms); });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export function createWorldController(store: SpacesStore, options: WorldControllerOptions): WorldController {
  const { loadHost, window, entryAllowed = () => true, log = () => undefined, loadTimeoutMs = 30_000, saveTimeoutMs = 15_000, savedHoldMs = 900 } = options;
  let runtime: WorldRuntime = { host: null, progress: null, fault: null, departure: null, resources: [] };
  let host: WorldHost | null = null;
  let scope: WorldResourceScope | null = null;
  // Each session has a number, so a late answer from a host that has already been given up on changes nothing.
  let session = 0;
  let stopped = false;
  let foreground = true;
  const listeners = new Set<() => void>();

  const publish = (patch: Partial<WorldRuntime>) => {
    runtime = { ...runtime, resources: scope?.active() ?? [], ...patch };
    listeners.forEach((listener) => listener());
  };
  const phase = () => store.getSnapshot().world;
  const snapshot = () => parseWorldSnapshot(store.getSnapshot().state.snapshots.world);
  const updateSnapshot = (patch: Partial<WorldSnapshot>) => store.setSpaceSnapshot("world", { ...snapshot(), ...patch });

  const halt = (reason: "menu" | "background") => {
    if (stopped || !host) return;
    stopped = true;
    host.suspend(reason).catch((error) => log("suspend-failed", String(error)));
  };

  /** Always ends with no host and an empty scope, however far the host got and whatever it does on the way out. */
  const teardown = async (orderly: boolean) => {
    const leaving = host;
    const held = scope;
    session++;
    host = null;
    scope = null;
    stopped = false;
    if (leaving && orderly) {
      log("leaving", leaving.memory() ?? undefined);
      await withDeadline(leaving.exit(), saveTimeoutMs).catch((error) => log("exit-failed", String(error)));
    }
    try { leaving?.dispose(); } catch (error) { log("dispose-failed", String(error)); }
    if (held) {
      const left = held.active();
      if (left.length) log("released-for-host", left);
      const { failed } = held.releaseAll();
      if (failed.length) log("release-failed", failed);
    }
    log("host-disposed");
    publish({ host: null, progress: null, resources: [] });
  };

  return {
    getRuntime: () => runtime,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot,
    updateSnapshot,

    async enter() {
      if (phase() !== "entry" || store.getSnapshot().state.activeSpace !== "world" || host || !entryAllowed()) return false;
      const mine = ++session;
      const held = createWorldResourceScope();
      scope = held;
      store.worldEvent("enter");
      publish({ fault: null, departure: null, progress: { stage: "start", label: "Entering the world", fraction: 0 } });
      const context: WorldHostContext = {
        window,
        resources: held,
        cancelled: () => mine !== session,
        report(progress) {
          if (mine !== session) return;
          publish({ progress: { ...progress, fraction: Math.min(1, Math.max(0, progress.fraction)) } });
        },
      };
      try {
        const loading = (async () => {
          const created = await loadHost();
          if (mine !== session) { created.dispose(); return null; }
          host = created;
          log("host-created", created.descriptor.id);
          publish({ host: created.descriptor.kind });
          await created.initialize(context);
          await created.load(snapshot().save ?? null);
          return created;
        })();
        const started = await withDeadline(loading, loadTimeoutMs);
        if (mine !== session) return false;
        store.worldEvent("ready");
        publish({ progress: null });
        log("playing", started?.memory() ?? undefined);
        // Someone may have left the app during the load. Play must not start with nobody there.
        if (!foreground) { store.worldEvent("pause"); halt("background"); }
        return true;
      } catch (error) {
        if (mine !== session) return false;
        log("load-failed", String(error));
        await teardown(false);
        store.worldEvent("failed");
        publish({ fault: { during: "load", message: NOT_FAULTED } });
        return false;
      }
    },

    pause() {
      if (phase() !== "playing") return;
      store.worldEvent("pause");
      halt("menu");
    },

    resume() {
      if (phase() !== "paused") return;
      store.worldEvent("resume");
      publish({ fault: null });
      if (stopped && host) { stopped = false; host.resume().catch((error) => log("resume-failed", String(error))); }
    },

    async leave({ discard = false } = {}) {
      if (phase() !== "paused" || !host) return;
      const current = host;
      const mine = session;
      store.worldEvent("leave");
      publish({ fault: null, progress: { stage: "save", label: discard ? "Leaving" : "Saving", fraction: 0 } });
      let receipt: WorldSaveReceipt | null = null;
      if (!discard) {
        try {
          receipt = await withDeadline(current.save(), saveTimeoutMs);
        } catch (error) {
          if (mine !== session) return;
          log("save-failed", String(error));
          store.worldEvent("failed");
          publish({ progress: null, fault: { during: "save", message: SAVE_FAULT } });
          return;
        }
        if (mine !== session) return;
        updateSnapshot({ save: receipt });
        store.flush();
      }
      publish({ departure: discard ? "discarded" : "saved", progress: null });
      store.worldEvent("saved");
      await teardown(true);
      await new Promise((resolve) => setTimeout(resolve, savedHoldMs));
      store.worldEvent("finish");
    },

    setForeground(active) {
      foreground = active;
      if (active) return;
      if (phase() === "playing") { store.worldEvent("pause"); halt("background"); }
    },
  };
}
