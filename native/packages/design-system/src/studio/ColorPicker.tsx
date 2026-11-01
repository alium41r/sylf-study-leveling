// Perceptual color choice. Three sliders replace the web's two-dimensional board: each works with touch, stylus, mouse,
// keyboard and screen readers, and moving one never changes the others' perceived value.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { appearance } from "@sylf/shared";
import { hexToOklch, oklchToHex } from "../color/oklch";
import { contrast } from "../color/palette";
import { Slider } from "../components/Slider";
import { TextField } from "../components/Field";
import { Disclosure } from "../components/Structure";
import { svgId } from "../logic/svg-id";
import { Icon } from "../icons";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { useTheme } from "../theme/context";

const GradientTrack = memo(function GradientTrack({ id: name, stops }: { id: string; stops: string[] }) {
  const { shape } = useTheme();
  const id = svgId(name);
  return (
    <View style={{ height: 14, borderRadius: Math.min(shape.radius.xs, 7), overflow: "hidden" }}>
      <Svg width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            {stops.map((color, index) => <Stop key={index} offset={index / (stops.length - 1)} stopColor={color} />)}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

function Swatch({ hex, name, selected, onPress }: { hex: string; name: string; selected: boolean; onPress: () => void }) {
  const { color, shape } = useTheme();
  const needsEdge = contrast(hex, color.plane) < 1.4;
  return (
    <Press label={name} selected={selected} onPress={onPress} feedback="none" radius={shape.radius.sm} hitSlop={4}>
      <View style={{ width: 32, height: 32, borderRadius: shape.radius.sm, backgroundColor: hex, alignItems: "center", justifyContent: "center", borderWidth: needsEdge ? 1 : 0, borderColor: color.lineStrong }}>
        {selected ? <Icon name="check" size={16} color={contrast(hex, "#ffffff") >= contrast(hex, "#000000") ? "#ffffff" : "#000000"} /> : null}
      </View>
    </Press>
  );
}

export interface ColorPickerProps {
  label: string;
  value: string;
  /** Called continuously while dragging. Must be cheap: it feeds preview scopes only. */
  onPreview: (hex: string) => void;
  onCommit: (hex: string) => void;
  swatches: { name: string; hex: string }[];
  recents?: string[];
  note?: string;
}

const HUES = Array.from({ length: 13 }, (_, i) => i * 30);

export function ColorPicker({ label, value, onPreview, onCommit, swatches, recents = [], note }: ColorPickerProps) {
  const { space } = useTheme();
  const seed = useMemo(() => hexToOklch(value), [value]);
  const [lch, setLch] = useState(seed);
  const [hexText, setHexText] = useState(value.toUpperCase());
  const lastValue = useRef(value);

  // Follow outside changes without losing the hue of a gray that the user is still tuning.
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    const next = hexToOklch(value);
    setLch((current) => (next.c < 0.005 ? { ...next, h: current.h } : next));
    setHexText(value.toUpperCase());
  }, [value]);

  const hexOf = (next: typeof lch) => oklchToHex(next);
  const change = (patch: Partial<typeof lch>) => {
    const next = { ...lch, ...patch };
    const hex = hexOf(next);
    setLch(next);
    setHexText(hex.toUpperCase());
    lastValue.current = hex;
    onPreview(hex);
  };
  const commit = () => onCommit(hexOf(lch));
  const typed = (text: string) => {
    setHexText(text);
    const withHash = text.startsWith("#") ? text : `#${text}`;
    if (appearance.isValidHex(withHash)) onCommit(appearance.normalizeHex(withHash).toLowerCase());
  };

  const hueStops = useMemo(() => HUES.map((h) => oklchToHex({ l: Math.max(0.55, lch.l), c: Math.max(0.1, lch.c), h })), [lch.l, lch.c]);
  const chromaStops = useMemo(() => [0, 0.09, 0.18, 0.27, 0.37].map((c) => oklchToHex({ ...lch, c })), [lch.l, lch.h]);
  const depthStops = useMemo(() => [0.08, 0.3, 0.5, 0.7, 0.9, 0.99].map((l) => oklchToHex({ ...lch, l })), [lch.c, lch.h]);
  const shown = useMemo(() => [...swatches, ...recents.filter((hex) => !swatches.some((s) => s.hex === hex)).map((hex) => ({ name: `Recent ${hex}`, hex }))], [swatches, recents]);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        <Text variant="subheading">{label}</Text>
        {note ? <Text variant="caption" tone="soft">{note}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {shown.map((swatch) => <Swatch key={swatch.hex} hex={swatch.hex} name={swatch.name} selected={swatch.hex.toLowerCase() === value.toLowerCase()} onPress={() => onCommit(swatch.hex.toLowerCase())} />)}
      </View>
      <Disclosure title="Fine tune" detail={value.toUpperCase()}>
        <Slider label="Hue" value={lch.h} min={0} max={360} step={1} format={(v) => `${Math.round(v)}°`} onChange={(h) => change({ h, c: lch.c < 0.02 ? 0.12 : lch.c })} onCommit={commit} track={<GradientTrack id={`${label}-hue`} stops={hueStops} />} />
        <Slider label="Vibrance" value={lch.c} min={0} max={0.37} step={0.005} format={(v) => `${Math.round((v / 0.37) * 100)}%`} onChange={(c) => change({ c })} onCommit={commit} track={<GradientTrack id={`${label}-chroma`} stops={chromaStops} />} />
        <Slider label="Depth" value={lch.l} min={0.08} max={0.99} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onChange={(l) => change({ l })} onCommit={commit} track={<GradientTrack id={`${label}-depth`} stops={depthStops} />} />
        <TextField label={`${label} hex code`} value={hexText} onChangeText={typed} autoCapitalize="characters" autoCorrect={false} maxLength={7} monospace />
      </Disclosure>
    </View>
  );
}
