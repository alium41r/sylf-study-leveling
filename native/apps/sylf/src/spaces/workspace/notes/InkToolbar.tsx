// The writing tools. One row, in the order a hand reaches for them: the tools, the colour and size of the one in hand, then undo.
// The tool in hand carries its ink colour, and tapping it again opens its settings. A narrow window keeps the tool in hand and undo
// on the row and puts the rest in a tray, so nothing is lost and nothing is squeezed.
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Divider, Icon, IconButton, Menu, Popover, Press, Text, Tooltip, useControlHeight, useInputFormat, useTheme, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import type { ShapeKind } from "@sylf/notes";
import { QUICK_ERASERS, QUICK_WIDTHS, type InkToolState } from "./ink-types";
import { ToolbarRow } from "./FormatBar";
import ColourSpectrum from "./ColourSpectrum";
import EraserPanel from "./EraserPanel";
import PenPanel from "./PenPanel";
import { HIGHLIGHTS, INKS } from "./pen-palettes";
import { inkTools, useQuickInks } from "./ink-tool";

export { HIGHLIGHTS, INKS };
const SHAPES: { value: ShapeKind; label: string }[] = [{ value: "line", label: "Line" }, { value: "rectangle", label: "Rectangle" }, { value: "ellipse", label: "Ellipse" }];
type ToolName = InkToolState["tool"];
const TOOLS: { name: ToolName; icon: IconName; label: string; settings?: string }[] = [
  { name: "pen", icon: "pen", label: "Pen", settings: "Pen settings" },
  { name: "highlighter", icon: "highlighter", label: "Highlighter", settings: "Highlighter settings" },
  { name: "eraser", icon: "eraser", label: "Eraser", settings: "Eraser settings" },
  { name: "lasso", icon: "lasso", label: "Lasso: select and move" },
  { name: "shape", icon: "shapes", label: "Shape", settings: "Choose a shape" },
];
const INKED = new Set<ToolName>(["pen", "highlighter", "shape"]);
const near = (a: number, b: number) => Math.abs(a - b) < 0.11;

interface Props {
  tool: InkToolState;
  onTool(next: InkToolState): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  selection: number;
  onSelectionAction(action: "delete" | "done" | "bigger" | "smaller" | { color: string }): void;
  /** Removes all ink from the page in view, in one step Undo brings back. */
  onClearPage?(): void;
  leading?: ReactNode;
  trailing?: ReactNode;
  end?: ReactNode;
  stylusKnown: boolean;
  compact?: boolean;
  compactUndo?: boolean;
}

