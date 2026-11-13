// The Workspace Space: a large, finite canvas with tools resting on it, and a Command Center to reach them. All of its state is
// the model's. This file only decides what each window may do right now: which windows are in view, how much of each stays
// alive, what the chrome covers, and whether the window is wide enough for a canvas at all.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, Plane, Stack, Text, useNotice, useNoticeClearance, useTheme, useWindowClass, type ViewHandle } from "@sylf/design-system";
import { OVERVIEW_ZOOM, LAUNCHER_TOOLS, ZOOM, fillTiles, openWindows, presetTiles, screenToWorld, pinchRegions, planLifecycles, seenWindowIds, windowTitle, TOOLS, type Point, type Rect, type Size, type ToolId } from "@sylf/spaces";
import { useShellMetrics, useWorkspaceModel, useWorkspaceState } from "../../shell/context";
import { useKeyboardLift } from "../../shell/useKeyboardLift";
import { CommandCenter, type ToolDrag } from "./CommandCenter";
import { TOOL_ICONS } from "./icons";
import { DockShelf, TOOLS_HANDLE_HEIGHT } from "./DockShelf";
import { useCamera } from "./useCamera";
import { useWorkspaceKeys } from "./workspace-keys";
import { WindowView } from "./WorkspaceWindow";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
import { DropPreview, FillArrangeContext, FillSeams, dropZone } from "./FillDividers";
import { useDropTarget } from "./drop";
import { openDocumentWindow } from "./notes/open-window";
import { importPdfBytes } from "./notes/pdf-import";
import { useNotesLibrary } from "../../shell/notes/library";

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

