// The Workspace's owner, kept outside React like the Spaces store it writes through, so a layout survives a Space change, a
// recreated root and a process kill. There is no second copy and no second persistence path: the state is the `workspace`
// snapshot. Screens call these actions and read `state()`. The camera commits here only when it comes to rest.
import { HOME_CAMERA, NO_INSETS, clampCamera, frameRect, revealRect, zoomAt, type Camera, type Frame, type Rect } from "./canvas";
import { INITIAL_WORKSPACE, applyLayout, closeWindow, cycleFocus, fitWorkspace, focusWindow, minimizeWindow, moveWindow, openWindow, parseWorkspaceState, resizeWindow, restoreWindow, setCamera, setToolState, type ToolState, type WorkspaceLayout, type WorkspaceState } from "./windows";
import type { ToolId } from "./tools";
import type { SpacesStore } from "../store";

export interface WorkspaceModel {
  state(): WorkspaceState;
  subscribe(listener: () => void): () => void;
  /** The canvas's size and what chrome covers. Placement and presets work from it. */
  setFrame(frame: Frame): void;
  frame(): Frame;
  /** Workspace left the screen. Until it returns, a frame is only a memory of a window that may have changed. */
  detach(): void;
  /** Returns the window's id, or null when the Workspace is full. */
  open(tool: ToolId, initial?: ToolState): string | null;
  /** Brings a tool forward, opening it if it must, from outside Workspace. It waits for the canvas, so it lands in the real view. */
  summon(tool: ToolId): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  restore(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, rect: Rect): void;
  patchTool(id: string, patch: ToolState): void;
  cycle(direction: 1 | -1): void;
  setLayout(layout: WorkspaceLayout): void;
  /** The camera came to rest here. */
  commitCamera(camera: Camera): void;
  fit(): void;
  resetView(): void;
  zoomBy(factor: number): void;
  zoomTo(zoom: number): void;
  /** Shows a window without changing what is focused, for a window that took keyboard focus off screen. */
  reveal(id: string): void;
  frameWindow(id: string): void;
  clear(): void;
  flush(): void;
}

const CLOSED_FRAME: Frame = { viewport: { width: 1280, height: 820 }, insets: NO_INSETS };

export function createWorkspaceModel(store: Pick<SpacesStore, "getSnapshot" | "setSpaceSnapshot" | "subscribe" | "flush">): WorkspaceModel {
  let raw = store.getSnapshot().state.snapshots.workspace;
  let current = parseWorkspaceState(raw);
  let frame = CLOSED_FRAME;
  let attached = false;
  let summoned: ToolId | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  // Following the store, not this object, means a change from anywhere reaches the screen too. Like Home's navigation, this
  // lives as long as the store does, so the subscription is never removed.
  store.subscribe(() => {
    const next = store.getSnapshot().state.snapshots.workspace;
    if (next === raw) return;
    raw = next;
    current = parseWorkspaceState(next);
    notify();
  });

  const write = (next: WorkspaceState) => {
    if (next === current) return;
    current = next;
    raw = next;
    store.setSpaceSnapshot("workspace", next);
    notify();
  };
  const pointCamera = (camera: Camera) => write(setCamera(current, camera, frame.viewport));
  const windowOf = (id: string) => current.windows.find((window) => window.id === id);
  const bringForward = (tool: ToolId) => {
    const window = current.windows.find((item) => item.tool === tool);
    const next = window ? restoreWindow(current, window.id) : openWindow(current, tool, frame).state;
    const shown = window ? next.windows.find((item) => item.id === window.id) : next.windows.find((item) => item.id === next.focused);
    write(shown ? setCamera(next, revealRect(next.camera, shown, frame), frame.viewport) : next);
  };

  return {
    state: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setFrame(next) {
      frame = next;
      attached = true;
      write(setCamera(current, current.camera, frame.viewport));
      if (summoned) { const tool = summoned; summoned = null; bringForward(tool); }
    },
    frame: () => frame,
    detach() { attached = false; },
    open(tool, initial) {
      const { state, id } = openWindow(current, tool, frame, initial);
      write(state);
      return id;
    },
    summon(tool) { if (attached) bringForward(tool); else summoned = tool; },
    close: (id) => write(closeWindow(current, id)),
    focus: (id) => write(focusWindow(current, id)),
    minimize: (id) => write(minimizeWindow(current, id)),
    restore(id) {
      const next = restoreWindow(current, id);
      const window = next.windows.find((item) => item.id === id);
      write(window ? setCamera(next, revealRect(next.camera, window, frame), frame.viewport) : next);
    },
    move: (id, x, y) => write(moveWindow(current, id, x, y)),
    resize: (id, rect) => write(resizeWindow(current, id, rect)),
    patchTool: (id, patch) => write(setToolState(current, id, patch)),
    cycle(direction) {
      const next = cycleFocus(current, direction);
      const window = next.windows.find((item) => item.id === next.focused);
      write(window ? setCamera(next, revealRect(next.camera, window, frame), frame.viewport) : next);
    },
    setLayout: (layout) => write(applyLayout(current, layout, frame)),
    commitCamera: pointCamera,
    fit: () => pointCamera(fitWorkspace(current, frame)),
    resetView: () => pointCamera(clampCamera(HOME_CAMERA, frame.viewport)),
    zoomBy(factor) { pointCamera(zoomAt(current.camera, current.camera.zoom * factor, { x: frame.viewport.width / 2, y: frame.viewport.height / 2 }, frame.viewport)); },
    zoomTo(zoom) { pointCamera(zoomAt(current.camera, zoom, { x: frame.viewport.width / 2, y: frame.viewport.height / 2 }, frame.viewport)); },
    reveal(id) {
      const window = windowOf(id);
      if (window) pointCamera(revealRect(current.camera, window, frame));
    },
    frameWindow(id) {
      const window = windowOf(id);
      if (window) pointCamera(frameRect(window, frame, 28, 1));
    },
    clear: () => write({ ...INITIAL_WORKSPACE, camera: clampCamera(HOME_CAMERA, frame.viewport), sequence: current.sequence }),
    flush: () => store.flush(),
  };
}
