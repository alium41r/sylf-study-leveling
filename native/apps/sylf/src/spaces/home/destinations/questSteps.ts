// Pure helpers mapping Today's quests and upcoming dated quests into sequential QuestPath steps.
import type { Quest } from "@sylf/backend";
import type { Objective } from "../data/contracts";
import { dayWords } from "./ahead";
import type { QuestStep } from "./QuestPath";

export function buildTodayQuestSteps({
  objectives,
  colourOf,
  sending,
  busy,
  onTick,
  onStudy,
}: {
  objectives: Objective[];
  colourOf: (subjectId: number | null | undefined) => string | null;
  sending: boolean;
  busy: boolean;
  onTick: (objective: Objective) => void;
  onStudy: (objective: Objective) => void;
}): QuestStep[] {
  const firstPending = objectives.findIndex((objective) => !objective.done);
  return objectives.map((objective, index) => {
    const canStudy = !(objective.done || busy || objective.questId === undefined);
    const meta = objective.detail && objective.subject && !objective.detail.includes(objective.subject)
      ? `${objective.subject} · ${objective.detail}`
      : objective.detail;
    return {
      id: objective.id,
      title: objective.title,
      meta,
      subjectColour: colourOf(objective.subjectId),
      done: objective.done,
      active: index === firstPending,
      disabled: sending || !objective.completion,
      testID: `today-quest-${objective.id}`,
      onToggle: () => onTick(objective),
      ...(canStudy ? {
        actionLabel: "Study this",
        actionTestID: `today-study-${objective.id}`,
        onAction: () => onStudy(objective),
      } : {}),
    };
  });
}

export function buildUpcomingQuestSteps({
  upcoming,
  subjectNames,
  colourOf,
  now,
  onOpen,
}: {
  upcoming: Quest[];
  subjectNames: ReadonlyMap<number, string>;
  colourOf: (subjectId: number | null | undefined) => string | null;
  now: Date;
  onOpen: () => void;
}): QuestStep[] {
  return upcoming.map((quest) => {
    const subjectName = quest.subjectId != null ? subjectNames.get(quest.subjectId) : undefined;
    const meta = [
      dayWords(quest.scheduledFor!, now),
      subjectName,
      quest.targetMinutes ? `${quest.targetMinutes} min` : null,
    ].filter(Boolean).join(" · ");
    return {
      id: String(quest.id),
      title: quest.title,
      meta,
      subjectColour: colourOf(quest.subjectId),
      done: quest.status === "COMPLETED",
      upcoming: true,
      testID: `today-upcoming-${quest.id}`,
      onOpen,
    };
  });
}
