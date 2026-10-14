"use client";

/**
 * ============================================================================
 * PIXEL DISPLAY — RUNTIME HOSTING
 * ============================================================================
 * Owns the lifecycle around one display: binding the canvas, tracking the
 * container's physical size, and suspending work when the display is not being
 * looked at.
 *
 * SUSPENSION POLICY (doc §16, §22, §25)
 *  - Off-screen or backgrounded  → `runtime.stop()`, so no frame is scheduled.
 *                                  Returning uses `resume()`, which continues
 *                                  the timeline instead of restarting it.
 *  - Reduced motion requested    → automatic idle animation is suppressed, so a
 *                                  static state reaches a genuine zero work.
 *  - `suspended` prop            → the dev surface's zero-work proof: the
 *                                  runtime is stopped and the frame counter
 *                                  must stay frozen.
 *
 * Everything here is a lifecycle concern. None of it knows what the display is
 * showing, which is why it can be reused by any later content or route.
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import {
  createPixDisplay,
  PixRuntime,
  type PixDisplay,
  type PixOverlay,
  type PixTimeline,
} from "@/lib/pixel-display/engine";
import {
  CanvasPixRenderer,
  type CanvasPixRendererOptions,
} from "@/lib/pixel-display/renderers/canvas-2d";
import type { PixGridPresentation } from "@/lib/pixel-display/renderers/grid-presentation";

export interface PixRuntimeHandle {
  readonly display: PixDisplay;
  readonly renderer: CanvasPixRenderer;
  readonly runtime: PixRuntime;
}

export interface UsePixRuntimeOptions {
  width: number;
  height: number;
  /** Called once per created display, after the canvas is bound. */
  onReady?: (handle: PixRuntimeHandle) => void;
  /**
   * Called when the display for the current size is torn down (a size change or
   * unmount), so a consumer can drop its reference to the dead objects.
   */
  onTeardown?: () => void;
  /** Draws content after `update` and before the renderer. */
  render?: (timeline: PixTimeline) => void;
  /**
   * Drawn *after* content every frame, so viewer state — a direct pixel edit, a
   * selection, a cursor — survives a content pass that clears the framebuffer.
   */
  overlay?: PixOverlay | null;
  rendererConfig?: CanvasPixRendererOptions;
  /** Fully suspend the runtime; no frame is ever scheduled while true. */
  suspended?: boolean;
}

export interface UsePixRuntimeResult {
  /**
   * The live objects, reachable through a ref. It is a ref rather than state
   * because React must never re-render on a frame; consumers read it from
   * effects and event handlers.
   */
  handleRef: RefObject<PixRuntimeHandle | null>;
  /** Ref callback for the `<canvas>`. */
  attachCanvas: (node: HTMLCanvasElement | null) => void;
  /** Ref callback for the sizing container. */
  attachContainer: (node: HTMLElement | null) => void;
  /** Installs or clears the content draw hook without recreating the display. */
  setRenderHook: (hook: ((timeline: PixTimeline) => void) | null) => void;
  /** Installs or clears the post-content overlay layer. */
  setOverlay: (overlay: PixOverlay | null) => void;
  /** Whether the ambient system requests reduced motion. */
  prefersReducedMotion: boolean;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the ambient reduced-motion preference live.
 *
 * `useSyncExternalStore` is the right tool here: the media query is an external
 * system, so the value is read on demand rather than mirrored into state by an
 * effect. The server snapshot is `false`, which is the correct default and lets
 * React resolve the difference on hydration.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const getSnapshot = useCallback((): boolean => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function usePixRuntime({
  width,
  height,
  onReady,
  onTeardown,
  render,
  overlay,
  rendererConfig,
  suspended = false,
}: UsePixRuntimeOptions): UsePixRuntimeResult {
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleRef = useRef<PixRuntimeHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const renderHookRef = useRef<((timeline: PixTimeline) => void) | null>(
    render ?? null,
  );
  const overlayRef = useRef<PixOverlay | null>(overlay ?? null);
  const onReadyRef = useRef(onReady);
  const onTeardownRef = useRef(onTeardown);
  const suspendedRef = useRef(suspended);

  // Mirroring callback props into refs after commit keeps the callbacks below
  // stable, so a re-render never tears down the observers or the display.
  useEffect(() => {
    onReadyRef.current = onReady;
    onTeardownRef.current = onTeardown;
    suspendedRef.current = suspended;
  });

  /**
   * Gives a handle the container's current physical size and wakes it once.
   *
   * Shared by the mount path and the logical-size-change path, because both need
   * the same three steps and a display that skipped them would have a backing
   * store of zero and never draw at all. The handle is read through
   * `handleRef` when none is named, so a callback that outlives its display
   * (an observer registered at mount) acts on the display that is actually on
   * screen rather than on a torn-down one.
   */
  const fitToContainer = useCallback((handle?: PixRuntimeHandle | null) => {
    const target = handle ?? handleRef.current;
    const node = containerRef.current;
    if (!target || !node) return;
    const rect = node.getBoundingClientRect();
    target.renderer.fit(rect.width, rect.height);
    // A suspension always wins: fitting must not wake a display the host has
    // deliberately put to sleep.
    if (!suspendedRef.current) target.runtime.requestFrame();
  }, []);

  // ── Create the display, renderer and runtime for the current logical size ──
  useEffect(() => {
    const display = createPixDisplay(width, height);
    const renderer = new CanvasPixRenderer(display, rendererConfig);
    const runtime = new PixRuntime();
    const next: PixRuntimeHandle = { display, renderer, runtime };

    runtime.setRenderer(renderer);
    runtime.setContent({
      id: "pixel-display-content",
      render: (timeline) => renderHookRef.current?.(timeline),
    });
    runtime.setOverlay(overlayRef.current);

    handleRef.current = next;

    // Ref callbacks may have fired before this effect ran.
    if (canvasRef.current) renderer.attach(canvasRef.current);
    onReadyRef.current?.(next);

    /*
     * A logical-size change replaces all three objects, and the canvas and
     * container bindings above are mount-scoped — they hold whichever handle
     * existed when they were created. Without this the new renderer would never
     * be given a presentation size (so it would never draw) and the container's
     * observer would keep re-fitting the dead one. Measured before the fix: a
     * density change left the canvas at its previous density, frozen, until the
     * component remounted.
     */
    fitToContainer(next);

    return () => {
      runtime.stop();
      renderer.detach();
      handleRef.current = null;
      onTeardownRef.current?.();
    };
  }, [width, height, rendererConfig, fitToContainer]);

  // ── Suspension policy ─────────────────────────────────────────────────────
  // Reduced motion is deliberately *not* handled here: it suppresses automatic
  // idle animation inside content so essential state changes stay visible (doc
  // §25). Stopping the runtime would hide the display's actual state instead.
  useEffect(() => {
    const current = handleRef.current;
    if (!current) return;
    if (suspended) current.runtime.stop();
    else if (!current.runtime.isRunning()) current.runtime.resume();
  }, [suspended, width, height, rendererConfig]);

  // ── Canvas binding ────────────────────────────────────────────────────────
  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    const current = handleRef.current;
    if (!node || !current) return;
    current.renderer.attach(node);
    current.runtime.start();
  }, []);

