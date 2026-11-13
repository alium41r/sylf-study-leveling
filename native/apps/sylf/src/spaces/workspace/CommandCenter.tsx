// The Command Center: the one place for tools (master plan §3.3). A tool shows whether it is open, the Marker sits under the one
// in focus, and everything here can be reached with touch, a pen, a mouse or the keyboard. Canvas controls sit at the far end,
// because they act on the view and not on a tool.
import { memo, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector, MouseButton, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Button, Dialog, Divider, Icon, IconButton, Menu, Press, Text, TextField, Tooltip, TravellingMarker, fade, useInputFormat, useNotice, useTheme, useWindowClass, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import { LAYOUT_LABELS, TOOLS, LAUNCHER_TOOLS, WORKSPACE_LAYOUTS, ZOOM, windowTitle, windowsOf, type Point, type ToolId, type WorkspaceLayout, type WorkspaceState } from "@sylf/spaces";
import { useWorkspaceModel } from "../../shell/context";
import { TOOL_ICONS } from "./icons";
import { WindowsSheet } from "./WindowsSheet";

const PIPS = 3;
/** Long enough for a Space's entrance to end. */
const SHADOW_AFTER_MS = 520;
const LAYOUT_ICONS: Record<WorkspaceLayout, IconName> = { free: "float", focus: "expand", split: "split", assistant: "sylvie", fill: "fit" };
const LAYOUT_DETAILS: Record<WorkspaceLayout, string> = { free: "Move and resize windows", focus: "Give one tool the view", split: "Keep two tools in view", assistant: "Work beside Sylvie", fill: "Give each tool its own tile" };

export interface ToolDrag {
  point: SharedValue<Point>;
  start(tool: ToolId): void;
  end(tool: ToolId, x: number, y: number, cancelled: boolean): void;
}

function ToolSlot({ tool, width, height, count, active, focused, onPress, onMenu, slotRef, drag }: { tool: ToolId; width: number; height: number; count: number; active: number; focused: boolean; onPress: () => void; onMenu: (point?: { x: number; y: number }) => void; slotRef: (node: ViewHandle | null) => void; drag?: ToolDrag }) {
  const { color, shape } = useTheme();
  const format = useInputFormat();
  const point = drag?.point;
  const dragActive = useRef(false);
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(release.current), []);
  const start = (id: ToolId) => {
    clearTimeout(release.current);
    dragActive.current = true;
    drag?.start(id);
  };
  const end = (id: ToolId, x: number, y: number, cancelled: boolean) => {
    drag?.end(id, x, y, cancelled);
    // The gesture and the underlying Pressable can both receive the same release.
    release.current = setTimeout(() => { dragActive.current = false; }, 120);
  };
  const lift = usePanGesture({
    enabled: Boolean(drag),
    mouseButton: MouseButton.LEFT,
    maxPointers: 1,
    // Lift a tool up from its row. A horizontal touch gesture remains available to scroll the row.
    activeOffsetY: -8,
    failOffsetX: format === "touch" ? [-16, 16] : undefined,
    onActivate: (event) => {
      "worklet";
      if (point) point.value = { x: event.absoluteX, y: event.absoluteY };
      scheduleOnRN(start, tool);
    },
    onUpdate: (event) => { "worklet"; if (point) point.value = { x: event.absoluteX, y: event.absoluteY }; },
    onDeactivate: (event) => { "worklet"; scheduleOnRN(end, tool, event.absoluteX, event.absoluteY, event.canceled); },
  });
  const label = `${TOOLS[tool].label}${count ? `, ${count} open` : ""}`;
  const web = Platform.OS === "web" ? { onContextMenu: (event: { preventDefault(): void; clientX: number; clientY: number }) => { event.preventDefault(); onMenu({ x: event.clientX, y: event.clientY }); } } : {};
  return (
    <GestureDetector gesture={lift} touchAction={drag ? "pan-x" : "auto"} userSelect="none">
    <View ref={slotRef} collapsable={false} {...web as object}>
      <Tooltip text={TOOLS[tool].label}>
        {(tooltip) => (
          <Press {...tooltip} testID={`dock-${tool}`} label={label} hint={drag ? "Press to open, or drag up to place on the canvas" : undefined} selected={focused} radius={shape.radius.md} height={height} onPress={() => { if (!dragActive.current) onPress(); }} onLongPress={() => { if (!dragActive.current) onMenu(); }} delayLongPress={380} bodyStyle={{ width, height, alignItems: "center", justifyContent: "center" }}>
            <Icon name={TOOL_ICONS[tool]} size={22} active={focused} color={count ? color.ink : color.inkSoft} />
            <View aria-hidden style={{ position: "absolute", bottom: 5, flexDirection: "row", gap: 3 }}>
              {focused ? null : Array.from({ length: Math.min(count, PIPS) }, (_, index) => <View key={index} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: index < active ? color.inkSoft : "transparent", borderWidth: 1, borderColor: color.inkSoft }} />)}
            </View>
          </Press>
        )}
      </Tooltip>
    </View>
    </GestureDetector>
  );
}

