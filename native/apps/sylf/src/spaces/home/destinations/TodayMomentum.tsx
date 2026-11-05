// Momentum: how things are going, in one place. Level and its progress, the week as bars against the person's own target, the run of days, Sylph, and the
// week's focus quest. Every number is the server's. It opens Progress, where the rest lives.
import { View } from "react-native";
import { Badge, Plane, Press, Progress, Stack, Text, useTheme } from "@sylf/design-system";
import { Bars, type Bar } from "../../../shell/charts/Bars";
import { WeeklyQuestInline } from "../../../shell/charts/WeeklyQuestCard";
import { useHomeNavigation } from "../../../shell/context";
import { useStats } from "../../../shell/live";
import { formatMinutes } from "../format";
import { lastDays } from "../progress/shared";
import { useRecord, useWeeklyQuest } from "../progress/useProgress";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function MomentumCard() {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const stats = useStats();
  const record = useRecord()?.data;
  const weekly = useWeeklyQuest()?.data;
  const week = record ? lastDays(record.summary, 7) : null;
  const bars: Bar[] = week ? week.map((day) => ({ key: day.date, value: day.minutes, today: day.today, label: LETTERS[day.weekday] })) : [];
  const total = week?.reduce((sum, day) => sum + day.minutes, 0) ?? 0;
  if (!stats && !record) return null;
  return (
    <Plane level="raised" radius="lg" testID="today-momentum" style={{ padding: space.lg, gap: space.lg }}>
      <Press role="button" label={stats ? `Your momentum. Level ${stats.level}. Open Progress` : "Open Progress"} onPress={() => navigation.select("progress")} bodyStyle={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <Text variant="subheading" role="heading" aria-level={2}>Your momentum</Text>
          {stats?.hunterRank ? <Badge label={`Rank ${stats.hunterRank}`} /> : null}
        </View>
        {stats ? (
          <Stack gap="xs">
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
              <Text variant="title">{`Level ${stats.level}`}</Text>
              <Text variant="caption" tone="soft">{`${stats.currentXP.toLocaleString()} of ${stats.xpToNextLevel.toLocaleString()} XP`}</Text>
            </View>
            <Progress value={Math.min(1, Math.max(0, stats.currentXP / Math.max(1, stats.xpToNextLevel)))} label={`Level ${stats.level} progress`} />
          </Stack>
        ) : null}
      </Press>
      {week ? (
        <Stack gap="xs">
          <Bars bars={bars} target={Math.max(1, record!.schedule.dailyGoalMinutes)} height={56} gap={6} testID="today-week-bars" summary={`The last seven days: ${formatMinutes(total)} in all.`} />
          <Text variant="caption" tone="soft">{`${formatMinutes(total)} in the last 7 days`}</Text>
        </Stack>
      ) : null}
      {stats ? (
        <View style={{ flexDirection: "row", gap: space.xxl }}>
          <View style={{ gap: 2 }}><Text variant="value">{`${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`}</Text><Text variant="caption" tone="soft">in a row</Text></View>
          {stats.sylph !== undefined ? <View style={{ gap: 2 }}><Text variant="value">{stats.sylph.toLocaleString()}</Text><Text variant="caption" tone="soft">Sylph</Text></View> : null}
        </View>
      ) : null}
      {weekly ? <WeeklyQuestInline quest={weekly} /> : null}
    </Plane>
  );
}
