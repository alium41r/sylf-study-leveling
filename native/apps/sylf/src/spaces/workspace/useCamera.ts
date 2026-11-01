// The camera while it moves. These shared values follow fingers on the UI thread, so panning and zooming render nothing in
// React. The model holds the camera at rest: a gesture writes to it when it ends, and a change from the model (Fit, a preset, a
// restored window) animates these values to match. That one rule is why the two can never disagree for long.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cancelAnimation, useSharedValue, type SharedValue } from "react-native-reanimated";
import { move, useTheme } from "@sylf/design-system";
import { clampCamera, type Camera, type Size, type WorkspaceModel } from "@sylf/spaces";

export interface CameraValues {
  x: SharedValue<number>;
  y: SharedValue<number>;
  zoom: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
}

export function useCamera(model: WorkspaceModel, resting: Camera, viewport: Size | null) {
  const { motion } = useTheme();
  const x = useSharedValue(resting.x);
  const y = useSharedValue(resting.y);
  const zoom = useSharedValue(resting.zoom);
  const width = useSharedValue(viewport?.width ?? 0);
  const height = useSharedValue(viewport?.height ?? 0);
  const camera = useMemo<CameraValues>(() => ({ x, y, zoom, width, height }), [x, y, zoom, width, height]);
  const target = useRef(resting);

  useEffect(() => {
    if (!viewport) return;
    width.value = viewport.width;
    height.value = viewport.height;
  }, [viewport, width, height]);

  useEffect(() => {
    if (resting.x === target.current.x && resting.y === target.current.y && resting.zoom === target.current.zoom) return;
    target.current = resting;
    x.value = move(resting.x, motion, "glide");
    y.value = move(resting.y, motion, "glide");
    zoom.value = move(resting.zoom, motion, "glide");
  }, [resting, motion, x, y, zoom]);

  /** A gesture ended here. Marking it first means the model's answer is not animated back onto a camera already in place. */
  const commit = useCallback((next: Camera) => {
    const settled = clampCamera(next, { width: width.value, height: height.value });
    target.current = settled;
    model.commitCamera(settled);
  }, [model, width, height]);

  const stop = useCallback(() => { cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom); }, [x, y, zoom]);
  return { camera, commit, stop };
}
