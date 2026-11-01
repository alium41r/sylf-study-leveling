// Progress keeps gamification quiet: one line for the level, three numbers, and one small chart. Only today's bar spends the
// accent. The chart has one series, so its title names it and it needs no legend.
import { useState } from "react";
import { Platform, View } from "react-native";
import { Button, Icon, Press, Progress, Readout, Stack, Text, Tooltip, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { useHomeResult } from "../data";
import type { Achievement, HomeDataAdapter, StudyDay } from "../data/contracts";
import { formatMinutes } from "../format";
import { EmptyPage, FailedPage, HomeColumns, HomePage, LoadingPage, PageTitle, Section } from "../HomePage";

const load = (adapter: HomeDataAdapter) => adapter.progress(new Date());
const CHART_HEIGHT = 120;
const COLUMN = 36;
const BAR = 24;

function WeekChart({ week }: { week: StudyDay[] }) {
  const { color, shape, space } = useTheme();
  const longest = week.reduce((most, day) => (day.minutes > most.minutes ? day : most), week[0]);
  const today = week.find((day) => day.today);
  const summary = week.map((day) => `${day.day} ${day.minutes ? formatMinutes(day.minutes) : "nothing"}`).join(", ");
  const corner = Math.min(shape.radius.xs, 4);
  return (
    <Stack gap="sm">
      <View accessible role="img" aria-label={`Study time by day. ${summary}.`} style={{ flexDirection: "row", justifyContent: "space-between", maxWidth: 560 }}>
        {week.map((day) => {
          const name = `${day.day}, ${day.minutes ? formatMinutes(day.minutes) : "no study"}`;
          return (
            <View key={day.day} style={{ width: COLUMN, gap: space.xs }}>
              {/* Hover and long press show the exact value. The chart's name already carries them for keyboards and screen readers. */}
              <Tooltip text={name}>
                {(tooltip) => (
                  <Press {...tooltip} label={name} aria-hidden feedback="none" {...(Platform.OS === "web" ? { tabIndex: -1 } : { accessible: false })} style={{ width: COLUMN }} bodyStyle={{ height: CHART_HEIGHT, alignItems: "center", justifyContent: "flex-end" }}>
                    <View style={{ width: BAR, height: Math.max(2, (day.minutes / Math.max(longest.minutes, 1)) * CHART_HEIGHT), borderTopLeftRadius: corner, borderTopRightRadius: corner, backgroundColor: day.today ? color.accent.mote : color.lineStrong }} />
                  </Press>
                )}
              </Tooltip>
              <Text variant="caption" tone={day.today ? "ink" : "soft"} align="center" numberOfLines={1}>{day.day}</Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="soft">{longest.minutes ? `Today ${today?.minutes ? formatMinutes(today.minutes) : "nothing"}. Longest day ${longest.day}, ${formatMinutes(longest.minutes)}.` : "Nothing recorded this week yet."}</Text>
    </Stack>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  const { color, space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [claiming, setClaiming] = useState(false);
  // The server decides whether it is earned and what it pays. A second press, or a stale screen, is refused there.
  const claim = async () => {
    if (!backend) return;
    setClaiming(true);
    try { await backend.reads.claimAchievement(achievement.id); notice(`${achievement.title} claimed.`); }
    catch (error) { notice(describeFailureText(error)); }
    setClaiming(false);
    backend.resources.invalidate("progress");
  };
  return (
    <View accessible={!achievement.claimable} aria-label={`${achievement.title}. ${achievement.earned ? "Earned" : "Not earned yet"}. ${achievement.detail}`} style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 18, height: 22, alignItems: "center", justifyContent: "center" }}><Icon name={achievement.earned || achievement.claimable ? "check" : "lock"} size={16} color={color.inkSoft} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" tone={achievement.earned ? "ink" : "soft"}>{achievement.title}</Text>
        <Text variant="caption" tone="soft">{achievement.detail}</Text>
      </View>
      {achievement.claimable ? <Button title={claiming ? "Claiming" : "Claim"} size="small" disabled={claiming} testID={`progress-claim-${achievement.id}`} onPress={() => void claim()} /> : null}
    </View>
  );
}

export function ProgressDestination() {
  const { space } = useTheme();
  const result = useHomeResult("progress", load);
  const progress = result?.data;
  return (
    <HomePage destination="progress" eyebrow="Your study record" provenance={result?.provenance} live={result?.live} ready={result !== null}>
      {!result ? <LoadingPage title="Progress" /> : !progress && result.live?.failure ? <FailedPage title="Progress" icon="progress" live={result.live} /> : !progress ? <EmptyPage title="Progress" icon="progress" heading="Nothing recorded yet" message="Your study time and achievements will appear here after your first session." /> : (
        <>
          <PageTitle title="Progress" />
          <HomeColumns
            primary={
              <>
                <Stack gap="md">
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
                    <Text variant="title">Level {progress.level}</Text>
                    <Text variant="caption" tone="soft">{progress.rank}</Text>
                  </View>
                  <Progress value={progress.levelProgress} label={`Level ${progress.level} progress`} showValue />
                  {progress.levelDetail ? <Text variant="caption" tone="soft" testID="progress-xp">{progress.levelDetail}</Text> : null}
                </Stack>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xxl }}>
                  {progress.stats.map((stat) => <Readout key={stat.id} value={stat.value} label={stat.label} unit={stat.unit} />)}
                </View>
                <Section title="Study time this week"><WeekChart week={progress.week} /></Section>
              </>
            }
            secondary={[
              <Section key="subjects" title="Subjects">
                {progress.subjects.length ? <Stack gap="md">{progress.subjects.map((subject) => <Progress key={subject.id} value={subject.share} label={subject.name} showValue />)}</Stack> : <Text variant="small" tone="soft">Time on each subject appears here after you study one.</Text>}
              </Section>,
              <Section key="achievements" title="Achievements">
                <Stack gap="md">{progress.achievements.map((achievement) => <AchievementRow key={achievement.id} achievement={achievement} />)}</Stack>
              </Section>,
            ]}
          />
        </>
      )}
    </HomePage>
  );
}
