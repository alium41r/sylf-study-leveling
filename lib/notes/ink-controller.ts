import {
  InkModel,
  type InkBrush,
  type InkSample,
  type InkStroke,
  type InkEdit,
} from "./ink";
import {
  InkRenderer,
  hitInk,
  lassoInk,
  type InkViewport,
  type InkRect,
} from "./ink-renderer";
export type InkTool = "pen" | "highlighter" | "eraser" | "lasso" | "hand";
export interface InkTools {
  tool: InkTool;
  color: string;
  width: number;
  finger: boolean;
}
/** Imperative input/rendering: no React work on pointer samples or animation frames. */
export class InkController {
  tools: InkTools = {
    tool: "pen",
    color: "#242830",
    width: 2.8,
    finger: false,
  };
  readonly renderer: InkRenderer;
  private scene: InkStroke[] = [];
  private active?: {
    pointer: number;
    id: string;
    style: InkBrush;
    points: InkSample[];
    started: number;
    input: string;
  };
  private action?: {
    pointer: number;
    kind: "erase" | "lasso" | "pan" | "move";
    x: number;
    y: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    polygon: { x: number; y: number }[];
    removed: Set<string>;
  };
  private readonly touches = new Map<number, { x: number; y: number }>();
  private gesture?: { x: number; y: number; distance: number };
  private penUntil = 0;
  private frame = 0;
  private resize: ResizeObserver;
  private disposed = false;
  private signature = "";
  private selected = new Set<string>();
  private space = false;
  private readonly removeModel: () => void;
  constructor(
    readonly host: HTMLElement,
    base: HTMLCanvasElement,
    live: HTMLCanvasElement,
    readonly model: InkModel,
    width: number,
    height: number,
    private readonly writable: () => boolean,
    private readonly changed: () => void,
    private readonly error: (message: string) => void,
    viewport?: InkViewport
  ) {
    this.renderer = new InkRenderer(base, live, width, height);
    this.scene = model.strokes();
    this.removeModel = model.subscribe(() => {
      try {
        this.scene = model.strokes();
        this.schedule();
      } catch (e) {
        this.report(e);
        this.finish("interrupted");
      }
    });
    this.resize = new ResizeObserver(() => {
      this.renderer.resize(host.clientWidth, host.clientHeight);
      if (!this.initialized) {
        this.renderer.fit();
        if (viewport) this.renderer.viewport = { ...viewport };
        this.initialized = true;
      }
      this.signature = "";
      this.schedule();
    });
    this.resize.observe(host);
    host.addEventListener("pointerdown", this.down);
    host.addEventListener("pointermove", this.move);
    host.addEventListener("pointerup", this.up);
    host.addEventListener("pointercancel", this.cancel);
    host.addEventListener("lostpointercapture", this.cancel);
    host.addEventListener("wheel", this.wheel, { passive: false });
    host.addEventListener("keydown", this.keyDown);
    host.addEventListener("keyup", this.keyUp);
    host.addEventListener("contextmenu", this.contextMenu);
    window.addEventListener("blur", this.blur);
    window.addEventListener("pagehide", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
  }
  private initialized = false;
  private report(error: unknown) {
    this.error(
      error instanceof Error
        ? error.message
        : "This stroke needs recovery. Keep this tab open."
    );
  }
  private point(event: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    return this.renderer.pagePoint(
      event.clientX - r.left,
      event.clientY - r.top
    );
  }
  private local(event: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  private sample(event: PointerEvent): InkSample {
    const p = this.point(event),
      a = this.active!;
    return [
      p.x,
      p.y,
      event.pressure,
      Math.max(0, Math.min(86400000, event.timeStamp - a.started)),
      event.tiltX || 0,
      event.tiltY || 0,
      event.twist || 0,
      event.tangentialPressure || 0,
    ];
  }
  private capture(event: PointerEvent) {
    try {
      this.host.setPointerCapture(event.pointerId);
    } catch {
      /* A detached/cancelled pointer cannot be captured. */
    }
  }
  private down = (event: PointerEvent) => {
    if (event.pointerType !== "pen" && event.button !== 0) return;
    try {
      if (event.pointerType === "pen") {
        this.penUntil = performance.now() + 800;
        if (
          this.active?.input === "touch" ||
          (this.action && this.touches.has(this.action.pointer))
        )
          this.finish("interrupted");
        this.touches.clear();
        this.gesture = undefined;
      }
      if (event.pointerType === "touch") {
        if (
          this.active?.input === "pen" ||
          performance.now() < this.penUntil ||
          event.width > 40 ||
          event.height > 40
        )
          return;
        this.touches.set(event.pointerId, this.local(event));
        if (this.touches.size >= 2) {
          this.finish("interrupted");
          this.beginGesture();
          this.capture(event);
          event.preventDefault();
          return;
        }
      }
      if (this.active || this.action) return;
      const p = this.point(event),
        local = this.local(event);
      const tool =
        this.space || (event.pointerType === "touch" && !this.tools.finger)
          ? "hand"
          : event.pointerType === "pen" &&
              (event.button === 5 ||
                event.button === 2 ||
                !!(event.buttons & 32))
            ? "eraser"
            : this.tools.tool;
      if (tool !== "hand" && !this.writable()) return;
      this.host.focus({ preventScroll: true });
      event.preventDefault();
      this.capture(event);
      if (tool === "hand") {
        this.action = {
          pointer: event.pointerId,
          kind: "pan",
          x: local.x,
          y: local.y,
          startX: local.x,
          startY: local.y,
          dx: 0,
          dy: 0,
          polygon: [],
          removed: new Set(),
        };
        return;
      }
      if (
        p.x < 0 ||
        p.y < 0 ||
        p.x > this.renderer.pageWidth ||
        p.y > this.renderer.pageHeight
      )
        return;
      if (tool === "pen" || tool === "highlighter") {
        this.selected.clear();
        const style: InkBrush = {
          tool,
          color: this.tools.color,
          width:
            tool === "highlighter"
              ? Math.max(10, this.tools.width * 5)
              : this.tools.width,
          input:
            event.pointerType === "pen"
              ? "pen"
              : event.pointerType === "touch"
                ? "touch"
                : "mouse",
          brush: "perfect-freehand/1.2.3:sylf-1",
        };
        const id = this.model.begin(style);
        this.active = {
          pointer: event.pointerId,
          id,
          style,
          points: [],
          started: event.timeStamp,
          input: event.pointerType,
        };
        this.addSamples(event);
      } else {
        const box = this.selectionBounds(),
          move =
            tool === "lasso" &&
            box &&
            p.x >= box.x &&
            p.y >= box.y &&
            p.x <= box.x + box.width &&
            p.y <= box.y + box.height;
        this.action = {
          pointer: event.pointerId,
          kind: tool === "eraser" ? "erase" : move ? "move" : "lasso",
          x: p.x,
          y: p.y,
          startX: p.x,
          startY: p.y,
          dx: 0,
          dy: 0,
          polygon: [p],
          removed: new Set(),
        };
        if (!move) this.selected.clear();
        if (tool === "eraser") this.erase(p.x, p.y);
      }
      this.signature = "";
      this.schedule();
      this.changed();
    } catch (error) {
      this.report(error);
      this.finish("interrupted");
    }
  };
  private addSamples(event: PointerEvent) {
    const active = this.active;
    if (!active) return;
    const events = event.getCoalescedEvents?.() || [];
    if (!events.length || events.at(-1)!.timeStamp !== event.timeStamp)
      events.push(event);
    const samples = events.map((e) => this.sample(e));
    active.points.push(...samples);
    this.model.append(samples);
    // Bound live geometry while retaining every original sample in independent continuation strokes.
    if (active.points.length >= 4096) {
      const style = active.style,
        last = active.points.at(-1)!,
        pointer = active.pointer,
        started = active.started,
        input = active.input;
      this.finish();
      const id = this.model.begin(style);
      this.active = { pointer, id, style, points: [last], started, input };
      this.model.append([last]);
    }
    this.schedule();
  }
  private move = (event: PointerEvent) => {
    try {
      if (event.pointerType === "pen") this.penUntil = performance.now() + 800;
      if (event.pointerType === "touch" && this.touches.has(event.pointerId)) {
        this.touches.set(event.pointerId, this.local(event));
        if (this.touches.size >= 2) {
          event.preventDefault();
          this.updateGesture();
          return;
        }
      }
      if (this.active?.pointer === event.pointerId) {
        event.preventDefault();
        if (this.writable()) this.addSamples(event);
        else this.finish("interrupted");
        return;
      }
      const action = this.action;
      if (!action || action.pointer !== event.pointerId) return;
      event.preventDefault();
      const p = action.kind === "pan" ? this.local(event) : this.point(event);
      if (action.kind === "pan") {
        this.renderer.pan(p.x - action.x, p.y - action.y);
        this.signature = "";
      } else if (action.kind === "erase") {
        const length = Math.hypot(p.x - action.x, p.y - action.y),
          steps = Math.min(256, Math.max(1, Math.ceil(length / 5)));
        for (let i = 1; i <= steps; i++)
          this.erase(
            action.x + ((p.x - action.x) * i) / steps,
            action.y + ((p.y - action.y) * i) / steps
          );
      } else if (action.kind === "lasso") {
        if (Math.hypot(p.x - action.x, p.y - action.y) > 2)
          action.polygon.push(p);
      } else {
        action.dx = p.x - action.startX;
        action.dy = p.y - action.startY;
      }
      action.x = p.x;
      action.y = p.y;
      this.schedule();
    } catch (error) {
      this.report(error);
      this.finish("interrupted");
    }
  };
  private erase(x: number, y: number) {
    const ids = this.renderer.index.query({
      x: x - 24,
      y: y - 24,
      width: 48,
      height: 48,
    });
    for (const stroke of this.scene)
      if (
        ids.has(stroke.id) &&
        hitInk(stroke, x, y, Math.max(6, this.tools.width * 2))
      )
        this.action?.removed.add(stroke.id);
    this.signature = "";
  }
  private beginGesture() {
    const points = [...this.touches.values()];
    this.gesture = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
      distance: Math.max(
        1,
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
      ),
    };
  }
  private updateGesture() {
    if (!this.gesture) {
      this.beginGesture();
      return;
    }
    const old = this.gesture;
    this.beginGesture();
    const next = this.gesture!;
    this.renderer.zoom(next.distance / old.distance, old.x, old.y);
    this.renderer.pan(next.x - old.x, next.y - old.y);
    this.signature = "";
    this.schedule();
  }
  private up = (event: PointerEvent) => {
    if (this.active?.pointer === event.pointerId) {
      try {
        if (this.writable()) this.addSamples(event);
      } catch (e) {
        this.report(e);
      }
    }
    this.endPointer(event, "complete");
  };
  private cancel = (event: PointerEvent) =>
    this.endPointer(event, "interrupted");
  private endPointer(event: PointerEvent, reason: "complete" | "interrupted") {
    if (
      this.active?.pointer === event.pointerId ||
      this.action?.pointer === event.pointerId
    )
      this.finish(reason);
    const hadGesture = !!this.gesture;
    const trackedTouch = this.touches.delete(event.pointerId);
    if (trackedTouch && this.touches.size < 2) {
      this.gesture = undefined;
      if (hadGesture) this.changed();
    }
    try {
      if (this.host.hasPointerCapture(event.pointerId))
        this.host.releasePointerCapture(event.pointerId);
    } catch {
      /* Already released. */
    }
  }
  finish = (reason: "complete" | "interrupted" = "complete") => {
    const active = this.active,
      action = this.action;
    this.active = undefined;
    this.action = undefined;
    try {
      this.model.finish(reason);
      if (action?.kind === "erase" && action.removed.size)
        this.model.edit({ targets: [...action.removed], erase: true }, true);
      if (action?.kind === "lasso" && action.polygon.length > 2) {
        this.selected = new Set(
          this.scene.filter((s) => lassoInk(s, action.polygon)).map((s) => s.id)
        );
      }
      if (action?.kind === "move" && (action.dx || action.dy))
        this.model.edit(
          {
            targets: [...this.selected],
            transform: { dx: action.dx, dy: action.dy, scale: 1, cx: 0, cy: 0 },
          },
          true
        );
    } catch (error) {
      this.report(error);
    }
    this.scene = this.safeStrokes();
    this.signature = "";
    this.schedule();
    if (active || action) this.changed();
  };
  private safeStrokes() {
    try {
      return this.model.strokes();
    } catch (e) {
      this.report(e);
      return this.scene;
    }
  }
  private selectionBounds(): InkRect | undefined {
    const selected = this.scene.filter((s) => this.selected.has(s.id));
    if (!selected.length) return;
    const x = Math.min(...selected.map((s) => s.bounds.x)),
      y = Math.min(...selected.map((s) => s.bounds.y));
    return {
      x,
      y,
      width: Math.max(...selected.map((s) => s.bounds.x + s.bounds.width)) - x,
      height:
        Math.max(...selected.map((s) => s.bounds.y + s.bounds.height)) - y,
    };
  }
  isActive() {
    return !!this.active || (!!this.action && this.action.kind !== "pan");
  }
  selectionCount() {
    return this.scene.filter((s) => this.selected.has(s.id)).length;
  }
  editSelection(edit: Omit<InkEdit, "targets">) {
    try {
      this.finish();
      if (this.selectionCount())
        this.model.edit({ ...edit, targets: [...this.selected] });
      this.changed();
    } catch (e) {
      this.report(e);
    }
  }
  scaleSelection(scale: number) {
    const box = this.selectionBounds();
    if (box)
      this.editSelection({
        transform: {
          dx: 0,
          dy: 0,
          scale,
          cx: box.x + box.width / 2,
          cy: box.y + box.height / 2,
        },
      });
  }
  setTools(tools: InkTools) {
    this.finish();
    this.tools = tools;
    this.host.style.cursor =
      tools.tool === "hand"
        ? "grab"
        : tools.tool === "eraser"
          ? "crosshair"
          : "crosshair";
    this.schedule();
  }
  fit() {
    this.finish();
    this.renderer.fit();
    this.signature = "";
    this.schedule();
    this.changed();
  }
  zoom(factor: number) {
    this.finish();
    this.renderer.zoom(factor);
    this.signature = "";
    this.schedule();
    this.changed();
  }
  viewport() {
    return { ...this.renderer.viewport };
  }
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.finish();
    const r = this.host.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey)
      this.renderer.zoom(
        Math.exp(-event.deltaY * 0.005),
        event.clientX - r.left,
        event.clientY - r.top
      );
    else this.renderer.pan(-event.deltaX, -event.deltaY);
    this.signature = "";
    this.schedule();
    this.changed();
  };
  private keyDown = (event: KeyboardEvent) => {
    try {
      if (event.code === "Space") {
        event.preventDefault();
        this.space = true;
        return;
      }
      const key = event.key.toLowerCase(),
        command = event.metaKey || event.ctrlKey;
      if (command && ["z", "y"].includes(key)) {
        event.preventDefault();
        this.finish();
        if (key === "y" || event.shiftKey) this.model.redoEdit();
        else this.model.undoEdit();
        this.changed();
      } else if (command && key === "a") {
        event.preventDefault();
        this.selected = new Set(this.scene.map((s) => s.id));
        this.schedule();
        this.changed();
      } else if (key === "escape") {
        this.finish();
        this.selected.clear();
        this.schedule();
        this.changed();
      } else if (["delete", "backspace"].includes(key)) {
        event.preventDefault();
        this.editSelection({ erase: true });
        this.selected.clear();
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1,
          dx =
            event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0,
          dy =
            event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0;
        if (this.selectionCount())
          this.editSelection({ transform: { dx, dy, scale: 1, cx: 0, cy: 0 } });
        else {
          this.renderer.pan(-dx * 24, -dy * 24);
          this.signature = "";
          this.schedule();
        }
      } else if (command && ["+", "=", "-", "0"].includes(key)) {
        event.preventDefault();
        if (key === "0") this.fit();
        else this.zoom(key === "-" ? 0.8 : 1.25);
      }
    } catch (e) {
      this.report(e);
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") this.space = false;
  };
  private blur = () => {
    this.space = false;
    this.finish("interrupted");
  };
  private visibility = () => {
    if (document.visibilityState === "hidden") this.blur();
  };
  private contextMenu = (event: Event) => event.preventDefault();
  private schedule() {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame(this.paint);
  }
  private paint = () => {
    this.frame = 0;
    if (this.disposed) return;
    try {
      const omit = new Set(this.action?.removed || []);
      if (this.active) omit.add(this.active.id);
      if (this.action?.kind === "move")
        for (const id of this.selected) omit.add(id);
      const signature = JSON.stringify([
        this.renderer.viewport,
        this.model.paper(),
        this.scene.filter((s) => !omit.has(s.id)).map((s) => [s.id, s.version]),
        [...omit],
      ]);
      if (signature !== this.signature) {
        this.renderer.draw(this.scene, this.model.paper(), omit);
        this.signature = signature;
      }
      const box = this.selectionBounds(),
        move = this.action?.kind === "move" ? this.action : undefined;
      this.renderer.overlay(
        this.active,
        this.action?.kind === "lasso" ? this.action.polygon : undefined,
        box
          ? { ...box, x: box.x + (move?.dx || 0), y: box.y + (move?.dy || 0) }
          : undefined,
        move
          ? {
              strokes: this.scene.filter((s) => this.selected.has(s.id)),
              dx: move.dx,
              dy: move.dy,
            }
          : undefined
      );
    } catch (e) {
      this.report(e);
    }
  };
  close() {
    this.finish("interrupted");
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.removeModel();
    for (const [name, listener] of [
      ["pointerdown", this.down],
      ["pointermove", this.move],
      ["pointerup", this.up],
      ["pointercancel", this.cancel],
      ["lostpointercapture", this.cancel],
      ["wheel", this.wheel],
      ["keydown", this.keyDown],
      ["keyup", this.keyUp],
      ["contextmenu", this.contextMenu],
    ] as const)
      this.host.removeEventListener(name, listener as EventListener);
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("pagehide", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.close();
  }
}
