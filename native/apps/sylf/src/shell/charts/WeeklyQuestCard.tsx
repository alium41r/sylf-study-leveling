// The week's focus quest, from the server: how much of the week's target is done, when it resets, and what finishing it pays. Nothing is computed here, and the
// reward is the server's own (it scales with level). Shown on Today and on Progress, from one component, so they always agree.
import { View } from "react-native";
import { Meter, Text, useTheme } from "@sylf/design-system";
import type { WeeklyQuest } from "@sylf/backend";
import { formatMinutes } from "../../spaces/home/format";
import { meterUnits } from "../../spaces/home/progress/shared";

export function weeklyQuestLine(quest: WeeklyQuest) {
  if (quest.isCompleted) return "Done this week. It starts again on Sunday.";
  const days = quest.daysRemaining ?? 0;
  return `${days === 0 ? "Resets tonight" : days === 1 ? "Resets tomorrow" : `Resets in ${days} days`}.`;
}

export function WeeklyQuestCard({ quest }: { quest: WeeklyQuest }) {
  const { color, shape, space } = useTheme();
  const progress = Math.min(quest.progressMinutes, quest.targetMinutes);
  const reward = [quest.xpReward ? `${quest.xpReward.toLocaleString()} XP` : "", quest.sylphReward ? `${quest.sylphReward.toLocaleString()} Sylph` : ""].filter(Boolean).join(" and ");
  return (
    <View testID="weekly-quest" style={{ gap: space.sm, padding: space.md, borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        <Text variant="small" tone="soft">This week's focus quest</Text>
        {quest.streakWeeks ? <Text variant="caption" tone="soft">{`${quest.streakWeeks} ${quest.streakWeeks === 1 ? "week" : "weeks"} running`}</Text> : null}
      </View>
      <Meter {...meterUnits(progress, quest.targetMinutes)} label={`${formatMinutes(quest.progressMinutes)} of ${formatMinutes(quest.targetMinutes)} this week`} />
      <Text variant="small">{`${formatMinutes(quest.progressMinutes)} of ${formatMinutes(quest.targetMinutes)}`}</Text>
      <Text variant="caption" tone="soft">{`${weeklyQuestLine(quest)}${reward && !quest.isCompleted ? ` Finish it for ${reward}.` : ""}`}</Text>
    </View>
  );
}

/** The same quest as one inline block, for places that already sit inside a card (a card inside a card is clutter). */
export function WeeklyQuestInline({ quest }: { quest: WeeklyQuest }) {
  const { space } = useTheme();
  const progress = Math.min(quest.progressMinutes, quest.targetMinutes);
  return (
    <View testID="weekly-quest" style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
        <Text variant="caption" tone="soft">Focus quest this week</Text>
        <Text variant="caption" tone="soft">{quest.isCompleted ? "Done" : weeklyQuestLine(quest).replace(/\.$/, "")}</Text>
      </View>
      <Meter {...meterUnits(progress, quest.targetMinutes)} label={`${formatMinutes(quest.progressMinutes)} of ${formatMinutes(quest.targetMinutes)} this week`} />
      <Text variant="small">{`${formatMinutes(quest.progressMinutes)} of ${formatMinutes(quest.targetMinutes)}`}</Text>
    </View>
  );
}
