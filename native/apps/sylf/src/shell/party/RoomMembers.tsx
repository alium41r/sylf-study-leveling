// The people in a party's room, and what each is doing. Only states, never a clock: the session is the one clock (ADR 0015), and a room that showed
// minutes would be a second one. A person who has left the room, or never came, simply reads as "in the party".
import { View } from "react-native";
import { Avatar, Press, Text, useTheme } from "@sylf/design-system";
import { openProfile } from "../profile/store";
import type { PartyState } from "@sylf/backend";

const WORDS: Record<string, string> = { FOCUSING: "Focusing", PAUSED: "Paused" };

export function roomLine(state: PartyState, userId: number): { name: string; detail: string; focusing: boolean } {
  const person = state.members.find((member) => member.userId === userId);
  const seat = state.activeSession?.members.find((member) => member.userId === userId && member.timerState !== "LEFT");
  return { name: person?.name ?? person?.username ?? "Member", detail: seat ? WORDS[seat.timerState] ?? "In the room" : "In the party", focusing: seat?.timerState === "FOCUSING" };
}

export function RoomMembers({ state, me, compact = false }: { state: PartyState; me: number | null; compact?: boolean }) {
  const { space } = useTheme();
  const lines = state.members.map((member) => ({ id: member.userId, username: member.username, ...roomLine(state, member.userId) }));
  const focusing = lines.filter((line) => line.focusing).length;
  if (compact) {
    return (
      <View testID="party-room" accessible aria-label={`${focusing} of ${lines.length} focusing in ${state.party.name}. ${lines.map((line) => `${line.name}, ${line.detail}`).join(". ")}`} style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", justifyContent: "center" }}>
        {lines.map((line) => <Avatar key={line.id} name={line.name} size={28} presence={line.focusing ? "focusing" : undefined} />)}
      </View>
    );
  }
  return (
    <View testID="party-room" style={{ gap: space.sm }}>
      {lines.map((line) => (
        <Press key={line.id} role="button" label={`${line.name}, ${line.detail}. Open profile`} onPress={() => openProfile(line.username)} testID={`party-room-member-${line.id}`} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Avatar name={line.name} size={36} presence={line.focusing ? "focusing" : undefined} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="small" numberOfLines={1}>{line.id === me ? `${line.name} (you)` : line.name}</Text>
            <Text variant="caption" tone="soft">{line.detail}</Text>
          </View>
        </Press>
      ))}
    </View>
  );
}
