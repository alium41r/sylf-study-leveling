// The one seam between Sylf and whatever eventually runs the game. Nothing here names an engine: Phase 15 implements this interface
// for whichever one it chooses, and nothing else changes. A host never touches the Spaces store or the shell. It does what it is
// asked and reports progress, and the controller decides what that means for the app. Everything a host holds goes in its resource
// scope, which is emptied however the host ends, so nothing of World can outlive World.
export type WorldHostKind = "preview" | "engine";
export type WorldSuspendReason = "menu" | "background";

export interface WorldHostDescriptor {
  id: string;
  kind: WorldHostKind;
  label: string;
}

/** Real progress only. `stage` is a stable id for tests and logs, and `label` is what a person reads. */
export interface WorldProgress {
  stage: string;
  label: string;
  fraction: number;
}

/**
 * Proof that a save finished. Like a Workspace window's state, this is a pointer and never the save itself, so it stays small enough
 * for a Spaces snapshot. The host owns the save data. `pendingSync` is shown as it is: a local save is not yet a synced one.
 */
export interface WorldSaveReceipt {
  ref: string;
  savedAt: number;
  location: "device";
  pendingSync: boolean;
}

/** What a host says it is holding, so World can be held to a budget of its own (master plan §5.3). Null when it cannot tell. */
export interface WorldMemoryReport { usedMb: number; budgetMb?: number }

export interface WorldHostContext {
  /** The window the host will draw in, read when asked, because a window can change during a load. */
  window(): { width: number; height: number };
  report(progress: WorldProgress): void;
  resources: WorldResourceScope;
  /** True once the controller has given up on this host: a long load should check it and stop. */
  cancelled(): boolean;
}

/**
 * `initialize` starts the runtime and takes hold of its surface, and `load` brings in a save, or a new game when `save` is null.
 * `suspend` and `resume` stop and restart all work, whether for the game menu or because the app left the foreground. `save` returns
 * only once the data is safe on this device. `exit` ends play in an orderly way, and `dispose` must always succeed, however far
 * the host got, and may be called after a failure at any step. `memory` is read when play starts and again as it ends.
 */
export interface WorldHost {
  readonly descriptor: WorldHostDescriptor;
  initialize(context: WorldHostContext): Promise<void>;
  load(save: WorldSaveReceipt | null): Promise<void>;
  suspend(reason: WorldSuspendReason): Promise<void>;
  resume(): Promise<void>;
  save(): Promise<WorldSaveReceipt>;
  exit(): Promise<void>;
  dispose(): void;
  memory(): WorldMemoryReport | null;
}

export interface WorldResourceScope {
  /** Registers something to release, and returns a function that releases it early. */
  track(name: string, release: () => void): () => void;
  /** A timer that dies with the scope. Hosts use this instead of a bare setTimeout. */
  after(ms: number, run: () => void): () => void;
  active(): string[];
  /** Releases everything, in reverse order of tracking. A release that throws does not stop the others. */
  releaseAll(): { released: number; failed: string[] };
}

export function createWorldResourceScope(): WorldResourceScope {
  const held: { name: string; release: () => void }[] = [];
  const scope: WorldResourceScope = {
    track(name, release) {
      const entry = { name, release };
      held.push(entry);
      return () => {
        const index = held.indexOf(entry);
        if (index < 0) return;
        held.splice(index, 1);
        release();
      };
    },
    after(ms, run) {
      const stop = scope.track("timer", () => clearTimeout(timer));
      const timer = setTimeout(() => { stop(); run(); }, ms);
      return stop;
    },
    active: () => held.map((entry) => entry.name),
    releaseAll() {
      const failed: string[] = [];
      let released = 0;
      for (const entry of held.splice(0).reverse()) {
        try { entry.release(); released++; } catch { failed.push(entry.name); }
      }
      return { released, failed };
    },
  };
  return scope;
}
