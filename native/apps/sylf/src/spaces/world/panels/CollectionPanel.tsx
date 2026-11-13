// What someone has earned so far, from the existing cosmetics. The Locker and the Shop keep their place here (master plan H1), and both
// wait for the game: a purchase is a server transaction on the existing ledgers, and nothing here can make one.
import { View } from "react-native";
import { Chip, Divider, Row, Stack, Text, useTheme } from "@sylf/design-system";
import { useWorldResult } from "../data";
import { PanelEmpty, PanelLoading, ReservedRow, SectionHeading } from "./shared";


export function CollectionPanel() {
  const { space } = useTheme();
  const result = useWorldResult("collection");
  if (!result) return <PanelLoading />;
  const groups = result.data?.groups.length ? result.data.groups : null;
  return (
    <Stack gap="lg">
      {groups ? (
        <>
          <Row justify="space-between">
            <Text variant="small" tone="soft" style={{ flex: 1 }}>Everything here was earned by studying.</Text>
          </Row>
          {groups.map((group) => (
            <Stack key={group.id} gap="sm">
              <SectionHeading>{group.label}</SectionHeading>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {group.items.map((item) => <Chip key={item.id} label={item.name} selected={item.equipped} disabled />)}
              </View>
            </Stack>
          ))}
          <Divider />
        </>
      ) : <PanelEmpty icon="bookmark" title="Nothing here yet" message={result.live?.failure ?? "Frames, titles and name colors you earn appear here."} />}
      <Stack gap="xs" style={{ marginHorizontal: -space.md }}>
        <ReservedRow title="Locker" detail="Equip and arrange. Arrives with the game" />
        <ReservedRow title="Shop" detail="Spend Sylph. Arrives with the game" />
      </Stack>
    </Stack>
  );
}
