// Typing tools: one bar, Sylf's own controls, sending commands to whichever BlockNote editor is active. Shared by typed notes and
// by the typing mode of a page note, where `leading` holds the Type and Write switch and `trailing` the page controls.
import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { Divider, IconButton, Press, Text, useTheme, type IconName } from "@sylf/design-system";

export interface Format { bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean; highlight: boolean; block: string; canIndent: boolean; canOutdent: boolean }
export const NO_FORMAT: Format = { bold: false, italic: false, underline: false, strike: false, code: false, highlight: false, block: "paragraph", canIndent: false, canOutdent: false };

export default function FormatBar({ format, send, narrow, leading, trailing, onImage }: { format: Format; send(command: object): void; narrow: boolean; leading?: ReactNode; trailing?: ReactNode; onImage?(): void }) {
  const theme = useTheme();
  const mark = (name: string, icon: IconName, label: string, active: boolean) => <IconButton key={name} icon={icon} size="small" label={label} active={active} onPress={() => send({ type: "mark", mark: name })} />;
  const block = (name: string, icon: IconName, label: string) => <IconButton key={name} icon={icon} size="small" label={label} active={format.block === name} onPress={() => send({ type: "block", block: format.block === name ? "paragraph" : name })} />;
  const heading = (level: number) => (
    <Press key={level} label={`Heading ${level}`} selected={format.block === `heading-${level}`} onPress={() => send(format.block === `heading-${level}` ? { type: "block", block: "paragraph" } : { type: "block", block: "heading", level })}
      style={{ minWidth: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: theme.shape.radius.sm, backgroundColor: format.block === `heading-${level}` ? theme.color.selected : "transparent" }}>
      <Text variant="label" tone={format.block === `heading-${level}` ? "ink" : "soft"}>H{level}</Text>
    </Press>
  );
  const rule = <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: theme.color.line }} contentContainerStyle={{ alignItems: "center", gap: 2, paddingHorizontal: theme.space.sm, paddingVertical: theme.space.xs }}>
      {leading}
      <IconButton icon="undo" size="small" label="Undo" onPress={() => send({ type: "undo" })} />
      <IconButton icon="redo" size="small" label="Redo" onPress={() => send({ type: "redo" })} />
      {rule}
      {[1, 2, 3].map(heading)}
      {rule}
      {mark("bold", "bold", "Bold", format.bold)}
      {mark("italic", "italic", "Italic", format.italic)}
      {mark("underline", "underline", "Underline", format.underline)}
      {narrow ? null : mark("strike", "strike", "Strikethrough", format.strike)}
      <IconButton icon="highlighter" size="small" label="Highlight" active={format.highlight} onPress={() => send({ type: "highlight", color: "yellow" })} />
      {rule}
      {block("bulletListItem", "bulletList", "Bulleted list")}
      {block("numberedListItem", "numberList", "Numbered list")}
      {block("checkListItem", "checkList", "Checklist")}
      {block("quote", "quote", "Quote")}
      {narrow ? null : block("codeBlock", "code", "Code block")}
      {onImage ? <IconButton icon="image" size="small" label="Insert a picture" onPress={onImage} /> : null}
      {trailing}
    </ScrollView>
  );
}
