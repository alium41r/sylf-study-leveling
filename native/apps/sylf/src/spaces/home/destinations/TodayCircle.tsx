// Who is around: friends studying now, as faces, and a way into Circle. With nobody studying it says so plainly, and with no friends yet it offers Circle instead
// of showing an empty row. What a friend has chosen to hide stays hidden, because the server never sent it.
import { View } from "react-native";
import { Avatar, Plane, Press, Text, useTheme } from "@sylf/design-system";
import { useHomeNavigation } from "../../../shell/context";
import { useHomeResult } from "../data";
import type { HomeDataAdapter } from "../data/contracts";

const load = (adapter: HomeDataAdapter) => adapter.circle();

export function CircleCard() {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const circle = useHomeResult("circle", load)?.data;
  if (!circle) return null;
  const people = circle.people;
  const studying = people.filter((person) => person.presence === "focusing");
  const shown = (studying.length ? studying : people).slice(0, 5);
  const line = !people.length ? "Add friends to study alongside them." : studying.length ? `${studying.length} studying now.` : "Nobody is studying right now.";
  return (
    <Plane level="plane" radius="lg" testID="today-circle" style={{ padding: space.lg }}>
      <Press role="button" label={`Circle. ${line} Open Circle`} onPress={() => navigation.select("circle")} bodyStyle={{ gap: space.md }}>
        <Text variant="subheading" role="heading" aria-level={2}>Circle</Text>
        {shown.length ? <View style={{ flexDirection: "row", gap: space.sm }}>{shown.map((person) => <Avatar key={person.id} name={person.name} size={36} presence={person.presence} />)}</View> : null}
        <Text variant="caption" tone="soft">{line}</Text>
      </Press>
    </Plane>
  );
}
