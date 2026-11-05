// A friend in the list: face, name, what they are doing, and what they have chosen to show. Tapping opens their profile. Nothing here is computed: the status
// and detail lines are built from what the server sent, and a hidden value reads "hidden" rather than zero.
import { View } from "react-native";
import { Avatar, Press, Text, useTheme } from "@sylf/design-system";
import type { CirclePerson } from "../data/contracts";
import { openProfile } from "../../../shell/profile/store";

export function PersonRow({ person, live }: { person: CirclePerson; live: boolean }) {
  const { space } = useTheme();
  const open = live && person.username ? () => openProfile(person.username!) : undefined;
  return (
    <Press role={open ? "button" : undefined} label={`${person.name}. ${person.status}. ${person.detail ?? ""}`} onPress={open} disabled={!open} testID="circle-person" bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs }}>
      <Avatar name={person.name} size={40} presence={person.presence} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="small" numberOfLines={1}>{person.name}</Text>
        <Text variant="caption" tone={person.presence === "focusing" ? "accent" : "soft"} numberOfLines={1}>{person.status}</Text>
        {person.detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{person.detail}</Text> : null}
      </View>
    </Press>
  );
}
