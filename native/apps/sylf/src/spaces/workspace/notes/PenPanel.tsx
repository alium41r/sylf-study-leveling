// The pen's own settings, opened by tapping the pen already in hand: its kind, size, line, pressure and colour. Every kind is shown
// as a stroke it writes, in the chosen colour, on paper, with the page's own outline code, so what you pick is what the page draws.
// Colours are the document's, not the theme's, because ink is written on paper.
import { useMemo, useState, type RefObject } from "react";
import { View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { DOCUMENT_DEFAULTS, Icon, IconButton, Popover, Press, Slider, Text, Toggle, useTheme, type ViewHandle } from "@sylf/design-system";
import { inkGeometry, inkOutline, type InkSample } from "@sylf/shared";
import ColourSpectrum from "./ColourSpectrum";
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
  const set = (patch: Partial<InkToolState>) => onTool({ ...tool, ...patch });
  const shown = pages[Math.min(page, pages.length - 1)];
  const step = (direction: number) => set({ width: Math.round(Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, tool.width + direction * WIDTH_RANGE.step)) * 10) / 10 });
  const paper = { backgroundColor: DOCUMENT_DEFAULTS.paper, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: color.line };
  const close = () => { setMixing(false); onClose(); };
  const finishMixing = () => { addPaletteInk(tool.color, pages, inkTools.addInk); setMixing(false); };

  const swatch = (value: string) => {
    const selected = tool.color.toLowerCase() === value.toLowerCase();
    return (
      <Press key={value} label={`Colour ${value}`} selected={selected} onPress={() => set({ color: value })} feedback="none" style={{ width: 28, height: 30, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: selected ? 2 : 0, borderColor: color.ink }}>
          <View style={{ width: selected ? 16 : 22, height: selected ? 16 : 22, borderRadius: 11, backgroundColor: value, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" }} />
        </View>
      </Press>
    );
  };
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
      <Text variant="label">{label}</Text>
      <Toggle label={label} value={value} onChange={onChange} />
    </View>
  );
  const closeButton = <IconButton icon="close" size="small" label="Close" onPress={close} />;

  return (
    <Popover open={open} anchor={anchor} onClose={close} label={pen ? "Pen settings" : "Highlighter settings"} width={296} side="bottom">
      <View style={{ padding: space.md, gap: space.sm }}>
        {mixing ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <IconButton icon="chevronLeft" size="small" label="Back to the pen" onPress={finishMixing} />
              {closeButton}
            </View>
            <ColourSpectrum value={tool.color} onPick={(hex) => { set({ color: hex }); addPaletteInk(hex, pages, inkTools.addInk); setMixing(false); }} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              {pen ? (
                <View role="radiogroup" aria-label="Pen kind" style={{ flex: 1, flexDirection: "row", gap: space.xs }}>
                  {NIBS.map((nib) => {
                    const on = tool.nib === nib.value;
                    return (
                      <Press key={nib.value} role="radio" checked={on} label={`${nib.label} pen`} onPress={() => set({ nib: nib.value })} feedback="none" radius={shape.radius.sm} style={{ flex: 1 }} bodyStyle={{ alignItems: "center" }}>
                        <View style={[paper, { borderColor: on ? color.accent.ink : color.line, borderWidth: on ? 2 : 1, overflow: "hidden" }]}>
                          <InkSampleView tool={{ ...tool, nib: nib.value, width: Math.max(2.2, Math.min(tool.width, 4)), lineStyle: "solid" }} width={38} height={30} />
                        </View>
                      </Press>
                    );
                  })}
                </View>
              ) : <View style={{ flex: 1 }} />}
              {closeButton}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <IconButton icon="minus" size="small" label="Thinner" disabled={tool.width <= WIDTH_RANGE.min} onPress={() => step(-1)} />
              <View style={{ flex: 1 }}>
                <Slider label="Size" hideValue value={size ?? tool.width} min={WIDTH_RANGE.min} max={WIDTH_RANGE.max} step={WIDTH_RANGE.step} format={(v) => v.toFixed(1)} onChange={setSize} onCommit={(v) => { setSize(null); set({ width: Math.round(v * 10) / 10 }); }} />
              </View>
              <Text variant="micro" tone="soft" style={{ minWidth: 22, textAlign: "center" }}>{(size ?? tool.width).toFixed(1)}</Text>
              <IconButton icon="plus" size="small" label="Thicker" disabled={tool.width >= WIDTH_RANGE.max} onPress={() => step(1)} />
            </View>
            {pen ? (
              <>
                <View role="radiogroup" aria-label="Line" style={{ flexDirection: "row", gap: space.xs }}>
                  {LINES.map((line) => {
                    const on = tool.lineStyle === line.value;
                    return (
                      <Press key={line.value} role="radio" checked={on} label={line.label} onPress={() => set({ lineStyle: line.value })} feedback="surface" radius={16} style={{ flex: 1 }} bodyStyle={{ height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? color.selected : color.sunken, borderWidth: 1, borderColor: on ? color.lineStrong : "transparent" }}>
                        <Svg width={44} height={6}>
                          <Line x1={3} y1={3} x2={41} y2={3} stroke={on ? color.ink : color.inkSoft} strokeWidth={3} strokeLinecap="round" strokeDasharray={line.value === "dashed" ? "9 7" : line.value === "dotted" ? "0.1 6" : undefined} />
                        </Svg>
                      </Press>
                    );
                  })}
                </View>
                {toggle("Pen pressure", tool.pressure, (pressure) => set({ pressure }))}
                {toggle("Straighten lines", tool.straighten, (straighten) => set({ straighten }))}
              </>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {shown.inks.map(swatch)}
              <Press label="Mix a colour" onPress={() => setMixing(true)} feedback="none" style={{ width: 28, height: 30, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.lineStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="plus" size={12} color={color.inkSoft} />
                </View>
              </Press>
            </View>
            {pages.length > 1 ? (
              <View role="tablist" aria-label="Colour sets" style={{ flexDirection: "row", justifyContent: "center" }}>
                {pages.map((p, i) => (
                  <Press key={p.label} role="tab" selected={i === page} label={`${p.label} colours`} onPress={() => setPage(i)} feedback="none" minHit={28} style={{ width: 18, height: 14, alignItems: "center", justifyContent: "center" }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? color.ink : color.inkGhost }} />
                  </Press>
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>
    </Popover>
  );
}