export default function InkToolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo, selection, onSelectionAction, onClearPage, leading, trailing, end, stylusKnown, compact, compactUndo }: Props) {
  const { space, color, shape } = useTheme();
  const format = useInputFormat();
  const control = Math.round(useControlHeight() * 0.82);
  const [menu, setMenu] = useState<"shape" | "eraser" | "pen" | null>(null);
  const [tray, setTray] = useState(false);
  const [changing, setChanging] = useState<number | null>(null);
  const slotAnchors = [useRef<ViewHandle>(null), useRef<ViewHandle>(null), useRef<ViewHandle>(null)];
  const penQuick = useQuickInks("pen"), highlighterQuick = useQuickInks("highlighter");
  const kind = tool.tool === "highlighter" ? "highlighter" : "pen";
  const quick = kind === "highlighter" ? highlighterQuick : penQuick;
  const hasColour = INKED.has(tool.tool);
  const isHighlight = (c: string) => HIGHLIGHTS.includes(c) || highlighterQuick.includes(c);
  const shapeAnchor = useRef<ViewHandle>(null), eraserAnchor = useRef<ViewHandle>(null), penAnchor = useRef<ViewHandle>(null), highlighterAnchor = useRef<ViewHandle>(null);
  const activeAnchor = useRef<ViewHandle>(null), trayAnchor = useRef<ViewHandle>(null);
  const anchors: Record<ToolName, RefObject<ViewHandle | null> | undefined> = { shape: shapeAnchor, eraser: eraserAnchor, pen: penAnchor, highlighter: highlighterAnchor, lasso: undefined };
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const pick = (name: ToolName) => set({ tool: name, color: name === "highlighter" && !isHighlight(tool.color) ? highlighterQuick[0] : name === "pen" && isHighlight(tool.color) ? penQuick[0] : tool.color });
  const labelFor = ({ name, label }: (typeof TOOLS)[number]) => name === "shape" ? `Shape: ${tool.shape}` : name === "eraser" && tool.eraser === "precise" ? "Eraser, precise" : label;
  const chooseTool = (name: ToolName) => {
    setTray(false);
    if (tool.tool !== name) pick(name);
    else if (name === "pen" || name === "highlighter") setMenu("pen");
    else if (name === "shape" || name === "eraser") setMenu(name);
  };
  const side = format === "touch" ? Math.max(control, 40) : control + 2;

  // A tool: its glyph, and under it the ink it writes with while it is in hand. Tapping the tool in hand opens its settings.
  const button = (item: (typeof TOOLS)[number], inTray = false) => {
    const active = tool.tool === item.name;
    const inked = active && INKED.has(item.name);
    return (
      <Tooltip text={(active && item.settings) || labelFor(item)}>
        {(tooltip) => (
          <Press {...tooltip} onFocusChange={inTray ? undefined : tooltip.onFocusChange} label={labelFor(item)} hint={active ? item.settings : undefined} selected={active} expanded={active && item.settings ? menu !== null : undefined}
            onPress={() => chooseTool(item.name)} height={control} radius={shape.radius.sm} testID={`ink-tool-${item.name}`} hitSlop={format === "touch" && control < 44 ? (44 - control) / 2 : undefined}
            bodyStyle={{ width: side, height: control, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: active ? color.selected : "transparent" }}>
            <Icon name={item.icon} size={19} active={active} color={active ? color.ink : color.inkSoft} />
            <View style={{ width: 16, height: 3, borderRadius: 1.5, backgroundColor: inked ? tool.color : "transparent", opacity: item.name === "highlighter" ? 0.7 : 1, borderWidth: inked ? StyleSheet.hairlineWidth : 0, borderColor: color.lineStrong }} />
          </Press>
        )}
      </Tooltip>
    );
  };
  // Ink colours are the document's, so each sits in a ring that reads on any theme: a dark ink on a dark bar is still a swatch.
  const swatch = (value: string, onPress: () => void, selected: boolean, hint?: string) => (
    <Press key={value} label={`Colour ${value}`} hint={hint} selected={selected} onPress={onPress} feedback="surface" height={control} radius={control / 2} style={{ minWidth: control }} bodyStyle={{ alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: selected ? 2 : 0, borderColor: color.ink }}>
        <View style={{ width: selected ? 14 : 18, height: selected ? 14 : 18, borderRadius: 9, backgroundColor: value, borderWidth: 1, borderColor: color.lineStrong }} />
      </View>
    </Press>
  );
  // Three sizes for the tool in hand: the pen's line, or the eraser's reach. The full range is in the tool's settings.
  const sizes = tool.tool === "eraser"
    ? QUICK_ERASERS.map((value, i) => ({ key: `e${value}`, label: ["Small eraser", "Medium eraser", "Large eraser"][i], dot: 6 + i * 5, ring: true, on: tool.eraserSize === value, pick: () => set({ eraserSize: value }) }))
    : hasColour ? QUICK_WIDTHS.map((value, i) => ({ key: `w${value}`, label: ["Fine line", "Medium line", "Bold line"][i], dot: 4 + i * 4, ring: false, on: near(tool.width, value), pick: () => set({ width: value }) })) : [];
  const sizeDots = sizes.length ? (
    <View role="radiogroup" aria-label={tool.tool === "eraser" ? "Eraser size" : "Line size"} style={{ flexDirection: "row", alignItems: "center" }}>
      {sizes.map((size) => (
        <Press key={size.key} role="radio" checked={size.on} label={size.label} onPress={size.pick} height={control} radius={control / 2} style={{ minWidth: control - 4 }} bodyStyle={{ alignItems: "center", justifyContent: "center" }} testID={`ink-size-${size.key}`}>
          <View style={{ width: size.dot, height: size.dot, borderRadius: size.dot / 2, backgroundColor: size.ring ? "transparent" : size.on ? color.ink : color.inkFaint, borderWidth: size.ring ? 1.5 : 0, borderColor: size.on ? color.ink : color.inkFaint }} />
        </Press>
      ))}
    </View>
  ) : null;

  const shapeItems: MenuItem[] = SHAPES.map((s) => ({ key: s.value, label: s.label, selected: tool.shape === s.value, onSelect: () => set({ tool: "shape", shape: s.value }) }));
  const rule = <Divider vertical style={{ height: space.lg, marginHorizontal: space.xs }} />;
  const undo = <Tooltip text="Undo">{(tooltip) => <IconButton {...tooltip} icon="undo" size="small" label="Undo" disabled={!canUndo} onPress={onUndo} testID="ink-undo" />}</Tooltip>;
  const redo = <Tooltip text="Redo">{(tooltip) => <IconButton {...tooltip} icon="redo" size="small" label="Redo" disabled={!canRedo} onPress={onRedo} testID="ink-redo" />}</Tooltip>;
  const fingersLabel = tool.penOnly ? "Fingers scroll; the pen writes" : "Fingers write too";
  const fingers = stylusKnown ? <Tooltip text={fingersLabel}>{(tooltip) => <IconButton {...tooltip} icon="hand" size="small" label={fingersLabel} active={!tool.penOnly} onPress={() => set({ penOnly: !tool.penOnly })} />}</Tooltip> : null;
  const tools = TOOLS.map((item) => <View key={item.name} ref={compact ? undefined : anchors[item.name]} collapsable={false}>{button(item, compact)}</View>);
  // The tools sit together on one sunken plate, so the row reads as tools, then what they write with, then history.
  const toolGroup = <View role="toolbar" aria-label="Writing tools" style={{ flexDirection: "row", alignItems: "center", gap: space.hair, padding: space.hair, borderRadius: shape.radius.md, backgroundColor: color.sunken }}>{tools}</View>;
  const colours = hasColour ? quick.map((c, i) => (
    <View key={i} ref={compact ? undefined : slotAnchors[i]} collapsable={false}>
      {swatch(c, () => { if (tool.color === c) { setTray(false); setChanging(i); } else set({ color: c }); }, tool.color === c, tool.color === c ? "Tap again to change this colour" : undefined)}
    </View>
  )) : null;
  const selectionActions = (
    <>
      <Tooltip text="Bigger">{(tooltip) => <IconButton {...tooltip} icon="plus" size="small" label="Bigger" onPress={() => onSelectionAction("bigger")} />}</Tooltip>
      <Tooltip text="Smaller">{(tooltip) => <IconButton {...tooltip} icon="minus" size="small" label="Smaller" onPress={() => onSelectionAction("smaller")} />}</Tooltip>
      <Tooltip text="Delete selection">{(tooltip) => <IconButton {...tooltip} icon="trash" size="small" label="Delete selection" onPress={() => { setTray(false); onSelectionAction("delete"); }} />}</Tooltip>
      <Tooltip text="Done">{(tooltip) => <IconButton {...tooltip} icon="check" size="small" label="Done" onPress={() => { setTray(false); onSelectionAction("done"); }} />}</Tooltip>
    </>
  );
  const selectionColours = selection ? INKS.slice(0, 5).map((c) => swatch(c, () => onSelectionAction({ color: c }), false)) : null;
  const activeTool = TOOLS.find((item) => item.name === tool.tool) ?? TOOLS[0];
  const row = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.hair };
  const wideTools = selection ? (
    <>
      <Text variant="label" tone="soft" style={{ paddingHorizontal: space.xs }}>{selection} selected</Text>
      {rule}{selectionColours}{rule}{selectionActions}
    </>
  ) : (
    <>
      {toolGroup}
      {colours ? <>{rule}{colours}</> : null}
      {sizeDots ? <>{rule}{sizeDots}</> : null}
      {fingers ? <>{rule}{fingers}</> : null}
      {trailing ? <>{rule}{trailing}</> : null}
    </>
  );

  return (
    <ToolbarRow start={leading} end={end}>
      {compact ? (
        <View style={row}>
          {selection ? <Text variant="micro" tone="soft">{selection}</Text> : <View ref={activeAnchor} collapsable={false}>{button(activeTool)}</View>}
          {compactUndo && !selection ? undo : null}
          <View ref={trayAnchor} collapsable={false}>
            <Tooltip text={selection ? "Selection actions" : "Writing tools"}>
              {(tooltip) => <IconButton {...tooltip} icon="sliders" size="small" label={selection ? "Selection actions" : "Writing tools"} expanded={tray} active={tray} onPress={() => setTray(true)} />}
            </Tooltip>
          </View>
        </View>
      ) : (
        // From the leading edge, never centred: a tool keeps its place when the colours and sizes beside it come and go. What does
        // not fit scrolls; Undo and Redo stay beside it, always in reach.
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.hair }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ alignItems: "center", gap: space.hair }}>
            {wideTools}
          </ScrollView>
          {selection ? null : <>{rule}{undo}{redo}</>}
        </View>
      )}
      <Popover open={compact === true && tray} anchor={trayAnchor} onClose={() => setTray(false)} label={selection ? "Selection actions" : "Writing tools"} width={296}>
        <View style={{ padding: space.md, gap: space.sm }}>
          <Text variant="label" tone="soft">{selection ? `${selection} selected` : "Writing tools"}</Text>
          {selection ? (
            <>
              <View style={row}>{selectionColours}</View>
              <View style={row}>{selectionActions}</View>
            </>
          ) : (
            <>
              <View style={row}>{toolGroup}</View>
              {colours || sizeDots ? <View style={row}>{colours}{colours && sizeDots ? rule : null}{sizeDots}</View> : null}
              <View style={row}>{undo}{redo}{fingers}</View>
              {trailing ? <View style={row}>{trailing}</View> : null}
            </>
          )}
        </View>
      </Popover>
      <Menu open={menu === "shape"} anchor={compact ? activeAnchor : shapeAnchor} onClose={() => setMenu(null)} items={shapeItems} label="Shapes" side="bottom" />
      <EraserPanel open={menu === "eraser" && tool.tool === "eraser"} anchor={compact ? activeAnchor : eraserAnchor} onClose={() => setMenu(null)} tool={tool} onTool={onTool} stylusKnown={stylusKnown} onClearPage={onClearPage} />
      <Popover open={changing !== null} anchor={compact ? trayAnchor : slotAnchors[changing ?? 0]} onClose={() => setChanging(null)} label="Change this colour" side="bottom">
        <View style={{ padding: space.md }}>
          <ColourSpectrum value={tool.color} onPick={(hex) => { if (changing !== null) inkTools.setQuick(kind, changing, hex); set({ color: hex }); setChanging(null); }} />
        </View>
      </Popover>
      <PenPanel open={menu === "pen" && (tool.tool === "pen" || tool.tool === "highlighter")} anchor={compact ? activeAnchor : tool.tool === "highlighter" ? highlighterAnchor : penAnchor} onClose={() => setMenu(null)} tool={tool} onTool={onTool} />
    </ToolbarRow>
  );
}
