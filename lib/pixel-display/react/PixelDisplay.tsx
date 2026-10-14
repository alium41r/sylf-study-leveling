"use client";

/**
 * ============================================================================
 * PIXEL DISPLAY — REACT HOST
 * ============================================================================
 * React owns the containing interface; the renderer owns the pixel surface
 * (doc §35). This component is the seam between them and is deliberately thin:
 *
 *  - It creates the display, renderer and runtime once and keeps them out of
 *    React state, so frame-by-frame drawing never triggers a re-render.
 *  - It never reads or writes individual pixels. Content does that.
 *  - It hands the runtime lifecycle to `usePixRuntime` (visibility, background,
 *    reduced motion) and nothing else.
 *
 * One `<canvas>` is the entire visual output: a 48×48 display has 2,304 logical
 * pixels and is still one DOM node (doc §10).
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createPixDisplay,
  PixRuntime,
  type PixOverlay,
  type PixTimeline,
} from "@/lib/pixel-display/engine";
import {
  CanvasPixRenderer,
  type CanvasPixRendererOptions,
} from "@/lib/pixel-display/renderers/canvas-2d";
import {
  DEFAULT_PRESENTATION,
  type PixPresentationPatch,
} from "@/lib/pixel-display/renderers/grid-presentation";
import { usePixRuntime } from "@/lib/pixel-display/react/usePixRuntime";
import {
  createSylfContent,
  type SylfContentOptions,
} from "@/lib/pixel-display/content";
import styles from "./PixelDisplay.module.css";

export interface PixelDisplayHandle {
  readonly runtime: PixRuntime;
  readonly renderer: CanvasPixRenderer;
  readonly display: ReturnType<typeof createPixDisplay>;
}

export interface PixelDisplayProps extends CanvasPixRendererOptions {
  /** Logical width in cells. */
  width: number;
  /** Logical height in cells. */
  height: number;
  /**
   * Receives the live objects once, after mount. Use it for dev controls and
   * imperative content wiring; it is not a render-time prop.
   */
  onReady?: (handle: PixelDisplayHandle) => void;
  /** Called when the display is torn down (size change or unmount). */
  onTeardown?: () => void;
  /** Presentation overrides (gap, inactive cells, backdrop, fill). */
  presentation?: PixPresentationPatch;
  /** Suspends the runtime entirely — used by the dev zero-work proof. */
  suspended?: boolean;
  /** Draws content before each renderer pass. */
  renderContent?: (timeline: PixTimeline) => void;
  /**
   * Composited after content every frame. Viewer state (a direct pixel edit, a
   * selection) belongs here so a content pass cannot erase it.
   */
  overlay?: PixOverlay | null;
  /**
   * Mounts the Sylf character as this display's content.
   *
   * Supplying this is the whole convenience: a production surface declares
   * *which* character it wants and at what fill, and the host creates, mounts
   * and reconfigures it. Without it the caller wires content through `onReady`,
   * which is what the development surface does — it needs the instance itself.
   *
   * Options are applied after creation too, so changing `autoBlink` or
   * `characterFill` reconfigures the live content instead of rebuilding it.
   */
  content?: SylfContentOptions;
  className?: string;
  ariaLabel?: string;
}

export function PixelDisplay({
  width,
  height,
  onReady,
  onTeardown,
  presentation,
  suspended = false,
  renderContent,
  overlay,
  content,
  className,
  ariaLabel,
  devicePixelRatio: ratioOverride,
}: PixelDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rendererConfig = useMemo<CanvasPixRendererOptions>(
    () => ({ devicePixelRatio: ratioOverride }),
    [ratioOverride],
  );

  const presentationKey = JSON.stringify({
    ...DEFAULT_PRESENTATION,
    ...presentation,
  });

  const contentRef = useRef<ReturnType<typeof createSylfContent> | null>(null);
  const wantsSylf = content !== undefined;
  const onReadyRef = useRef(onReady);
  /**
   * The content options most recently declared.
   *
   * A live mirror rather than a mount-time capture, because the display can be
   * rebuilt while this component stays mounted — a logical-size change does
   * exactly that — and a capture would give the new content the options that
   * were declared when the surface first appeared. This effect is registered
   * before `usePixRuntime` below, so the mirror is up to date whenever the
   * display is created or recreated.
   */
  const contentOptionsRef = useRef(content);

  useEffect(() => {
    onReadyRef.current = onReady;
    contentOptionsRef.current = content;
  });

  /**
   * Creates the Sylf content once per display.
   *
   * Creation-only on purpose: rebuilding content whenever an option changes
   * would restart a reaction mid-flight, which on a production surface means a
   * celebration visibly resetting itself. Option changes are pushed by the
   * effect below instead.
   */
  const handleReady = useCallback(
    (handle: PixelDisplayHandle) => {
      if (wantsSylf) {
        const instance = createSylfContent(
          handle.display,
          handle.runtime,
          contentOptionsRef.current,
        );
        contentRef.current = instance;
        handle.runtime.setContent(instance);
      }
      onReadyRef.current?.(handle);
    },
    [wantsSylf],
  );

  const handleTeardown = useCallback(() => {
    contentRef.current = null;
    onTeardown?.();
  }, [onTeardown]);

  const { handleRef, attachCanvas, attachContainer, setRenderHook, setOverlay } =
    usePixRuntime({
      width,
      height,
      onReady: wantsSylf || onReady ? handleReady : undefined,
      onTeardown: wantsSylf || onTeardown ? handleTeardown : undefined,
      rendererConfig,
      suspended,
    });

  useEffect(() => {
    attachCanvas(canvasRef.current);
  }, [attachCanvas]);

  useEffect(() => {
    attachContainer(containerRef.current);
  }, [attachContainer]);

  useEffect(() => {
    setRenderHook(renderContent ?? null);
  }, [renderContent, setRenderHook]);

  useEffect(() => {
    setOverlay(overlay ?? null);
  }, [overlay, setOverlay]);

  // Content options are pushed into the live instance rather than rebuilding it.
  useEffect(() => {
    if (!wantsSylf) return;
    if (content) contentRef.current?.configure(content);
  }, [wantsSylf, content]);

  // Presentation values are pushed imperatively; changing them must never
  // remount the canvas or change a logical coordinate.
  useEffect(() => {
    const current = handleRef.current;
    if (!current) return;
    current.renderer.setPresentation(
      JSON.parse(presentationKey) as PixPresentationPatch,
    );
    current.runtime.requestFrame();
  }, [handleRef, presentationKey]);

  return (
    <div ref={containerRef} className={`${styles.slot} ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
      />
    </div>
  );
}

export default PixelDisplay;
