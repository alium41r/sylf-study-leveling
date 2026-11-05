// The room, beside a session studied with a party: whose seat is where, and one honest line if the room cannot be reached. Shown in the Focus
// threshold and in the environment, from the same objects. It reads the session and never keeps time. If the room is out of reach the session still
// counts, because the credit is the session's (owner decision E-13), and the line says so.
import { View } from "react-native";
import { Text, useTheme } from "@sylf/design-system";
import { useAuth, usePartyPresence } from "../backend";
import { useSessionState } from "../context";
import { RoomMembers } from "./RoomMembers";
import { useRoom } from "./useParty";

export function RoomStrip({ watching, compact = true }: { watching: boolean; compact?: boolean }) {
  const { space } = useTheme();
  const { active } = useSessionState();
  const presence = usePartyPresence();
  const me = useAuth().userId;
  const party = active?.party;
  const room = useRoom(party?.partyId ?? null, watching && Boolean(party));
  if (!active || !party) return null;
  const trouble = presence.clientKey === active.clientKey && presence.link !== "in-room" && presence.link !== "idle" ? presence.message ?? "Joining the room." : null;
  return (
    <View testID="room-strip" style={{ alignItems: "center", gap: space.xs }}>
      <Text variant="caption" tone="soft" align="center">{`With ${party.name ?? "your party"}`}</Text>
      {room.state ? <RoomMembers state={room.state} me={me} compact={compact} /> : null}
      {trouble ? <Text variant="caption" tone="soft" align="center" testID="room-strip-note">{trouble}</Text> : null}
    </View>
  );
}
