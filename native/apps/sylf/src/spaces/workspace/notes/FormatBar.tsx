// Native editing controls send commands to whichever BlockNote page is active.
import { useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { IconButton, Menu, Tooltip, useTheme, type MenuItem, type ViewHandle } from "@sylf/design-system";

export interface Format { bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean; highlight: boolean; block: string; canIndent: boolean; canOutdent: boolean }
export const NO_FORMAT: Format = { bold: false, italic: false, underline: false, strike: false, code: false, highlight: false, block: "paragraph", canIndent: false, canOutdent: false };

const MARKS = [
  { key: "bold", label: "Bold", icon: "bold" },
  { key: "italic", label: "Italic", icon: "italic" },
  { key: "underline", label: "Underline", icon: "underline" },
  { key: "strike", label: "Strikethrough", icon: "strike" },
  { key: "code", label: "Inline code", icon: "code" },
] as const;

const BLOCKS = [
  { key: "paragraph", label: "Paragraph", icon: "type" },
  { key: "heading-1", label: "Heading 1", icon: "heading", level: 1 },
  { key: "heading-2", label: "Heading 2", icon: "heading", level: 2 },
  { key: "heading-3", label: "Heading 3", icon: "heading", level: 3 },
  { key: "bulletListItem", label: "Bulleted list", icon: "bulletList" },
  { key: "numberedListItem", label: "Numbered list", icon: "numberList" },
  { key: "checkListItem", label: "Checklist", icon: "checkList" },
  { key: "quote", label: "Quote", icon: "quote" },
  { key: "codeBlock", label: "Code block", icon: "code" },
] as const;

export default function FormatBar({ format, send, compact, leading, end }: { format: Format; send(command: object): void; compact: boolean; leading?: ReactNode; end?: ReactNode }) {
  const { space } = useTheme();
  const anchor = useRef<ViewHandle>(null);
  const trigger = useRef<ViewHandle>(null);
  const returnToEditor = useRef(false);
  const [open, setOpen] = useState(false);
  const run = (command: object) => {
    returnToEditor.current = Platform.OS === "web";
    send(command);
  };
  const openMenu = () => {
    if (Platform.OS === "web") (trigger.current as unknown as HTMLElement | null)?.focus();
    setOpen(true);
  };
  const blocks: MenuItem[] = BLOCKS.map((block) => ({
    key: block.key, label: block.label, icon: block.icon, selected: format.block === block.key,
    onSelect: () => run("level" in block ? { type: "block", block: "heading", level: block.level } : { type: "block", block: block.key }),
  }));
  const marks: MenuItem[] = MARKS.slice(compact ? 0 : 3).map(({ key, label, icon }) => ({
    key, label, icon, selected: format[key], onSelect: () => run({ type: "mark", mark: key }),
  }));
  const inline: MenuItem[] = [
    ...marks,
    { key: "highlight", label: "Highlight", icon: "highlighter", selected: format.highlight, onSelect: () => run({ type: "highlight", color: "yellow" }) },
  ];
  const redo: MenuItem = { key: "redo", label: "Redo", icon: "redo", onSelect: () => run({ type: "redo" }) };
  const indent: MenuItem[] = [
    { key: "indent", label: "Indent", icon: "chevronRight", disabled: !format.canIndent, onSelect: () => run({ type: "indent" }) },
    { key: "outdent", label: "Outdent", icon: "chevronLeft", disabled: !format.canOutdent, onSelect: () => run({ type: "outdent" }) },
  ];
  const items = compact ? [redo, ...inline, ...blocks, ...indent] : [...blocks, ...inline, ...indent];

  return (
    <ToolbarRow start={leading} end={end}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.hair }}>
        <IconButton icon="undo" size="small" label="Undo" onPress={() => send({ type: "undo" })} />
        {compact ? null : <IconButton icon="redo" size="small" label="Redo" onPress={() => send({ type: "redo" })} />}
        <View ref={anchor} collapsable={false}>
          <Tooltip text={`Formatting · ${BLOCKS.find((block) => block.key === format.block)?.label ?? "Text"}`}>
            {(tooltip) => (
              <IconButton {...tooltip} ref={trigger} icon="type" size="small" label="Formatting" expanded={open} active={open || format.block !== "paragraph"} onPress={openMenu}
                onFocusChange={(focused) => {
                  tooltip.onFocusChange(focused);
                  // The menu first restores its trigger, then typing can resume at the same selection.
                  if (focused && returnToEditor.current) {
                    returnToEditor.current = false;
                    requestAnimationFrame(() => send({ type: "focus" }));
                  }
                }} />
            )}
          </Tooltip>
        </View>
        {compact ? null : MARKS.slice(0, 3).map(({ key, label, icon }) => <IconButton key={key} icon={icon} size="small" label={label} active={format[key]} onPress={() => send({ type: "mark", mark: key })} />)}
      </View>
      <Menu open={open} anchor={anchor} onClose={() => setOpen(false)} items={items} label="Formatting" />
    </ToolbarRow>
  );
}

/** Navigation and page actions stay at the edges while the controls for the current mode take the middle. */
export function ToolbarRow({ start, end, children }: { start?: ReactNode; end?: ReactNode; children?: ReactNode }) {
  const { color, space } = useTheme();
  const edge = { flexDirection: "row" as const, alignItems: "center" as const, gap: space.hair };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, backgroundColor: color.raised }}>
      {start ? <View style={edge}>{start}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {end ? <View style={edge}>{end}</View> : null}
    </View>
  );
}
