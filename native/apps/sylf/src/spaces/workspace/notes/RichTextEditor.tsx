// A typed note: the host side of the BlockNote DOM component. The document's own replica lives here, in the Notes library, and the
// editor's copy follows it. The format bar is native, so it looks like the rest of Sylf, and talks to the editor by command.
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import * as Y from "yjs";
import { DOCUMENT_DEFAULTS, Divider, IconButton, Press, Text, useTheme, type IconName } from "@sylf/design-system";
import { RICH_TEXT_ADAPTER, typedTemplate, templateOf, type OpenDocument } from "@sylf/notes";
import RichTextDom, { type RichTextHandle, type RichTextLook } from "./RichTextDom";
import { fromBase64, toBase64 } from "./base64";

interface Format { bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean; highlight: boolean; block: string; canIndent: boolean; canOutdent: boolean }
const NONE: Format = { bold: false, italic: false, underline: false, strike: false, code: false, highlight: false, block: "paragraph", canIndent: false, canOutdent: false };
const DOCUMENT_FONT = '"Instrument Sans", -apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

export function richTextStream(document: OpenDocument) {
  const d = document.descriptor();
  return d.kind === "flow" ? d.streams.find((s) => s.adapter === RICH_TEXT_ADAPTER)!.streamId : d.pages[0].streamId;
}

export default function RichTextEditor({ document, editable, narrow }: { document: OpenDocument; editable: boolean; narrow: boolean }) {
  const theme = useTheme();
  const editor = useRef<RichTextHandle>(null);
  const origin = useMemo(() => ({}), []);
  const streamId = useMemo(() => richTextStream(document), [document]);
  const doc = document.stream(streamId);
  const initial = useMemo(() => toBase64(Y.encodeStateAsUpdate(doc)), [doc]);
  const template = useMemo(() => JSON.stringify(typedTemplate(templateOf(document.descriptor())).blocks), [document]);
  const [format, setFormat] = useState<Format>(NONE);
  const look = useMemo<RichTextLook>(() => ({ ink: DOCUMENT_DEFAULTS.ink, soft: "#4a4f5a", faint: "#9aa0ab", accent: theme.color.accent.fill, wash: "rgba(90,110,180,0.12)", paper: DOCUMENT_DEFAULTS.paper, line: "#d9dce3", font: DOCUMENT_FONT, menu: "#ffffff", menuInk: "#1a1a1a" }), [theme.color.accent.fill]);

  // Another window editing the same note: its changes reach this editor's replica.
  useEffect(() => {
    const forward = (update: Uint8Array, from: unknown) => { if (from !== origin) editor.current?.apply(toBase64(update)); };
    doc.on("update", forward);
    return () => doc.off("update", forward);
  }, [doc, origin]);

  const send = (command: object) => editor.current?.command(JSON.stringify(command));
  const mark = (name: string, icon: IconName, label: string, active: boolean) => <IconButton key={name} icon={icon} size="small" label={label} active={active} onPress={() => send({ type: "mark", mark: name })} />;
  const block = (name: string, icon: IconName, label: string) => <IconButton key={name} icon={icon} size="small" label={label} active={format.block === name} onPress={() => send({ type: "block", block: format.block === name ? "paragraph" : name })} />;
  const heading = (level: number) => (
    <Press key={level} label={`Heading ${level}`} selected={format.block === `heading-${level}`} onPress={() => send(format.block === `heading-${level}` ? { type: "block", block: "paragraph" } : { type: "block", block: "heading", level })}
      style={{ minWidth: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: theme.shape.radius.sm, backgroundColor: format.block === `heading-${level}` ? theme.color.selected : "transparent" }}>
      <Text variant="label" tone={format.block === `heading-${level}` ? "ink" : "soft"}>H{level}</Text>
    </Press>
  );

  return (
    <View style={{ flex: 1 }}>
      {editable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.color.line }} contentContainerStyle={{ alignItems: "center", gap: 2, paddingHorizontal: theme.space.sm, paddingVertical: theme.space.xs }}>
          <IconButton icon="undo" size="small" label="Undo" onPress={() => send({ type: "undo" })} />
          <IconButton icon="redo" size="small" label="Redo" onPress={() => send({ type: "redo" })} />
          <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
          {[1, 2, 3].map(heading)}
          <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
          {mark("bold", "bold", "Bold", format.bold)}
          {mark("italic", "italic", "Italic", format.italic)}
          {mark("underline", "underline", "Underline", format.underline)}
          {narrow ? null : mark("strike", "strike", "Strikethrough", format.strike)}
          <IconButton icon="highlighter" size="small" label="Highlight" active={format.highlight} onPress={() => send({ type: "highlight", color: "yellow" })} />
          <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
          {block("bulletListItem", "bulletList", "Bulleted list")}
          {block("numberedListItem", "numberList", "Numbered list")}
          {block("checkListItem", "checkList", "Checklist")}
          {block("quote", "quote", "Quote")}
          {narrow ? null : block("codeBlock", "code", "Code block")}
        </ScrollView>
      ) : null}
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
