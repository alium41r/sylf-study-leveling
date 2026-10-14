/**
 * ============================================================================
 * PIXEL DISPLAY — MINIMAL RUNTIME
 * ============================================================================
 * The runtime progresses display behaviour over time. It is intentionally the
 * smallest scheduler that satisfies the display's contract (roadmap [C1]).
 *
 * THE THREE PHASES
 *
 *   stopped ──start()/resume()/requestFrame()──► running ──(frame)──► idle
 *      ▲                                                                  │
 *      └───────────────────────── stop() ◄───────────────────────────────┘
 *
 *   `stopped`  Nothing is scheduled and nothing will be scheduled until a
 *              caller explicitly wakes it. `stop()` lands here. The *session*
 *              survives a stop, so `resume()` continues the timeline while
 *              `start()` rebases it.
 *   `running`  Exactly one frame is scheduled or executing.
 *   `idle`     A session is live, the display is being maintained, and no frame
 *              is scheduled because nothing needs to change.
 *
 * `idle` and `stopped` are deliberately different. `idle` means "on screen and
 * correct, costing nothing"; `stopped` means "not being maintained at all" —
 * which is what a display that has been scrolled out of view or backgrounded
 * should be. Both are zero work, but only `idle` resumes on its own.
 *
 * THE ZERO-WORK GUARANTEE (doc §16)
 *  - When idle, **no timer and no animation frame is scheduled at all**. Idle
 *    is not "a loop that decides to do nothing"; it is the absence of a loop.
 *  - `requestFrame()` is the only way back to work. It schedules exactly one
 *    frame, and repeats only while content asks to continue.
 *  - `stop()` cancels any frame that is in flight, so a suspended display is
 *    observably stopped rather than merely unrendered.
 *  - A `stop()` that happens during a frame wins over content asking to
 *    continue, so a torn-down display cannot resurrect itself.
 *
 * LOGICAL TIME
 *  - `start()` rebases logical time so a restarted display does not accumulate
 *    suspended wall-clock time; `resume()` does not, so it continues. The
 *    rebase happens in exactly one place (`beginSession`) rather than at every
 *    entry point.
 *  - `delta` is the logical gap since the previous frame, so content advances by
 *    accumulated delta and one long frame advances one step, not several.
 *
 * The runtime does not assume 60 FPS, does not own a clock it cannot be given,
 * and knows nothing about Sylf, characters, or content (boundaries B1, B2, B5).
 * Scheduling and time are injectable, so behaviour is deterministic in tests
 * without a real browser.
 * ============================================================================
 */

export interface PixTimeline {
  /** Monotonic logical time in milliseconds since the session began. */
  elapsed: number;
  /** Logical milliseconds since the previous frame. */
  delta: number;
  /** Frames rendered since the runtime started. */
  frame: number;
}

/** The runtime's lifecycle phase. See the phase diagram above. */
export type PixRuntimePhase = "stopped" | "running" | "idle";

export interface PixRenderer {
  /** True when the renderer has a usable drawing surface. */
  isReady(): boolean;
  /** Draws the current display state. Must not mutate content or app state. */
  draw(timeline: PixTimeline): void;
  /** Optional: react to a physical presentation-size change. */
  fit?(width: number, height: number): void;
}

/**
 * Content answers "what should those pixels currently show?".
 *
 * CONTRACT (kept deliberately minimal — the doc asks only for a "basic content
 * interface", §29)
 *  - `render` is a **full composite**: it writes the complete state of the
 *    display, deterministically derived from the content's own state. It is not
 *    required to preserve anything left by a previous frame, so the runtime
 *    makes no promise that the framebuffer survives between frames.
 *  - `update` is the **only** way content keeps an animation alive. Returning
 *    `true` requests another frame; returning `false` or nothing lets the
 *    runtime settle into `idle`, which is zero work.
 *  - Neither method may read CSS dimensions, viewport size, or device pixel
 *    ratio. Content addresses logical cells only (boundary B3).
 */
export interface PixContent {
  /** Stable identifier, used in dev readouts and diagnostics. */
  readonly id: string;
  /**
   * Called once per frame before drawing. Return `true` to request another
   * frame; returning `false` (or nothing) lets the runtime fall back to idle.
   */
  update?(timeline: PixTimeline): boolean | void;
  /** Called before the renderer. Writes the display's full state. */
  render?(timeline: PixTimeline): void;
}

