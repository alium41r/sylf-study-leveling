// Overview answers one question: am I on track? Today against the target the student set, this week against the week that target makes, and thirty days
// with the Marker on today. Bars scale to the target and never to the longest day, so one minute looks like one minute. Level and rank are one quiet
// line. There is no HP here: Native shows none.
import { Platform, View } from "react-native";
import { Callout, Marker, Meter, Press, Progress, Stack, Text, Tooltip, useTheme } from "@sylf/design-system";
import { useStats } from "../../../shell/live";
import { formatMinutes } from "../format";
import { HomeColumns, Section } from "../HomePage";
import { barHeight, lastDays, thisWeek, weekTarget } from "./shared";
import { useRecord } from "./useProgress";

const STRIP_HEIGHT = 56;

function HeatStrip({ days, target }: { days: ReturnType<typeof lastDays>; target: number }) {
  const { color, shape, space } = useTheme();
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const active = days.filter((day) => day.minutes > 0).length;
  const corner = Math.min(shape.radius.xs, 3);
  return (
    <Stack gap="sm">
      <View accessible role="img" aria-label={`Study time over the last ${days.length} days. ${formatMinutes(total)} on ${active} days.`} style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", height: STRIP_HEIGHT }}>
        {days.map((day) => (
          <Tooltip key={day.date} text={`${day.date}, ${day.minutes ? formatMinutes(day.minutes) : "no study"}`}>
            {(tooltip) => (
              <Press {...tooltip} label={`${day.date}, ${day.minutes ? formatMinutes(day.minutes) : "no study"}`} aria-hidden feedback="none" {...(Platform.OS === "web" ? { tabIndex: -1 } : { accessible: false })} minHit={0} style={{ flex: 1 }} bodyStyle={{ height: STRIP_HEIGHT, justifyContent: "flex-end" }}>
                <View style={{ height: Math.max(barHeight(day.minutes, target, STRIP_HEIGHT), 1), borderTopLeftRadius: corner, borderTopRightRadius: corner, backgroundColor: day.today ? color.accent.mote : day.minutes ? color.lineStrong : color.line }} />
              </Press>
            )}
          </Tooltip>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text variant="caption" tone="soft" style={{ flex: 1 }}>{days.length} days ago</Text>
        <Marker />
        <Text variant="caption" tone="ink">Today</Text>
      </View>
    </Stack>
  );
}

export function OverviewView() {
  const { space } = useTheme();
  const stats = useStats();
  const result = useRecord();
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
                    <Meter value={Math.min(todayStudied, goal)} max={Math.max(1, goal)} label={`${formatMinutes(todayStudied)} of ${formatMinutes(goal)} studied today`} />
                    <Text variant="caption" tone="soft">{left > 0 ? `${formatMinutes(left)} to your target.` : "Target reached."}</Text>
                  </Stack></View>
                )}
              </Section>
              <Section title="This week">
                <View testID="progress-week"><Stack gap="sm">
                  <Progress value={weekGoal ? Math.min(1, weekStudied / weekGoal) : 0} label={`${formatMinutes(weekStudied)} of ${formatMinutes(weekGoal)} this week`} />
                  <Text variant="caption" tone="soft">{`${formatMinutes(weekStudied)} of the ${formatMinutes(weekGoal)} your schedule asks for.`}</Text>
                </Stack></View>
              </Section>
            </Stack>
            <Section title="Thirty days"><HeatStrip days={days} target={Math.max(1, goal)} /></Section>
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
