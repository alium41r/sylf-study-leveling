import {
  InkModel,
  type InkBrush,
  type InkSample,
  type InkStroke,
  type InkEdit,
} from "./ink";
import { inkOpacity, type EraseCircle } from "./ink-geometry";
import { displayInkColor } from "./note-style";
import { resolveStylusTool, stylusButton, type StylusMapping } from "./stylus";
import {
  InkRenderer,
  hitInk,
  lassoInk,
  type InkViewport,
  type InkRect,
} from "./ink-renderer";
interface DelegatedInkPresenter {
  updateInkTrailStartPoint(
    event: PointerEvent,
    style: { color: string; diameter: number }
  ): void;
}
export type InkTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "lasso"
  | "hand"
  | "line"
  | "rectangle"
  | "ellipse";
export interface InkTools {
  tool: InkTool;
  color: string;
  width: number;
  finger: boolean;
  nib?: InkBrush["nib"];
  opacity?: number;
  pressure?: number;
  smoothing?: number;
  lineStyle?: InkBrush["lineStyle"];
  straighten?: boolean;
  eraserMode?: "stroke" | "precision";
  eraserSize?: number;
  stylus?: StylusMapping;
}
export interface InkSurface {
  viewport?: InkViewport;
  fit?: (wholePage?: boolean) => void;
  snap?: (
    bounds: InkRect,
    dx: number,
    dy: number,
    disabled: boolean
  ) => { dx: number; dy: number };
  moveSelection?: (ids: string[], dx: number, dy: number) => boolean;
  reveal?: (rect: InkRect) => void;
  ignoreInput?: (event: PointerEvent) => boolean;
  onViewport?: (viewport: InkViewport) => void;
  transparent?: boolean;
  fixed?: boolean;
  fixedZoom?: number;
  point?: (event: PointerEvent) => { x: number; y: number };
  /** `focal` is the gesture centre in client coordinates, so zoom stays under the fingers/cursor. */
  navigate?: (
    dx: number,
    dy: number,
    scale: number,
    focal?: { x: number; y: number },
    phase?: "live" | "end"
  ) => void;
  /** Called with the lowest page coordinate a pen has reached, so the page can grow or continue. */
  extend?: (y: number) => void;
  onPen?: (event: PointerEvent) => void;
  onActiveChange?: (active: boolean) => void;
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
    predicted?: InkSample[];
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
    cuts?: EraseCircle[];
  };
  private readonly touches = new Map<number, { x: number; y: number }>();
  private gesture?: { x: number; y: number; distance: number };
  private penUntil = 0;
  private frame = 0;
  private resize: ResizeObserver;
  private disposed = false;
  private signature = "";
  private sceneKeyVersion = -1;
  private sceneKeyOmit = "";
  private sceneKey = "";
  private cachedRect?: DOMRect;
  private inkPresenter?: DelegatedInkPresenter;
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
    viewport?: InkViewport,
    private readonly surface: InkSurface = {}
  ) {
    this.renderer = new InkRenderer(
      base,
      live,
      width,
      height,
      surface.transparent
    );
    this.scene = model.strokes();
    const navInk =
      typeof navigator !== "undefined"
        ? (
            navigator as Navigator & {
              ink?: {
                requestPresenter(param: {
                  presentationArea: Element;
                }): Promise<DelegatedInkPresenter>;
              };
            }
          ).ink
        : undefined;
    void navInk
      ?.requestPresenter({ presentationArea: live })
      .then((presenter) => {
        if (!this.disposed) this.inkPresenter = presenter;
      })
      .catch(() => {});
    this.removeModel = model.subscribe(() => {
      try {
        if (this.active && model.onlyDirtyStroke() === this.active.id) return;
        this.scene = model.strokes();
        this.schedule();
      } catch (e) {
        this.report(e);
        this.finish("interrupted");
      }
    });
    this.resize = new ResizeObserver(() => {
      this.cachedRect = undefined;
      this.renderer.resize(host.clientWidth, host.clientHeight);
      if (surface.fixed)
        this.renderer.viewport = surface.viewport || {
          zoom: surface.fixedZoom || host.clientWidth / width,
          x: 0,
          y: 0,
        };
      if (!this.initialized) {
        if (!surface.fixed) this.renderer.fit();
        if (viewport && !surface.fixed) {
          this.renderer.viewport = { ...viewport };
          this.fitMode = undefined;
          this.renderer.zoom(1);
        }
        this.initialized = true;
      } else if (!surface.fixed && this.fitMode) {
        if (this.fitMode === "width" && this.lastWidth !== host.clientWidth) {
          const top = this.renderer.viewport.y / this.renderer.viewport.zoom;
          this.renderer.fit();
          this.renderer.viewport.y = top * this.renderer.viewport.zoom;
          this.renderer.pan(0, 0);
        } else if (this.fitMode === "page") this.fitPage();
      }
      this.lastWidth = host.clientWidth;
      this.changed();
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
  private lastWidth = 0;
  private fitMode: "width" | "page" | undefined = "width";
  private report(error: unknown) {
    this.error(
      error instanceof Error
        ? error.message
        : "This stroke needs recovery. Keep this tab open."
    );
  }
  private hostRect() {
    if (!this.cachedRect) this.cachedRect = this.host.getBoundingClientRect();
    return this.cachedRect;
  }
  private point(event: PointerEvent) {
    if (this.surface.point) return this.surface.point(event);
    const r = this.hostRect();
    return this.renderer.pagePoint(
      event.clientX - r.left,
      event.clientY - r.top
    );
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
  private abortPinchTap() {
    const active = this.active;
    if (
      active?.input === "touch" &&
      active.points.length <= 8 &&
      Math.hypot(
        active.points.at(-1)![0] - active.points[0][0],
        active.points.at(-1)![1] - active.points[0][1]
      ) < 12 &&
      this.model.cancelUnflushed()
    ) {
      this.active = undefined;
      this.surface.onActiveChange?.(false);
      this.schedule();
      return;
    }
    this.finish("interrupted");
  }
  private down = (event: PointerEvent) => {
    if (this.surface.ignoreInput?.(event)) return;
    if (event.pointerType !== "pen" && event.button !== 0) return;
    this.cachedRect = undefined;
    try {
      if (event.pointerType === "pen") {
        this.penUntil = performance.now() + 180;
        if (
          this.active?.input === "touch" ||
          (this.action && this.touches.has(this.action.pointer))
        )
          this.abortPinchTap();
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
        this.touches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (this.touches.size >= 2) {
          this.abortPinchTap();
          this.beginGesture();
          this.capture(event);
          event.preventDefault();
          return;
        }
      }
      if (this.active || this.action) return;
      const p = this.point(event);
      this.stopMomentum();
      this.surface.onPen?.(event);
      const tool =
        this.space || (event.pointerType === "touch" && !this.tools.finger)
          ? "hand"
          : resolveStylusTool(
              stylusButton(event),
              this.tools.stylus,
              this.tools.tool
            );
      if (tool !== "hand" && !this.writable()) return;
      if (document.activeElement !== this.host)
        this.host.focus({ preventScroll: true });
      event.preventDefault();
      this.capture(event);
      if (tool === "hand") {
        this.action = {
          pointer: event.pointerId,
          kind: "pan",
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          dx: 0,
          dy: 0,
          polygon: [],
          removed: new Set(),
        };
        return;
      }
      if (tool !== "eraser" && tool !== "lasso") this.surface.extend?.(p.y);
      if (
        p.x < 0 ||
        p.y < 0 ||
        p.x > this.renderer.pageWidth ||
        p.y > this.renderer.pageHeight
      )
        return;
      const hadSelection = this.selected.size > 0;
      if (
        ["pen", "highlighter", "line", "rectangle", "ellipse"].includes(tool)
      ) {
        this.selected.clear();
        const style: InkBrush = {
          tool: tool === "highlighter" ? "highlighter" : "pen",
          nib: this.tools.nib,
          opacity: this.tools.opacity,
          pressure: this.tools.pressure,
          smoothing: this.tools.smoothing,
          lineStyle: this.tools.lineStyle,
          straighten: this.tools.straighten,
          ...(["line", "rectangle", "ellipse"].includes(tool)
            ? { shape: tool as "line" | "rectangle" | "ellipse" }
            : {}),
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
        this.surface.onActiveChange?.(true);
        this.addSamples(event, false);
        if (hadSelection) {
          this.signature = "";
          this.changed();
        }
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
          cuts: [],
        };
        if (!move) this.selected.clear();
        if (tool === "eraser") this.erase(p.x, p.y);
        this.signature = "";
        this.schedule();
        this.changed();
      }
    } catch (error) {
      this.report(error);
      this.finish("interrupted");
    }
  };
  private addSamples(event: PointerEvent, allowPredicted = true) {
    const active = this.active;
    if (!active) return;
    const events = event.getCoalescedEvents?.() || [];
    if (!events.length || events.at(-1)!.timeStamp !== event.timeStamp)
      events.push(event);
    const samples = events.map((e) => this.sample(e));
    active.points.push(...samples);
    active.predicted = undefined;
    this.model.append(samples);
    let maxY = samples[0][1];
    for (let i = 1; i < samples.length; i++)
      if (samples[i][1] > maxY) maxY = samples[i][1];
    this.surface.extend?.(maxY);
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
      this.surface.onActiveChange?.(true);
      this.model.append([last]);
    }
    const current = this.active;
    if (allowPredicted && current) {
      if (
        this.inkPresenter &&
        !current.style.shape &&
        (!current.style.lineStyle || current.style.lineStyle === "solid") &&
        inkOpacity(current.style) >= 0.98
      ) {
        const diameter = current.style.width * this.renderer.viewport.zoom;
        if (diameter >= 0.5) {
          try {
            this.inkPresenter.updateInkTrailStartPoint(event, {
              color: displayInkColor(
                current.style.color,
                this.renderer.adaptDark
              ),
              diameter,
            });
          } catch {
            /* Non-trusted or unsupported synthetic events skip hardware trail. */
          }
        }
      }
      if (!current.style.shape && current.points.length >= 2) {
        const predictedEvents = event.getPredictedEvents?.();
        if (predictedEvents?.length) {
          const prev = current.points.at(-1)!,
            prev2 = current.points.at(-2)!,
            stepDist = Math.hypot(prev[0] - prev2[0], prev[1] - prev2[1]),
            maxStep = Math.max(18, stepDist * 3.2);
          const predicted: InkSample[] = [];
          let anchor = prev;
          for (const pe of predictedEvents.slice(0, 3)) {
            if (pe.timeStamp <= event.timeStamp) continue;
            const sp = this.sample(pe);
            const dist = Math.hypot(sp[0] - anchor[0], sp[1] - anchor[1]);
            if (
              dist > maxStep ||
              sp[0] < 0 ||
              sp[1] < 0 ||
              sp[0] > this.renderer.pageWidth ||
              sp[1] > this.renderer.pageHeight
            )
              break;
            predicted.push(sp);
            anchor = sp;
          }
          if (predicted.length) current.predicted = predicted;
        }
      }
    }
    this.schedule();
  }
  private move = (event: PointerEvent) => {
    try {
      if (event.pointerType === "pen" && event.buttons !== 0)
        this.penUntil = performance.now() + 180;
      if (event.pointerType === "touch" && this.touches.has(event.pointerId)) {
        this.touches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (this.touches.size >= 2) {
          event.preventDefault();
          this.updateGesture();
          return;
        }
      }
      if (this.active?.pointer === event.pointerId) {
        event.preventDefault();
        this.cachedRect = undefined;
        if (this.writable()) this.addSamples(event, true);
        else this.finish("interrupted");
        return;
      }
      const action = this.action;
      if (!action || action.pointer !== event.pointerId) return;
      event.preventDefault();
      if (action.kind === "pan") {
        const dx = event.clientX - action.x,
          dy = event.clientY - action.y;
        action.x = event.clientX;
        action.y = event.clientY;
        const now = performance.now();
        const t =
          event.timeStamp > 0 && Math.abs(now - event.timeStamp) < 5000
            ? event.timeStamp
            : now;
        this.panBy(dx, dy, true, t);
        return;
      }
      this.cachedRect = undefined;
      const p = this.point(event);
      if (action.kind === "erase") {
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
        const bounds = this.selectionBounds();
        if (bounds && this.surface.snap) {
          const snapped = this.surface.snap(
            bounds,
            action.dx,
            action.dy,
            event.altKey
          );
          action.dx = snapped.dx;
          action.dy = snapped.dy;
        }
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
    const radius = this.tools.eraserSize || Math.max(6, this.tools.width * 2);
    if (
      this.tools.eraserMode === "precision" &&
      (this.action?.cuts?.length || 0) < 1024
    )
      this.action?.cuts?.push({ x, y, radius });
    const ids = this.renderer.index.query({
      x: x - radius - 40,
      y: y - radius - 40,
      width: radius * 2 + 80,
      height: radius * 2 + 80,
    });
    for (const stroke of this.scene)
      if (ids.has(stroke.id) && hitInk(stroke, x, y, radius))
        this.action?.removed.add(stroke.id);
    this.signature = "";
  }
  private velocity: { t: number; dx: number; dy: number }[] = [];
  private momentum = 0;
  private movePage(dx: number, dy: number) {
    this.cachedRect = undefined;
    if (this.surface.fixed) {
      this.surface.navigate?.(dx, dy, 1);
      return;
    }
    this.renderer.pan(dx, dy);
    this.signature = "";
    this.schedule();
  }
  private panBy(dx: number, dy: number, track: boolean, timeStamp?: number) {
    if (track) {
      this.velocity.push({ t: timeStamp ?? performance.now(), dx, dy });
      if (this.velocity.length > 8) this.velocity.shift();
    }
    this.movePage(dx, dy);
  }
  private stopMomentum() {
    if (this.momentum) cancelAnimationFrame(this.momentum);
    this.momentum = 0;
    this.velocity = [];
  }
  /** Release a pan with the finger's velocity so scrolling glides and decelerates. */
  private startMomentum() {
    const latest = this.velocity.at(-1)?.t ?? performance.now(),
      recent = this.velocity.filter((v) => latest - v.t < 100);
    this.velocity = [];
    if (recent.length < 2) return;
    const span = Math.max(16, latest - recent[0].t);
    let vx = recent.reduce((sum, v) => sum + v.dx, 0) / span,
      vy = recent.reduce((sum, v) => sum + v.dy, 0) / span,
      last = performance.now();
    if (Math.hypot(vx, vy) < 0.15) return;
    const step = (time: number) => {
      const dt = Math.max(1, Math.min(48, time - last));
      last = time;
      this.panBy(vx * dt, vy * dt, false);
      const decay = Math.exp(-dt / 325);
      vx *= decay;
      vy *= decay;
      this.momentum =
        Math.hypot(vx, vy) > 0.02 && !this.disposed
          ? requestAnimationFrame(step)
          : 0;
      if (!this.momentum && !this.surface.fixed) this.changed();
    };
    this.momentum = requestAnimationFrame(step);
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
    this.velocity = [];
    if (this.surface.fixed) {
      this.surface.navigate?.(
        next.x - old.x,
        next.y - old.y,
        next.distance / old.distance,
        { x: next.x, y: next.y },
        "live"
      );
      return;
    }
    this.cachedRect = undefined;
    const r = this.hostRect();
    this.fitMode = undefined;
    this.renderer.zoom(
      next.distance / old.distance,
      old.x - r.left,
      old.y - r.top
    );
    this.renderer.pan(next.x - old.x, next.y - old.y);
    this.signature = "";
    this.schedule();
  }
  private up = (event: PointerEvent) => {
    if (this.active?.pointer === event.pointerId) {
      this.cachedRect = undefined;
      try {
        if (this.writable()) this.addSamples(event, false);
      } catch (e) {
        this.report(e);
      }
    }
    this.endPointer(event, "complete");
  };
  private cancel = (event: PointerEvent) =>
    this.endPointer(event, "interrupted");
  private endPointer(event: PointerEvent, reason: "complete" | "interrupted") {
    if (event.pointerType === "pen") this.penUntil = performance.now() + 140;
    if (
      this.active?.pointer === event.pointerId ||
      this.action?.pointer === event.pointerId
    )
      this.finish(reason);
    const hadGesture = !!this.gesture;
    const trackedTouch = this.touches.delete(event.pointerId);
    if (trackedTouch && this.touches.size < 2) {
      this.gesture = undefined;
      if (hadGesture) {
        this.cachedRect = undefined;
        if (this.surface.fixed)
          this.surface.navigate?.(0, 0, 1, undefined, "end");
        this.changed();
      }
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
    if (active) this.surface.onActiveChange?.(false);
    if (action?.kind === "pan") {
      if (reason === "complete") this.startMomentum();
      else this.velocity = [];
      if (this.surface.fixed) return;
    }
    this.surface.snap?.({ x: 0, y: 0, width: 0, height: 0 }, 0, 0, true);
    try {
      this.model.finish(reason);
      if (action?.kind === "erase" && action.removed.size) {
        if (this.tools.eraserMode === "precision")
          this.model.eraseSegments([...action.removed], action.cuts || []);
        else
          this.model.edit({ targets: [...action.removed], erase: true }, true);
      }
      if (action?.kind === "lasso" && action.polygon.length > 2) {
        this.selected = new Set(
          this.scene.filter((s) => lassoInk(s, action.polygon)).map((s) => s.id)
        );
      }
      if (
        action?.kind === "move" &&
        (action.dx || action.dy) &&
        !this.surface.moveSelection?.([...this.selected], action.dx, action.dy)
      )
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
  selectionBounds(): InkRect | undefined {
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
  selectionIds() {
    return [...this.selected];
  }
  selectIds(ids: string[]) {
    this.finish();
    this.selected = new Set(ids);
    this.signature = "";
    this.schedule();
    this.changed();
  }
  /** Selected strokes as portable brush + samples, ready for the clipboard. */
  copyStrokes(): { style: InkBrush; points: InkSample[] }[] {
    return this.scene
      .filter((s) => this.selected.has(s.id))
      .map((s) => ({ style: s.style, points: s.points }));
  }
  /** Re-create copied strokes as new strokes (never sharing identity) and select them. */
  pasteStrokes(
    items: { style: InkBrush; points: InkSample[] }[],
    dx: number,
    dy: number
  ) {
    if (!this.writable()) return [];
    this.finish();
    const ids: string[] = [];
    try {
      for (const item of items.slice(0, 2000)) {
        if (!item.points.length) continue;
        const id = this.model.begin(item.style);
        ids.push(id);
        this.model.append(
          item.points.map(
            (p) => [p[0] + dx, p[1] + dy, ...p.slice(2)] as InkSample
          )
        );
        this.model.finish();
      }
    } catch (error) {
      this.report(error);
      this.model.finish("interrupted");
    }
    this.scene = this.safeStrokes();
    this.selected = new Set(ids);
    this.signature = "";
    this.schedule();
    this.changed();
    return ids;
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
    if (this.surface.fit) {
      this.surface.fit();
      return;
    }
    if (this.surface.fixed) return;
    this.fitMode = "width";
    this.finish();
    this.renderer.fit();
    this.signature = "";
    this.schedule();
    this.changed();
  }
  zoom(factor: number) {
    if (factor !== 1) this.fitMode = undefined;
    if (this.surface.fixed) {
      if (factor !== 1) this.surface.navigate?.(0, 0, factor);
      this.signature = "";
      this.schedule();
      this.changed();
      return;
    }
    this.finish();
    this.renderer.zoom(factor);
    this.signature = "";
    this.schedule();
    this.changed();
  }
  fitPage() {
    if (this.surface.fit) {
      this.surface.fit(true);
      return;
    }
    if (this.surface.fixed) return;
    this.fitMode = "page";
    this.finish();
    const r = this.renderer;
    const zoom = Math.max(
      0.3,
      Math.min(
        1.5,
        (this.host.clientWidth - 32) / r.pageWidth,
        (this.host.clientHeight - 40) / r.pageHeight
      )
    );
    r.viewport = {
      zoom,
      x: (this.host.clientWidth - r.pageWidth * zoom) / 2,
      y: 20,
    };
    this.signature = "";
    this.schedule();
    this.changed();
  }
  viewport() {
    return { ...this.renderer.viewport };
  }
  reveal(rect: InkRect) {
    if (this.surface.reveal) {
      this.surface.reveal(rect);
      return;
    }
    const dx =
      rect.x < 24
        ? 24 - rect.x
        : rect.x + rect.width > this.host.clientWidth - 24
          ? this.host.clientWidth - 24 - rect.x - rect.width
          : 0;
    const dy =
      rect.y < 24
        ? 24 - rect.y
        : rect.y + rect.height > this.host.clientHeight - 88
          ? this.host.clientHeight - 88 - rect.y - rect.height
          : 0;
    if (!dx && !dy) return;
    if (this.surface.fixed) this.surface.navigate?.(dx, dy, 1);
    else this.renderer.pan(dx, dy);
    this.signature = "";
    this.schedule();
    this.changed();
  }
  /** PDF geometry changes never replace the native model or its pending journal. */
  setFixedViewport(zoom: number, point: NonNullable<InkSurface["point"]>) {
    if (!this.surface.fixed) return;
    this.cachedRect = undefined;
    this.finish("interrupted");
    this.surface.fixedZoom = zoom;
    this.surface.point = point;
    this.renderer.resize(this.host.clientWidth, this.host.clientHeight);
    this.renderer.viewport = { zoom, x: 0, y: 0 };
    this.signature = "";
    this.schedule();
  }
  /** A scrolling notebook clips each canvas to the viewport, never the full long page. */
  setNotebookViewport(viewport: InkViewport) {
    if (!this.surface.fixed) return;
    this.cachedRect = undefined;
    this.surface.viewport = viewport;
    this.surface.fixedZoom = viewport.zoom;
    this.renderer.resize(this.host.clientWidth, this.host.clientHeight);
    this.renderer.viewport = { ...viewport };
    this.signature = "";
    this.flushPaint();
  }
  flushPaint() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.paint();
  }
  private wheel = (event: WheelEvent) => {
    if (this.surface.fixed) return;
    event.preventDefault();
    this.finish();
    const r = this.host.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) {
      this.fitMode = undefined;
      this.renderer.zoom(
        Math.exp(-event.deltaY * 0.005),
        event.clientX - r.left,
        event.clientY - r.top
      );
    } else this.renderer.pan(-event.deltaX, -event.deltaY);
    this.signature = "";
    this.schedule();
    this.changed();
  };
  private keyDown = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest(
        'input, textarea, button, select, a, [contenteditable="true"]'
      )
    )
      return;
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
          if (this.surface.fixed) {
            this.surface.navigate?.(-dx * 24, -dy * 24, 1);
          } else {
            this.renderer.pan(-dx * 24, -dy * 24);
            this.signature = "";
            this.schedule();
          }
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
  private contextMenu = (event: Event) => {
    if (!(event.target as HTMLElement).closest('[contenteditable="true"]'))
      event.preventDefault();
  };
  private schedule() {
    if (!this.frame && !this.disposed)
      this.frame = requestAnimationFrame(this.paint);
  }
  private paint = () => {
    this.frame = 0;
    if (this.disposed) return;
    try {
      this.surface.onViewport?.(this.viewport());
      const omit = new Set(
        this.tools.eraserMode === "precision" ? [] : this.action?.removed || []
      );
      if (this.active) omit.add(this.active.id);
      if (this.action?.kind === "move")
        for (const id of this.selected) omit.add(id);
      const modelVer = this.model.sceneVersion(),
        omitKey =
          omit.size === 0
            ? ""
            : omit.size === 1 && this.active
              ? "__active__"
              : [...omit].join(",");
      if (modelVer !== this.sceneKeyVersion || omitKey !== this.sceneKeyOmit) {
        this.sceneKeyVersion = modelVer;
        this.sceneKeyOmit = omitKey;
        let hash = "";
        for (const s of this.scene)
          if (!omit.has(s.id)) hash += `${s.id}:${s.version};`;
        this.sceneKey = hash;
      }
      const v = this.renderer.viewport,
        p = this.model.paper();
      const signature = `${v.zoom}:${v.x}:${v.y}:${this.renderer.surfaceWidth()}:${this.renderer.surfaceHeight()}:${this.renderer.pageWidth}:${this.renderer.pageHeight}:${this.renderer.adaptDark}:${p.template}:${p.color}:${p.rule}:${p.spacing}:${this.sceneKey}`;
      if (signature !== this.signature) {
        this.renderer.draw(this.scene, p, omit);
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
    this.stopMomentum();
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
