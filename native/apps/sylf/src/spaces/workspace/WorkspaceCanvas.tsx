// The canvas: the grid, the world and every gesture that moves the camera. A drag on empty canvas pans, with one finger, the
// mouse or a pen. A pinch zooms the canvas from anywhere: the second finger takes over from whatever the first one started,
// wherever each landed. The exception is two fingers on a tool that zooms its own content, such as Notes, where the pinch is the
// tool's and the canvas stays still. Windows live in one world layer, so the camera is one transform on one view: nothing is laid
// out while it moves, however many windows are open.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { GestureDetector, GestureStateManager, MouseButton, usePanGesture, usePinchGesture } from "react-native-gesture-handler";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDecay, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme, type ViewHandle } from "@sylf/design-system";
import { WORLD, clampCamera, clampZoom, pinchOwner, zoomAt, type Camera, type PinchRegion, type Size } from "@sylf/spaces";
import { useCanvasWheel } from "./canvas-input";
import { DotGrid } from "./DotGrid";
import type { CameraValues } from "./useCamera";

/** Larger than any view at the lowest zoom, so nothing past the world's edge ever shows dots. */
const BEYOND = 6000;
// `clip` also stops the browser scrolling this view to reveal focus, which would move the canvas without moving the camera.
const webStage = Platform.select<ViewStyle>({ web: { overflow: "clip", cursor: "grab" } as unknown as ViewStyle, default: { overflow: "hidden" } });

/** What a window's own gestures need so they can give way to a pinch: the gesture itself, and whether two fingers are down. */
export interface CanvasPinch { gesture: ReturnType<typeof usePinchGesture>; pinched: SharedValue<boolean> }
const PinchContext = createContext<CanvasPinch | null>(null);
export function useCanvasPinch() {
  const pinch = useContext(PinchContext);
  if (!pinch) throw new Error("useCanvasPinch needs WorkspaceCanvas");
  return pinch;
}

function WorldEdge() {
  const { color } = useTheme();
  const { width, height } = WORLD;
  const beyond = { position: "absolute" as const, backgroundColor: color.ground };
  return (
    <>
      <View pointerEvents="none" style={[beyond, { left: -BEYOND, top: -BEYOND, width: width + BEYOND * 2, height: BEYOND }]} />
      <View pointerEvents="none" style={[beyond, { left: -BEYOND, top: height, width: width + BEYOND * 2, height: BEYOND }]} />
      <View pointerEvents="none" style={[beyond, { left: -BEYOND, top: 0, width: BEYOND, height }]} />
      <View pointerEvents="none" style={[beyond, { left: width, top: 0, width: BEYOND, height }]} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width, height, borderWidth: 1, borderColor: color.line }} />
    </>
  );
}