export default function WorkspaceSpace() {
  const lifted = useKeyboardLift();
  const { space } = useTheme();
  const { size } = useWindowClass();
  const { control, edge, insets, top } = useShellMetrics();
  const model = useWorkspaceModel();
  const state = useWorkspaceState();
  const notice = useNotice();
  const [viewport, setViewport] = useState<Size | null>(null);
  const { camera, commit, stop } = useCamera(model, state.camera, viewport);
  const regions = useMemo(() => pinchRegions(state), [state]);
  const [seen, setSeen] = useState<string[]>([]);
  const [overview, setOverview] = useState(state.camera.zoom < OVERVIEW_ZOOM);
  const [hand, setHand] = useState(false);
  const mountedIds = useRef(new Set(state.windows.map((window) => window.id)));
  const compact = size === "compact";
  const dockHeight = control + space.sm * 2 + 8;
  const clearTop = top + control + space.xs;
  const clearBottom = dockHeight + edge * 2 + insets.bottom;
  useNoticeClearance(clearBottom);
  const library = useNotesLibrary();
  const root = useRef<ViewHandle>(null);
  const point = useSharedValue<Point>({ x: 0, y: 0 });
  const origin = useSharedValue<Point>({ x: 0, y: 0 });
  const [placing, setPlacing] = useState<ToolId | null>(null);
  const drag = useMemo<ToolDrag>(() => ({
    point,
    start(tool) {
      stop();
      root.current?.measureInWindow((x, y) => { origin.value = { x, y }; });
      setPlacing(tool);
    },
    end(tool, x, y, cancelled) {
      setPlacing(null);
      if (cancelled || !viewport) return;
      root.current?.measureInWindow((left, top) => {
        const at = { x: x - left, y: y - top };
        if (at.x < insets.left || at.x >= viewport.width - insets.right || at.y < clearTop || at.y >= viewport.height - clearBottom) return;
        commit({ x: camera.x.value, y: camera.y.value, zoom: camera.zoom.value });
        if (!model.openAt(tool, at)) notice("The Workspace is full. Close a window first.");
      });
    },
  }), [point, origin, stop, viewport, insets.left, insets.right, clearTop, clearBottom, commit, camera, model, notice]);
  const carried = useAnimatedStyle(() => ({ transform: [{ translateX: point.value.x - origin.value.x + space.sm }, { translateY: point.value.y - origin.value.y - control - space.sm }] }));
  // A drop lands where it was let go: the window's title bar sits under the pointer.
  const worldAt = (at: Point) => viewport ? screenToWorld({ x: at.x - 48, y: at.y - 16 }, { x: camera.x.value, y: camera.y.value, zoom: camera.zoom.value }, viewport) : null;
  useDropTarget(root, {
    onDocument: (id, at) => {
      const entry = library.getSnapshot().entries.find((e) => e.id === id);
      if (entry && !openDocumentWindow(model, entry, compact ? null : worldAt(at))) notice("The Workspace is full. Close a window first.");
    },
    onPdf: (file, at) => {
      void importPdfBytes(library, file.bytes, file.name, null).then((id) => {
        const entry = library.getSnapshot().entries.find((e) => e.id === id);
        if (entry && !openDocumentWindow(model, entry, compact ? null : worldAt(at))) notice("Added to PDFs. Close a window to open it.");
      }, (error: unknown) => notice(error instanceof Error ? error.message : "That PDF could not be added."));
    },
  });

  useEffect(() => {
    if (viewport) model.setFrame({ viewport, insets: { top: clearTop, right: insets.right + edge, bottom: clearBottom, left: insets.left + edge } });
  }, [model, viewport, clearTop, clearBottom, insets.right, insets.left, edge]);
  useEffect(() => () => { model.flush(); model.detach(); }, [model]);
  // One tool at a time has to be some tool: a compact window never shows nothing while windows are open.
  useEffect(() => {
    if (!compact || state.focused) return;
    const next = state.recent.find((id) => state.windows.some((window) => window.id === id && !window.minimized));
    if (next) model.focus(next);
  }, [compact, model, state.focused, state.recent, state.windows]);

  // What is in view is checked as the camera moves, but only in steps, so a gesture renders nothing until a window actually
  // crosses the edge of the view.
  const refresh = useCallback((x: number, y: number, zoom: number) => {
    setOverview(zoom < OVERVIEW_ZOOM);
    if (!viewport) return;
    const current = model.state();
    const next = compact ? (current.focused ? [current.focused] : [])
      : current.layout !== "free" ? openWindows(current).map(({ id }) => id)
      : seenWindowIds({ ...current, camera: { x, y, zoom } }, viewport);
    setSeen((previous) => (same(previous, next) ? previous : next));
  }, [model, viewport, compact]);
  useEffect(() => { const { x, y, zoom } = state.camera; refresh(x, y, zoom); }, [refresh, state.camera, state.windows, state.focused, state.layout]);
  const { x, y, zoom } = camera;
  useAnimatedReaction(
    () => Math.round(x.value / 96) * 1e8 + Math.round(y.value / 96) * 1e4 + Math.round(Math.log2(zoom.value) * 16),
    (key, previous) => { if (previous !== null && key !== previous) scheduleOnRN(refresh, x.value, y.value, zoom.value); },
  );

  useWorkspaceKeys({
    openTool(index) { const tool = LAUNCHER_TOOLS[index]; if (tool && !model.open(tool)) notice("The Workspace is full. Close a window first."); },
    closeFocused() { if (state.focused) model.close(state.focused); },
    minimizeFocused() { if (state.focused) model.minimize(state.focused); },
    cycle: model.cycle,
    layout: model.setLayout,
    fit: model.fit,
    reset: model.resetView,
    frameFocused() { if (state.focused) model.frameWindow(state.focused); },
    zoomIn() { model.zoomBy(ZOOM.step); },
    zoomOut() { model.zoomBy(1 / ZOOM.step); },
    pan(dx, dy) { const resting = model.state().camera; model.commitCamera({ ...resting, x: resting.x + dx / resting.zoom, y: resting.y + dy / resting.zoom }); },
    leaveFocus() { if (state.layout === "free") return false; model.setLayout("free"); return true; },
    hand: setHand,
  });

  const lifecycles = useMemo(() => planLifecycles(state, seen), [state, seen]);
  const fillOrder = useMemo(() => new Map(state.recent.map((id, index) => [id, index])), [state.recent]);
  const stackedRect = useMemo<Rect | null>(() => (compact && viewport ? { x: insets.left, y: clearTop, width: viewport.width - insets.left - insets.right, height: Math.max(0, viewport.height - clearTop - clearBottom) } : null), [compact, viewport, insets.left, insets.right, clearTop, clearBottom]);
  const empty = !state.windows.some((window) => !window.minimized);
  const pageOnly = state.layout === "fill" && state.windows.some((window) => !window.minimized && window.state.bare === true);
  const fill = state.layout === "fill" && (!compact || pageOnly) && !empty;
  const tuckTools = !compact && (state.layout === "focus" || fill);
  const preset = !compact && state.layout !== "free" && state.layout !== "fill" && !empty;
  const fillArea = useMemo(() => (fill && viewport ? { x: insets.left, y: insets.top, width: Math.max(0, viewport.width - insets.left - insets.right), height: Math.max(0, viewport.height - insets.top - insets.bottom) } : null), [fill, viewport, insets.left, insets.right, insets.top, insets.bottom]);
  const presetBottom = state.layout === "focus" ? insets.bottom : clearBottom + (state.windows.some((window) => window.minimized) ? 36 + space.xs : 0);
  const panes = useMemo(() => {
    if (fillArea) return fillTiles(state, fillArea);
    if (!preset || !viewport) return null;
    const area = { x: insets.left, y: clearTop, width: Math.max(0, viewport.width - insets.left - insets.right), height: Math.max(0, viewport.height - clearTop - presetBottom) };
    return presetTiles(state, area, viewport.height > viewport.width);
  }, [fillArea, state, preset, viewport, insets.left, insets.right, clearTop, presetBottom]);
  // Moving a tool by its title bar in full screen: where it would land, shown while dragging, applied on release.
  const [arranging, setArranging] = useState<{ id: string; x: number; y: number } | null>(null);
  const latestTile = useRef<typeof arranging>(null);
  const drop = arranging && fillArea && panes ? dropZone(panes, arranging.id, arranging.x, arranging.y) : null;
  const arrange = useMemo(() => ({
    move: (id: string, x: number, y: number) => {
      latestTile.current = { id, x, y };
      setArranging(latestTile.current);
    },
    end: (id: string, cancelled: boolean) => {
      const current = latestTile.current;
      latestTile.current = null;
      setArranging(null);
      if (cancelled || current?.id !== id || !panes || !fillArea) return;
      const target = dropZone(panes, id, current.x, current.y);
      if (target) model.dockFill(fillArea, id, target.target, target.zone);
    },
  }), [panes, fillArea, model]);

  return (
    <FillArrangeContext.Provider value={arrange}>
    <Animated.View ref={root} testID="workspace-root" collapsable={false} aria-label="Workspace" style={[{ flex: 1 }, lifted]}>
      <WorkspaceCanvas
        camera={camera}
        viewport={viewport}
        regions={regions}
        stacked={compact || fill || preset}
        hand={hand && !compact && !fill && !preset}
        commit={commit}
        stop={stop}
        onViewport={setViewport}
        overlay={
          <>
            {empty ? (
              <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: dockHeight, alignItems: "center", justifyContent: "center", padding: space.xl }}>
                <Stack gap="xs" align="center">
                  <Text variant="title" role="heading" aria-level={1} align="center">Workspace</Text>
                  <Text variant="small" tone="soft" align="center">{compact ? "Open a tool below." : "Drag a tool up from the dock to place it, or select it to open."}</Text>
                </Stack>
              </View>
            ) : null}
            {fillArea ? <FillSeams area={fillArea} state={state} model={model} /> : null}
            {drop ? <DropPreview rect={drop.preview} /> : null}
            {placing ? (
              <Animated.View testID="workspace-carry" pointerEvents="none" aria-hidden style={[{ position: "absolute", left: 0, top: 0, zIndex: 20 }, carried]}>
                <Plane level="float" radius="md" style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: control, paddingHorizontal: space.md }}>
                  <Icon name={TOOL_ICONS[placing]} active />
                  <Text variant="label">{TOOLS[placing].label}</Text>
                </Plane>
              </Animated.View>
            ) : null}
            {!pageOnly ? <DockShelf state={state} model={model} tuckable={tuckTools} bottom={insets.bottom + edge} safeBottom={insets.bottom} sides={{ left: insets.left + edge, right: insets.right + edge }}>
              <CommandCenter state={state} height={dockHeight} drag={!compact && state.layout === "free" ? drag : undefined} />
            </DockShelf> : null}
          </>
        }
      >
        {state.windows.map((window) => {
          const pane = panes?.[window.id];
          const atBottom = pane && viewport && pane.y + pane.height >= viewport.height - insets.bottom - 1;
          const bottomInset = tuckTools && !pageOnly && atBottom ? TOOLS_HANDLE_HEIGHT : 0;
          return <WindowView
            key={window.id}
            window={window}
            title={windowTitle(state, window)}
            focused={state.focused === window.id}
            lifecycle={lifecycles[window.id] ?? "suspended"}
            fresh={!mountedIds.current.has(window.id)}
            fillOrder={mountedIds.current.has(window.id) ? fillOrder.get(window.id) ?? 0 : 0}
            overview={overview && !compact && !fill && !preset}
            stacked={panes ? pane ?? null : stackedRect}
            bottomInset={bottomInset}
            tiled={fill}
            preset={preset}
            single={state.layout === "focus" && !compact}
            zoom={zoom}
          />;
        })}
      </WorkspaceCanvas>
    </Animated.View>
    </FillArrangeContext.Provider>
  );
}
