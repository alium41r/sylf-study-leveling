// The pen's own settings, opened by tapping the pen already in hand: its kind, size, line, pressure and colour. Every kind is shown
// as a stroke it writes, in the chosen colour, on paper, with the page's own outline code, so what you pick is what the page draws.
// Colours are the document's, not the theme's, because ink is written on paper.
import { useMemo, useState, type RefObject } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ColorPicker, DOCUMENT_DEFAULTS, Icon, IconButton, oklchToHex, Popover, Press, Segmented, Slider, Text, Toggle, useTheme, type ViewHandle } from "@sylf/design-system";
import { inkGeometry, inkOutline, type InkSample } from "@sylf/shared";
import { addPaletteInk, inkPages } from "./pen-palettes";
import { brushOf, WIDTH_RANGE, type InkToolState, type Nib } from "./ink-types";
import { inkTools, useCustomInks } from "./ink-tool";

export const NIBS: { value: Nib; label: string }[] = [
  { value: "fountain", label: "Fountain" },
  { value: "ballpoint", label: "Ballpoint" },
  { value: "fineliner", label: "Fineliner" },
  { value: "pencil", label: "Pencil" },
  { value: "brush", label: "Brush" },
];
/** A ring of hues, deep enough to read on paper, so one tap mixes a colour; Fine tune does the rest. */
const HUES = Array.from({ length: 12 }, (_, i) => ({ name: `Hue ${i * 30}°`, hex: oklchToHex({ l: 0.52, c: 0.16, h: i * 30 }) }));
const LINES: { value: InkToolState["lineStyle"]; label: string }[] = [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }];

/** A pen's sample: a wave written lightly, then hard, then lightly again, leaning a little, as a hand would. */
function sampleStroke(width: number, height: number): InkSample[] {
  const n = 40, pad = 8;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [pad + t * (width - pad * 2), height / 2 + Math.sin(t * Math.PI * 2) * height * 0.22, 0.15 + 0.8 * Math.sin(t * Math.PI), i * 12, 28, 18, 0, 0] as InkSample;
  });
}
function strokePath(style: ReturnType<typeof brushOf>, width: number, height: number) {
  return inkGeometry.inkSegments(sampleStroke(width, height), style).map((segment) => inkOutline.outlineSvg(inkOutline.inkOutline(segment, style))).filter(Boolean).join(" ");
}

function InkSampleView({ tool, width, height }: { tool: InkToolState; width: number; height: number }) {
  const style = brushOf(tool, "pen");
  const d = useMemo(() => strokePath(style, width, height), [style.color, style.width, style.nib, style.pressure, style.lineStyle, width, height]);
  return <Svg width={width} height={height}><Path d={d} fill={style.color} fillOpacity={inkGeometry.inkOpacity(style)} /></Svg>;
}

interface Props {
  open: boolean;
  anchor: RefObject<ViewHandle | null>;
  onClose(): void;
  tool: InkToolState;
  onTool(next: InkToolState): void;
}

