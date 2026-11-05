// Where you stand, in one quiet line: level with its progress, the run of days, and Sylph. Every number is the server's. It is the first thing under the
// greeting because it answers "how am I doing" before anything asks for action, and it opens Progress for the rest.
import { View } from "react-native";
import { Press, Progress, Text, useTheme } from "@sylf/design-system";
import { useHomeNavigation } from "../../../shell/context";
import { useStats } from "../../../shell/live";

export function TodayStatus() {
  const { space } = useTheme();
  const stats = useStats();
  const navigation = useHomeNavigation();
  if (!stats) return null;
  const fraction = Math.min(1, Math.max(0, stats.currentXP / Math.max(1, stats.xpToNextLevel)));
  return (
    <Press role="button" label={`Level ${stats.level}, ${stats.currentXP} of ${stats.xpToNextLevel} XP. ${stats.streakDays} day streak. Open Progress`} onPress={() => navigation.select("progress")} testID="today-status" bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.lg, flexWrap: "wrap" }}>
      <View style={{ minWidth: 200, flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
          <Text variant="small">{`Level ${stats.level}`}</Text>
          <Text variant="caption" tone="soft">{`${stats.currentXP.toLocaleString()} of ${stats.xpToNextLevel.toLocaleString()} XP`}</Text>
        </View>
        <Progress value={fraction} label={`Level ${stats.level} progress`} />
      </View>
      <View style={{ gap: 2 }}><Text variant="small">{`${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`}</Text><Text variant="caption" tone="soft">in a row</Text></View>
      {stats.sylph !== undefined ? <View style={{ gap: 2 }}><Text variant="small">{stats.sylph.toLocaleString()}</Text><Text variant="caption" tone="soft">Sylph</Text></View> : null}
    </Press>
  );
}
