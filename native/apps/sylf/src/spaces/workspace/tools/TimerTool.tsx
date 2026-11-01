// A window on the one study session. It keeps no time and no state of its own, so it can never disagree with the dock or with Focus, and
// closing it, minimizing it or suspending it changes nothing about the session. The clock stops rendering when the window is out of sight.
import { View } from "react-native";
import { Stack, Text, useTheme } from "@sylf/design-system";
import { sessionLengthLabel } from "@sylf/spaces";
import { useSessionState, useStudySession } from "../../../shell/context";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionLengths, SessionNote, SessionProgress, SessionSubject } from "../../../shell/session/SessionParts";
import { isSeen, ToolPage, type ToolProps } from "./shared";

export default function TimerTool({ lifecycle }: ToolProps) {
  const { space } = useTheme();
  const session = useStudySession();
  const { active, length, plan } = useSessionState();
  const status = session.status();
  const seen = isSeen(lifecycle);
  return (
    <ToolPage padded={false} contentContainerStyle={{ flexGrow: 1, padding: space.lg, justifyContent: "space-between", gap: space.md }}>
      <Stack gap="sm" align="center" style={{ flex: 1, justifyContent: "center" }}>
        <SessionClock live={seen} testID="timer-clock" />
        <Text variant="caption" tone="soft" align="center" numberOfLines={1}>{status === "idle" ? (plan?.title ?? plan?.subject ?? sessionLengthLabel(length)) : `${active?.title}, ${SESSION_STATUS_LABELS[status].toLowerCase()}`}</Text>
        {status === "idle" ? <View style={{ paddingTop: space.sm }}><SessionLengths /></View> : <View style={{ alignSelf: "stretch" }}><SessionProgress live={seen} /></View>}
      </Stack>
      <Stack gap="sm">
        <SessionSubject />
        <SessionActions surface="timer" />
        <SessionNote />
      </Stack>
    </ToolPage>
  );
}
