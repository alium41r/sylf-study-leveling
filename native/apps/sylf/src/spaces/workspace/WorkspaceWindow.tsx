// One window. Its frame is cheap and always here, and everything that moves it runs on the UI thread, so dragging renders nothing
// in React until the drop. Position and size live in shared values that follow the model. The shadow is a still layer of its
// own at the size the model last agreed: a blurred shadow on anything that changes size is redrawn at every size and the GPU keeps
// each one (Phase 5), so it steps aside while the window resizes and comes back at the end.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { GestureDetector, MouseButton, usePanGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Badge, Corners, FocusRing, Icon, IconButton, Marker, Text, fade, getInputMode, move, useInputFormat, useInputMode, useTheme } from "@sylf/design-system";
import { GRID, TOOLS, WORLD, clamp, type Rect, type ToolLifecycle, type WorkspaceWindow as WindowRecord } from "@sylf/spaces";
import { useWorkspaceModel } from "../../shell/context";
import { TOOL_ICONS } from "./icons";
import { ToolHost } from "./ToolHost";
import { useCanvasPinch } from "./WorkspaceCanvas";

export interface WindowViewProps {
  window: WindowRecord;
  title: string;
  focused: boolean;
  lifecycle: ToolLifecycle;
  sample: boolean;
  fresh: boolean;
  fillOrder: number;
  overview: boolean;
  /** One tool at a time in a compact window: the rectangle it fills, or null on the canvas. */
  stacked: Rect | null;
  zoom: SharedValue<number>;
  onProvenance: (id: string, sample: boolean) => void;
}

interface LiveRect { x: SharedValue<number>; y: SharedValue<number>; width: SharedValue<number>; height: SharedValue<number> }

const BAR = 40;
const webOnly = (style: object) => Platform.select<ViewStyle>({ web: style as ViewStyle, default: {} });
const hiddenOnWeb = webOnly({ visibility: "hidden" });
const HANDLES = [
  { id: "n", dx: 0, dy: -1, cursor: "ns-resize" }, { id: "s", dx: 0, dy: 1, cursor: "ns-resize" }, { id: "w", dx: -1, dy: 0, cursor: "ew-resize" }, { id: "e", dx: 1, dy: 0, cursor: "ew-resize" },
  { id: "nw", dx: -1, dy: -1, cursor: "nwse-resize" }, { id: "se", dx: 1, dy: 1, cursor: "nwse-resize" }, { id: "ne", dx: 1, dy: -1, cursor: "nesw-resize" }, { id: "sw", dx: -1, dy: 1, cursor: "nesw-resize" },
] as const;

function ResizeHandle({ handle, rect, zoom, size, limits, onStart, onEnd }: { handle: (typeof HANDLES)[number]; rect: LiveRect; zoom: SharedValue<number>; size: number; limits: typeof TOOLS.notes; onStart: () => void; onEnd: (rect: Rect) => void }) {
  const { dx, dy } = handle;
  const start = useSharedValue({ x: 0, y: 0, width: 0, height: 0 });
  const origin = useSharedValue({ x: 0, y: 0 });
  const { min, max } = limits;
  const pinch = useCanvasPinch();
  const halted = useSharedValue(false);
  const pan = usePanGesture({
    maxPointers: 1,
    minDistance: 1,
    mouseButton: MouseButton.LEFT,
    simultaneousWith: pinch.gesture,
    onActivate: (event) => {
      "worklet";
      halted.value = false;
      start.value = { x: rect.x.value, y: rect.y.value, width: rect.width.value, height: rect.height.value };
      origin.value = { x: event.absoluteX, y: event.absoluteY };
      scheduleOnRN(onStart);
    },
    onUpdate: (event) => {
      "worklet";
      if (pinch.pinched.value) halted.value = true;
      if (halted.value) return;
      const from = start.value;
      if (dx) {
        const reach = dx > 0 ? WORLD.width - from.x : from.x + from.width;
        const width = clamp(from.width + (dx * (event.absoluteX - origin.value.x)) / zoom.value, min.width, Math.min(max.width, reach));
        rect.width.value = width;
        if (dx < 0) rect.x.value = from.x + from.width - width;
      }
      if (dy) {
        const reach = dy > 0 ? WORLD.height - from.y : from.y + from.height;
        const height = clamp(from.height + (dy * (event.absoluteY - origin.value.y)) / zoom.value, min.height, Math.min(max.height, reach));
        rect.height.value = height;
        if (dy < 0) rect.y.value = from.y + from.height - height;
      }
    },
    onDeactivate: () => { "worklet"; scheduleOnRN(onEnd, { x: rect.x.value, y: rect.y.value, width: rect.width.value, height: rect.height.value }); },
  });
  const edge = -size / 2;
  const place: ViewStyle = {
    position: "absolute",
    ...(dx === 0 ? { left: size, right: size } : dx < 0 ? { left: edge, width: size } : { right: edge, width: size }),
    ...(dy === 0 ? { top: size, bottom: size } : dy < 0 ? { top: edge, height: size } : { bottom: edge, height: size }),
  };
  return (
    <GestureDetector gesture={pan}>
      <View testID={`resize-${handle.id}`} aria-hidden style={[place, webOnly({ cursor: handle.cursor, touchAction: "none" })]} />
    </GestureDetector>
  );
}

