// Whiteboard is a Notes drawing document, not a second kind of file. The surface and its tools are here so the window can be
// judged, and they say plainly that writing arrives with native ink (risk R2, Phase 14).
import { useEffect } from "react";
import { View } from "react-native";
import { DocumentSurface, IconButton, Select, Text, useTheme } from "@sylf/design-system";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolLimited, ToolFootnote, ToolLoading, useWindowDocument, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.boards();
const PAPER_LINE = "#d8d8de";

export default function WhiteboardTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const result = useToolResult("boards", load);
  const boards = result?.data ?? [];
  const board = useWindowDocument(window, boards);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  useEffect(() => { if (board && window.state.title !== board.title) patch({ document: board.id, title: board.title }); }, [board, window.state.title, patch]);
  if (!result) return <ToolLoading />;
  if (result.limited) return <ToolLimited icon="whiteboard" title="Whiteboards open on the web for now" message={result.limited} />;
  if (!board) return <ToolEmpty icon="whiteboard" title="No drawings yet" message="Drawings you make in Notes will appear here." />;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}><Select label="Drawing" hideLabel value={board.id} options={boards.map((item) => ({ value: item.id, label: item.title }))} onChange={(document) => patch({ document, title: boards.find((item) => item.id === document)?.title ?? null })} /></View>
        <IconButton icon="pen" size="small" label="Pen, not available yet" disabled />
        <IconButton icon="eraser" size="small" label="Eraser, not available yet" disabled />
      </View>
      <DocumentSurface style={{ flex: 1, margin: space.md, marginBottom: 0, alignItems: "center", justifyContent: "center" }}>
        <View aria-hidden style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, backgroundColor: PAPER_LINE }} />
        <View aria-hidden style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, backgroundColor: PAPER_LINE }} />
        <View aria-hidden style={{ width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: "#1a1a1a" }} />
      </DocumentSurface>
      <ToolFootnote><Text variant="caption" tone="soft">Writing arrives with native ink. Whiteboards are Notes drawings.</Text></ToolFootnote>
    </View>
  );
}
