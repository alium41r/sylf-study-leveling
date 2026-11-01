"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { flushSync } from "react-dom";
import InkEditor from "./InkEditor";
import {
  notebookLayout,
  notebookWindow,
  NOTEBOOK_GAP,
} from "@/lib/notes/notebook-layout";
import { readNoteStyle } from "@/lib/notes/note-style";
import type { InkTools } from "@/lib/notes/ink-controller";
import type { InkViewport, InkRect } from "@/lib/notes/ink-renderer";
import s from "../Ink.module.css";

/** Scroll is bucketed: canvases are repainted per bucket, never on every scroll frame. */
const SCROLL_STEP = 160;
/** Extra painted pixels above/below the viewport so scrolling never reveals blank paper. */
const OVERSCAN = 480;
export type NotebookSurface = {
  active: boolean;
  chrome: HTMLElement | null;
  viewport: InkViewport;
  height: number;
  typing: boolean;
  setTyping: (value: boolean) => void;
  settings: InkTools | undefined;
  setSettings: (value: InkTools) => void;
  activate: (target: EventTarget | null) => void;
  navigate: (
    dx: number,
    dy: number,
    scale: number,
    focal?: { x: number; y: number },
    phase?: "live" | "end"
  ) => void;
  fit: (wholePage?: boolean) => void;
  focus: boolean;
  setFocus: (value: boolean) => void;
  resize: (height: number) => void;
  dock: "top" | "bottom";
  setDock: (value: "top" | "bottom") => void;
  retain: (value: boolean) => void;
  reveal: (rect: InkRect) => void;
};
export default function NotebookWorkspace(
  props: ComponentProps<typeof InkEditor> & {
    onVisiblePage?: (pageId: string) => void;
  }
) {
  const { note, pageId, registerLeave, onError, onVisiblePage, library } =
    props;
  const [chrome, setChrome] = useState<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 800, height: 800, top: 0 });
  const [zoom, setZoom] = useState<number>();
  const [active, setActive] = useState(
    pageId ||
      note.view.descriptor.pages.find((p) => !p.extensions.archived)?.pageId
  );
  const [typing, setTyping] = useState(
    note.view.descriptor.streams[0]?.adapter !== "sylf-ink/1"
  );
  const [settings, setSettings] = useState<InkTools>();
  const [focus, setFocus] = useState(false);
  const [dock, setDock] = useState<"top" | "bottom">("top");
  const [retained, setRetained] = useState<string[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const leaves = useRef(new Set<() => Promise<void>>());
  const topNow = useRef(0);
  const resumeNow = useRef({ active, top: 0 });
  useEffect(() => {
    resumeNow.current = { active, top: topNow.current };
  }, [active, area.top]);
  const keepLeave = useCallback((callback?: () => Promise<void>) => {
    if (callback) leaves.current.add(callback);
    return () => {
      if (callback) leaves.current.delete(callback);
    };
  }, []);
  const pageWidth = Math.max(
    320,
    ...note.view.descriptor.pages
      .filter((p) => !p.extensions.archived)
      .map((p) => p.width)
  );
  const fitted = Math.max(0.3, Math.min(1.3, (area.width - 48) / pageWidth));
  const scale = zoom ?? fitted;
  const isContinuous = useMemo(() => {
    const docStyle = note.view.descriptor.extensions.noteStyle
      ? readNoteStyle(note.view.descriptor.extensions.noteStyle)
      : note.view.descriptor.pages[0]?.extensions.noteStyle
      ? readNoteStyle(note.view.descriptor.pages[0]?.extensions.noteStyle)
      : undefined;
    return (docStyle ?? readNoteStyle(undefined)).layout === "continuous";
  }, [note.view.descriptor.extensions.noteStyle, note.view.descriptor.pages]);
  const gap = isContinuous ? 0 : NOTEBOOK_GAP;
  const layout = useMemo(
    () =>
      notebookLayout(
        note.view.descriptor.pages.map((p) => ({
          ...p,
          height: Math.max(p.height, heights[p.pageId] || 0),
        })),
        scale,
        gap
      ),
    [note.view.descriptor.pages, scale, heights, gap]
  );
  const windowPages = notebookWindow(layout.items, area.top, area.height);
  // Retain the focused editor until focus moves. Other pages release native leases on eviction.
  const activeLayout = layout.items.find((p) => p.pageId === active);
  if (activeLayout && !windowPages.some((p) => p.pageId === active))
    windowPages.push(activeLayout);
  for (const id of retained) {
    const p = layout.items.find((p) => p.pageId === id);
    if (p && !windowPages.some((p) => p.pageId === id)) windowPages.push(p);
  }
  windowPages.sort((a, b) => a.top - b.top);
  const layoutNow = useRef(layout);
  const scaleNow = useRef(scale);
  const prevScaleRef = useRef(scale);
  const heightsRef = useRef(heights);
  const pagesRef = useRef(note.view.descriptor.pages);
  const gapRef = useRef(gap);
  useLayoutEffect(() => {
    heightsRef.current = heights;
    pagesRef.current = note.view.descriptor.pages;
    gapRef.current = gap;
  }, [heights, note.view.descriptor.pages, gap]);
  const pendingScale = useRef<number | undefined>(undefined);
  const zoomFrame = useRef(0);
  const wheelSettleRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const liveZoomRef = useRef<
    | {
        baseScale: number;
        scale: number;
        baseScrollLeft: number;
        baseScrollTop: number;
        trackX: number;
        trackY: number;
        tx: number;
        ty: number;
        fx: number;
        fy: number;
      }
    | undefined
  >(undefined);
  const zoomPin = useRef<
    | { pageId: string; ry: number; rx: number; fx: number; fy: number }
    | undefined
  >(undefined);
  const clearLiveTransform = useCallback(() => {
    if (wheelSettleRef.current) {
      clearTimeout(wheelSettleRef.current);
      wheelSettleRef.current = undefined;
    }
    liveZoomRef.current = undefined;
    if (trackRef.current) {
      trackRef.current.style.transform = "";
      trackRef.current.style.transformOrigin = "";
    }
  }, []);
  // Layout effects run before paint, so the zoom focal point never visibly jumps.
  useLayoutEffect(() => {
    scaleNow.current = scale;
    pendingScale.current = undefined;
    if (trackRef.current && !liveZoomRef.current) {
      trackRef.current.style.transform = "";
      trackRef.current.style.transformOrigin = "";
    }
    if (!liveZoomRef.current) {
      const zoomLabel = sectionRef.current?.querySelector<HTMLElement>(
        "[data-notes-zoom-value]"
      );
      if (zoomLabel?.firstChild)
        zoomLabel.firstChild.nodeValue = `${Math.round(scale * 100)}%`;
    }
    const previous = layoutNow.current,
      prevScale = prevScaleRef.current,
      node = scroll.current,
      pinned = zoomPin.current;
    if (node && pinned) {
      zoomPin.current = undefined;
      const p = layout.items.find((item) => item.pageId === pinned.pageId);
      if (p) {
        const track = Math.max(node.clientWidth, pageWidth * scale + 48);
        node.scrollTop = Math.max(0, p.top + pinned.ry * p.height - pinned.fy);
        node.scrollLeft = Math.max(
          0,
          track / 2 + pinned.rx * scale - pinned.fx
        );
      }
    } else if (node && previous !== layout) {
      const anchor = previous.items.find(
        (p) =>
          p.top <= node.scrollTop + 80 && p.top + p.height > node.scrollTop + 80
      );
      const next =
        anchor && layout.items.find((p) => p.pageId === anchor.pageId);
      if (anchor && next) {
        if (scale === prevScale) {
          node.scrollTop = next.top + (node.scrollTop - anchor.top);
        } else {
          node.scrollTop =
            next.top +
            ((node.scrollTop - anchor.top) / anchor.height) * next.height;
        }
      }
    }
    prevScaleRef.current = scale;
    layoutNow.current = layout;
  }, [layout, pageWidth, scale]);
  useEffect(() => {
    const leave = async () => {
      const { active, top } = resumeNow.current;
      await library.whenDocumentIdle(note.id);
      for (const leave of [...leaves.current]) await leave();
      const p = layoutNow.current.items.find((p) => p.pageId === active);
      if (p)
        await library.saveResume(note.id, {
          version: 1,
          pageId: p.pageId,
          scrollRatio: Math.max(
            0,
            Math.min(1, ((topNow.current || top) - p.top) / p.height)
          ),
        });
    };
    const remove = registerLeave(leave),
      close = library.registerBeforeClose(leave);
    return () => {
      remove();
      close();
    };
  }, [registerLeave, library, note.id]);
  const requested = useRef<string | undefined>(undefined);
  const writingPage = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!typing) writingPage.current = undefined;
  }, [typing]);
  const restored = useRef(false);
  const reported = useRef<string | undefined>(undefined);
  const goPage = useCallback(
    (id: string) => {
      clearLiveTransform();
      writingPage.current = undefined;
      const focused = document.activeElement as HTMLElement | null;
      const focusedPage =
        focused?.closest<HTMLElement>("[data-notebook-page]");
      if (focusedPage && focusedPage.dataset.notebookPage !== id)
        focused?.blur();
      const p = layoutNow.current.items.find((item) => item.pageId === id);
      if (!p) {
        requested.current = id;
        setActive(id);
        return;
      }
      requested.current = undefined;
      setActive(id);
      scroll.current?.scrollTo({
        top: Math.max(0, p.top - 24),
        behavior: "instant",
      });
    },
    [clearLiveTransform]
  );
  useEffect(() => {
    if (!note.view.descriptor.pages.length)
      void library
        .ensurePageLayers(note.id)
        .then((layers) => goPage(layers.page.pageId))
        .catch((error) => onError(error.message));
  }, [library, note.id, note.view.descriptor.pages.length, goPage, onError]);

  useEffect(() => {
    if (pageId === reported.current) return;
    if (pageId) {
      goPage(pageId);
      if (!restored.current && note.resume?.pageId === pageId) {
        const p = layoutNow.current.items.find((p) => p.pageId === pageId);
        if (p && scroll.current)
          scroll.current.scrollTop += p.height * (note.resume.scrollRatio || 0);
      }
      restored.current = true;
    }
    // The resume is an opening snapshot, not a command on each catalog refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, goPage]);
  useEffect(() => {
    if (!active || !onVisiblePage) return;
    const timer = setTimeout(() => {
      reported.current = active;
      onVisiblePage?.(active);
    }, 180);
    return () => clearTimeout(timer);
  }, [active, onVisiblePage]);
  useEffect(() => {
    if (requested.current) goPage(requested.current);
  }, [layout, goPage]);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      topNow.current = node.scrollTop;
      const bucket = Math.floor(node.scrollTop / SCROLL_STEP) * SCROLL_STEP;
      setArea((old) =>
        old.width === node.clientWidth &&
        old.height === node.clientHeight &&
        old.top === bucket
          ? old
          : { width: node.clientWidth, height: node.clientHeight, top: bucket }
      );
      const visible = notebookWindow(
        layoutNow.current.items,
        node.scrollTop,
        node.clientHeight
      );
      const closest = visible.sort((a, b) => {
        const amount = (p: typeof a) =>
          Math.max(
            0,
            Math.min(p.top + p.height, node.scrollTop + node.clientHeight) -
              Math.max(p.top, node.scrollTop)
          );
        return amount(b) - amount(a);
      })[0];
      const focused = document.activeElement as HTMLElement | null;
      const focusedPage = focused?.matches("[contenteditable], input, textarea")
        ? focused.closest<HTMLElement>("[data-notebook-page]")?.dataset
            .notebookPage
        : undefined;
      // A caret can sit near a page boundary while the next page occupies more
      // viewport space. Formatting must continue to target the focused page.
      const writer = writingPage.current || focusedPage;
      if (writer || closest) setActive(writer || closest.pageId);
    };
    const changed = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(changed);
    resize.observe(node);
    node.addEventListener("scroll", changed, { passive: true });
    update();
    return () => {
      resize.disconnect();
      node.removeEventListener("scroll", changed);
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(
    () => () => {
      if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current);
      if (zoomFrame.current) cancelAnimationFrame(zoomFrame.current);
    },
    []
  );
  const commitZoom = useCallback(
    (
      targetScale: number,
      pin:
        | { pageId: string; ry: number; rx: number; fx: number; fy: number }
        | undefined,
      sync = false
    ) => {
      const node = scroll.current;
      if (!node) return;
      pendingScale.current = targetScale;
      zoomPin.current = pin;
      let nextBucket: number | undefined;
      if (pin) {
        const targetLayout = notebookLayout(
          pagesRef.current.map((p) => ({
            ...p,
            height: Math.max(p.height, heightsRef.current[p.pageId] || 0),
          })),
          targetScale,
          gapRef.current
        );
        const nextP = targetLayout.items.find(
          (item) => item.pageId === pin.pageId
        );
        if (nextP) {
          const maxScrollTop = Math.max(
            0,
            targetLayout.height - node.clientHeight
          );
          const targetScrollTop = Math.max(
            0,
            Math.min(maxScrollTop, nextP.top + pin.ry * nextP.height - pin.fy)
          );
          topNow.current = targetScrollTop;
          nextBucket = Math.floor(targetScrollTop / SCROLL_STEP) * SCROLL_STEP;
        }
      }
      const apply = () => {
        if (nextBucket !== undefined) {
          setArea((old) =>
            old.width === node.clientWidth &&
            old.height === node.clientHeight &&
            old.top === nextBucket
              ? old
              : {
                  width: node.clientWidth,
                  height: node.clientHeight,
                  top: nextBucket,
                }
          );
        }
        setZoom(targetScale);
      };
      if (sync) flushSync(apply);
      else apply();
    },
    []
  );
  const commitLiveZoom = useCallback(
    (sync = false) => {
      if (wheelSettleRef.current) {
        clearTimeout(wheelSettleRef.current);
        wheelSettleRef.current = undefined;
      }
      const live = liveZoomRef.current;
      liveZoomRef.current = undefined;
      const node = scroll.current;
      if (!live || !node) return;
      if (Math.abs(live.scale - scaleNow.current) < 1e-4) {
        if (trackRef.current) {
          trackRef.current.style.transform = "";
          trackRef.current.style.transformOrigin = "";
        }
        const zoomLabel = sectionRef.current?.querySelector<HTMLElement>(
          "[data-notes-zoom-value]"
        );
        if (zoomLabel?.firstChild)
          zoomLabel.firstChild.nodeValue = `${Math.round(scaleNow.current * 100)}%`;
        node.scrollLeft = Math.max(0, live.trackX - live.fx);
        node.scrollTop = Math.max(0, live.trackY - live.fy);
        return;
      }
      const items = layoutNow.current.items;
      const p =
        items.find(
          (item) => live.trackY < item.top + item.height + gapRef.current / 2
        ) || items.at(-1);
      const baseTrackWidth = Math.max(
        node.clientWidth,
        pageWidth * live.baseScale + 48
      );
      const pin = p
        ? {
            pageId: p.pageId,
            ry: (live.trackY - p.top) / p.height,
            rx: (live.trackX - baseTrackWidth / 2) / live.baseScale,
            fx: live.fx,
            fy: live.fy,
          }
        : undefined;
      commitZoom(live.scale, pin, sync);
    },
    [commitZoom, pageWidth]
  );
  const navigate = useCallback(
    (
      dx: number,
      dy: number,
      factor: number,
      focal?: { x: number; y: number },
      phase?: "live" | "end"
    ) => {
      const node = scroll.current;
      if (!node) return;
      if (phase === "end") {
        commitLiveZoom();
        return;
      }
      if (factor === 1 && phase !== "live") {
        if (liveZoomRef.current) commitLiveZoom(true);
        node.scrollLeft -= dx;
        node.scrollTop -= dy;
        return;
      }
      const rect = node.getBoundingClientRect();
      const fx = focal ? focal.x - rect.left : node.clientWidth / 2,
        fy = focal ? focal.y - rect.top : node.clientHeight / 2;
      const minZoom = Math.min(0.6, fitted);
      if (phase === "live") {
        const current = liveZoomRef.current ?? {
          baseScale: scaleNow.current,
          scale: scaleNow.current,
          baseScrollLeft: node.scrollLeft,
          baseScrollTop: node.scrollTop,
          trackX: 0,
          trackY: 0,
          tx: 0,
          ty: 0,
          fx,
          fy,
        };
        const prevRatio = current.scale / current.baseScale;
        const ox = fx - (focal ? dx : 0),
          oy = fy - (focal ? dy : 0);
        const trackX = (ox + current.baseScrollLeft - current.tx) / prevRatio;
        const trackY = (oy + current.baseScrollTop - current.ty) / prevRatio;
        const next = Math.max(minZoom, Math.min(4, current.scale * factor));
        const ratio = next / current.baseScale;
        const tx = fx + current.baseScrollLeft - trackX * ratio;
        const ty = fy + current.baseScrollTop - trackY * ratio;
        liveZoomRef.current = {
          baseScale: current.baseScale,
          scale: next,
          baseScrollLeft: current.baseScrollLeft,
          baseScrollTop: current.baseScrollTop,
          trackX,
          trackY,
          tx,
          ty,
          fx,
          fy,
        };
        if (trackRef.current) {
          trackRef.current.style.transformOrigin = "0 0";
          trackRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${ratio})`;
        }
        const zoomLabel = sectionRef.current?.querySelector<HTMLElement>(
          "[data-notes-zoom-value]"
        );
        if (zoomLabel?.firstChild)
          zoomLabel.firstChild.nodeValue = `${Math.round(next * 100)}%`;
        return;
      }
      if (liveZoomRef.current) commitLiveZoom(true);
      if (zoomFrame.current) {
        cancelAnimationFrame(zoomFrame.current);
        zoomFrame.current = 0;
      }
      const baseScale = pendingScale.current ?? scaleNow.current;
      pendingScale.current = undefined;
      const next = Math.max(minZoom, Math.min(4, baseScale * factor));
      if (next === scaleNow.current) return;
      // Pin the content under the gesture's starting point to the committed layout.
      const ox = fx - (focal ? dx : 0),
        oy = fy - (focal ? dy : 0),
        y = node.scrollTop + oy,
        items = layoutNow.current.items,
        p =
          items.find(
            (item) => y < item.top + item.height + gapRef.current / 2
          ) || items.at(-1);
      const current = scaleNow.current,
        track = Math.max(node.clientWidth, pageWidth * current + 48);
      const pin = p
        ? {
            pageId: p.pageId,
            ry: (y - p.top) / p.height,
            rx: (node.scrollLeft + ox - track / 2) / current,
            fx,
            fy,
          }
        : undefined;
      commitZoom(next, pin);
    },
    [commitLiveZoom, commitZoom, fitted, pageWidth]
  );
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        navigate(
          0,
          0,
          Math.exp(
            -event.deltaY * (Math.abs(event.deltaY) < 40 ? 0.012 : 0.004)
          ),
          { x: event.clientX, y: event.clientY },
          "live"
        );
        if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current);
        wheelSettleRef.current = setTimeout(() => {
          wheelSettleRef.current = undefined;
          commitLiveZoom();
        }, 120);
      } else if (liveZoomRef.current) {
        commitLiveZoom(true);
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [commitLiveZoom, navigate]);
  const fit = (wholePage = false) => {
    clearLiveTransform();
    if (!wholePage) setZoom(undefined);
    else {
      const page = note.view.descriptor.pages.find((p) => p.pageId === active);
      if (page)
        setZoom(
          Math.max(
            0.3,
            Math.min(
              1.5,
              (area.width - 48) / page.width,
              (area.height - 72) / page.height
            )
          )
        );
    }
    requestAnimationFrame(() => {
      if (active) goPage(active);
    });
  };
  if (
    note.view.descriptor.pages.find((p) => p.pageId === active)?.extensions
      .archived
  )
    return (
      <InkEditor
        {...props}
        pageId={active}
        registerLeave={keepLeave}
        onPage={goPage}
      />
    );
  return (
    <section
      ref={sectionRef}
      className={s.notebook}
      data-focus={focus}
      data-dock={dock}
      aria-label="Continuous notebook"
    >
      <div
        ref={setChrome}
        className={`${s.notebookChrome} ${s.editor}`}
        data-focus={focus}
        data-dock={dock}
      />
      <div
        ref={scroll}
        className={s.notebookScroll}
        aria-label="Notebook scroll area"
        tabIndex={-1}
        onPointerDownCapture={(event) => {
          if (liveZoomRef.current && event.pointerType !== "touch")
            commitLiveZoom(true);
        }}
      >
        <div
          ref={trackRef}
          className={s.notebookTrack}
          data-layout={isContinuous ? "continuous" : "paged"}
          style={{ height: layout.height, minWidth: pageWidth * scale + 48 }}
        >
          {windowPages.map((p) => {
            const maxSliceHeight = Math.max(
              1,
              Math.min(p.height, area.height + OVERSCAN * 2 + SCROLL_STEP)
            );
            const clipTop = Math.max(
              0,
              Math.min(p.height - maxSliceHeight, area.top - p.top - OVERSCAN)
            );
            const visibleHeight = maxSliceHeight;
            return (
              <div
                key={p.pageId}
                className={s.notebookPage}
                data-layout={isContinuous ? "continuous" : "paged"}
                data-first-page={
                  p.pageId === layout.items[0]?.pageId || undefined
                }
                data-last-page={
                  p.pageId === layout.items.at(-1)?.pageId || undefined
                }
                data-notebook-page={p.pageId}
                style={{ top: p.top, width: p.width, height: p.height }}
              >
                <div
                  className={s.notebookSlice}
                  style={{ top: clipTop, height: visibleHeight }}
                >
                  <InkEditor
                    {...props}
                    pageId={p.pageId}
                    registerLeave={keepLeave}
                    onPage={goPage}
                    onError={onError}
                    workspace={{
                      active: p.pageId === active,
                      chrome,
                      viewport: { zoom: scale, x: 0, y: -clipTop },
                      height: visibleHeight,
                      typing,
                      setTyping,
                      settings,
                      setSettings,
                      activate: (target) => {
                        setActive(p.pageId);
                        const element =
                          target instanceof HTMLElement ? target : undefined;
                        if (
                          element?.closest("[contenteditable], input, textarea")
                        )
                          writingPage.current = p.pageId;
                        else if (element?.closest("[data-notebook-page]"))
                          writingPage.current = undefined;
                      },
                      navigate,
                      fit,
                      reveal: (r) => {
                        const node = scroll.current;
                        if (!node) return;
                        const view = node.getBoundingClientRect();
                        if (r.y < view.top + 24)
                          node.scrollTop -= view.top + 24 - r.y;
                        else if (r.y + r.height > view.bottom - 88)
                          node.scrollTop += r.y + r.height - view.bottom + 88;
                        if (r.x < view.left + 24)
                          node.scrollLeft -= view.left + 24 - r.x;
                        else if (r.x + r.width > view.right - 24)
                          node.scrollLeft += r.x + r.width - view.right + 24;
                      },
                      focus,
                      setFocus,
                      dock,
                      setDock,
                      retain: (value) =>
                        setRetained((old) =>
                          value
                            ? old.includes(p.pageId)
                              ? old
                              : [...old, p.pageId]
                            : old.includes(p.pageId)
                              ? old.filter((id) => id !== p.pageId)
                              : old
                        ),
                      resize: (height) =>
                        setHeights((old) =>
                          old[p.pageId] === height
                            ? old
                            : { ...old, [p.pageId]: height }
                        ),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
