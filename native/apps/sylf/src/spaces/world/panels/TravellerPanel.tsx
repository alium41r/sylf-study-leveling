// Who is about to step through: identity and progression from the existing backend. Portraits, the companion and appearance belong to
// the game, so they keep a place here without being drawn.
import { View } from "react-native";
import { Avatar, Divider, Progress, Readout, Row, Stack, Text, useTheme } from "@sylf/design-system";
import { useWorldResult } from "../data";
import { PanelEmpty, PanelLoading, ReservedRow, SectionHeading } from "./shared";


export function TravellerPanel() {
  const { space } = useTheme();
  const result = useWorldResult("traveller");
  if (!result) return <PanelLoading />;
  const traveller = result.data;
  return (
    <Stack gap="lg">
      {traveller ? (
        <>
          <Row gap="md" align="center">
            <Avatar name={traveller.name} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="heading" numberOfLines={1}>{traveller.name}</Text>
              <Text variant="small" tone="soft" numberOfLines={1}>{`${traveller.title}, ${traveller.studyClass}`}</Text>
            </View>
          </Row>
          <Progress value={traveller.levelProgress} label={`Level ${traveller.level}`} showValue />
          <Row gap="xl" wrap>
            <Readout label="Level" value={String(traveller.level)} />
            <Readout label="Rank" value={traveller.rank.replace(/^Rank /, "")} />
            <Readout label="Sylph" value={traveller.sylph.toLocaleString()} />
          </Row>
          <Divider />
          <Stack gap="sm">
            <SectionHeading>Earned this week</SectionHeading>
            <Row gap="xl" wrap>
              <Readout label="XP" value={traveller.earnedThisWeek.xp.toLocaleString()} />
              <Readout label="Sylph" value={traveller.earnedThisWeek.sylph.toLocaleString()} />
            </Row>
            <Text variant="small" tone="soft">Rewards come from your sessions, quests and achievements. Time in World never counts as study.</Text>
          </Stack>
          <Divider />
        </>
      ) : <PanelEmpty icon="progress" title="No traveller yet" message={result.live?.failure ?? "Your level, rank and Sylph could not be loaded."} />}
      <Stack gap="xs" style={{ marginHorizontal: -space.md }}>
        <ReservedRow title="Appearance" detail="Arrives with the game" />
        <ReservedRow title="Companion" detail="Arrives with the game" />
      </Stack>
    </Stack>
  );
}
