// Notes, read only. The document is drawn on its own paper and never follows the theme. Writing arrives with the real editor
// (Phase 14). Each window remembers its own document, so two Notes windows are two different notes.
import { useEffect } from "react";
import { Text as PlainText, View } from "react-native";
import { DOCUMENT_DEFAULTS, DocumentSurface, Select, Text, useTheme } from "@sylf/design-system";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolLimited, ToolFootnote, ToolLoading, ToolPage, useWindowDocument, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.notes();

export default function NotesTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const result = useToolResult("notes", load);
  const notes = result?.data ?? [];
  const note = useWindowDocument(window, notes);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  useEffect(() => { if (note && window.state.title !== note.title) patch({ document: note.id, title: note.title }); }, [note, window.state.title, patch]);
  if (!result) return <ToolLoading />;
  if (result.limited) return <ToolLimited icon="notes" title="Notes open on the web for now" message={result.limited} />;
  if (!note) return <ToolEmpty icon="notes" title="No notes yet" message="Notes you write will appear here." />;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
        <Select label="Note" hideLabel value={note.id} options={notes.map((item) => ({ value: item.id, label: item.title }))} onChange={(document) => patch({ document, title: notes.find((item) => item.id === document)?.title ?? null })} />
      </View>
      <ToolPage padded={false}>
        <DocumentSurface style={{ margin: space.md, padding: space.xl, gap: space.md }}>
          <PlainText role="heading" aria-level={2} style={{ color: DOCUMENT_DEFAULTS.ink, fontSize: 24, fontWeight: "600" }}>{note.title}</PlainText>
          <PlainText style={{ color: DOCUMENT_DEFAULTS.ink, opacity: 0.6, fontSize: 13 }}>{note.subject}, {note.updated.toLowerCase()}</PlainText>
          {note.body.map((block, index) => (
            <View key={index} style={{ gap: 4 }}>
              {block.heading ? <PlainText style={{ color: DOCUMENT_DEFAULTS.ink, fontSize: 16, fontWeight: "600" }}>{block.heading}</PlainText> : null}
              <PlainText style={{ color: DOCUMENT_DEFAULTS.ink, fontSize: 15, lineHeight: 23 }}>{block.text}</PlainText>
            </View>
          ))}
        </DocumentSurface>
      </ToolPage>
      <ToolFootnote><Text variant="caption" tone="soft">Reading only. Writing arrives with the Notes editor.</Text></ToolFootnote>
    </View>
  );
}
