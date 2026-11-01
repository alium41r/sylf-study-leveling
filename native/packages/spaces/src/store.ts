// The Spaces store lives outside React for the same reason the appearance store does: Android can recreate the React
// root, and the first frame must already show the right Space. Which Space is active is written at once. Snapshots change
// often (a scroll position, say), so they wait for a short pause or a flush when the app is backgrounded.
import { INITIAL_SPACES_STATE, availableSpaces, parseSpacesState, type FormFactor, type SpaceId, type SpacesRestorationState } from "./contracts";
import { nextWorldPhase, worldHoldsNavigation, type WorldEvent, type WorldPhase } from "./world";

export interface SpacesStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export const SPACES_STORAGE_KEY = "sylf.native.spaces.v1";
const SNAPSHOT_DELAY_MS = 240;

export interface SpacesSnapshot {
  state: SpacesRestorationState;
  /** Not persisted: a restart comes back through World's entry environment (master plan §3.2). */
  world: WorldPhase;
}

export interface SpacesStore {
  getSnapshot(): SpacesSnapshot;
  subscribe(listener: () => void): () => void;
  available(): SpaceId[];
  /** Returns false when the Space is unavailable here or World's own flow holds navigation. */
  select(space: SpaceId): boolean;
  setSpaceSnapshot(space: SpaceId, value: unknown): void;
  worldEvent(event: WorldEvent): void;
  flush(): void;
}

export function createSpacesStore(storage: SpacesStorage | undefined, formFactor: FormFactor, now: () => number = Date.now): SpacesStore {
  const load = (): SpacesRestorationState => {
    try {
      const raw = storage?.getItem(SPACES_STORAGE_KEY);
      return raw ? parseSpacesState(JSON.parse(raw), formFactor) : INITIAL_SPACES_STATE;
    } catch {
      return INITIAL_SPACES_STATE; // A corrupt record must never stop the app from starting.
    }
  };

  let snapshot: SpacesSnapshot = { state: load(), world: "entry" };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    try { storage?.setItem(SPACES_STORAGE_KEY, JSON.stringify(snapshot.state)); } catch { /* Navigation still works this session. */ }
  };
  const update = (next: SpacesSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const activate = (space: SpaceId, world: WorldPhase, snapshots = snapshot.state.snapshots) => {
    const { activeSpace, returnSpace } = snapshot.state;
    const leaving = activeSpace === "world" ? returnSpace : activeSpace;
    update({ world, state: { ...snapshot.state, activeSpace: space, returnSpace: space === "world" ? leaving : space, snapshots } });
    flush();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    available: () => availableSpaces(formFactor),
    select(space) {
      if (!availableSpaces(formFactor).includes(space) || worldHoldsNavigation(snapshot.world)) return false;
      if (space !== snapshot.state.activeSpace) activate(space, snapshot.world);
      return true;
    },
    setSpaceSnapshot(space, value) {
      update({ ...snapshot, state: { ...snapshot.state, snapshots: { ...snapshot.state.snapshots, [space]: value } } });
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SNAPSHOT_DELAY_MS);
    },
    worldEvent(event) {
      const world = nextWorldPhase(snapshot.world, event);
      if (world === snapshot.world) return;
      if (event !== "finish") { update({ ...snapshot, world }); return; }
      // The record also holds the lobby's choices and the last save, so leaving adds to it and never replaces it.
      const visited = { ...(snapshot.state.snapshots.world as object | undefined), leftAt: now() };
      activate(snapshot.state.returnSpace, world, { ...snapshot.state.snapshots, world: visited });
    },
    flush,
  };
}
