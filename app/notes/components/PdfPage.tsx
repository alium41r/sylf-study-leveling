"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { InkModel } from "@/lib/notes/ink";
import { InkController, type InkTools } from "@/lib/notes/ink-controller";
import {
  PdfMarkup,
  pdfPageMaps,
  PDF_ADAPTER,
  pageRotationMatrix,
  inverseMatrix,
  transformPoint,
  pdfRotation,
  pdfMatrix,
  type NotesPage,
  type PdfMark,
  type PdfRect,
} from "@/lib/notes/pdf";
import { pdfRuntime, type PdfDocumentPool } from "@/lib/notes/pdf-reader";
import type { NotesLibrary } from "@/lib/notes/library";
import type { SaveState } from "@/lib/notes/engine";
import s from "../Pdf.module.css";
export type PdfTool = "read" | "text" | "comment" | InkTools["tool"];
export interface PdfPageHandle {
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  ink: InkModel;
  markup: PdfMarkup;
  input: InkController;
  writable: () => boolean;
}
export interface PdfSelection {
  rects: PdfRect[];
  quote: string;
  pageId: string;
}
export default function PdfPage({
  library,
  documentId,
  page,
  pool,
  zoom,
  tool,
  settings,
  active,
  onActive,
  onReady,
  onState,
  onControls,
  onDurability,
  onError,
  onSelection,
  onNavigate,
  onEdit,
  thumbnail = false,
}: {
  library: NotesLibrary;
  documentId: string;
  page: NotesPage;
  pool: PdfDocumentPool;
  zoom: number;
  tool: PdfTool;
  settings: InkTools;
  active: boolean;
  onActive: () => void;
  onReady?: (handle?: PdfPageHandle) => void;
  onState?: (state: SaveState) => void;
  onControls?: () => void;
  onDurability?: (pinned: boolean) => void;
  onError: (message: string) => void;
  onSelection?: (selection: PdfSelection) => void;
  onNavigate?: (dx: number, dy: number, scale: number) => void;
  onEdit?: (point: { x: number; y: number }, mark?: PdfMark) => void;
  thumbnail?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    outer = useRef<HTMLDivElement>(null),
    pdfCanvas = useRef<HTMLCanvasElement>(null),
    base = useRef<HTMLCanvasElement>(null),
    live = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null),
    input = useRef<InkController | undefined>(undefined),
    stateRef = useRef({
      active,
      tool,
      settings,
      onReady,
      onState,
      onControls,
      onDurability,
      onError,
      onSelection,
      onNavigate,
      onEdit,
    });
  useLayoutEffect(() => {
    stateRef.current = {
      active,
      tool,
      settings,
      onReady,
      onState,
      onControls,
      onDurability,
      onError,
      onSelection,
      onNavigate,
      onEdit,
    };
  }, [
    active,
    tool,
    settings,
    onReady,
    onState,
    onControls,
    onDurability,
    onError,
    onSelection,
    onNavigate,
    onEdit,
  ]);
  const [marks, setMarks] = useState<PdfMark[]>([]),
    [nativeReady, setNativeReady] = useState(false),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState("");
  const sourceReady = useRef(!page.originalAssetId);
  const {
    originalAssetId,
    sourcePage,
    width: pageWidth,
    height: pageHeight,
  } = page;
  const transformKey = JSON.stringify(pdfMatrix(page));
  const rotation = pdfRotation(page),
    matrix = pageRotationMatrix(page.width, page.height, rotation),
    size = rotation % 180 ? { width: page.height, height: page.width } : page;
  const geometry = useRef({
    width: page.width,
    height: page.height,
    rotation,
    zoom,
  });
  const pagePoint = useCallback((event: PointerEvent) => {
    const g = geometry.current,
      r = outer.current!.getBoundingClientRect();
    return transformPoint(
      inverseMatrix(pageRotationMatrix(g.width, g.height, g.rotation)),
      (event.clientX - r.left) / g.zoom,
      (event.clientY - r.top) / g.zoom
    );
  }, []);
  useLayoutEffect(() => {
    geometry.current = {
      width: page.width,
      height: page.height,
      rotation,
      zoom,
    };
    input.current?.setFixedViewport(zoom, pagePoint);
  }, [page.width, page.height, rotation, zoom, pagePoint]);
  useEffect(() => {
    let cancelled = false,
      cleanup: (() => void) | undefined,
      statusTimer: ReturnType<typeof setTimeout> | undefined;
    queueMicrotask(() => {
      if (!cancelled) {
        setNativeReady(false);
        setFailure("");
      }
    });
    void (async () => {
      const source = await library.open(documentId, page.pageId);
      if (cancelled) {
        source.release();
        return;
      }
      if (source.stream.adapterId !== PDF_ADAPTER) {
        source.release();
        throw new Error("This page requires its original PDF reader.");
      }
      let healthy = true;
      const writable = () =>
        healthy &&
        !cancelled &&
        sourceReady.current &&
        !library.snapshot().memoryPending &&
        !["failed", "closed", "pausing"].includes(
          source.stream.status().state
        ) &&
        !library.session.signal.aborted;
      let ink: InkModel | undefined,
        markup: PdfMarkup | undefined,
        controller: InkController | undefined;
      try {
        ink = new InkModel(
          source.stream.doc,
          writable,
          pdfPageMaps(source.stream.doc).ink
        );
        markup = new PdfMarkup(source.stream.doc, writable);
        let announced: SaveState | undefined;
        const announce = (state: SaveState) => {
          if (thumbnail) return;
          if (
            state === "saving" ||
            state === "failed" ||
            controller?.isActive()
          )
            stateRef.current.onDurability?.(true);
          const send = (value: SaveState) => {
            if (stateRef.current.active && value !== announced) {
              announced = value;
              stateRef.current.onState?.(value);
            }
          };
          if (state === "failed" || state === "closed") send(state);
          else if (state === "saving" && announced !== "saving") send("saving");
          if (!statusTimer)
            statusTimer = setTimeout(() => {
              statusTimer = undefined;
              const status = source.stream.status();
              stateRef.current.onDurability?.(
                status.state === "failed" ||
                  status.pending > 0 ||
                  !!controller?.isActive()
              );
              send(controller?.isActive() ? "saving" : status.state);
            }, 200);
        };
        const changed = () => {
          if (!cancelled) {
            try {
              setMarks(markup!.marks());
            } catch (e) {
              error((e as Error).message);
            }
            if (stateRef.current.active && !controller?.isActive())
              stateRef.current.onControls?.();
            announce(
              controller?.isActive() ? "saving" : source.stream.status().state
            );
          }
        };
        const error = (message: string) => {
          healthy = false;
          if (!cancelled) {
            setFailure(message);
            stateRef.current.onError(message);
          }
        };
        controller = new InkController(
          host.current!,
          base.current!,
          live.current!,
          ink,
          page.width,
          page.height,
          writable,
          changed,
          error,
          undefined,
          {
            transparent: !!page.originalAssetId,
            fixed: true,
            fixedZoom: geometry.current.zoom,
            point: pagePoint,
            navigate: (dx, dy, scale) =>
              stateRef.current.onNavigate?.(dx, dy, scale),
          }
        );
        input.current = controller;
        controller.setTools(stateRef.current.settings);
        const boundary = source.stream.registerInputBoundary(() =>
          controller!.finish("interrupted")
        );
        const status = source.stream.subscribe((state) => {
          if (["failed", "closed", "pausing"].includes(state))
            controller!.finish("interrupted");
          if (state === "failed")
            error(
              "Annotations are paused to protect unsaved changes. Retry or export recovery before leaving."
            );
          announce(state);
        });
        const removeMark = markup.subscribe(changed);
        const handle: PdfPageHandle = {
          ink,
          markup,
          input: controller,
          writable,
          flush: async () => {
            controller!.finish();
            await source.stream.flush();
          },
          retry: async () => {
            await source.stream.retry();
            ink!.assertHealthy();
            markup!.assertHealthy();
            healthy = true;
            setFailure("");
          },
        };
        if (!thumbnail) stateRef.current.onReady?.(handle);
        cleanup = () => {
          clearTimeout(statusTimer);
          boundary();
          removeMark();
          status();
          controller!.close();
          markup!.close();
          ink!.close();
          if (!thumbnail) stateRef.current.onReady?.();
          void source.stream
            .flush()
            .catch((e) => stateRef.current.onError(e.message))
            .finally(() => source.release());
          input.current = undefined;
        };
        if (cancelled) {
          cleanup();
          return;
        }
        changed();
        setNativeReady(true);
      } catch (e) {
        controller?.close();
        markup?.close();
        ink?.close();
        source.release();
        throw e;
      }
    })().catch((e) => {
      if (!cancelled) {
        setFailure(e.message);
        stateRef.current.onState?.("failed");
        stateRef.current.onError(e.message);
      }
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // A stable PDF page owns its native stream; geometry changes keep pending work and undo identities alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, documentId, page.pageId, thumbnail]);
  useEffect(() => {
    input.current?.setTools(settings);
  }, [settings]);
  // The source canvas and selectable text layer are disposable; source bytes never change.
  useEffect(() => {
    let cancelled = false,
      release: (() => void) | undefined,
      task: { cancel: () => void } | undefined,
      layer: { cancel: () => void } | undefined,
      pageProxy: import("@/lib/notes/pdf-reader").PDFPageProxy | undefined;
    const targetCanvas = pdfCanvas.current;
    sourceReady.current = !originalAssetId;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      if (!originalAssetId) {
        setLoading(false);
        return;
      }
      const lease = await pool.acquire(originalAssetId);
      release = lease.release;
      if (cancelled) {
        release();
        return;
      }
      const source = await lease.doc.getPage(sourcePage! + 1);
      pageProxy = source;
      if (cancelled) return;
      const canonical = source.getViewport({ scale: 1 });
      if (
        Math.abs(canonical.width - pageWidth) > 0.01 ||
        Math.abs(canonical.height - pageHeight) > 0.01 ||
        canonical.transform.some(
          (v, i) =>
            Math.abs(v - (JSON.parse(transformKey) as number[])[i]) > 1e-5
        )
      )
        throw new Error(
          "PDF page coordinates do not match the retained source. Writing is paused; export recovery before changing it."
        );
      const viewport = source.getViewport({ scale: zoom }),
        canvas = targetCanvas!,
        dpr = Math.min(
          devicePixelRatio || 1,
          2,
          Math.sqrt(2_000_000 / (viewport.width * viewport.height))
        );
      canvas.width = Math.max(1, Math.ceil(viewport.width * dpr));
      canvas.height = Math.max(1, Math.ceil(viewport.height * dpr));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = source.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await (task as unknown as { promise: Promise<void> }).promise;
      if (cancelled) return;
      if (!thumbnail) {
        const runtime = await pdfRuntime(),
          content = await source.getTextContent();
        if (cancelled) return;
        const target = text.current!;
        target.replaceChildren();
        target.style.setProperty(
          "--total-scale-factor",
          String(zoom * source.userUnit)
        );
        target.style.setProperty("--scale-factor", String(zoom));
        target.style.setProperty("--user-unit", String(source.userUnit));
        target.style.setProperty("--scale-round-x", "1px");
        target.style.setProperty("--scale-round-y", "1px");
        const textLayer = new runtime.TextLayer({
          textContentSource: content,
          container: target,
          viewport,
        });
        layer = textLayer;
        await textLayer.render();
      }
      if (!cancelled) {
        sourceReady.current = true;
        setLoading(false);
      }
    })().catch((e) => {
      if (!cancelled && e.name !== "RenderingCancelledException") {
        setFailure(e.message);
        stateRef.current.onState?.("failed");
        stateRef.current.onError(e.message);
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
      pageProxy?.cleanup();
      release?.();
      if (targetCanvas) {
        targetCanvas.width = targetCanvas.height = 1;
      }
    };
  }, [
    originalAssetId,
    sourcePage,
    pageWidth,
    pageHeight,
    transformKey,
    pool,
    zoom,
    thumbnail,
  ]);
  const annotate =
    active &&
    nativeReady &&
    !loading &&
    !["read", "text", "comment"].includes(tool) &&
    !thumbnail;
  const select = () => {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !text.current?.contains(selection.anchorNode) ||
      !text.current?.contains(selection.focusNode)
    )
      return;
    const r = outer.current!.getBoundingClientRect(),
      inv = inverseMatrix(matrix),
      rects: PdfRect[] = [];
    for (const box of selection.getRangeAt(0).getClientRects()) {
      if (box.width < 1 || box.height < 1) continue;
      const points = [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ].map(([x, y]) =>
        transformPoint(inv, (x - r.left) / zoom, (y - r.top) / zoom)
      );
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      rects.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
      if (rects.length >= 500) break;
    }
    if (rects.length)
      stateRef.current.onSelection?.({
        rects,
        quote: selection.toString().slice(0, 2000),
        pageId: page.pageId,
      });
  };
  return (
    <div
      ref={outer}
      className={s.pageOuter}
      data-page-id={page.pageId}
      data-page-width={page.width}
      data-page-height={page.height}
      data-page-rotation={rotation}
      aria-busy={loading || !nativeReady}
      style={{ width: size.width * zoom, height: size.height * zoom }}
      onPointerDown={onActive}
    >
      <div
        className={s.pageInner}
        style={{
          width: page.width * zoom,
          height: page.height * zoom,
          transform: `matrix(${matrix[0]},${matrix[1]},${matrix[2]},${matrix[3]},${matrix[4] * zoom},${matrix[5] * zoom})`,
        }}
      >
        {page.originalAssetId && (
          <canvas
            ref={pdfCanvas}
            className={s.sourceCanvas}
            aria-hidden="true"
          />
        )}
        <div
          ref={text}
          className={s.textLayer}
          data-selectable={tool === "read" && !thumbnail}
          onPointerUp={select}
          aria-label={thumbnail ? undefined : "Selectable PDF text"}
        />
        <div
          ref={host}
          tabIndex={annotate ? 0 : -1}
          role={annotate ? "application" : undefined}
          aria-label={annotate ? "PDF handwriting surface" : undefined}
          className={s.inkHost}
          style={{
            pointerEvents: annotate ? "auto" : "none",
            width: page.width * zoom,
            height: page.height * zoom,
          }}
        >
          <canvas ref={base} aria-hidden="true" />
          <canvas ref={live} aria-hidden="true" />
        </div>
        <div
          className={s.markLayer}
          style={{
            width: page.width,
            height: page.height,
            transform: `scale(${zoom})`,
            pointerEvents:
              active && ["text", "comment"].includes(tool) ? "auto" : "none",
          }}
          onClick={(e) => {
            if (!["text", "comment"].includes(tool)) return;
            const r = outer.current!.getBoundingClientRect(),
              p = transformPoint(
                inverseMatrix(matrix),
                (e.clientX - r.left) / zoom,
                (e.clientY - r.top) / zoom
              );
            stateRef.current.onEdit?.(p);
          }}
        >
          {marks.map((m) =>
            m.rects.map((r, i) => (
              <div
                key={`${m.target}:${i}`}
                className={s.mark}
                data-kind={m.kind}
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  color: m.color,
                  fontSize: m.size,
                  background:
                    m.kind === "highlight" ? m.color + "48" : undefined,
                  borderColor: m.color,
                }}
                onClick={(e) => {
                  if (!thumbnail) {
                    e.stopPropagation();
                    stateRef.current.onEdit?.({ x: r.x, y: r.y }, m);
                  }
                }}
                role={
                  m.kind === "text" || m.kind === "comment" ? "note" : undefined
                }
                aria-label={
                  m.kind === "comment" ? `Comment: ${m.text}` : undefined
                }
              >
                {(m.kind === "text" || m.kind === "comment") && m.text}
              </div>
            ))
          )}
        </div>
      </div>
      {loading && (
        <span className={s.pageStatus} role="status">
          Loading page…
        </span>
      )}
      {failure && (
        <span className={s.pageError} role="alert">
          {failure}
        </span>
      )}
    </div>
  );
}
