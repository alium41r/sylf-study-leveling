// The pen case: tools, three colours of your own, undo. Colours are the document's, not the theme's, because ink is written on paper.
// Tapping the pen or highlighter already in hand opens its settings (PenPanel), where size and every other colour live; tapping the
// colour already in hand opens a spectrum to change it. With a selection, the bar becomes what can be done to it.
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Divider, IconButton, Menu, Popover, Press, Text, useTheme, type IconName, type MenuItem , type ViewHandle } from "@sylf/design-system";
import type { ShapeKind } from "@sylf/notes";
import type { InkToolState } from "./ink-types";
import { ToolbarRow } from "./FormatBar";
import ColourSpectrum from "./ColourSpectrum";
import PenPanel from "./PenPanel";
import { HIGHLIGHTS, INKS } from "./pen-palettes";
import { inkTools, useQuickInks } from "./ink-tool";

export { HIGHLIGHTS, INKS };
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
  /** Pinned at the right end, outside the scrolling tools. */
  end?: React.ReactNode;
  stylusKnown: boolean;
}

export default function InkToolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo, selection, onSelectionAction, leading, trailing, end, stylusKnown }: Props) {
  const { space, color } = useTheme();
  const [menu, setMenu] = useState<"shape" | "eraser" | "pen" | null>(null);
  const [changing, setChanging] = useState<number | null>(null);
  const slotAnchors = [useRef<ViewHandle>(null), useRef<ViewHandle>(null), useRef<ViewHandle>(null)];
  const penQuick = useQuickInks("pen"), highlighterQuick = useQuickInks("highlighter");
  const kind = tool.tool === "highlighter" ? "highlighter" : "pen";
  const quick = kind === "highlighter" ? highlighterQuick : penQuick;
  const isHighlight = (c: string) => HIGHLIGHTS.includes(c) || highlighterQuick.includes(c);
  const shapeAnchor = useRef<ViewHandle>(null), eraserAnchor = useRef<ViewHandle>(null), penAnchor = useRef<ViewHandle>(null), highlighterAnchor = useRef<ViewHandle>(null);
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const pick = (name: InkToolState["tool"]) => set({ tool: name, color: name === "highlighter" && !isHighlight(tool.color) ? highlighterQuick[0] : name === "pen" && isHighlight(tool.color) ? penQuick[0] : tool.color });
  const button = (name: InkToolState["tool"], icon: IconName, label: string, hint?: string) => <IconButton key={name} icon={icon} size="small" label={label} hint={tool.tool === name ? hint : undefined} active={tool.tool === name} onPress={() => (tool.tool !== name ? pick(name) : name === "shape" || name === "eraser" ? setMenu(name) : name === "pen" || name === "highlighter" ? setMenu("pen") : undefined)} />;
  const swatch = (value: string, onPress: () => void, selected: boolean, hint?: string) => (
    <Press key={value} label={`Colour ${value}`} hint={hint} selected={selected} onPress={onPress} feedback="none" style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: selected ? 20 : 16, height: selected ? 20 : 16, borderRadius: 10, backgroundColor: value, borderWidth: selected ? 2 : 1, borderColor: selected ? color.ink : "rgba(0,0,0,0.12)" }} />
    </Press>
  );
  const shapeItems: MenuItem[] = SHAPES.map((s) => ({ key: s.value, label: s.label, selected: tool.shape === s.value, onSelect: () => set({ tool: "shape", shape: s.value }) }));
  const eraserItems: MenuItem[] = [{ key: "stroke", label: "Whole strokes", selected: tool.eraser === "stroke", onSelect: () => set({ tool: "eraser", eraser: "stroke" }) }, { key: "precise", label: "Just what it touches", selected: tool.eraser === "precise", onSelect: () => set({ tool: "eraser", eraser: "precise" }) }];

  return (
    <ToolbarRow end={end}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 1, flexShrink: 1 }} contentContainerStyle={{ alignItems: "center", gap: 2, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
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
          <View ref={penAnchor} collapsable={false}>{button("pen", "pen", "Pen", "Tap again for the pen's settings")}</View>
          <View ref={highlighterAnchor} collapsable={false}>{button("highlighter", "highlighter", "Highlighter", "Tap again for the highlighter's settings")}</View>
          <View ref={eraserAnchor} collapsable={false}>{button("eraser", "eraser", tool.eraser === "precise" ? "Eraser, precise" : "Eraser")}</View>
          {button("lasso", "lasso", "Lasso: select and move")}
          <View ref={shapeAnchor} collapsable={false}>{button("shape", "shapes", `Shape: ${tool.shape}`)}</View>
          {tool.tool === "pen" || tool.tool === "highlighter" || tool.tool === "shape" ? (
            <>
              <Divider vertical style={{ height: 18, marginHorizontal: 4 }} />
              {quick.map((c, i) => (
                <View key={i} ref={slotAnchors[i]} collapsable={false}>
                  {swatch(c, () => (tool.color === c ? setChanging(i) : set({ color: c })), tool.color === c, tool.color === c ? "Tap again to change this colour" : undefined)}
                </View>
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
      <Popover open={changing !== null} anchor={slotAnchors[changing ?? 0]} onClose={() => setChanging(null)} label="Change this colour" side="bottom">
        <View style={{ padding: space.md }}>
          <ColourSpectrum value={tool.color} onPick={(hex) => { if (changing !== null) inkTools.setQuick(kind, changing, hex); set({ color: hex }); setChanging(null); }} />
        </View>
      </Popover>
      <PenPanel open={menu === "pen" && (tool.tool === "pen" || tool.tool === "highlighter")} anchor={tool.tool === "highlighter" ? highlighterAnchor : penAnchor} onClose={() => setMenu(null)} tool={tool} onTool={onTool} />
    </ScrollView>
    </ToolbarRow>
  );
}
