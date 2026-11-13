// A window on the one study session. It keeps no time and no state of its own, so it can never disagree with the dock or with Focus, and
// closing it, minimizing it or suspending it changes nothing about the session. The clock stops rendering when the window is out of sight.
import { useState } from "react";
import { View } from "react-native";
import { Stack, Text, useTheme } from "@sylf/design-system";
import { useSessionState, useStudySession } from "../../../shell/context";
import { EnterFocusButton } from "../../../shell/focus/enter";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionLengths, SessionNote, SessionProgress, SessionSubject } from "../../../shell/session/SessionParts";
import { isSeen, ToolPage, type ToolProps } from "./shared";

export default function TimerTool({ lifecycle }: ToolProps) {
  const { space } = useTheme();
  const session = useStudySession();
  const { active, plan } = useSessionState();
  const status = session.status();
  const seen = isSeen(lifecycle);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const narrow = size.width > 0 && size.width < 264;
  const short = size.height > 0 && size.height < 380;
  const summary = status === "idle" ? plan?.title ?? plan?.subject : `${active?.title}, ${SESSION_STATUS_LABELS[status].toLowerCase()}`;
  return (
    <ToolPage padded={false} onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize((old) => old.width === width && old.height === height ? old : { width, height })}
      contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center", justifyContent: "center", padding: narrow || short ? space.sm : space.lg, gap: short ? space.sm : space.lg }}>
      <Stack gap="sm" align="center">
        <SessionClock variant={narrow || short ? "readout" : "readoutXL"} live={seen} testID="timer-clock" />
        {summary ? <Text variant="caption" tone="soft" align="center" numberOfLines={2}>{summary}</Text> : null}
        {status === "idle" ? <View style={{ paddingTop: space.sm }}><SessionLengths /></View> : <View style={{ alignSelf: "stretch" }}><SessionProgress live={seen} /></View>}
      </Stack>
      <Stack gap="sm">
        <SessionSubject />
        <SessionActions surface="timer" compact={narrow} />
        <EnterFocusButton surface="timer" />
        <SessionNote />
      </Stack>
    </ToolPage>
  );
}