  // ── Container binding: sizing, visibility, backgrounding, DPR ─────────────
  const attachContainer = useCallback(
    (node: HTMLElement | null) => {
      containerRef.current = node;
      if (!node) return;

      /*
       * Every callback below resolves the handle through the ref rather than
       * closing over the one that existed when the observer was registered.
       * A logical-size change replaces the display, renderer and runtime; a
       * captured handle would leave the observer re-fitting and re-waking a
       * torn-down display that can no longer paint anything.
       */
      const fit = () => fitToContainer();

      fit();

      const resizeObserver =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
      resizeObserver?.observe(node);

      // Device pixel ratio can change while the display is on screen (moving a
      // window between monitors). Re-fit so cells stay snapped to whole device
      // pixels rather than being resampled by the compositor.
      let ratioQuery: MediaQueryList | null = null;
      const onRatioChange = () => {
        fit();
        watchRatio();
      };
      const watchRatio = () => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        ratioQuery = window.matchMedia(
          `(resolution: ${window.devicePixelRatio}dppx)`,
        );
        ratioQuery.addEventListener("change", onRatioChange, { once: true });
      };
      watchRatio();

      let visible = true;
      const updateSuspension = () => {
        const current = handleRef.current;
        if (!current) return;
        if (suspendedRef.current) {
          current.runtime.stop();
          return;
        }
        // Resuming continues the session's timeline; only a fresh attach uses
        // `start()`. Scrolling away and back must not restart an animation.
        if (visible && !document.hidden) current.runtime.resume();
        else current.runtime.stop();
      };

      const intersection =
        typeof IntersectionObserver === "undefined"
          ? null
          : new IntersectionObserver(([entry]) => {
              visible = entry.isIntersecting;
              updateSuspension();
            });
      intersection?.observe(node);
      document.addEventListener("visibilitychange", updateSuspension);
      updateSuspension();

      return () => {
        resizeObserver?.disconnect();
        ratioQuery?.removeEventListener("change", onRatioChange);
        intersection?.disconnect();
        document.removeEventListener("visibilitychange", updateSuspension);
      };
    },
    [fitToContainer],
  );

  const setRenderHook = useCallback(
    (hook: ((timeline: PixTimeline) => void) | null) => {
      renderHookRef.current = hook;
      handleRef.current?.runtime.requestFrame();
    },
    [],
  );

  const setOverlay = useCallback((next: PixOverlay | null) => {
    overlayRef.current = next;
    handleRef.current?.runtime.setOverlay(next);
    handleRef.current?.runtime.requestFrame();
  }, []);

  return {
    handleRef,
    attachCanvas,
    attachContainer,
    setRenderHook,
    setOverlay,
    prefersReducedMotion,
  };
}

/** Convenience accessor for the presentation currently in force. */
export function currentPresentation(
  handle: PixRuntimeHandle | null,
): PixGridPresentation | null {
  return handle ? handle.renderer.getPresentation() : null;
}
