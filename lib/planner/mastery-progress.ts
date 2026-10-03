/**
 * Conservative Chapter / Unit Mastery progress projection (Phase 4 §13, §39).
 *
 * It reports only what the planner actually knows: which planned items exist,
 * which of their Quests are done, and whether the plan's own Mastery Check has
 * been completed. It deliberately does NOT label anything or anyone "mastered".
 * An item existing, a Quest being completed, Focus minutes being recorded or a
 * check being finished are not evidence of academic mastery, and Sylf makes no
 * such claim here; the judgement stays with the student.
 *
 * Nothing in this module reads the database or infers mastery from Quest data:
 * it is a pure projection over the confirmed revision plus linked-Quest status.
 */
import type { MasteryStage } from "./mastery-fields";

/**
 * Plan-level workflow state. `CHECK_COMPLETED` means the check Quest was
 * completed and `PLAN_COMPLETED` that every linked Quest was — neither is a
 * statement about what the student knows.
 */
export const MASTERY_PLAN_STATES = [
  "NOT_CONFIRMED",
  "PLANNED",
  "IN_PROGRESS",
  "CHECK_PENDING",
  "CHECK_COMPLETED",
  "PLAN_COMPLETED",
] as const;
export type MasteryPlanState = (typeof MASTERY_PLAN_STATES)[number];

/** Unit-level state. Never "mastered"; completion of work is all that is shown. */
export const MASTERY_UNIT_STATES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PLANNED_WORK_DONE",
] as const;
export type MasteryUnitState = (typeof MASTERY_UNIT_STATES)[number];

export const MASTERY_PLAN_STATE_LABEL: Record<MasteryPlanState, string> = {
  NOT_CONFIRMED: "Draft — not confirmed yet",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  CHECK_PENDING: "Planned work done — check outstanding",
  CHECK_COMPLETED: "Check completed",
  PLAN_COMPLETED: "All planned work done",
};

export const MASTERY_UNIT_STATE_LABEL: Record<MasteryUnitState, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  PLANNED_WORK_DONE: "Planned work done",
};

export const MASTERY_CHECK_STATES = ["PENDING", "DUE", "COMPLETED"] as const;
export type MasteryCheckState = (typeof MASTERY_CHECK_STATES)[number];

export const MASTERY_CHECK_STATE_LABEL: Record<MasteryCheckState, string> = {
  PENDING: "Scheduled",
  DUE: "Scheduled for today or earlier",
  COMPLETED: "Completed",
};

/**
 * Shown wherever mastery progress is displayed. Sylf records the work; it does not
 * decide whether the unit is mastered.
 */
export const MASTERY_PROGRESS_NOTE =
  "This shows the work you planned and completed. It is not a mastery judgement: only you can decide whether you can now do this without help.";

/** The fixed progression, so a stage list is never re-ordered by accident. */
export const MASTERY_STAGE_RANK: Record<MasteryStage, number> = {
  UNDERSTAND: 0,
  LEARN: 1,
  ACTIVE_RECALL: 2,
  PRACTICE: 3,
  REVIEW_MISTAKES: 4,
  MASTERY_CHECK: 5,
};

export interface MasteryProgressItem {
  key: string;
  topicKey: string;
  masteryStage?: string;
  type: string;
  title: string;
  date: string;
  minutes: number;
  relatedTopicKeys?: string[];
  removed?: boolean;
}

export interface MasteryProgressExecution {
  itemKey: string;
  /** The linked Quest's own status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`). */
  status: string;
  completedAt?: string | null;
}

export interface MasteryProgressInput {
  /** True once the revision carrying these items was confirmed. */
  confirmed: boolean;
  /** The user's own local today, from the planner capability. */
  today: string;
  units: { key: string; title: string }[];
  items: MasteryProgressItem[];
  /** Bounded link projection: one row per linked item, written by the server. */
  execution: MasteryProgressExecution[];
}

export interface MasteryUnitProgress {
  unitKey: string;
  title: string;
  state: MasteryUnitState;
  stages: {
    stage: MasteryStage;
    planned: number;
    completed: number;
    minutes: number;
  }[];
  planned: number;
  completed: number;
  plannedMinutes: number;
  completedMinutes: number;
}

export interface MasteryCheckProgress {
  itemKey: string;
  title: string;
  date: string;
  minutes: number;
  state: MasteryCheckState;
  /** Unit keys the check was planned to cover, from the item's own metadata. */
  coversUnitKeys: string[];
}

export interface MasteryProgress {
  state: MasteryPlanState;
  units: MasteryUnitProgress[];
  check: MasteryCheckProgress | null;
  plannedItems: number;
  completedItems: number;
  plannedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  note: string;
}