export const WindowView = memo(function WindowView({ window, title, focused, lifecycle, sample, fresh, fillOrder, overview, stacked, zoom, onProvenance }: WindowViewProps) {
  const { color, motion, shape, space, surface } = useTheme();
  const format = useInputFormat();
  const inputMode = useInputMode();
  const model = useWorkspaceModel();
  const [barFocused, setBarFocused] = useState(false);
  const { id, tool, z, minimized } = window;
  const hidden = minimized || (!!stacked && !focused);
  const placed = stacked ?? window;
  const spec = TOOLS[tool];

  const x = useSharedValue(placed.x);
  const y = useSharedValue(placed.y);
  const width = useSharedValue(placed.width);
  const height = useSharedValue(placed.height);
  const presence = useSharedValue(fresh || hidden ? 0 : 1);
  const lifted = useSharedValue(0);
  const shadow = useSharedValue(fresh || hidden ? 0 : 1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const rest = useRef<Rect>({ x: placed.x, y: placed.y, width: placed.width, height: placed.height });
  const live = useRef<LiveRect>({ x, y, width, height }).current;
  const shadowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [gone, setGone] = useState(hidden);

  const showShadow = useCallback(() => {
    clearTimeout(shadowTimer.current);
    shadowTimer.current = setTimeout(() => { shadow.value = fade(1, motion, "base"); }, 240);
  }, [motion, shadow]);
  const hideShadow = useCallback(() => { clearTimeout(shadowTimer.current); shadow.value = 0; }, [shadow]);
  useEffect(() => () => clearTimeout(shadowTimer.current), []);

  // The model is the truth at rest. Anything it changes that this window did not just do itself is animated to.
  const settle = useCallback((next: Rect, kind: "settle" | "glide" = "settle") => {
    const resized = next.width !== rest.current.width || next.height !== rest.current.height;
    rest.current = { x: next.x, y: next.y, width: next.width, height: next.height };
    x.value = move(next.x, motion, kind);
    y.value = move(next.y, motion, kind);
    if (resized) hideShadow();
    width.value = move(next.width, motion, kind);
    height.value = move(next.height, motion, kind);
    if (resized) showShadow();
  }, [hideShadow, height, motion, showShadow, width, x, y]);

  useEffect(() => {
    const { x: nx, y: ny, width: nw, height: nh } = placed;
    const held = rest.current;
    if (held.x !== nx || held.y !== ny || held.width !== nw || held.height !== nh) settle({ x: nx, y: ny, width: nw, height: nh }, "glide");
  }, [placed, settle]);

  useEffect(() => {
    if (hidden) {
      presence.value = move(0, motion, "settle");
      shadow.value = 0;
      const timer = setTimeout(() => setGone(true), motion.fade.base + 80);
      return () => clearTimeout(timer);
    }
    setGone(false);
    presence.value = move(1, motion, "lift");
    showShadow();
  }, [hidden, motion, presence, shadow, showShadow]);

  const focus = useCallback(() => model.focus(id), [model, id]);
  const drop = useCallback((nextX: number, nextY: number) => {
    model.move(id, nextX, nextY);
    const window = model.state().windows.find((item) => item.id === id);
    if (window) settle(window);
  }, [model, id, settle]);
  const resized = useCallback((next: Rect) => {
    model.resize(id, next);
    const window = model.state().windows.find((item) => item.id === id);
    if (window) { hideShadow(); rest.current = { ...rest.current, width: -1 }; settle(window); }
  }, [model, id, settle, hideShadow]);
  const frame = useCallback(() => model.frameWindow(id), [model, id]);

  const movable = !stacked;
  const pinch = useCanvasPinch();
  const halted = useSharedValue(false);
  const drag = usePanGesture({
    enabled: movable,
    maxPointers: 1,
    minDistance: 2,
    mouseButton: MouseButton.LEFT,
    simultaneousWith: pinch.gesture,
    onBegin: () => { "worklet"; scheduleOnRN(focus); },
    onActivate: (event) => {
      "worklet";
      startX.value = x.value;
      startY.value = y.value;
      originX.value = event.absoluteX;
      originY.value = event.absoluteY;
      lifted.value = move(1, motion);
      halted.value = false;
    },
    onUpdate: (event) => {
      "worklet";
      // A pinch took over, so the window stays where it is and lands there.
      if (pinch.pinched.value) halted.value = true;
      if (halted.value) return;
      x.value = clamp(startX.value + (event.absoluteX - originX.value) / zoom.value, 0, WORLD.width - width.value);
      y.value = clamp(startY.value + (event.absoluteY - originY.value) / zoom.value, 0, WORLD.height - height.value);
    },
    onDeactivate: () => { "worklet"; lifted.value = move(0, motion); scheduleOnRN(drop, x.value, y.value); },
  });
  const doubleTap = useTapGesture({ enabled: movable, numberOfTaps: 2, onDeactivate: (event) => { "worklet"; if (!event.canceled) scheduleOnRN(frame); } });
  const bar = useSimultaneousGestures(drag, doubleTap);

  const lift = 0.012 * motion.amount;
  const enter = 1 - (1 - motion.enterScale) * motion.amount;
  const frameStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: height.value,
    opacity: Math.min(1, presence.value * 1.6),
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: (enter + (1 - enter) * presence.value) * (1 + lifted.value * lift) }],
  }));
  const still = useAnimatedStyle(() => ({ opacity: shadow.value }));

  const nudge = (dx: number, dy: number, resize: boolean) => {
    const current = rest.current;
    if (resize) model.resize(id, { ...current, width: current.width + dx * GRID, height: current.height + dy * GRID });
    else model.move(id, current.x + dx * GRID, current.y + dy * GRID);
  };
  const onKeyDown = (event: { key: string; shiftKey: boolean; preventDefault(): void }) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    nudge(step[0], step[1], event.shiftKey);
  };
  const onAction = (name: string) => {
    if (name === "minimize") model.minimize(id);
    else if (name === "frame") model.frameWindow(id);
    else nudge(name === "moveLeft" ? -2 : name === "moveRight" ? 2 : 0, name === "moveUp" ? -2 : name === "moveDown" ? 2 : 0, false);
  };

  const { boxShadow, ...flat } = surface("float", "lg") as ReturnType<typeof surface> & { boxShadow?: string };
  const handleSize = format === "touch" ? 28 : 14;
  return (
    <Animated.View
      testID={`workspace-window-${id}`}
      role="group"
      aria-label={title}
      aria-hidden={hidden || undefined}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
      pointerEvents={hidden ? "none" : "box-none"}
      onStartShouldSetResponderCapture={() => { focus(); return false; }}
      {...(Platform.OS === "web" ? { onFocus: () => { if (getInputMode() === "keyboard") { focus(); model.reveal(id); } } } as object : {})}
      style={[{ position: "absolute", left: 0, top: 0, zIndex: stacked ? 1 : z }, gone ? hiddenOnWeb : null, frameStyle]}
    >
      {boxShadow ? <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: window.width, height: window.height, borderRadius: shape.radius.lg, boxShadow }, still]} /> : null}
      <View style={[StyleSheet.absoluteFill, flat, { overflow: "hidden" }, webOnly({ cursor: "default" })]}>
        <View style={{ height: BAR, flexDirection: "row", alignItems: "center", paddingRight: space.xs, borderBottomWidth: 1, borderBottomColor: color.line }}>
          <GestureDetector gesture={bar} userSelect="none">
            <View
              testID={`window-bar-${id}`}
              accessible
              role="button"
              aria-label={`${title}. Move with the arrow keys, resize with Shift and the arrow keys.`}
              accessibilityActions={[{ name: "moveLeft", label: "Move left" }, { name: "moveRight", label: "Move right" }, { name: "moveUp", label: "Move up" }, { name: "moveDown", label: "Move down" }, { name: "frame", label: "Fill the view" }, { name: "minimize", label: "Minimize" }]}
              onAccessibilityAction={(event) => onAction(event.nativeEvent.actionName)}
              {...(Platform.OS === "web" ? { tabIndex: 0, onKeyDown, onFocus: () => setBarFocused(true), onBlur: () => setBarFocused(false) } as object : {})}
              style={[{ flex: 1, minWidth: 0, height: BAR, flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: space.md }, webOnly({ cursor: movable ? "grab" : "default", outlineStyle: "none", touchAction: "none" })]}
            >
              {focused ? <Marker /> : null}
              <Icon name={TOOL_ICONS[tool]} size={16} color={focused ? color.ink : color.inkSoft} />
              <Text variant="small" tone={focused ? "ink" : "soft"} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Text>
              {sample ? <View aria-label="Sample data. Nothing in this window is real yet."><Badge label="Sample" /></View> : null}
              {barFocused && inputMode === "keyboard" ? <FocusRing radius={shape.radius.sm} inset={2} /> : null}
            </View>
          </GestureDetector>
          <IconButton icon="minus" size="small" bare label={`Minimize ${title}`} testID={`window-minimize-${id}`} style={{ alignSelf: "center" }} onPress={() => model.minimize(id)} />
          <IconButton icon="close" size="small" bare label={`Close ${title}`} testID={`window-close-${id}`} style={{ alignSelf: "center" }} onPress={() => model.close(id)} />
        </View>
        <ToolHost window={window} lifecycle={lifecycle} title={title} fillOrder={fillOrder} overview={overview} onProvenance={onProvenance} />
      </View>
      <Corners behind={color.ground} />
      {focused && movable && !overview && format === "touch" ? <View pointerEvents="none" aria-hidden style={{ position: "absolute", right: 3, bottom: 3 }}><Icon name="grip" size={12} color={color.inkFaint} /></View> : null}
      {focused && movable && !overview ? HANDLES.map((handle) => <ResizeHandle key={handle.id} handle={handle} rect={live} zoom={zoom} size={handleSize} limits={spec} onStart={hideShadow} onEnd={resized} />) : null}
    </Animated.View>
  );
});
