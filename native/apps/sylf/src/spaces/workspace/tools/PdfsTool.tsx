// PDFs, as a stand-in page. Paging works and each window keeps its own place. Real pages come from the PDF renderer (risk R4,
// Phase 14), and annotation stays with Notes.
import { useEffect } from "react";
import { Text as PlainText, View } from "react-native";
import { DOCUMENT_DEFAULTS, DocumentSurface, IconButton, Select, Text, useTheme } from "@sylf/design-system";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolLimited, ToolLoading, ToolPage, useWindowDocument, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.pdfs();

export default function PdfsTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const result = useToolResult("pdfs", load);
  const documents = result?.data ?? [];
  const document = useWindowDocument(window, documents);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  useEffect(() => { if (document && window.state.title !== document.title) patch({ document: document.id, title: document.title }); }, [document, window.state.title, patch]);
  if (!result) return <ToolLoading />;
  if (result.limited) return <ToolLimited icon="pdf" title="PDFs open on the web for now" message={result.limited} />;
  if (!document) return <ToolEmpty icon="pdf" title="No PDFs yet" message="PDFs you add to Notes will appear here." />;
  const page = Math.min(typeof window.state.page === "number" ? window.state.page : 0, document.pages.length - 1);
  const current = document.pages[page];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}><Select label="PDF" hideLabel value={document.id} options={documents.map((item) => ({ value: item.id, label: item.title }))} onChange={(next) => patch({ document: next, page: 0, title: documents.find((item) => item.id === next)?.title ?? null })} /></View>
        <IconButton icon="chevronLeft" size="small" label="Previous page" disabled={page === 0} onPress={() => patch({ page: page - 1 })} />
        <Text variant="micro" tone="soft" aria-label={`Page ${page + 1} of ${document.pages.length}`}>{page + 1}/{document.pages.length}</Text>
        <IconButton icon="chevronRight" size="small" label="Next page" disabled={page >= document.pages.length - 1} onPress={() => patch({ page: page + 1 })} />
      </View>
      <ToolPage padded={false}>
        <DocumentSurface style={{ margin: space.md, padding: space.xl, gap: space.md, minHeight: 420 }}>
          <PlainText style={{ color: DOCUMENT_DEFAULTS.ink, opacity: 0.55, fontSize: 12 }}>{document.detail}</PlainText>
          <PlainText role="heading" aria-level={2} style={{ color: DOCUMENT_DEFAULTS.ink, fontSize: 18, fontWeight: "600" }}>{current.heading}</PlainText>
          {current.lines.map((line) => <PlainText key={line} style={{ color: DOCUMENT_DEFAULTS.ink, fontSize: 15, lineHeight: 24 }}>{line}</PlainText>)}
        </DocumentSurface>
      </ToolPage>
    </View>
  );
}
