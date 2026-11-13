// Where the person stands: level and the way to the next, today's study against their own target, the run of days, the week and Sylph. Every number is the
// server's, read through the shell's and Progress's own resources, so this adds no request of its own. It draws no surface: two measures side by side, a row of
// figures and the week as bars. A read that has not answered shows a placeholder, and one that failed says so and offers the retry.
import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";
import { Button, Divider, Meter, Placeholder, Progress, Text, useTheme } from "@sylf/design-system";
import { Bars, type Bar } from "../../../shell/charts/Bars";
import { useHomeNavigation } from "../../../shell/context";
import { useStatsResult } from "../data";
import type { DayTarget } from "../data/contracts";
import { formatMinutes } from "../format";
import { lastDays, meterUnits } from "../progress/shared";
import { useRecord } from "../progress/useProgress";
import { GroupLabel, PartHeader, Stat } from "./TodayParts";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
/** Each measure wraps under the other below this, so neither is squeezed. */
const MEASURE_WIDTH = 220;

export function targetLine(target: DayTarget): string {
  if (target.rest) return "A rest day. Nothing to reach today.";
  if (target.goal <= 0) return "";
  if (target.studied >= target.goal) return `Daily target reached · ${formatMinutes(target.goal)}.`;
  if (target.studied <= 0) return `${formatMinutes(target.goal)} daily target.`;
  return `${formatMinutes(target.goal - target.studied)} left of ${formatMinutes(target.goal)} target.`;
}

export const TodayProgress = memo(function TodayProgress({ target, onTarget }: { target: DayTarget | undefined; onTarget: () => void }) {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const statsResult = useStatsResult();
  const record = useRecord()?.data;
  const stats = statsResult?.data ?? null;
  const week = useMemo(() => (record ? lastDays(record.summary, 7) : null), [record]);
  const bars: Bar[] = useMemo(() => (week ? week.map((day) => ({ key: day.date, value: day.minutes, today: day.today, label: LETTERS[day.weekday] })) : []), [week]);
  const total = week?.reduce((sum, day) => sum + day.minutes, 0) ?? 0;
  const openProgress = useCallback(() => navigation.select("progress"), [navigation]);
  const goal = target && !target.rest && target.goal > 0 ? target.goal : null;
  const measure = { flexGrow: 1, flexShrink: 1, flexBasis: MEASURE_WIDTH, minWidth: 0, gap: space.sm } as const;

  return (
    <View testID="today-momentum" style={{ gap: space.xl }}>
      <PartHeader title="Your progress" action="Progress" onAction={openProgress} actionTestID="today-open-progress" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.xxl, rowGap: space.lg }}>
        <View testID="today-level" style={measure}>
          <GroupLabel>Level</GroupLabel>
          {stats ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: space.sm }}>
                <Text variant="readoutXL" numberOfLines={1}>{String(stats.level)}</Text>
                {stats.hunterRank ? <Text variant="small" tone="soft">{`Rank ${stats.hunterRank}`}</Text> : null}
              </View>
              <Progress value={Math.min(1, Math.max(0, stats.currentXP / Math.max(1, stats.xpToNextLevel)))} label={`Level ${stats.level} progress`} />
              <Text variant="caption" tone="soft">{`${stats.currentXP.toLocaleString()} of ${stats.xpToNextLevel.toLocaleString()} XP`}</Text>
            </>
          ) : statsResult ? (
            <View testID="today-level-failed" style={{ gap: space.xs, alignItems: "flex-start" }}>
              <Text variant="small" tone="soft">{statsResult.live.failure ?? "Your level didn't load."}</Text>
              <Button title="Try again" size="small" variant="ghost" onPress={statsResult.live.retry} />
            </View>
          ) : <View aria-label="Loading" style={{ gap: space.md, paddingVertical: space.sm }}><Placeholder width="40%" height={28} /><Placeholder width="80%" /></View>}
        </View>
        <View testID="today-target" style={measure}>
          <GroupLabel>Studied today</GroupLabel>
          {target ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: space.sm }}>
                <Text variant="readoutXL" numberOfLines={1}>{String(target.studied < 60 ? target.studied : Math.floor(target.studied / 60))}</Text>
                <Text variant="small" tone="soft">{target.studied < 60 ? "min" : target.studied % 60 ? `hr ${target.studied % 60} min` : "hr"}</Text>
              </View>
              {goal !== null ? <Meter {...meterUnits(target.studied, goal)} label={`${formatMinutes(target.studied)} studied of ${formatMinutes(goal)} target`} /> : null}
              {goal !== null ? <Text variant="caption" tone="soft">{targetLine(target)}</Text>
                : target.rest ? <Text variant="caption" tone="soft">{targetLine(target)}</Text>
                : <Button title="Set a daily target" size="small" testID="today-set-target" style={{ alignSelf: "flex-start" }} onPress={onTarget} />}
            </>
          ) : <Text variant="small" tone="soft">Study total unavailable</Text>}
        </View>
      </View>
      <Divider />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", columnGap: space.xxl, rowGap: space.lg }}>
        {stats ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.xl, rowGap: space.md, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
            <Stat testID="today-streak" value={String(stats.streakDays)} label={stats.streakDays === 1 ? "day in a row" : "days in a row"} />
            {week ? <Stat testID="today-week" value={formatMinutes(total)} label="last 7 days" /> : null}
            {stats.sylph !== undefined ? <Stat testID="today-sylph" value={stats.sylph.toLocaleString()} label="Sylph" /> : null}
          </View>
        ) : null}
        {week ? <View style={{ flexGrow: 1, flexBasis: 180, maxWidth: 260, minWidth: 0 }}><Bars bars={bars} target={Math.max(1, record!.schedule.dailyGoalMinutes)} height={44} gap={6} testID="today-week-bars" summary={`The last seven days: ${formatMinutes(total)} in all.`} /></View> : null}
      </View>
    </View>
  );
});
