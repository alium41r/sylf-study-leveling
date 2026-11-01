// The Resource Shelf: a list of pointers to things Notes already owns, never a second store. Opening one opens the real tool on
// that document, so the shelf is the first thing in Workspace that links one window to another.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Chip, ListRow, useNotice, useTheme, type IconName } from "@sylf/design-system";
import type { ToolId } from "@sylf/spaces";
import { useWorkspaceModel } from "../../../shell/context";
import type { ResourceKind, WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { TOOL_ICONS } from "../icons";
import { ToolEmpty, ToolLimited, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.resources();
const KIND_TOOL: Record<ResourceKind, ToolId> = { note: "notes", pdf: "pdfs", board: "whiteboard" };
const FILTERS: { value: ResourceKind | "all"; label: string; icon?: IconName }[] = [{ value: "all", label: "All" }, { value: "note", label: "Notes", icon: "notes" }, { value: "pdf", label: "PDFs", icon: "pdf" }, { value: "board", label: "Boards", icon: "whiteboard" }];

export default function ResourcesTool({ onProvenance }: ToolProps) {
  const { space } = useTheme();
  const model = useWorkspaceModel();
  const notice = useNotice();
  const result = useToolResult("resources", load);
  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  if (!result) return <ToolLoading />;
  if (result.limited) return <ToolLimited icon="resources" title="The shelf comes with Notes" message={result.limited} />;
  const entries = result.data ?? [];
  if (!entries.length) return <ToolEmpty icon="resources" title="Nothing on the shelf" message="Notes and PDFs you keep for this subject will appear here." />;
  const shown = entries.filter((entry) => filter === "all" || entry.kind === filter);
  return (
    <ToolPage padded={false}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, paddingHorizontal: space.md, paddingTop: space.md }}>
        {FILTERS.map((item) => <Chip key={item.value} label={item.label} icon={item.icon} selected={filter === item.value} onPress={() => setFilter(item.value)} />)}
      </View>
      <View style={{ padding: space.sm }}>
        {shown.map((entry) => <ListRow key={entry.id} title={entry.title} detail={entry.detail} icon={TOOL_ICONS[KIND_TOOL[entry.kind]]} onPress={() => { if (!model.open(KIND_TOOL[entry.kind], { document: entry.documentId, title: entry.title })) notice("The Workspace is full. Close a window first."); }} />)}
      </View>
    </ToolPage>
  );
}