export default function PenPanel({ open, anchor, onClose, tool, onTool }: Props) {
  const { space, shape, color } = useTheme();
  const custom = useCustomInks();
  const pen = tool.tool === "pen";
  const pages = inkPages(pen ? "pen" : "highlighter", custom);
  const [page, setPage] = useState(() => Math.max(0, pages.findIndex((p) => p.inks.includes(tool.color))));
  const [mixing, setMixing] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const shown = pages[Math.min(page, pages.length - 1)];
  const step = (direction: number) => set({ width: Math.round(Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, tool.width + direction * WIDTH_RANGE.step)) * 10) / 10 });
  const paper = { backgroundColor: DOCUMENT_DEFAULTS.paper, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: color.line };
  const close = () => { setMixing(false); onClose(); };
  const finishMixing = () => { addPaletteInk(tool.color, pages, inkTools.addInk); setMixing(false); };

  const swatch = (value: string) => {
    const selected = tool.color.toLowerCase() === value.toLowerCase();
    return (
      <Press key={value} label={`Colour ${value}`} selected={selected} onPress={() => set({ color: value })} feedback="none" style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: selected ? 2 : 0, borderColor: color.ink }}>
          <View style={{ width: selected ? 18 : 24, height: selected ? 18 : 24, borderRadius: 12, backgroundColor: value, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
        </View>
      </Press>
    );
  };
  const row = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" tone="soft">{hint}</Text>
      </View>
      <Toggle label={label} hint={hint} value={value} onChange={onChange} />
    </View>
  );

  return (
    <Popover open={open} anchor={anchor} onClose={close} label={pen ? "Pen settings" : "Highlighter settings"} width={340} side="bottom">
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {mixing ? <IconButton icon="chevronLeft" size="small" label="Back to the pen" onPress={finishMixing} /> : null}
          <Text variant="subheading" style={{ flex: 1 }}>{mixing ? "Your colour" : pen ? `${NIBS.find((n) => n.value === tool.nib)?.label ?? "Ballpoint"} pen` : "Highlighter"}</Text>
          <IconButton icon="close" size="small" label="Close" onPress={close} />
        </View>
        {mixing ? (
          <>
            <View style={[paper, { alignItems: "center", overflow: "hidden" }]}>
              <InkSampleView tool={{ ...tool, color: preview ?? tool.color }} width={300} height={52} />
            </View>
            <ColorPicker label="Ink" value={tool.color} onPreview={setPreview} onCommit={(hex) => { setPreview(null); set({ color: hex }); }} swatches={HUES} recents={custom} note="Kept with your colours" />
          </>
        ) : (
          <>
            {pen ? (
              <View role="radiogroup" aria-label="Pen kind" style={{ flexDirection: "row", gap: space.xs }}>
                {NIBS.map((nib) => {
                  const on = tool.nib === nib.value;
                  return (
                    <Press key={nib.value} role="radio" checked={on} label={`${nib.label} pen`} onPress={() => set({ nib: nib.value })} feedback="none" radius={shape.radius.sm} style={{ flex: 1 }} bodyStyle={{ alignItems: "center" }}>
                      <View style={[paper, { borderColor: on ? color.accent.ink : color.line, borderWidth: on ? 2 : 1, overflow: "hidden" }]}>
                        <InkSampleView tool={{ ...tool, nib: nib.value, width: Math.max(2.2, Math.min(tool.width, 4)), lineStyle: "solid" }} width={52} height={38} />
                      </View>
                    </Press>
                  );
                })}
              </View>
            ) : null}
            <View style={[paper, { alignItems: "center", overflow: "hidden" }]} aria-label="How the pen writes">
              <InkSampleView tool={{ ...tool, width: size ?? tool.width }} width={300} height={52} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
              <IconButton icon="minus" size="small" label="Thinner" disabled={tool.width <= WIDTH_RANGE.min} onPress={() => step(-1)} />
              <View style={{ flex: 1 }}>
                <Slider label="Size" value={size ?? tool.width} min={WIDTH_RANGE.min} max={WIDTH_RANGE.max} step={WIDTH_RANGE.step} format={(v) => v.toFixed(1)} onChange={setSize} onCommit={(v) => { setSize(null); set({ width: Math.round(v * 10) / 10 }); }} />
              </View>
              <IconButton icon="plus" size="small" label="Thicker" disabled={tool.width >= WIDTH_RANGE.max} onPress={() => step(1)} />
            </View>
            {pen ? (
              <>
                <Segmented label="Line" fit value={tool.lineStyle} options={LINES} onChange={(lineStyle) => set({ lineStyle })} />
                {row("Pen pressure", tool.pressure ? "Pressing harder writes wider" : "Every line is the same width", tool.pressure, (pressure) => set({ pressure }))}
                {row("Straighten lines", "A nearly straight line becomes straight", tool.straighten, (straighten) => set({ straighten }))}
              </>
            ) : null}
            <View style={{ gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Text variant="caption" tone="soft">{shown.label}</Text>
                <View role="tablist" aria-label="Colour sets" style={{ flexDirection: "row" }}>
                  {pages.map((p, i) => (
                    <Press key={p.label} role="tab" selected={i === page} label={`${p.label} colours`} onPress={() => setPage(i)} feedback="none" minHit={28} style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === page ? color.ink : color.inkGhost }} />
                    </Press>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                {shown.inks.map(swatch)}
                <Press label="Mix a colour" onPress={() => setMixing(true)} feedback="none" style={{ width: 30, height: 32, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.lineStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="plus" size={14} color={color.inkSoft} />
                  </View>
                </Press>
              </View>
            </View>
          </>
        )}
      </View>
    </Popover>
  );
}
