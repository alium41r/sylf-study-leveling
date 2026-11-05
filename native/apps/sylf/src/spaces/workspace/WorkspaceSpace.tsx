// The Workspace Space: a large, finite canvas with tools resting on it, and a Command Center to reach them. All of its state is
// the model's. This file only decides what each window may do right now: which windows are in view, how much of each stays
// alive, what the chrome covers, and whether the window is wide enough for a canvas at all.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Stack, Text, useNotice, useNoticeClearance, useTheme, useWindowClass, type ViewHandle } from "@sylf/design-system";
import { OVERVIEW_ZOOM, TOOL_IDS, ZOOM, pinchRegions, planLifecycles, seenWindowIds, windowTitle, type Rect, type Size } from "@sylf/spaces";
import { useShellMetrics, useWorkspaceModel, useWorkspaceState } from "../../shell/context";
import { useKeyboardLift } from "../../shell/useKeyboardLift";
import { CommandCenter } from "./CommandCenter";
import { DockShelf } from "./DockShelf";
import { QuickSwitcher } from "./QuickSwitcher";
import { useCamera } from "./useCamera";
import { useWorkspaceKeys } from "./workspace-keys";
import { WindowView } from "./WorkspaceWindow";
import { WorkspaceCanvas } from "./WorkspaceCanvas";
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
  const [samples, setSamples] = useState<Record<string, boolean>>({});
  const [switching, setSwitching] = useState(false);
  const [hand, setHand] = useState(false);
  const mountedIds = useRef(new Set(state.windows.map((window) => window.id)));
  const compact = size === "compact";
  const dockHeight = control + space.sm * 2 + 8;
  const clearTop = top + control + space.xs;
  const clearBottom = dockHeight + edge * 2 + insets.bottom;
  useNoticeClearance(clearBottom);
  const library = useNotesLibrary();
  const root = useRef<ViewHandle>(null);
  // A drop lands where it was let go: the window's title bar sits under the pointer.
  const worldAt = (at: { x: number; y: number }) => viewport ? { x: state.camera.x + (at.x - viewport.width / 2) / state.camera.zoom - 48, y: state.camera.y + (at.y - viewport.height / 2) / state.camera.zoom - 16 } : null;
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
    const next = compact ? (current.focused ? [current.focused] : []) : seenWindowIds({ ...current, camera: { x, y, zoom } }, viewport);
    setSeen((previous) => (same(previous, next) ? previous : next));
  }, [model, viewport, compact]);
  useEffect(() => { const { x, y, zoom } = state.camera; refresh(x, y, zoom); }, [refresh, state.camera, state.windows, state.focused]);
  const { x, y, zoom } = camera;
  useAnimatedReaction(
    () => Math.round(x.value / 96) * 1e8 + Math.round(y.value / 96) * 1e4 + Math.round(Math.log2(zoom.value) * 16),
    (key, previous) => { if (previous !== null && key !== previous) scheduleOnRN(refresh, x.value, y.value, zoom.value); },
  );

  useWorkspaceKeys({
    openTool(index) { if (!model.open(TOOL_IDS[index])) notice("The Workspace is full. Close a window first."); },
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
    quickSwitch() { setSwitching(true); },
    leaveFocus() { if (state.layout !== "focus") return false; model.setLayout("free"); return true; },
    hand: setHand,
  });

  const lifecycles = useMemo(() => planLifecycles(state, seen), [state, seen]);
  const onProvenance = useCallback((id: string, sample: boolean) => setSamples((current) => (current[id] === sample ? current : { ...current, [id]: sample })), []);
  const fillOrder = useMemo(() => new Map(state.recent.map((id, index) => [id, index])), [state.recent]);
  const stackedRect = useMemo<Rect | null>(() => (compact && viewport ? { x: insets.left, y: clearTop, width: viewport.width - insets.left - insets.right, height: viewport.height - clearTop - clearBottom } : null), [compact, viewport, insets.left, insets.right, clearTop, clearBottom]);
  const empty = !state.windows.some((window) => !window.minimized);

  return (
    <Animated.View ref={root} testID="workspace-root" aria-label="Workspace" style={[{ flex: 1 }, lifted]}>
      <WorkspaceCanvas
        camera={camera}
        viewport={viewport}
        regions={regions}
        stacked={compact}
        hand={hand}
        commit={commit}
        stop={stop}
        onViewport={setViewport}
        overlay={
          <>
            {empty ? (
              <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: dockHeight, alignItems: "center", justifyContent: "center", padding: space.xl }}>
                <Stack gap="xs" align="center">
                  <Text variant="title" role="heading" aria-level={1} align="center">Workspace</Text>
                  <Text variant="small" tone="soft" align="center">{compact ? "Open a tool below." : "Open a tool below. Drag the canvas to move, and pinch to zoom."}</Text>
                </Stack>
              </View>
            ) : null}
            <DockShelf state={state} model={model} tuckable={state.layout === "focus" && !compact} bottom={insets.bottom + edge} sides={{ left: insets.left + edge, right: insets.right + edge }}>
              <CommandCenter state={state} height={dockHeight} />
            </DockShelf>
          </>
        }
      >
        {state.windows.map((window) => (
          <WindowView
            key={window.id}
            window={window}
            title={windowTitle(state, window)}
            focused={state.focused === window.id}
            lifecycle={lifecycles[window.id] ?? "suspended"}
            sample={!!samples[window.id]}
            fresh={!mountedIds.current.has(window.id)}
            fillOrder={mountedIds.current.has(window.id) ? fillOrder.get(window.id) ?? 0 : 0}
            overview={overview && !compact}
            stacked={stackedRect}
            zoom={zoom}
            onProvenance={onProvenance}
          />
        ))}
      </WorkspaceCanvas>
      <QuickSwitcher open={switching} onClose={() => setSwitching(false)} state={state} model={model} />
    </Animated.View>
  );
}
