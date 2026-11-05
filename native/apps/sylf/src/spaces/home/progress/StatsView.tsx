// Stats answers where the time goes: how long, on what, and when in the day. Everything comes from two light reads, the summary and the last fifty
// sessions, and never the full report. A subject's share is of what was recorded in the last thirty-odd days, and says so.
import { useState } from "react";
import { View } from "react-native";
import { Button, Callout, Chip, ListRow, Progress, Readout, Stack, Text, useTheme } from "@sylf/design-system";
import { Bars } from "../../../shell/charts/Bars";
import { formatMinutes } from "../format";
import { HomeColumns, Section } from "../HomePage";
import { BANDS, lastDays, rhythmByBand } from "./shared";
import { useRecord, useSessionList } from "./useProgress";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const amount = (minutes: number) => (minutes < 60 ? { value: String(Math.round(minutes)), unit: "min" } : { value: (minutes / 60).toFixed(minutes < 6000 ? 1 : 0), unit: "hr" });

export function StatsView() {
  const { space } = useTheme();
  const record = useRecord();
  const sessions = useSessionList();
  const [period, setPeriod] = useState<7 | 30>(7);
  const [shown, setShown] = useState(8);
  if (!record) return <View testID="progress-stats"><Text tone="soft">Loading your record.</Text></View>;
  if (!record.data) return <View testID="progress-stats"><Callout tone="caution" title="Your record didn't load" message={record.live.failure ?? "Try again in a moment."} /></View>;
  const { summary, schedule } = record.data;
  const days = lastDays(summary, period);
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const active = days.filter((day) => day.minutes > 0).length;
  const subjectTotal = summary.subjectBreakdown.reduce((sum, subject) => sum + subject.seconds, 0);
  const list = sessions?.data?.sessions ?? [];
  const bands = rhythmByBand(list);
  const bandTotal = BANDS.reduce((sum, band) => sum + bands[band], 0);
  return (
    <View testID="progress-stats">
      <HomeColumns
        primary={
          <>
            <View role="radiogroup" aria-label="Period" style={{ flexDirection: "row", gap: space.xs }}>
              <Chip radio label="7 days" selected={period === 7} onPress={() => setPeriod(7)} />
              <Chip radio label="30 days" selected={period === 30} onPress={() => setPeriod(30)} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xxl }} testID="progress-stats-numbers">
              <Readout {...amount(total)} label={`Last ${period} days`} />
              <Readout value={String(active)} unit={active === 1 ? "day" : "days"} label="Days studied" />
              <Readout {...amount(active ? total / active : 0)} label="Average a study day" />
              <Readout {...amount(summary.summary.avgSessionSeconds / 60)} label="Average session" />
            </View>
            <Bars bars={days.map((day) => ({ key: day.date, value: day.minutes, today: day.today, ...(period === 7 ? { label: ["S", "M", "T", "W", "T", "F", "S"][day.weekday] } : {}) }))} target={Math.max(1, schedule.dailyGoalMinutes)} height={96} gap={period === 7 ? 8 : 2} testID="progress-stats-bars" summary={`Study time over the last ${period} days: ${formatMinutes(total)} on ${active} days.`} />
            <Text variant="caption" tone="soft">{`Your target is ${formatMinutes(schedule.dailyGoalMinutes)} a day, drawn as the line.`}</Text>
            <Section title="Time of day">
              {bandTotal > 0 ? (
                <Stack gap="md" testID="progress-rhythm">{BANDS.map((band) => <Progress key={band} value={bands[band] / bandTotal} label={band} showValue />)}</Stack>
              ) : <Text variant="small" tone="soft">{sessions ? "When you study shows here after a few sessions." : "Loading your sessions."}</Text>}
              {bandTotal > 0 ? <Text variant="caption" tone="soft">{`From your last ${list.length} sessions.`}</Text> : null}
            </Section>
          </>
        }
        secondary={[
          <Section key="subjects" title="Subjects">
            {summary.subjectBreakdown.length ? (
              <Stack gap="md" testID="progress-subjects">{summary.subjectBreakdown.map((subject) => <Progress key={subject.name} value={subjectTotal ? subject.seconds / subjectTotal : 0} label={`${subject.name}, ${formatMinutes(Math.round(subject.minutes))}`} showValue />)}</Stack>
            ) : <Text variant="small" tone="soft">Time on each subject appears here after you study one.</Text>}
            {summary.subjectBreakdown.length ? <Text variant="caption" tone="soft">Share of the last month's recorded time.</Text> : null}
          </Section>,
          <Section key="recent" title="Recent sessions">
            {!sessions ? <Text variant="small" tone="soft">Loading your sessions.</Text> : !list.length ? <Text variant="small" tone="soft">Sessions you finish appear here, with their time.</Text> : (
              <Stack gap="xs" testID="progress-sessions">
                {list.slice(0, shown).map((session) => <ListRow key={session.id} title={session.questTitle ?? session.subjectName ?? "Study session"} detail={when(session.startedAt)} value={formatMinutes(Math.max(1, Math.round(session.durationSeconds / 60)))} />)}
                {shown < list.length ? <View style={{ flexDirection: "row" }}><Button title="Show more" size="small" variant="ghost" testID="progress-sessions-more" onPress={() => setShown(shown + 12)} /></View> : null}
              </Stack>
            )}
          </Section>,
        ]}
      />
    </View>
  );
}
