// A study party that asked you to join, shown where you start your day and never as an interruption during a session. It only points to Circle, where the
// invitation is answered, so there is one place to answer it. With none pending, it renders nothing.
import { View } from "react-native";
import { Button, Marker, Text, useTheme } from "@sylf/design-system";
import { useSessionState, useHomeNavigation } from "../../../shell/context";
import { usePartySummary } from "../../../shell/party/useParty";

export function TodayInvites() {
  const { color, shape, space } = useTheme();
  const navigation = useHomeNavigation();
  const { active } = useSessionState();
  const { summary } = usePartySummary();
  const invites = summary?.pendingInvites ?? [];
  if (!invites.length || active) return null;
  const first = invites[0]!;
  return (
    <View testID="today-invites" style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap", paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }}>
      <Marker />
      <Text variant="small" style={{ flex: 1, minWidth: 180 }}>{`${first.senderName ?? first.senderUsername} invited you to study in ${first.partyName}${invites.length > 1 ? `, and ${invites.length - 1} more` : ""}.`}</Text>
      <Button title="See in Circle" size="small" testID="today-invites-open" onPress={() => { navigation.setView("circle", "parties"); navigation.select("circle"); }} />
    </View>
  );
}
