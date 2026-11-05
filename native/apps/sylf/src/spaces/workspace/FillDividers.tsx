// Full screen's own controls: the seams between tools, which drag in either direction, and the preview while a tool is moved by its
// title bar onto another (an edge docks it there, the middle swaps them). The arrangement is the model's (FillNode), kept across visits.
import { createContext, useRef } from "react";
import { PanResponder, View } from "react-native";
import { useTheme } from "@sylf/design-system";
import { effectiveFill, fillSeams, type DockZone, type FillSeam, type Rect, type WorkspaceModel, type WorkspaceState } from "@sylf/spaces";

const GRAB = 14;

/** What a tiled window's title bar reports while it is dragged. */
export const FillArrangeContext = createContext<{ move(id: string, x: number, y: number): void; end(id: string): void } | null>(null);

/** Which tile a point is over, and which part: the middle third swaps, otherwise the nearest edge. */
export function dropZone(tiles: Record<string, Rect>, moving: string, x: number, y: number): { target: string; zone: DockZone; preview: Rect } | null {
  const hit = Object.entries(tiles).find(([id, t]) => id !== moving && x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height);
  if (!hit) return null;
  const [target, t] = hit;
  const fx = (x - t.x) / t.width, fy = (y - t.y) / t.height;
  if (fx > 1 / 3 && fx < 2 / 3 && fy > 1 / 3 && fy < 2 / 3) return { target, zone: "center", preview: t };
  const edges: [DockZone, number][] = [["left", fx], ["right", 1 - fx], ["top", fy], ["bottom", 1 - fy]];
  const zone = edges.sort((a, b) => a[1] - b[1])[0][0];
  const preview = zone === "left" ? { ...t, width: t.width / 2 } : zone === "right" ? { ...t, x: t.x + t.width / 2, width: t.width / 2 } : zone === "top" ? { ...t, height: t.height / 2 } : { ...t, y: t.y + t.height / 2, height: t.height / 2 };
  return { target, zone, preview };
}

export function FillSeams({ area, state, model }: { area: Rect; state: WorkspaceState; model: WorkspaceModel }) {
  const seams = fillSeams(effectiveFill(state, area), area);
  return <>{seams.map((seam) => <Seam key={`${seam.path.join(".")}:${seam.index}`} seam={seam} area={area} model={model} />)}</>;
}

function Seam({ seam, area, model }: { seam: FillSeam; area: Rect; model: WorkspaceModel }) {
  const { color } = useTheme();
  const last = useRef(0);
  const latest = useRef({ seam, area });
  latest.current = { seam, area };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { last.current = 0; },
    onPanResponderMove: (_, gesture) => {
      const { seam: s, area: a } = latest.current;
      const moved = s.dir === "row" ? gesture.dx : gesture.dy;
      const step = moved - last.current;
      if (Math.abs(step) < 2) return;
      last.current = moved;
      model.resizeFill({ width: a.width, height: a.height }, s.path, s.index, step * s.units);
    },
  })).current;
  const row = seam.dir === "row";
  const box = row ? { left: seam.at.x - GRAB / 2, top: seam.at.y, width: GRAB, height: seam.at.height } : { left: seam.at.x, top: seam.at.y - GRAB / 2, width: seam.at.width, height: GRAB };
  return (
    <View {...responder.panHandlers} role="separator" aria-label="Resize the tools on either side" aria-orientation={row ? "vertical" : "horizontal"}
      style={{ position: "absolute", ...box, zIndex: 5, alignItems: "center", justifyContent: "center", cursor: row ? "col-resize" : "row-resize" } as object}>
      <View style={{ width: row ? 4 : 36, height: row ? 36 : 4, borderRadius: 2, backgroundColor: color.lineStrong, opacity: 0.8 }} />
    </View>
  );
}

export function DropPreview({ rect }: { rect: Rect }) {
  const { color } = useTheme();
  return <View pointerEvents="none" style={{ position: "absolute", left: rect.x + 4, top: rect.y + 4, width: rect.width - 8, height: rect.height - 8, zIndex: 20, borderRadius: 14, borderWidth: 2, borderColor: color.accent.fill, backgroundColor: color.accent.wash }} />;
}