/**
 * A compositing layer drawn *after* content on every frame.
 *
 * This is the seam for viewer state — a direct pixel edit, a selection, a
 * cursor — that must survive a content pass which clears the framebuffer. It is
 * deliberately separate from `PixContent`: an overlay is not part of the
 * picture, so it must not be able to replace or own the content's paint order.
 */
export interface PixOverlay {
  /** Stable identifier, used in dev readouts and diagnostics. */
  readonly id: string;
  draw(timeline: PixTimeline): void;
}

export interface PixRuntimeConfig {
  /** Logical clock. Defaults to `performance.now()` where available. */
  clock?: () => number;
  /** Frame scheduler. Defaults to `requestAnimationFrame`. */
  schedule?: (callback: (time: number) => void) => number;
  /** Cancels a scheduled frame. Defaults to `cancelAnimationFrame`. */
  cancel?: (handle: number) => void;
}

/** Default clock: `performance.now()` when present, else `Date.now()`. */
function defaultClock(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** True when the current environment can schedule animation frames natively. */
export function canScheduleFrames(): boolean {
  return typeof requestAnimationFrame === "function";
}

/**
 * Default scheduler. Falls back to a zero-delay timeout in environments without
 * `requestAnimationFrame` (such as jsdom), which keeps the runtime usable while
 * tests inject their own deterministic scheduler.
 */
function defaultSchedule(callback: (time: number) => void): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(defaultClock()), 0) as unknown as number;
}

