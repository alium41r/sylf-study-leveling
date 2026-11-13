// What is past today: the next few dated quests and the goals they serve. Both come from Plan's own read of quests and goals, so Today and Plan never
// disagree and nothing is fetched twice. Either list renders nothing when it is empty: the dashboard never draws a heading over no content.
import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";
import { Divider, Press, Progress, Stack, Text, useTheme } from "@sylf/design-system";
import { useHomeNavigation } from "../../../shell/context";
import { useSubjectColour, useSubjects } from "../../../shell/live";
import { useQuestsAndGoals } from "../plan/usePlan";
import { upcomingQuests } from "./ahead";
import { QuestPath } from "./QuestPath";
import { buildUpcomingQuestSteps } from "./questSteps";
import { GroupLabel } from "./TodayParts";

const MAX_GOALS = 3;
const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });

/** Chronological dated quests coming up after today, connected along a quiet timeline. */
export const TodayUpcoming = memo(function TodayUpcoming({ divided }: { divided?: boolean }) {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const subjects = useSubjects();
  const colourOf = useSubjectColour();
  const now = useMemo(() => new Date(), []);
  const data = useQuestsAndGoals()?.data;
  const upcoming = useMemo(() => upcomingQuests(data?.quests ?? [], now), [data, now]);
  const subjectNames = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects]);
  const openQuests = useCallback(() => { navigation.setView("plan", "quests"); navigation.select("plan"); }, [navigation]);

  const steps = useMemo(
    () => buildUpcomingQuestSteps({ upcoming, subjectNames, colourOf, now, onOpen: openQuests }),
    [colourOf, now, openQuests, subjectNames, upcoming],
  );

  if (!steps.length) return null;

  return (
    <>
      {divided ? <Divider /> : null}
      <Stack gap="md" testID="today-ahead">
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
          <GroupLabel>Coming up</GroupLabel>
          <Text variant="caption" tone="soft">{`${steps.length} scheduled`}</Text>
        </View>
        <QuestPath steps={steps} />
      </Stack>
    </>
  );
});

/** Active long-horizon goals, given full column width so titles breathe without truncation clutter. */
export const TodayGoals = memo(function TodayGoals({ divided }: { divided?: boolean }) {
  const { space } = useTheme();
  const navigation = useHomeNavigation();
  const data = useQuestsAndGoals()?.data;
  const goals = useMemo(() => (data?.goals ?? []).filter((goal) => goal.status !== "COMPLETED").slice(0, MAX_GOALS), [data]);
  const openGoals = useCallback(() => { navigation.setView("plan", "quests"); navigation.select("plan"); }, [navigation]);

  if (!goals.length) return null;

  return (
    <>
      {divided ? <Divider /> : null}
      <Stack gap="md" testID="today-goals">
        <GroupLabel>Goals</GroupLabel>
        <Stack gap="md">
          {goals.map((goal) => {
            const total = goal.quests?.length ?? 0;
            const finished = goal.quests?.filter((quest) => quest.status === "COMPLETED").length ?? 0;
            const detail = [
              goal.targetDate ? `By ${shortDate(goal.targetDate)}` : null,
              total ? `${finished} of ${total} quests done` : "No quests yet",
            ].filter(Boolean).join(" · ");
            return (
              <Press
                key={goal.id}
                role="button"
                label={`${goal.title}. ${detail}. Open goals`}
                testID={`today-goal-${goal.id}`}
                onPress={openGoals}
                bodyStyle={{ gap: space.xs, paddingVertical: space.xs }}
              >
                <Text variant="small" numberOfLines={2}>{goal.title}</Text>
                <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text>
                {total ? <Progress value={finished / total} label={`${goal.title} progress`} /> : null}
              </Press>
            );
          })}
        </Stack>
      </Stack>
    </>
  );
});
