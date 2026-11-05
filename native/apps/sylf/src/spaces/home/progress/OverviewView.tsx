// Overview answers one question: am I on track? Today against the target the student set, this week against the week that target makes, and thirty days
// with the Marker on today. Bars scale to the target and never to the longest day, so one minute looks like one minute. Level and rank are one quiet
// line. There is no HP here: Native shows none.
import { View } from "react-native";
import { Callout, Marker, Meter, Progress, Stack, Text, useTheme } from "@sylf/design-system";
import { useStats } from "../../../shell/live";
import { formatMinutes } from "../format";
import { HomeColumns, Section } from "../HomePage";
import { Bars, type Bar } from "../../../shell/charts/Bars";
import { WeeklyQuestCard } from "../../../shell/charts/WeeklyQuestCard";
import { lastDays, meterUnits, thisWeek, weekTarget } from "./shared";
import { useRecord, useWeeklyQuest } from "./useProgress";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Monday to Sunday of this week, with the days still to come left empty, so the week keeps one shape all week. */
function weekBars(week: ReturnType<typeof thisWeek>): Bar[] {
  const bars: Bar[] = week.map((day) => ({ key: day.date, value: day.minutes, label: WEEKDAY_LETTERS[day.weekday], today: day.today }));
  for (let ahead = 1; bars.length < 7; ahead++) bars.push({ key: `ahead-${ahead}`, value: 0, label: WEEKDAY_LETTERS[(((week.at(-1)?.weekday ?? 0) + ahead) % 7)], future: true });
  return bars;
}

export function OverviewView() {
  const { space } = useTheme();
  const stats = useStats();
  const result = useRecord();
  const weekly = useWeeklyQuest()?.data;
  const record = result?.data;
  if (!result) return <View testID="progress-overview"><Text tone="soft">Loading your record.</Text></View>;
  if (!record) return <View testID="progress-overview"><Callout tone="caution" title="Your record didn't load" message={result.live.failure ?? "Try again in a moment."} /></View>;
  const { summary, schedule } = record;
  const days = lastDays(summary, 30);
  const week = thisWeek(summary);
  const todayStudied = Math.max(Math.round((stats?.todayStudySeconds ?? 0) / 60), days.at(-1)?.minutes ?? 0);
  const goal = schedule.dailyGoalMinutes;
  const rest = schedule.restDays.includes(week.at(-1)?.weekday ?? -1);
  const weekStudied = week.reduce((sum, day) => sum + day.minutes, 0);
  const weekGoal = weekTarget(goal, schedule.restDays);
  const left = goal - todayStudied;
  return (
    <View testID="progress-overview">
      <HomeColumns
        primary={
          <>
            <Stack gap="md">
              <Section title="Today">
                {rest && todayStudied === 0 ? <Text variant="small" tone="soft" testID="progress-today">A rest day. Nothing to reach today.</Text> : (
                  <View testID="progress-today"><Stack gap="sm">
                    <Meter {...meterUnits(todayStudied, goal)} label={`${formatMinutes(todayStudied)} of ${formatMinutes(goal)} studied today`} />
                    <Text variant="caption" tone="soft">{left > 0 ? `${formatMinutes(left)} to your target.` : "Target reached."}</Text>
                  </Stack></View>
                )}
              </Section>
              <Section title="This week">
                <View testID="progress-week"><Stack gap="sm">
                  <Bars bars={weekBars(week)} target={goal} height={88} gap={8} testID="progress-week-bars" summary={`This week: ${formatMinutes(weekStudied)} of ${formatMinutes(weekGoal)}. ${week.map((day) => `${day.date} ${day.minutes ? formatMinutes(day.minutes) : "none"}`).join(", ")}.`} />
                  <Text variant="caption" tone="soft">{`${formatMinutes(weekStudied)} of the ${formatMinutes(weekGoal)} your schedule asks for.`}</Text>
                </Stack></View>
              </Section>
            </Stack>
            <Section title="Thirty days">
              <Stack gap="sm">
                <Bars bars={days.map((day) => ({ key: day.date, value: day.minutes, today: day.today }))} target={Math.max(1, goal)} height={64} gap={2} testID="progress-month-bars" summary={`Study time over the last ${days.length} days. ${formatMinutes(days.reduce((sum, day) => sum + day.minutes, 0))} on ${days.filter((day) => day.minutes > 0).length} days.`} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Text variant="caption" tone="soft" style={{ flex: 1 }}>{days.length} days ago</Text>
                  <Marker />
                  <Text variant="caption" tone="ink">Today</Text>
                </View>
              </Stack>
            </Section>
          </>
        }
        secondary={[
          <Section key="level" title="Level">
            <Stack gap="sm">
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
                <Text variant="title" testID="progress-level">{stats ? `Level ${stats.level}` : "Level"}</Text>
                {stats ? <Text variant="caption" tone="soft">{`Rank ${stats.hunterRank}`}</Text> : null}
              </View>
              {stats ? <Progress value={Math.min(1, stats.currentXP / Math.max(1, stats.xpToNextLevel))} label={`Level ${stats.level} progress`} showValue /> : null}
              {stats ? <Text variant="caption" tone="soft" testID="progress-xp">{`${stats.currentXP.toLocaleString()} of ${stats.xpToNextLevel.toLocaleString()} XP`}</Text> : null}
            </Stack>
          </Section>,
          ...(weekly ? [<Section key="weekly" title="This week's quest"><WeeklyQuestCard quest={weekly} /></Section>] : []),
          <Section key="run" title="Run">
            <Stack gap="xs">
              <Text variant="small">{stats ? `${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"} in a row` : "A streak starts with a session."}</Text>
              <Text variant="caption" tone="soft">{`${summary.summary.activeDaysLast30} study days in the last 30.`}</Text>
              {stats?.sylph !== undefined ? <Text variant="caption" tone="soft" testID="progress-sylph">{`${stats.sylph.toLocaleString()} Sylph`}</Text> : null}
            </Stack>
          </Section>,
        ]}
      />
    </View>
  );
}
