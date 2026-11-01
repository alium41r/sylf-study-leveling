// Controls for before the game. The sky and the drift are real and saved on this device. Sound, detail and controls wait for something
// to act on, so they are present and say so.
import { Platform, View } from "react-native";
import { Divider, ListRow, Press, Stack, Text, Toggle, useTheme } from "@sylf/design-system";
import { SKY_LABELS, WORLD_SKIES, type SkyChoice, type WorldSky } from "@sylf/spaces";
import { useWorldController } from "../../../shell/context";
import { SKY_STYLES } from "../art/skies";
import { ReservedRow, SectionHeading } from "./shared";

const CHOICES: SkyChoice[] = ["auto", ...WORLD_SKIES];
const TILE = 74;

function SkyTile({ choice, shows, selected, onSelect }: { choice: SkyChoice; shows: WorldSky; selected: boolean; onSelect: () => void }) {
  const { color, shape, space } = useTheme();
  const bands = SKY_STYLES[shows].swatch;
  return (
    <Press testID={`world-sky-${choice}`} role="radio" checked={selected} label={SKY_LABELS[choice]} onPress={onSelect} feedback="sink" radius={shape.radius.sm} {...(Platform.OS === "web" ? { tabIndex: 0 } : {})} bodyStyle={{ width: TILE, gap: space.xs }}>
      <View style={{ height: 44, borderRadius: shape.radius.sm, overflow: "hidden", borderWidth: selected ? 2 : 1, borderColor: selected ? color.accent.ink : color.line }}>
        {bands.map((band, index) => <View key={index} style={{ flex: index === 1 ? 1.4 : 1, backgroundColor: band }} />)}
      </View>
      <Text variant="caption" tone={selected ? "ink" : "soft"} numberOfLines={2} align="center">{SKY_LABELS[choice]}</Text>
    </Press>
  );
}

export function PreparationsPanel({ sky }: { sky: WorldSky }) {
  const { motion, space } = useTheme();
  const controller = useWorldController();
  const { sky: choice = "auto", drift = true } = controller.snapshot();
  const still = motion.amount === 0;
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <SectionHeading>Sky</SectionHeading>
        <View role="radiogroup" aria-label="Sky" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {CHOICES.map((option) => <SkyTile key={option} choice={option} shows={option === "auto" ? sky : option} selected={option === choice} onSelect={() => controller.updateSnapshot({ sky: option })} />)}
        </View>
        <Text variant="small" tone="soft">{choice === "auto" ? "Follows the time of day where you are." : "Kept on this device."}</Text>
      </Stack>
      <Divider />
      <Stack gap="xs" style={{ marginHorizontal: -space.md }}>
        <ListRow title="Drift" detail={still ? "Off while motion is reduced" : "Clouds and falling petals"} trailing={<Toggle label="Drift" value={drift && !still} disabled={still} onChange={(value) => controller.updateSnapshot({ drift: value })} />} />
        <ReservedRow title="Sound" detail="Arrives with the game" />
        <ReservedRow title="Detail" detail="Set for this device with the game" />
        <ReservedRow title="Controls" detail="Arrives with the game" />
      </Stack>
    </Stack>
  );
}
