// A colour spectrum to pick ink from with one tap: every hue from deep to light, then greys from black to white. No words; each
// swatch says its colour to a screen reader. Colours are the document's, not the theme's, because ink is written on paper.
import { View } from "react-native";
import { oklchToHex, Press, useTheme } from "@sylf/design-system";

const HUES = Array.from({ length: 12 }, (_, i) => i * 30);
const SHADES = [{ l: 0.32, c: 0.12 }, { l: 0.45, c: 0.16 }, { l: 0.58, c: 0.17 }, { l: 0.7, c: 0.15 }, { l: 0.83, c: 0.1 }];
export const SPECTRUM: string[][] = [
  ...SHADES.map(({ l, c }) => HUES.map((h) => oklchToHex({ l, c, h }).toLowerCase())),
  Array.from({ length: 12 }, (_, i) => oklchToHex({ l: 0.12 + (i * 0.86) / 11, c: 0, h: 0 }).toLowerCase()),
];

export default function ColourSpectrum({ value, onPick }: { value: string; onPick(hex: string): void }) {
  const { color } = useTheme();
  const current = value.toLowerCase();
  return (
    <View role="radiogroup" aria-label="Colours" style={{ gap: 2 }}>
      {SPECTRUM.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: 2 }}>
          {row.map((hex) => {
            const on = hex === current;
            return (
              <Press key={hex} role="radio" checked={on} label={`Colour ${hex}`} onPress={() => onPick(hex)} feedback="none" minHit={20} radius={4} style={{ width: 20, height: 20 }} bodyStyle={{ width: 20, height: 20, borderRadius: 4, backgroundColor: hex, borderWidth: on ? 2 : 0, borderColor: color.ink }} />
            );
          })}
        </View>
      ))}
    </View>
  );
}
