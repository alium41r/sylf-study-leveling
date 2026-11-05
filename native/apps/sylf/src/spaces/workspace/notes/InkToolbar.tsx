// The pen case: tools, a few inks, three widths, undo. Colours are the document's, not the theme's, because ink is written on paper.
// With a selection, the bar becomes what can be done to it.
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Divider, IconButton, Menu, Press, Text, useTheme, type IconName, type MenuItem , type ViewHandle } from "@sylf/design-system";
import type { ShapeKind } from "@sylf/notes";
import type { InkToolState } from "./ink-types";

export const INKS = ["#1f2a44", "#345bc6", "#c8423b", "#2f8f5b", "#7a4fd0", "#555b63"];
export const HIGHLIGHTS = ["#e4b930", "#7ed3a3", "#f29bc1", "#8ec5ff"];
const WIDTHS = [{ value: 1.6, label: "Fine" }, { value: 2.6, label: "Medium" }, { value: 4.4, label: "Bold" }];
const SHAPES: { value: ShapeKind; label: string }[] = [{ value: "line", label: "Line" }, { value: "rectangle", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }];

interface Props {
  tool: InkToolState;
  onTool(next: InkToolState): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  selection: number;
  onSelectionAction(action: "delete" | "done" | "bigger" | "smaller" | { color: string }): void;
  /** Extra controls at the start (a note's Type and Write switch) and at the end (pages, paper, zoom). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  stylusKnown: boolean;
}

export default function InkToolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo, selection, onSelectionAction, leading, trailing, stylusKnown }: Props) {
  const { space, color } = useTheme();
  const [menu, setMenu] = useState<"shape" | "eraser" | null>(null);
  const shapeAnchor = useRef<ViewHandle>(null), eraserAnchor = useRef<ViewHandle>(null);
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const pick = (name: InkToolState["tool"]) => set({ tool: name, color: name === "highlighter" && !HIGHLIGHTS.includes(tool.color) ? HIGHLIGHTS[0] : name === "pen" && HIGHLIGHTS.includes(tool.color) ? INKS[0] : tool.color });
  const button = (name: InkToolState["tool"], icon: IconName, label: string) => <IconButton key={name} icon={icon} size="small" label={label} active={tool.tool === name} onPress={() => (tool.tool === name && (name === "shape" || name === "eraser") ? setMenu(name) : pick(name))} />;
  const palette = tool.tool === "highlighter" ? HIGHLIGHTS : INKS;
  const swatch = (value: string, onPress: () => void, selected: boolean) => (
    <Press key={value} label={`Colour ${value}`} selected={selected} onPress={onPress} feedback="none" style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: selected ? 20 : 16, height: selected ? 20 : 16, borderRadius: 10, backgroundColor: value, borderWidth: selected ? 2 : 1, borderColor: selected ? color.ink : "rgba(0,0,0,0.12)" }} />
    </Press>
  );
  const shapeItems: MenuItem[] = SHAPES.map((s) => ({ key: s.value, label: s.label, selected: tool.shape === s.value, onSelect: () => set({ tool: "shape", shape: s.value }) }));
  const eraserItems: MenuItem[] = [{ key: "stroke", label: "Whole strokes", selected: tool.eraser === "stroke", onSelect: () => set({ tool: "eraser", eraser: "stroke" }) }, { key: "precise", label: "Just what it touches", selected: tool.eraser === "precise", onSelect: () => set({ tool: "eraser", eraser: "precise" }) }];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: color.line }} contentContainerStyle={{ alignItems: "center", gap: 2, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
      {selection ? (
        <>
          <Text variant="label" tone="soft" style={{ paddingHorizontal: space.xs }}>{selection} selected</Text>
          {INKS.slice(0, 5).map((c) => swatch(c, () => onSelectionAction({ color: c }), false))}
          <IconButton icon="plus" size="small" label="Bigger" onPress={() => onSelectionAction("bigger")} />
          <IconButton icon="minus" size="small" label="Smaller" onPress={() => onSelectionAction("smaller")} />
          <IconButton icon="trash" size="small" label="Delete selection" onPress={() => onSelectionAction("delete")} />
          <IconButton icon="check" size="small" label="Done" onPress={() => onSelectionAction("done")} />
        </>
      ) : (
        <>
          {leading}
          <IconButton icon="undo" size="small" label="Undo" disabled={!canUndo} onPress={onUndo} />
          <IconButton icon="redo" size="small" label="Redo" disabled={!canRedo} onPress={onRedo} />
          <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
          {button("pen", "pen", "Pen")}
          {button("highlighter", "highlighter", "Highlighter")}
          <View ref={eraserAnchor} collapsable={false}>{button("eraser", "eraser", tool.eraser === "precise" ? "Eraser, precise" : "Eraser")}</View>
          {button("lasso", "lasso", "Lasso: select and move")}
          <View ref={shapeAnchor} collapsable={false}>{button("shape", "shapes", `Shape: ${tool.shape}`)}</View>
          {tool.tool === "pen" || tool.tool === "highlighter" || tool.tool === "shape" ? (
            <>
              <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
              {palette.map((c) => swatch(c, () => set({ color: c }), tool.color === c))}
              <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
              {WIDTHS.map((w) => (
                <Press key={w.value} label={`${w.label} line`} selected={tool.width === w.value} onPress={() => set({ width: w.value })} feedback="none" style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 16, height: Math.max(2, w.value * 1.1), borderRadius: 4, backgroundColor: tool.width === w.value ? color.ink : color.inkFaint }} />
                </Press>
              ))}
            </>
          ) : null}
          {stylusKnown ? (
            <>
              <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
              <IconButton icon="hand" size="small" label={tool.penOnly ? "Fingers scroll; the pen writes" : "Fingers write too"} active={!tool.penOnly} onPress={() => set({ penOnly: !tool.penOnly })} />
            </>
          ) : null}
          {trailing}
        </>
      )}
      <Menu open={menu === "shape"} anchor={shapeAnchor } onClose={() => setMenu(null)} items={shapeItems} label="Shapes" side="bottom" />
      <Menu open={menu === "eraser"} anchor={eraserAnchor } onClose={() => setMenu(null)} items={eraserItems} label="Eraser" side="bottom" />
    </ScrollView>
  );
}