function defaultCancel(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

export class PixRuntime {
  private readonly clock: () => number;
  private readonly schedule: (callback: (time: number) => void) => number;
  private readonly cancel: (handle: number) => void;

  private handle: number | null = null;
  private renderedFrames = 0;
  private startedAt = 0;
  private lastTime = 0;
  private phase: PixRuntimePhase = "stopped";
  /**
   * Whether a session is live. Kept separate from `phase` because a deployed
   * display is *stopped* whenever it is off-screen, yet its session — and so its
   * logical timeline — must survive that and continue on resume.
   */
  private sessionActive = false;
  private content: PixContent | null = null;
  private overlay: PixOverlay | null = null;
  private renderer: PixRenderer | null = null;

  constructor(config: PixRuntimeConfig = {}) {
    this.clock = config.clock ?? defaultClock;
    this.schedule = config.schedule ?? defaultSchedule;
    this.cancel = config.cancel ?? defaultCancel;
  }

  /** Attaches or replaces the content. Does not itself schedule work. */
  setContent(content: PixContent | null): void {
    this.content = content;
  }

  /**
   * Attaches or replaces the overlay. The overlay is drawn after content every
   * frame, so it is the correct home for viewer state that content must not be
   * able to clear. Does not itself schedule work.
   */
  setOverlay(overlay: PixOverlay | null): void {
    this.overlay = overlay;
  }

  /** Attaches or replaces the renderer. Does not itself schedule work. */
  setRenderer(renderer: PixRenderer | null): void {
    this.renderer = renderer;
  }

  /**
   * Begins a **new session**: logical time is rebased to now and the opening
   * frame is scheduled, painting the current state immediately.
   *
   * Use this whenever the display is (re)entering service and suspended
   * wall-clock time must not count. Use `resume()` to continue an existing
   * session after a `stop()`.
   */
  start(): void {
    this.disconnect();
    this.sessionActive = false;
    this.beginSession();
    this.requestFrame();
  }

  /**
   * Continues after a `stop()` **without** rebasing logical time, so the display
   * picks up its animation where it left off. A no-op while a frame is already
   * scheduled.
   *
   * This is the correct call for a display returning from off-screen or from a
   * backgrounded tab: nothing about the content changed, so nothing about its
   * timeline should either.
   */
  resume(): void {
    this.requestFrame();
  }

  /**
   * Cancels any in-flight frame and marks the display as stopped. After this the
   * runtime performs no work at all until `start()` or `resume()` is called.
   *
   * The session is deliberately left live: a stopped display that resumes should
   * continue its timeline, not restart it. Only `start()` rebases time.
   */
  stop(): void {
    this.disconnect();
    this.phase = "stopped";
  }

  /** Cancels the pending frame handle, if any, without changing the phase. */
  private disconnect(): void {
    if (this.handle !== null) {
      this.cancel(this.handle);
      this.handle = null;
    }
  }

  /**
   * Requests one frame. This is the only path from a non-running phase back to
   * work, and a no-op while a frame is already scheduled, so a wake cannot be
   * duplicated.
   */
  requestFrame(): void {
    if (this.handle !== null) return;
    this.beginSession();
    this.handle = this.schedule(() => {
      this.tick();
    });
    this.phase = "running";
  }

  /**
   * Asks for a frame **on the content's behalf**.
   *
   * The difference from `requestFrame()` is one rule: a suspended display is not
   * woken by content. `requestFrame()` is the explicit external wake-up — the
   * dev surface's "render one frame", a test, a caller that knows better — and it
   * always works. This is for the case Phase 8 introduced: a looping animation
   * that schedules its own next frame on a timer.
   *
   * That timer knows nothing about visibility, so without this it kept waking a
   * backgrounded card on its own schedule — measured at nine frames over three
   * seconds in a hidden tab, on a display whose entire purpose in that state is to
   * cost nothing. Suspension has to win, and the distinction belongs here rather
   * than in every piece of content that ever animates.
   */
  requestFrameFromContent(): void {
    if (this.phase === "stopped" && this.sessionActive) return;
    this.requestFrame();
  }

  /** The current lifecycle phase. */
  getPhase(): PixRuntimePhase {
    return this.phase;
  }

  /** True while a frame is scheduled or executing. */
  isRunning(): boolean {
    return this.phase === "running";
  }

  /**
   * True when a session is live and no frame is scheduled — the display is on
   * screen and correct, and costs nothing to maintain. A `stopped` runtime is
   * **not** idle: it is not being maintained at all.
   */
  isIdle(): boolean {
    return this.phase === "idle";
  }

  /** True when no session is live and nothing will run until explicitly woken. */
  isStopped(): boolean {
    return this.phase === "stopped";
  }

  /** Frames rendered since construction. A frozen counter proves zero work. */
  getFrameCount(): number {
    return this.renderedFrames;
  }

  /**
   * Logical milliseconds elapsed in the current session. A stopped runtime keeps
   * reporting the session's elapsed time, because resuming continues it.
   */
  getElapsed(): number {
    if (!this.sessionActive) return 0;
    return this.clock() - this.startedAt;
  }

  /**
   * Rebases logical time for a new session. This is the single place time is
   * reset, so every path out of `stopped` (start, wake, a manually driven tick)
   * behaves identically and no suspended wall-clock time leaks into `elapsed`.
   */
  private beginSession(): void {
    if (this.sessionActive) return;
    const now = this.clock();
    this.startedAt = now;
    this.lastTime = now;
    this.sessionActive = true;
    this.phase = "idle";
  }

  /**
   * Runs one frame synchronously. Exposed for deterministic tests and for
   * environments that drive frames themselves. Production code should call
   * `requestFrame()`.
   */
  tick(): void {
    // A manual tick from a stopped runtime opens its own session, so the frame
    // it renders still reports sane logical time.
    this.beginSession();
    this.handle = null;

    const now = this.clock();
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.renderedFrames += 1;

    const timeline: PixTimeline = {
      elapsed: now - this.startedAt,
      delta,
      frame: this.renderedFrames,
    };

    let continueRequested = false;
    const content = this.content;
    if (content) {
      continueRequested = content.update?.(timeline) === true;
      content.render?.(timeline);
    }

    // The overlay runs after content, so a content pass that clears the
    // framebuffer cannot erase a viewer-layer edit.
    this.overlay?.draw(timeline);

    if (this.renderer?.isReady()) {
      this.renderer.draw(timeline);
    }

    // A `stop()` that happened during this frame always wins: content asking to
    // continue must not resurrect a display the host has torn down.
    if (this.phase === "stopped") return;

    // Content may have requested its own continuation during update/render; a
    // frame already scheduled must not be duplicated. Otherwise honour the
    // update return value, which is what keeps an animation running. A frame
    // that nobody continues settles into `idle`, which is zero work.
    if (this.handle === null && continueRequested) {
      this.requestFrame();
      return;
    }
    if (this.handle === null) {
      this.phase = "idle";
    }
  }
}

export function createPixRuntime(config?: PixRuntimeConfig): PixRuntime {
  return new PixRuntime(config);
}
