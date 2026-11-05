// The hero: what to do now, and the way to start it. The ring is today's target (the one number a student checks), the words are the next thing, and a window
// onto the World's sky for the hour sits at the edge, as the dashboard's one piece of scenery. Begin is the only filled control on the page.
import { View } from "react-native";
import { Button, Marker, Plane, Stack, Text, useTheme, useWindowClass } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { Ring } from "../../../shell/charts/Ring";
import { useSessionReadout } from "../../../shell/context";
import { SessionClock } from "../../../shell/session/SessionParts";
import type { DayTarget } from "../data/contracts";
import { formatMinutes } from "../format";
import { Scenery } from "./TodayScenery";
import { ringNumber } from "./todayRing";

export function TodayHero({ sky, target, title, detail, subjectColour, active, live, onBegin, onChoose }: { sky: WorldSky; /** The clock beats only while Today is on screen. */ live: boolean; target?: DayTarget; title: string; detail: string; subjectColour: string | null; active: boolean; onBegin: () => void; onChoose: () => void }) {
  const { color, space } = useTheme();
  const { size } = useWindowClass();
  const compact = size === "compact";
  const pad = compact ? space.lg : space.xl;
  const studied = target?.studied ?? 0;
  const goal = Math.max(1, target?.goal ?? 0);
  const rest = target?.rest === true;
  const number = ringNumber(studied);
  // While a countdown runs the ring is the session, so it and the clock in its middle say one thing. Otherwise it is today against the target.
  const readout = useSessionReadout(active && live);
  const sessionFraction = active && readout.fraction !== null ? readout.fraction : null;
  const ring = (
    <Ring value={sessionFraction ?? (rest ? 0 : studied / goal)} size={compact ? 120 : 164} stroke={compact ? 7 : 9} label={sessionFraction !== null ? "This session" : rest ? "A rest day" : `${formatMinutes(studied)} of ${formatMinutes(goal)} studied today`} testID="today-ring">
      {active ? <><SessionClock variant={compact ? "title" : "readout"} live={live} testID="today-clock" /><Text variant="caption" tone="soft">this session</Text></> : rest ? <><Text variant="small">Rest</Text><Text variant="caption" tone="soft">day</Text></> : <><Text variant={compact ? "title" : "readout"}>{number.value}</Text><Text variant="caption" tone="soft">{`${number.unit} of ${formatMinutes(goal)}`}</Text></>}
    </Ring>
  );
  const words = (
    <Stack gap="md" flex={1} style={{ minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Marker />
        <Text variant="caption" tone="soft">{active ? "In progress" : title ? "Next up" : "Ready when you are"}</Text>
      </View>
      <Stack gap="xs">
        <Text variant={compact ? "subheading" : "title"} numberOfLines={2} testID="today-next-title">{title || "Pick something to study"}</Text>
        {detail ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {subjectColour ? <View aria-hidden style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: subjectColour }} /> : null}
            <Text variant="small" tone="soft" numberOfLines={1} style={{ flexShrink: 1 }}>{detail}</Text>
          </View>
        ) : null}
      </Stack>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button title={active ? "Back to your session" : "Begin"} variant="emphasis" icon="play" testID="today-begin" onPress={onBegin} />
        {active ? null : <Button title="Choose a rhythm" variant="ghost" testID="today-choose" onPress={onChoose} />}
      </View>
    </Stack>
  );
  return (
    <Plane level="raised" radius="xl" testID="today-next" style={{ padding: pad, gap: space.lg, overflow: "hidden" }}>
      {compact ? <View style={{ height: 124, marginTop: -pad, marginHorizontal: -pad }}><Scenery sky={sky} bleed testID="today-window" /></View> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? space.lg : space.xxl }}>
        {ring}
        {words}
        {compact ? null : <View style={{ width: 312, alignSelf: "stretch", minHeight: 196, marginVertical: -pad, marginRight: -pad }}><Scenery sky={sky} bleed testID="today-window" /></View>}
      </View>
      {target && !rest && studied >= goal ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}><Marker color={color.positive.mark} /><Text variant="caption" tone="soft">Today's target reached.</Text></View> : null}
    </Plane>
  );
}
