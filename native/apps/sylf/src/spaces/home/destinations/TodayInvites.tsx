// A study party that asked you to join, shown where you start your day and never as an interruption during a session. It only points to Circle, where the
// invitation is answered, so there is one place to answer it. With none pending, it renders nothing.
import { View } from "react-native";
import { Button, Text, useTheme } from "@sylf/design-system";
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
    <View testID="today-invites" style={{ gap: space.sm, padding: space.md, borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }}>
      <Text variant="small" tone="soft">Study party invitation</Text>
      <Text variant="small">{`${first.senderName ?? first.senderUsername} invited you to ${first.partyName}${invites.length > 1 ? `, and ${invites.length - 1} more` : ""}.`}</Text>
      <View style={{ flexDirection: "row" }}><Button title="See in Circle" size="small" testID="today-invites-open" onPress={() => { navigation.setView("circle", "parties"); navigation.select("circle"); }} /></View>
    </View>
  );
}
