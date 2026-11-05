// A whiteboard: one large Notes drawing page seen through a camera. Fingers, the wheel and a trackpad move and zoom it, the pen draws.
// The camera is the window's small state, so a board reopens where it was left.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { IconButton, Text, useTheme } from "@sylf/design-system";
import { InkScene, type OpenDocument } from "@sylf/notes";
import InkToolbar from "./InkToolbar";
import InkView from "./InkView";
import { DEFAULT_TOOL, type InkCamera } from "./ink-types";
import { useInkTool } from "./ink-tool";

const MIN = 0.15, MAX = 4;

export default function BoardCanvas({ document, editable, camera: saved, onCamera }: { document: OpenDocument; editable: boolean; camera: InkCamera | null; onCamera(camera: InkCamera): void }) {
  const { space, color } = useTheme();
  const page = document.descriptor().pages[0];
  const scene = useMemo(() => new InkScene(document.stream(page.streamId)), [document, page.streamId]);
  useEffect(() => () => scene.close(), [scene]);
  const [, bump] = useState(0);
  useEffect(() => scene.subscribe(() => bump((n) => n + 1)), [scene]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<InkCamera | null>(saved);
  const [tool, setTool, stylusKnown, penSeen] = useInkTool(DEFAULT_TOOL, "board");
  const [selection, setSelection] = useState<string[]>([]);
  const save = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clamp = (next: InkCamera): InkCamera => {
    const zoom = Math.max(MIN, Math.min(MAX, next.zoom));
    const w = size.width / zoom, h = size.height / zoom;
    // Keep some of the board in view, so it can never be lost off an edge.
    return { zoom, x: Math.max(-w * 0.6, Math.min(page.width - w * 0.4, next.x)), y: Math.max(-h * 0.6, Math.min(page.height - h * 0.4, next.y)) };
  };
  const fit = (): InkCamera => {
    const box = scene.strokes().length ? scene.boundsOf(scene.strokes().map((s) => s.id)) : null;
    const target = box ? { x: box.x - 80, y: box.y - 80, width: box.width + 160, height: box.height + 160 } : { x: page.width / 2 - size.width / 2, y: page.height / 2 - size.height / 2, width: size.width, height: size.height };
    const zoom = Math.max(MIN, Math.min(1.5, Math.min(size.width / target.width, size.height / target.height)));
    return { zoom, x: target.x + target.width / 2 - size.width / zoom / 2, y: target.y + target.height / 2 - size.height / zoom / 2 };
  };
  useEffect(() => { if (size.width && !camera) setCamera(fit()); }, [size.width]);
  const move = (next: InkCamera) => {
    const clamped = clamp(next);
    setCamera(clamped);
    clearTimeout(save.current);
    save.current = setTimeout(() => onCamera(clamped), 400);
  };
  useEffect(() => () => clearTimeout(save.current), []);

  const pan = (dx: number, dy: number) => camera && move({ ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom });
  const zoomAt = (factor: number, x = size.width / 2, y = size.height / 2) => {
    if (!camera) return;
    const zoom = Math.max(MIN, Math.min(MAX, camera.zoom * factor));
    const px = camera.x + x / camera.zoom, py = camera.y + y / camera.zoom;
    move({ zoom, x: px - x / zoom, y: py - y / zoom });
  };
  const onSelectionAction = (action: "delete" | "done" | "bigger" | "smaller" | { color: string }) => {
    if (action === "delete") scene.remove(selection);
    else if (action === "bigger") scene.scale(selection, 1.15);
    else if (action === "smaller") scene.scale(selection, 1 / 1.15);
    else if (typeof action === "object") scene.recolor(selection, action.color);
    if (action === "delete" || action === "done") setSelection([]);
  };

  return (
    <View style={{ flex: 1 }}>
      {editable ? (
        <InkToolbar tool={tool} onTool={setTool} stylusKnown={stylusKnown} canUndo={scene.canUndo()} canRedo={scene.canRedo()} onUndo={() => scene.undo()} onRedo={() => scene.redo()}
          selection={selection.length} onSelectionAction={onSelectionAction}
          trailing={
            <>
              <IconButton icon="minus" size="small" label="Zoom out" onPress={() => zoomAt(1 / 1.25)} />
              <Text variant="micro" tone="soft" style={{ minWidth: 36, textAlign: "center" }}>{Math.round((camera?.zoom ?? 1) * 100)}%</Text>
              <IconButton icon="plus" size="small" label="Zoom in" onPress={() => zoomAt(1.25)} />
              <IconButton icon="fit" size="small" label="Show everything" onPress={() => move(fit())} />
            </>
          } />
      ) : null}
      <View style={{ flex: 1, backgroundColor: color.sunken, overflow: "hidden" }} onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} testID="board-canvas">
        {size.width && camera ? (
          <InkView scene={scene} pageWidth={page.width} pageHeight={page.height} camera={camera} width={size.width} height={size.height} tool={tool} drawPaper editable={editable}
            selection={selection} onSelection={setSelection} onPan={pan} onPinch={zoomAt} onPenSeen={penSeen} wheel="all" />
        ) : null}
        {!scene.strokes().length && editable ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: space.lg, alignItems: "center" }}>
            <Text variant="caption" tone="faint">{stylusKnown ? "Draw with the pen. Two fingers move the board." : "Draw anywhere. Scroll to move, pinch or Control and scroll to zoom."}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