export function WorkspaceCanvas({ camera, viewport, regions, stacked, hand, commit, stop, onViewport, children, overlay }: {
  camera: CameraValues;
  viewport: Size | null;
  regions: PinchRegion[];
  /** One tool at a time: the canvas stands still and windows are placed in screen points. */
  stacked: boolean;
  /** The Space bar is held: a drag anywhere moves the canvas, even over a window. */
  hand: boolean;
  commit: (camera: Camera) => void;
  stop: () => void;
  onViewport: (size: Size) => void;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const { color, motion } = useTheme();
  const stage = useRef<ViewHandle>(null);
  const { x, y, zoom, width, height } = camera;
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const coasting = useSharedValue(false);
  const pinched = useSharedValue(false);
  const held = useSharedValue(false);
  const ceded = useSharedValue(false);
  const windows = useSharedValue(regions);
  const glides = motion.amount > 0;

  useEffect(() => { windows.value = regions; }, [windows, regions]);

  const place = useCallback((next: Camera) => {
    "worklet";
    const held = clampCamera(next, { width: width.value, height: height.value });
    x.value = held.x;
    y.value = held.y;
    zoom.value = held.zoom;
  }, [x, y, zoom, width, height]);

  const panConfig = {
    enabled: !stacked,
    maxPointers: 1,
    minDistance: 3,
    mouseButton: MouseButton.LEFT | MouseButton.MIDDLE,
    onBegin: () => {
      "worklet";
      if (coasting.value) { cancelAnimation(x); cancelAnimation(y); coasting.value = false; scheduleOnRN(commit, { x: x.value, y: y.value, zoom: zoom.value }); }
      cancelAnimation(zoom);
      startX.value = x.value;
      startY.value = y.value;
      held.value = false;
    },
    onUpdate: (event) => {
      "worklet";
      // A finger left down after a pinch carries on from where the pinch put the camera.
      if (pinched.value) { held.value = true; return; }
      if (held.value) {
        held.value = false;
        startX.value = x.value + event.translationX / zoom.value;
        startY.value = y.value + event.translationY / zoom.value;
      }
      place({ x: startX.value - event.translationX / zoom.value, y: startY.value - event.translationY / zoom.value, zoom: zoom.value });
    },
    onDeactivate: (event) => {
      "worklet";
      if (pinched.value) return;
      const resting = clampCamera({ x: x.value, y: y.value, zoom: zoom.value }, { width: width.value, height: height.value });
      const speed = Math.hypot(event.velocityX, event.velocityY);
      if (!glides || event.canceled || held.value || speed < 240) { scheduleOnRN(commit, resting); return; }
      // The camera coasts to a stop inside the same bounds the drag respected.
      const atRest = (finished?: boolean) => {
        "worklet";
        if (finished) { coasting.value = false; scheduleOnRN(commit, { x: x.value, y: y.value, zoom: zoom.value }); }
      };
      const bounds = { low: clampCamera({ x: -1e6, y: -1e6, zoom: zoom.value }, { width: width.value, height: height.value }), high: clampCamera({ x: 1e6, y: 1e6, zoom: zoom.value }, { width: width.value, height: height.value }) };
      coasting.value = true;
      x.value = withDecay({ velocity: -event.velocityX / zoom.value, deceleration: 0.996, clamp: [bounds.low.x, Math.max(bounds.low.x + 0.001, bounds.high.x)] });
      y.value = withDecay({ velocity: -event.velocityY / zoom.value, deceleration: 0.996, clamp: [bounds.low.y, Math.max(bounds.low.y + 0.001, bounds.high.y)] }, atRest);
    },
  } satisfies Parameters<typeof usePanGesture>[0];
  const pan = usePanGesture(panConfig);
  const handPan = usePanGesture(panConfig);

  const pinch = usePinchGesture({
    enabled: !stacked,
    simultaneousWith: [pan, handPan],
    onTouchesDown: (event) => {
      "worklet";
      if (event.numberOfTouches < 2 || pinched.value) return;
      const scale = zoom.value;
      const [first, second] = event.allTouches.map((touch) => ({ x: x.value + (touch.x - width.value / 2) / scale, y: y.value + (touch.y - height.value / 2) / scale }));
      // On the web this arrives before the gesture has begun, too early to fail it, so the gesture also checks `ceded` itself.
      ceded.value = !!pinchOwner(windows.value, first, second);
      if (ceded.value) GestureStateManager.fail(event.handlerTag);
      else pinched.value = true;
    },
    onTouchesUp: (event) => {
      "worklet";
      const lifted = event.changedTouches.map((touch) => touch.id);
      if (event.allTouches.filter((touch) => !lifted.includes(touch.id)).length < 2) pinched.value = false;
    },
    onTouchesCancel: () => { "worklet"; pinched.value = false; },
    onFinalize: () => { "worklet"; pinched.value = false; },
    onActivate: (event) => {
      "worklet";
      if (ceded.value) return;
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(zoom);
      coasting.value = false;
      startX.value = x.value;
      startY.value = y.value;
      startZoom.value = zoom.value;
      focalX.value = event.focalX;
      focalY.value = event.focalY;
      lastX.value = event.focalX;
      lastY.value = event.focalY;
    },
    onUpdate: (event) => {
      "worklet";
      // The update as a finger lifts reports the other finger as the focal point, half the fingers' spread from where it was.
      if (ceded.value || event.numberOfPointers < 2 || (event.scaleChange === 1 && Math.hypot(event.focalX - lastX.value, event.focalY - lastY.value) > 12)) return;
      lastX.value = event.focalX;
      lastY.value = event.focalY;
      const next = clampZoom(startZoom.value * event.scale);
      const halfWidth = width.value / 2;
      const halfHeight = height.value / 2;
      const worldX = startX.value + (focalX.value - halfWidth) / startZoom.value;
      const worldY = startY.value + (focalY.value - halfHeight) / startZoom.value;
      place({ x: worldX - (event.focalX - halfWidth) / next, y: worldY - (event.focalY - halfHeight) / next, zoom: next });
    },
    onDeactivate: () => { "worklet"; scheduleOnRN(commit, { x: x.value, y: y.value, zoom: zoom.value }); },
  });

  useCanvasWheel(stage, {
    pan(dx, dy) { if (stacked) return; stop(); place({ x: x.value + dx / zoom.value, y: y.value + dy / zoom.value, zoom: zoom.value }); },
    zoom(factor, focusX, focusY) {
      if (stacked) return;
      stop();
      const viewportNow = { width: width.value, height: height.value };
      place(zoomAt({ x: x.value, y: y.value, zoom: zoom.value }, zoom.value * factor, { x: focusX, y: focusY }, viewportNow));
    },
    end() { if (!stacked) commit({ x: x.value, y: y.value, zoom: zoom.value }); },
  });

  const canvasPinch = useMemo(() => ({ gesture: pinch, pinched }), [pinch, pinched]);

  const world = useAnimatedStyle(() => {
    const scale = zoom.value;
    if (stacked) return { transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    return { transform: [{ translateX: width.value / 2 - x.value * scale + (WORLD.width * (scale - 1)) / 2 }, { translateY: height.value / 2 - y.value * scale + (WORLD.height * (scale - 1)) / 2 }, { scale }] };
  });

  const onLayout = (event: LayoutChangeEvent) => { const { width: w, height: h } = event.nativeEvent.layout; onViewport({ width: w, height: h }); };

  return (
    <GestureDetector gesture={pinch} touchAction="auto" userSelect="auto">
      <View ref={stage} testID="workspace-canvas" collapsable={false} onLayout={onLayout} style={[{ flex: 1, backgroundColor: color.ground }, webStage]}>
        <GestureDetector gesture={pan}>
          <View testID="workspace-surface" accessible={false} style={StyleSheet.absoluteFill}>
            {viewport && !stacked ? <DotGrid camera={camera} viewport={viewport} /> : null}
          </View>
        </GestureDetector>
        <Animated.View pointerEvents="box-none" style={[{ position: "absolute", left: 0, top: 0, width: WORLD.width, height: WORLD.height }, world]}>
          {stacked ? null : <WorldEdge />}
          <PinchContext.Provider value={canvasPinch}>{children}</PinchContext.Provider>
        </Animated.View>
        {hand ? (
          <GestureDetector gesture={handPan}>
            <View testID="workspace-hand" style={[StyleSheet.absoluteFill, Platform.select<ViewStyle>({ web: { cursor: "grabbing" } as unknown as ViewStyle, default: {} })]} />
          </GestureDetector>
        ) : null}
        {overlay}
      </View>
    </GestureDetector>
  );
}