export const CommandCenter = memo(function CommandCenter({ state, height, drag }: { state: WorkspaceState; height: number; drag?: ToolDrag }) {
  const { color, motion, shape, space, surface } = useTheme();
  const format = useInputFormat();
  const { width } = useWindowDimensions();
  const compact = useWindowClass().size === "compact";
  const model = useWorkspaceModel();
  const notice = useNotice();
  const anchors = useRef(new Map<ToolId, ViewHandle>());
  const zoomAnchor = useRef<ViewHandle>(null);
  const [menu, setMenu] = useState<{ tool: ToolId; point?: { x: number; y: number } } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const layoutAnchor = useRef<ViewHandle>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const slotWidth = format === "touch" ? 48 : 44;
  const focusedTool = state.windows.find((item) => item.id === state.focused)?.tool ?? null;
  const zoomLabel = `${Math.round(state.camera.zoom * 100)}%`;
  const roomy = width >= 760;

  const open = (tool: ToolId) => { if (!model.open(tool)) notice("The Workspace is full. Close a window first."); };
  const press = (tool: ToolId) => {
    const instances = windowsOf(state, tool);
    if (!instances.length) open(tool);
    else if (instances.length === 1) model.restore(instances[0].id);
    else setMenu({ tool });
  };

  const items = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const { tool } = menu;
    const instances = windowsOf(state, tool);
    const list: MenuItem[] = instances.map((item) => ({ key: item.id, label: windowTitle(state, item), detail: item.minimized ? "Minimized" : undefined, selected: item.id === state.focused, onSelect: () => model.restore(item.id) }));
    if (TOOLS[tool].multiple || !instances.length) list.push({ key: "new", label: TOOLS[tool].multiple && instances.length ? "New window" : `Open ${TOOLS[tool].label}`, icon: "plus", onSelect: () => open(tool) });
    if (instances.length) list.push({ key: "close", label: instances.length > 1 ? "Close all" : "Close", icon: "close", destructive: true, onSelect: () => instances.forEach((item) => model.close(item.id)) });
    return list;
  }, [menu, state, model]);

  const zoomItems: MenuItem[] = [
    { key: "in", label: "Zoom in", icon: "plus", disabled: state.camera.zoom >= ZOOM.max, onSelect: () => model.zoomBy(ZOOM.step) },
    { key: "out", label: "Zoom out", icon: "minus", disabled: state.camera.zoom <= ZOOM.min, onSelect: () => model.zoomBy(1 / ZOOM.step) },
    { key: "actual", label: "Actual size", detail: "100%", onSelect: () => model.zoomTo(1) },
    { key: "fit", label: "Fit Workspace", icon: "expand", onSelect: () => model.fit() },
    { key: "reset", label: "Reset View", icon: "reset", onSelect: () => model.resetView() },
  ];

  const [naming, setNaming] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const layoutItems: MenuItem[] = [
    ...WORKSPACE_LAYOUTS.map((layout) => ({
      key: layout,
      label: LAYOUT_LABELS[layout],
      detail: compact && layout !== "free" ? "Available in a wider window" : layout === "free" && state.saved ? "Restore your previous arrangement" : LAYOUT_DETAILS[layout],
      disabled: compact && layout !== "free" || (layout === "fill" && !state.windows.some((window) => !window.minimized)),
      icon: LAYOUT_ICONS[layout],
      selected: state.layout === layout,
      onSelect: () => model.setLayout(layout),
    })),
    // Arrangements kept by name: each reopens its windows on the same documents.
    ...state.layouts.map((layout) => ({ key: `saved-${layout.id}`, label: layout.name, detail: `${layout.windows.length} ${layout.windows.length === 1 ? "window" : "windows"}`, icon: "layers" as IconName, onSelect: () => model.applySavedLayout(layout.id) })),
    ...(state.windows.length ? [{ key: "save", label: "Save this layout", icon: "bookmark" as IconName, onSelect: () => setNaming("") }] : []),
    ...(state.layouts.length ? [{ key: "forget", label: "Remove a saved layout", icon: "trash" as IconName, onSelect: () => setForgetting(true) }] : []),
  ];
  const saveNamed = () => { const name = naming?.trim(); setNaming(null); if (name) { model.saveLayout(name); notice(`Saved as ${name}`); } };

  const focusIndex = focusedTool ? LAUNCHER_TOOLS.indexOf(focusedTool) : -1;
  const toolStrip = useRef<ComponentRef<typeof ScrollView>>(null);
  const stripOffset = useRef(0);
  const [stripWidth, setStripWidth] = useState(0);
  useEffect(() => {
    if (focusIndex < 0 || !stripWidth) return;
    const start = focusIndex * slotWidth;
    const end = start + slotWidth;
    const offset = stripOffset.current;
    if (start < offset) toolStrip.current?.scrollTo({ x: start, animated: false });
    else if (end > offset + stripWidth) toolStrip.current?.scrollTo({ x: end - stripWidth, animated: false });
  }, [focusIndex, slotWidth, stripWidth]);
  const { boxShadow, ...plate } = surface("float", "lg");
  // The shadow is a still layer that arrives once the Space has stopped moving. Drawn during the entrance, the GPU keeps a copy of
  // it for each frame: about 40 MB an entrance on the tablet, up to its 135 MB cap, and it never gives them back.
  const [shadowed, setShadowed] = useState(false);
  const shadow = useSharedValue(0);
  useEffect(() => {
    const timer = setTimeout(() => { setShadowed(true); shadow.value = fade(1, motion, "base"); }, SHADOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [motion, shadow]);
  const still = useAnimatedStyle(() => ({ opacity: shadow.value }));

  return (
    <View style={{ maxWidth: "100%", height }}>
      {shadowed && boxShadow ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: plate.borderRadius, boxShadow }, still]} /> : null}
      <View role="toolbar" aria-label="Command Center" testID="workspace-dock" style={[plate, { flexDirection: "row", alignItems: "center", height, paddingHorizontal: space.xs, gap: space.xs }]}>
      <ScrollView ref={toolStrip} testID="dock-tool-strip" keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={stripWidth < LAUNCHER_TOOLS.length * slotWidth} overScrollMode="never"
        onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)} onScroll={(event) => { stripOffset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={32}
        style={{ flexShrink: 1 }} contentContainerStyle={{ flexDirection: "row" }}>
        {LAUNCHER_TOOLS.map((tool) => {
          const instances = windowsOf(state, tool);
          return <ToolSlot key={tool} tool={tool} drag={drag} width={slotWidth} height={height - space.xs * 2} count={instances.length} active={instances.filter((item) => !item.minimized).length} focused={focusedTool === tool} onPress={() => press(tool)} onMenu={(point) => setMenu({ tool, point })} slotRef={(node) => { if (node) anchors.current.set(tool, node); }} />;
        })}
        <TravellingMarker x={Math.max(0, focusIndex) * slotWidth + slotWidth * 0.3} width={slotWidth * 0.4} baseline={space.xs + 3} visible={focusIndex >= 0} />
      </ScrollView>
      <Divider vertical style={{ height: height * 0.5, alignSelf: "center" }} />
      <View ref={layoutAnchor} collapsable={false}>
        {roomy ? (
          <Button title={LAYOUT_LABELS[state.layout]} icon={LAYOUT_ICONS[state.layout]} trailingIcon="chevronDown" variant="ghost" size="small" testID="dock-layout" expanded={layoutOpen} onPress={() => setLayoutOpen(true)} />
        ) : (
          <Tooltip text={`Layout: ${LAYOUT_LABELS[state.layout]}`}>
            {(tooltip) => <IconButton {...tooltip} icon={LAYOUT_ICONS[state.layout]} size="small" bare label={`Layout: ${LAYOUT_LABELS[state.layout]}`} testID="dock-layout" expanded={layoutOpen} active={state.layout !== "free"} onPress={() => setLayoutOpen(true)} />}
          </Tooltip>
        )}
      </View>
      {/* A tooltip's anchor sits at the start of its line, so it is wrapped, as Layout is, to centre with the row. */}
      <View>
        <Tooltip text="Windows: open several, close or clear">
          {(tooltip) => <IconButton {...tooltip} icon="layers" size="small" bare label="Windows" testID="dock-windows" onPress={() => setManaging(true)} />}
        </Tooltip>
      </View>
      {roomy && state.layout === "free" ? <IconButton icon="expand" size="small" bare label="Fit Workspace" testID="canvas-fit" style={{ alignSelf: "center" }} onPress={() => model.fit()} /> : null}
      {roomy && state.layout === "free" ? <IconButton icon="reset" size="small" bare label="Reset View" testID="canvas-reset" style={{ alignSelf: "center" }} onPress={() => model.resetView()} /> : null}
      {!compact && state.layout === "free" ? <View ref={zoomAnchor} collapsable={false}>
        <Press testID="canvas-zoom" label={`Zoom ${zoomLabel}`} expanded={zoomOpen} radius={shape.radius.md} height={36} onPress={() => setZoomOpen(true)} bodyStyle={{ height: 36, minWidth: 52, paddingHorizontal: space.sm, alignItems: "center", justifyContent: "center" }}>
          <Text variant="micro" tone="soft" style={{ color: color.inkSoft }}>{zoomLabel}</Text>
        </Press>
      </View> : null}
      <Menu open={layoutOpen} anchor={layoutAnchor as RefObject<ViewHandle | null>} onClose={() => setLayoutOpen(false)} items={layoutItems} label="Layout" side="top" />
      <WindowsSheet open={managing} onClose={() => setManaging(false)} state={state} model={model} />
      <Dialog open={naming !== null} onClose={() => setNaming(null)} title="Save this layout" message="Its windows reopen on the same notes, PDFs and boards." actions={[{ label: "Cancel", onPress: () => setNaming(null) }, { label: "Save", variant: "emphasis", onPress: saveNamed }]}>
        <TextField label="Name" hideLabel autoFocus placeholder="Revision desk" value={naming ?? ""} onChangeText={setNaming} onSubmitEditing={saveNamed} maxLength={40} />
      </Dialog>
      <Menu open={forgetting} anchor={layoutAnchor as RefObject<ViewHandle | null>} onClose={() => setForgetting(false)} label="Remove a saved layout" side="top"
        items={state.layouts.map((layout) => ({ key: layout.id, label: layout.name, icon: "trash" as IconName, destructive: true, onSelect: () => { model.deleteSavedLayout(layout.id); notice(`Removed ${layout.name}`); } }))} />
      <Menu open={zoomOpen} anchor={zoomAnchor as RefObject<ViewHandle | null>} onClose={() => setZoomOpen(false)} items={zoomItems} label="Canvas view" side="top" />
      <Menu open={!!menu} anchor={{ current: menu ? anchors.current.get(menu.tool) ?? null : null }} onClose={() => setMenu(null)} items={items} label={menu ? TOOLS[menu.tool].label : "Tool"} side="top" point={menu?.point} />
      </View>
    </View>
  );
});
