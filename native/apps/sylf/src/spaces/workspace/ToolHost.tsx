// Where a tool's code runs. Tools load on first use, and a window that is restored waits its turn, so entering a busy Workspace
// shows the frames at once and fills them in order, the window you were using first. Suspended content is unmounted and its small
// state stays in the snapshot. A hidden tool is present for memory's sake only: no touches, no focus, no assistive technology.
import { Suspense, lazy, memo, useCallback, useEffect, useState, type ComponentType } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon, Press, Text, useTheme } from "@sylf/design-system";
import type { ToolId, ToolLifecycle, ToolState, WorkspaceWindow } from "@sylf/spaces";
import { useWorkspaceModel } from "../../shell/context";
import { TOOL_ICONS } from "./icons";
import { isSeen, ToolLoading, type ToolProps } from "./tools/shared";

const VIEWS: Record<ToolId, ComponentType<ToolProps>> = {
  notes: lazy(() => import("./tools/NotesTool")),
  pdfs: lazy(() => import("./tools/PdfsTool")),
  whiteboard: lazy(() => import("./tools/WhiteboardTool")),
  planner: lazy(() => import("./tools/PlannerTool")),
  calendar: lazy(() => import("./tools/CalendarTool")),
  sylvie: lazy(() => import("./tools/SylvieTool")),
  timer: lazy(() => import("./tools/TimerTool")),
  calculator: lazy(() => import("./tools/CalculatorTool")),
  audio: lazy(() => import("./tools/AudioTool")),
  resources: lazy(() => import("./tools/ResourcesTool")),
};
const hiddenOnWeb = Platform.select<ViewStyle>({ web: { visibility: "hidden" } as unknown as ViewStyle, default: {} });
const FILL_STEP_MS = 48;

/** A window with nothing running in it: the tool's name, so a far or suspended window is still findable. */
const ToolResting = memo(function ToolResting({ tool, title, overview, onOpen }: { tool: ToolId; title: string; overview: boolean; onOpen: () => void }) {
  const { color, space } = useTheme();
  const body = { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.lg, backgroundColor: color.float } as const;
  // Far away, a window is its name in large type, and pressing it goes there.
  if (overview) return <Press label={`Go to ${title}`} feedback="surface" radius={0} onPress={onOpen} style={StyleSheet.absoluteFill} bodyStyle={body}><Icon name={TOOL_ICONS[tool]} size={96} color={color.inkSoft} /><Text variant="title" tone="soft" align="center" numberOfLines={2} style={{ fontSize: 64, lineHeight: 72 }}>{title}</Text></Press>;
  return <View style={[StyleSheet.absoluteFill, body]}><Icon name={TOOL_ICONS[tool]} size={28} color={color.inkSoft} /><Text variant="small" tone="soft" align="center" numberOfLines={2}>{title}</Text></View>;
});

export const ToolHost = memo(function ToolHost({ window, lifecycle, title, fillOrder, overview, onProvenance }: { window: WorkspaceWindow; lifecycle: ToolLifecycle; title: string; fillOrder: number; overview: boolean; onProvenance: (id: string, sample: boolean) => void }) {
  const model = useWorkspaceModel();
  const [ready, setReady] = useState(fillOrder === 0);
  const { id, tool } = window;
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), fillOrder * FILL_STEP_MS);
    return () => clearTimeout(timer);
  }, [ready, fillOrder]);
  const patch = useCallback((state: ToolState) => model.patchTool(id, state), [model, id]);
  const report = useCallback((sample: boolean) => onProvenance(id, sample), [id, onProvenance]);
  const onOpen = useCallback(() => { model.focus(id); model.frameWindow(id); }, [model, id]);
  const Tool = VIEWS[tool];
  const mounted = ready && lifecycle !== "suspended";
  const seen = isSeen(lifecycle);
  return (
    <View style={{ flex: 1 }}>
      {mounted ? (
        <View testID={`tool-${id}`} {...({ dataSet: { lifecycle } } as object)} aria-hidden={!seen || undefined} importantForAccessibility={seen ? "auto" : "no-hide-descendants"} pointerEvents={seen ? "auto" : "none"} style={[{ flex: 1 }, seen ? null : hiddenOnWeb, seen ? null : { opacity: 0 }]}>
          <Suspense fallback={<ToolLoading />}><Tool window={window} lifecycle={lifecycle} patch={patch} onProvenance={report} /></Suspense>
        </View>
      ) : null}
      {seen ? null : <ToolResting tool={tool} title={title} overview={overview} onOpen={onOpen} />}
    </View>
  );
});