const isDone = (status: string | undefined) => status === "COMPLETED";

/**
 * Derives the plan's workflow state from linked Quest execution only. A check that
 * was never completed cannot be reported as completed, and a plan whose every item
 * is done is reported as work done, never as mastered.
 */
export function masteryProgress(input: MasteryProgressInput): MasteryProgress {
  const active = input.items.filter((item) => !item.removed);
  const statusOf = new Map(
    input.execution.map((row) => [row.itemKey, row.status])
  );
  const stageOf = (item: MasteryProgressItem): MasteryStage | null =>
    item.masteryStage && item.masteryStage !== ""
      ? (item.masteryStage as MasteryStage)
      : null;

  const checkItem = active.find((item) => stageOf(item) === "MASTERY_CHECK");
  const units: MasteryUnitProgress[] = input.units.map((unit) => {
    const own = active.filter((item) => item.topicKey === unit.key);
    const byStage = new Map<MasteryStage, { planned: number; completed: number; minutes: number }>();
    for (const item of own) {
      const stage = stageOf(item);
      if (!stage) continue;
      const entry = byStage.get(stage) ?? { planned: 0, completed: 0, minutes: 0 };
      entry.planned += 1;
      entry.minutes += item.minutes;
      if (isDone(statusOf.get(item.key))) entry.completed += 1;
      byStage.set(stage, entry);
    }
    const completed = own.filter((item) => isDone(statusOf.get(item.key))).length;
    return {
      unitKey: unit.key,
      title: unit.title,
      state:
        !own.length
          ? ("NOT_STARTED" as const)
          : completed === 0
            ? ("NOT_STARTED" as const)
            : completed === own.length
              ? ("PLANNED_WORK_DONE" as const)
              : ("IN_PROGRESS" as const),
      stages: [...byStage.entries()]
        .map(([stage, entry]) => ({ stage, ...entry }))
        .sort(
          (a, b) =>
            MASTERY_STAGE_RANK[a.stage] - MASTERY_STAGE_RANK[b.stage]
        ),
      planned: own.length,
      completed,
      plannedMinutes: own.reduce((total, item) => total + item.minutes, 0),
      completedMinutes: own
        .filter((item) => isDone(statusOf.get(item.key)))
        .reduce((total, item) => total + item.minutes, 0),
    };
  });

  const check: MasteryCheckProgress | null = checkItem
    ? {
        itemKey: checkItem.key,
        title: checkItem.title,
        date: checkItem.date,
        minutes: checkItem.minutes,
        state: isDone(statusOf.get(checkItem.key))
          ? "COMPLETED"
          : checkItem.date <= input.today
            ? "DUE"
            : "PENDING",
        coversUnitKeys: [
          ...new Set([checkItem.topicKey, ...(checkItem.relatedTopicKeys ?? [])]),
        ],
      }
    : null;

  const completedItems = active.filter((item) =>
    isDone(statusOf.get(item.key))
  ).length;
  const plannedMinutes = active.reduce((total, item) => total + item.minutes, 0);
  const completedMinutes = active
    .filter((item) => isDone(statusOf.get(item.key)))
    .reduce((total, item) => total + item.minutes, 0);
  const work = active.filter((item) => stageOf(item) !== "MASTERY_CHECK");
  const checkDone = check?.state === "COMPLETED";
  const state: MasteryPlanState = !input.confirmed
    ? "NOT_CONFIRMED"
    : completedItems === 0
      ? "PLANNED"
      : completedItems === active.length
        ? "PLAN_COMPLETED"
        : check && !checkDone && work.length > 0 && work.every((item) => isDone(statusOf.get(item.key)))
          ? "CHECK_PENDING"
          : checkDone
            ? "CHECK_COMPLETED"
            : "IN_PROGRESS";

  return {
    state,
    units,
    check,
    plannedItems: active.length,
    completedItems,
    plannedMinutes,
    completedMinutes,
    remainingMinutes: Math.max(0, plannedMinutes - completedMinutes),
    note: MASTERY_PROGRESS_NOTE,
  };
}

/**
 * The one place the UI says what completing the check does and does not mean.
 * Phrased as a record of what happened, never as an assessment.
 */
export function masteryCheckSummary(
  check: MasteryCheckProgress | null
): string {
  if (!check) return "No mastery check is planned in this revision.";
  if (check.state === "COMPLETED")
    return "You completed the check. What it showed is yours to judge — Sylf does not decide whether the unit is mastered.";
  return `One bounded check covering ${check.coversUnitKeys.length} unit${check.coversUnitKeys.length === 1 ? "" : "s"} is planned for ${check.date}. It records what was correct and what was not; it does not decide mastery.`;
}
