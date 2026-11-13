// The eraser's own settings, opened by tapping the eraser already in hand: what it removes, how large it is, whether the pen's side
// button erases, and clearing the page. The size is the eraser's own, so changing it never changes the pen.
import { useState, type RefObject } from "react";
import { View } from "react-native";
import { Button, IconButton, Popover, Press, Slider, Text, Toggle, useTheme, type ViewHandle } from "@sylf/design-system";
import { ERASER_RANGE, type InkToolState } from "./ink-types";

const MODES: { value: InkToolState["eraser"]; label: string; detail: string }[] = [
  { value: "stroke", label: "Strokes", detail: "Removes each whole stroke it touches" },
  { value: "precise", label: "Precise", detail: "Removes only what it passes over" },
];

interface Props {
  open: boolean;
  anchor: RefObject<ViewHandle | null>;
  onClose(): void;
  tool: InkToolState;
  onTool(next: InkToolState): void;
  /** A pen has been seen on this device, so its side button is worth a setting. */
  stylusKnown: boolean;
  /** Removes all ink from the page in view, as one step that Undo brings back. Absent where there is nothing to clear. */
  onClearPage?(): void;
}

export default function EraserPanel({ open, anchor, onClose, tool, onTool, stylusKnown, onClearPage }: Props) {
  const { space, color, shape } = useTheme();
  const [size, setSize] = useState<number | null>(null);
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const shown = size ?? tool.eraserSize;
  const mode = MODES.find((item) => item.value === tool.eraser) ?? MODES[0];
  return (
    <Popover open={open} anchor={anchor} onClose={onClose} label="Eraser settings" width={296} side="bottom">
      <View style={{ padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <View role="radiogroup" aria-label="What the eraser removes" style={{ flex: 1, flexDirection: "row", borderRadius: shape.radius.md, backgroundColor: color.sunken }}>
            {MODES.map((item) => {
              const on = tool.eraser === item.value;
              return (
                <Press key={item.value} role="radio" checked={on} label={`${item.label}. ${item.detail}`} onPress={() => set({ eraser: item.value })} style={{ flex: 1 }} testID={`eraser-mode-${item.value}`}
                  bodyStyle={{ height: 32, alignItems: "center", justifyContent: "center", backgroundColor: on ? color.selected : "transparent" }}>
                  <Text variant="label" tone={on ? "ink" : "soft"}>{item.label}</Text>
                </Press>
              );
            })}
          </View>
          <IconButton icon="close" size="small" label="Close" onPress={onClose} />
        </View>
        <Text variant="caption" tone="soft">{mode.detail}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }} aria-hidden>
            <View style={{ width: Math.min(44, shown * 1.1), height: Math.min(44, shown * 1.1), borderRadius: 22, borderWidth: 1.5, borderColor: color.inkSoft }} />
          </View>
          <View style={{ flex: 1 }}>
            <Slider label="Eraser size" hideValue value={shown} min={ERASER_RANGE.min} max={ERASER_RANGE.max} step={ERASER_RANGE.step} format={(v) => String(Math.round(v))} onChange={setSize} onCommit={(v) => { setSize(null); set({ eraserSize: Math.round(v) }); }} />
          </View>
          <Text variant="micro" tone="soft" style={{ minWidth: 22, textAlign: "center" }}>{Math.round(shown)}</Text>
        </View>
        {stylusKnown ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="label">Pen button erases</Text>
              <Text variant="caption" tone="soft">Hold the pen&apos;s side button to erase</Text>
            </View>
            <Toggle label="Pen button erases" value={tool.buttonErases} onChange={(buttonErases) => set({ buttonErases })} />
          </View>
        ) : null}
        {onClearPage ? <Button title="Clear this page" icon="trash" size="small" variant="quiet" onPress={() => { onClose(); onClearPage(); }} testID="eraser-clear-page" /> : null}
      </View>
    </Popover>
  );
}
