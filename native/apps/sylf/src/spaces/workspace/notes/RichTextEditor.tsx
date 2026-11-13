// A typed note: the host side of the BlockNote DOM component. The document's own replica lives here, in the Notes library, and the
// editor's copy follows it. The format bar is native, so it looks like the rest of Sylf, and talks to the editor by command.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import * as Y from "yjs";
import { DOCUMENT_DEFAULTS, useTheme } from "@sylf/design-system";
import { RICH_TEXT_ADAPTER, typedTemplate, templateOf, type OpenDocument } from "@sylf/notes";
import RichTextDom, { type RichTextHandle, type RichTextLook } from "./RichTextDom";
import FormatBar, { NO_FORMAT, type Format } from "./FormatBar";
import { fromBase64, toBase64 } from "./base64";

const DOCUMENT_FONT = '"Instrument Sans", -apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

export function richTextStream(document: OpenDocument) {
  const d = document.descriptor();
  return d.kind === "flow" ? d.streams.find((s) => s.adapter === RICH_TEXT_ADAPTER)!.streamId : d.pages[0].streamId;
}

export default function RichTextEditor({ document, editable, compact, leading, end }: { document: OpenDocument; editable: boolean; compact: boolean; leading?: ReactNode; end?: ReactNode }) {
  const theme = useTheme();
  const editor = useRef<RichTextHandle>(null);
  const origin = useMemo(() => ({}), []);
  const streamId = useMemo(() => richTextStream(document), [document]);
  const doc = document.stream(streamId);
  const initial = useMemo(() => toBase64(Y.encodeStateAsUpdate(doc)), [doc]);
  const template = useMemo(() => JSON.stringify(typedTemplate(templateOf(document.descriptor())).blocks), [document]);
  const [format, setFormat] = useState<Format>(NO_FORMAT);
  const look = useMemo<RichTextLook>(() => ({ ink: DOCUMENT_DEFAULTS.ink, soft: "#4a4f5a", faint: "#9aa0ab", accent: theme.color.accent.fill, wash: "rgba(90,110,180,0.12)", paper: DOCUMENT_DEFAULTS.paper, line: "#d9dce3", font: DOCUMENT_FONT, menu: "#ffffff", menuInk: "#1a1a1a" }), [theme.color.accent.fill]);

  // Another window editing the same note: its changes reach this editor's replica.
  useEffect(() => {
    const forward = (update: Uint8Array, from: unknown) => { if (from !== origin) editor.current?.apply(toBase64(update)); };
    doc.on("update", forward);
    return () => doc.off("update", forward);
  }, [doc, origin]);

  const send = (command: object) => editor.current?.command(JSON.stringify(command));

  return (
    <View style={{ flex: 1 }}>
      {editable ? <FormatBar format={format} send={send} compact={compact} leading={leading} end={end} /> : null}
      <View style={{ flex: 1, backgroundColor: DOCUMENT_DEFAULTS.paper }}>
        <RichTextDom ref={editor} initial={initial} template={template} look={look} editable={editable}
          onUpdate={async (update) => { Y.applyUpdate(doc, fromBase64(update), origin); }}
          onText={async (text) => document.setText(text)}
          onFormat={async (state) => setFormat(JSON.parse(state) as Format)}
          dom={{ style: { flex: 1 }, scrollEnabled: false, matchContents: false, containerStyle: { flex: 1 } } as never} />
      </View>
    </View>
  );
}
