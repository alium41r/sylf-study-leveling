import "server-only";
import type { PlanBriefV1 } from "../intake/brief";
import { flattenScope } from "../intake/brief";
import type { IntakeAction } from "../intake/actions";
import { CONSTRAINT_KIND_LABEL, type PlannerConstraint } from "../constraints";
import { MATRIX_STATE_LABEL, matrixPatch, type PreparednessMatrixState } from "../preparedness-matrix";
import { OVERLAP_LABEL } from "../comparison/contracts";
import { PRIORITY_LABEL } from "../priority";
import type { CopilotConfirmationCode } from "./outcomes";
import type { CopilotCommand, CopilotCommandPreview } from "./contracts";

/**
 * The mapping from a Copilot command to the action that already exists.
 *
 * This module is deliberate about what it does *not* do: it invents no vocabulary. Every
 * command becomes an `IntakeAction` (or a named capability), and every preview sentence is
 * assembled from the *current* brief plus the proposed value — never from the model's
 * prose. That is what makes "I understood that as X" checkable, and it is why the Copilot
 * cannot describe a change it is not about to make.
 */

/**
 * One action as this module writes it: the action's own fields, without the concurrency
 * and idempotency keys the intake service adds. `Omit` is distributed across the union so
 * each variant keeps its own fields rather than collapsing into the common ones.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CopilotIntakeAction = DistributiveOmit<
  IntakeAction,
  "schemaVersion" | "expectedVersion" | "actionKey"
>;

/** An action, or a capability the orchestrator routes instead of applying. */
export type MappedCommand =
  | { kind: "ACTION"; action: CopilotIntakeAction }
  | {
      kind: "CAPABILITY";
      capability: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE";
      payload:
        | { kind: "RESEARCH" }
        | { kind: "COMPARISON"; refresh: boolean }
        | { kind: "DRAFT_EDIT"; edits: DraftEditIntent[] }
        | { kind: "REPLAN"; reason: string }
        | { kind: "RELEASE"; itemKeys: string[]; labels: string[] };
    }
  | { kind: "REFUSED"; code: "UNKNOWN_REFERENCE" | "COMMAND_NOT_ALLOWED_IN_STATE"; detail: string };

export interface DraftEditIntent {
  /** Scope unit label the student named, for the item choice. */
  label: string;
  edit: "REMOVE" | "SHORTEN" | "LENGTHEN" | "MOVE_EARLIER" | "MOVE_LATER";
  minutes: number | null;
  days: number | null;
}

export interface MappedPlan {
  commands: MappedCommand[];
  preview: CopilotCommandPreview[];
  /** What the student must confirm before this proposal may run. */
  requires: CopilotConfirmationCode[];
  /** The units a label resolved to, for the explanation and for tests. */
  resolved: { label: string; nodeIds: string[] }[];
}

/** Normalise a label for matching: case, whitespace and punctuation are not meaning. */
const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Resolve student wording to confirmed scope units.
 *
 * Exact (case-insensitive) match first, then a normalised match, then a "one candidate
 * contains the words" match. Ambiguity is *returned*, never resolved by picking one: the
 * caller asks which unit, because guessing a referent is exactly the hallucination §70
 * forbids.
 */
export function resolveUnitLabels(
  brief: PlanBriefV1,
  labels: readonly string[]
): { resolved: { label: string; nodeIds: string[] }[]; unresolved: string[]; ambiguous: string[] } {
  const units = flattenScope(brief.scope.nodes).units;
  const resolved: { label: string; nodeIds: string[] }[] = [];
  const unresolved: string[] = [];
  const ambiguous: string[] = [];
  for (const label of labels) {
    const exact = units.filter((unit) => unit.displayLabel.toLowerCase() === label.toLowerCase());
    const pool = exact.length
      ? exact
      : units.filter((unit) => normalise(unit.displayLabel) === normalise(label));
    const candidates = pool.length
      ? pool
      : units.filter((unit) => {
          const haystack = normalise(unit.displayLabel);
          const needle = normalise(label);
          return needle.length >= 3 && (haystack.includes(needle) || needle.includes(haystack));
        });
    const ids = [...new Set(candidates.map((unit) => unit.nodeId))];
    if (ids.length === 1) resolved.push({ label, nodeIds: ids });
    else if (!ids.length) unresolved.push(label);
    else ambiguous.push(label);
  }
  return { resolved, unresolved, ambiguous };
}

/** Resolve a target date, or null when the student's wording cannot be made concrete. */
export function resolveTargetDate(input: {
  brief: PlanBriefV1;
  today: string;
  date: string | null;
  shiftDays: number | null;
}): string | null {
  if (input.date) return input.date;
  if (input.shiftDays === null) return null;
  const base = input.brief.target.endDate ?? input.today;
  const parsed = Date.parse(`${base}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + input.shiftDays * 86_400_000).toISOString().slice(0, 10);
}

const hoursLabel = (minutes: number): string => {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded}h`;
};

/** One deterministic consequence sentence, derived from state plus the proposed value. */
function consequenceOf(command: CopilotCommand, brief: PlanBriefV1): string {
  switch (command.command) {
    case "SET_GOAL":
      return brief.goal.title ? `Study goal: ${brief.goal.title} → ${command.title}.` : `Study goal set to ${command.title}.`;
    case "SET_WEEKLY_HOURS": {
      const before = brief.budget.weeklyMinutes;
      const after = Math.round(command.hours * 60);
      const shape = command.hard ? "a hard weekly maximum" : "your weekly target";
      return before === null
        ? `Weekly study time becomes ${hoursLabel(after)} as ${shape}.`
        : `Weekly study time: ${hoursLabel(before)} → ${hoursLabel(after)} as ${shape}.`;
    }
    case "SET_TARGET_DATE":
      return brief.target.endDate
        ? `Target date: ${brief.target.endDate} → ${command.date ?? "shifted"}.`
        : `Target date set to ${command.date ?? "shifted"}.`;
    case "SET_BACKGROUND_CURRICULUM":
      return `Background curriculum set to ${command.label}${
        command.subjects.length ? ` (${command.subjects.join(", ")})` : ""
      }.`;
    case "SET_PREPAREDNESS":
      return `${command.labels.join(", ")}: marked ${MATRIX_STATE_LABEL[
        command.state as PreparednessMatrixState
      ].toLowerCase()}.`;
    case "SET_OVERLAP_CORRECTION":
      return `${command.labels.join(", ")}: overlap recorded as “${OVERLAP_LABEL[command.overlap]}”.`;
    case "SET_PRIORITY":
      return `${command.labels.join(", ")}: priority ${PRIORITY_LABEL[command.priority].toLowerCase()}.`;
    case "SET_DIFFICULTY":
      return `${command.labels.join(", ")}: ${command.difficult ? "marked" : "no longer marked"} difficult.`;
    case "SET_CONSTRAINT": {
      const strength = command.strength === "HARD" ? "a hard rule" : "a preference";
      if (command.kind === "UNAVAILABLE_WEEKDAY") {
        const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
          Math.round(command.value)
        ];
        return day
          ? `${day} becomes unavailable as ${strength}.`
          : `${CONSTRAINT_KIND_LABEL[command.kind]} becomes ${strength}.`;
      }
      return `${CONSTRAINT_KIND_LABEL[command.kind]} becomes ${strength} (${command.value}).`;
    }
    case "REMOVE_CONSTRAINT":
      return `${CONSTRAINT_KIND_LABEL[command.kind]} is removed.`;
    case "UPDATE_SCOPE": {
      const parts = [
        command.add.length ? `add ${command.add.map((entry) => entry.label).join(", ")}` : null,
        command.remove.length ? `remove ${command.remove.join(", ")}` : null,
        command.rename.length
          ? `rename ${command.rename.map((entry) => `${entry.from} → ${entry.to}`).join(", ")}`
          : null,
      ].filter(Boolean);
      return `Scope changes: ${parts.join("; ")}. This withdraws your confirmation, so the scope will need confirming again.`;
    }
    case "REQUEST_SCOPE_RESEARCH":
      return "Sylf looks for the official syllabus. Nothing changes until you confirm what it finds.";
    case "REQUEST_CURRICULUM_COMPARISON":
      return command.refresh
        ? "Sylf compares your background curriculum with this scope again, replacing the previous comparison."
        : "Sylf compares your background curriculum with this scope.";
    case "REQUEST_DRAFT_EDIT":
      return `Draft edit: ${command.labels.join(", ")} — ${command.edit.toLowerCase().replace("_", " ")}${
        command.minutes ? ` to ${command.minutes} minutes` : ""
      }${command.days ? ` by ${command.days} days` : ""}.`;
    case "REQUEST_REPLAN":
      return "Sylf rebalances the remaining unstarted work. Completed, started and protected work stays exactly as it is, and nothing changes until you approve the proposed diff.";
    case "RELEASE_GENERATED_ITEM":
      return `Stops one unstarted planner-generated task (${command.labels.join(", ")}) from being your responsibility. It stays in the record as released.`;
  }
}

/** The constraints a command needs the student to have confirmed first. */
function confirmationsFor(command: CopilotCommand): CopilotConfirmationCode[] {
  const codes: CopilotConfirmationCode[] = [];
  if (command.command === "SET_CONSTRAINT" && command.strength === "HARD")
    codes.push("HARD_CONSTRAINT");
  if (command.command === "UPDATE_SCOPE" && command.remove.length) codes.push("SCOPE_REMOVAL");
  if (command.command === "REQUEST_SCOPE_RESEARCH" || command.command === "REQUEST_CURRICULUM_COMPARISON")
    codes.push("RESEARCH");
  if (command.command === "REQUEST_DRAFT_EDIT") codes.push("DRAFT_EDIT");
  if (command.command === "REQUEST_REPLAN") codes.push("REPLAN");
  if (command.command === "RELEASE_GENERATED_ITEM") codes.push("RELEASE");
  return codes;
}

/**
 * Commands that may run without a confirmation step.
 *
 * The boundary in one sentence: a single, high-confidence, reversible change to the
 * working brief that the student could equally have made by hand in the structured UI —
 * and nothing that creates a hard rule, removes scope, or removes work.
 */
export const DIRECT_EXECUTION_COMMANDS = [
  "SET_WEEKLY_HOURS",
  "SET_PREPAREDNESS",
  "SET_BACKGROUND_CURRICULUM",
  "SET_OVERLAP_CORRECTION",
  "SET_PRIORITY",
  "SET_DIFFICULTY",
  "SET_TARGET_DATE",
] as const;

/**
 * Map one interpretation into actions, previews and confirmation requirements.
 *
 * `today` and the brief are the whole input to resolution: the model supplies labels and
 * intent, and the server decides what those refer to. An unresolved label is a refusal
 * with a closed code, and an ambiguous one is a refusal the caller turns into a
 * clarification — never a guess.
 */
export function mapCommands(input: {
  brief: PlanBriefV1;
  today: string;
  commands: readonly CopilotCommand[];
}): MappedPlan {
  const mapped: MappedCommand[] = [];
  const preview: CopilotCommandPreview[] = [];
  const requires = new Set<CopilotConfirmationCode>();
  const resolved: { label: string; nodeIds: string[] }[] = [];

  const unitIds = (labels: readonly string[]): string[] | null => {
    const outcome = resolveUnitLabels(input.brief, labels);
    if (outcome.unresolved.length || outcome.ambiguous.length) return null;
    resolved.push(...outcome.resolved);
    return [...new Set(outcome.resolved.flatMap((entry) => entry.nodeIds))];
  };

  for (const command of input.commands) {
    for (const code of confirmationsFor(command)) requires.add(code);
    const base = { command: command.command, consequence: consequenceOf(command, input.brief) };
    switch (command.command) {
      case "SET_GOAL":
        mapped.push({ kind: "ACTION", action: { action: "setGoal", title: command.title } });
        preview.push(base);
        break;
      case "SET_WEEKLY_HOURS": {
        const minutes = Math.round(command.hours * 60);
        if (command.hard) {
          // "I cannot do more than 8 hours" is a HARD ceiling; aiming for 8 hours is a
          // target. The model decides which the student said, and both land on an action
          // that already exists — but a hard rule is never applied without a confirmation,
          // whichever command carried it.
          requires.add("HARD_CONSTRAINT");
          mapped.push({
            kind: "ACTION",
            action: { action: "setConstraint", kind: "MAX_WEEKLY_MINUTES", strength: "HARD", value: minutes },
          });
        } else {
          mapped.push({ kind: "ACTION", action: { action: "setWeeklyBudget", weeklyMinutes: minutes } });
        }
        preview.push({ ...base, requires: command.hard ? "HARD_CONSTRAINT" : undefined });
        break;
      }
      case "SET_TARGET_DATE": {
        const date = resolveTargetDate({
          brief: input.brief,
          today: input.today,
          date: command.date,
          shiftDays: command.shiftDays,
        });
        if (!date) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: "The date you gave could not be turned into a calendar date.",
          });
          break;
        }
        mapped.push({
          kind: "ACTION",
          action: {
            action: "setTargetDate",
            endDate: date,
            ...(input.brief.mode === "EXAM" ? { examDate: date } : {}),
          },
        });
        preview.push({ ...base, consequence: `Target date: ${input.brief.target.endDate ?? "unset"} → ${date}.` });
        break;
      }
      case "SET_BACKGROUND_CURRICULUM":
        mapped.push({
          kind: "ACTION",
          action: {
            action: "setBackgroundCurriculum",
            label: command.label,
            level: command.level,
            board: command.board,
            subjects: command.subjects,
          },
        });
        preview.push(base);
        break;
      case "SET_PREPAREDNESS": {
        const ids = unitIds(command.labels);
        if (!ids?.length) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: `I could not find ${command.labels.join(", ")} in your confirmed scope.`,
          });
          break;
        }
        mapped.push({
          kind: "ACTION",
          action: { action: "bulkSetPreparedness", nodeIds: ids, state: command.state },
        });
        preview.push(base);
        break;
      }
      case "SET_OVERLAP_CORRECTION": {
        const ids = unitIds(command.labels);
        if (!ids?.length) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: `I could not find ${command.labels.join(", ")} in your confirmed scope.`,
          });
          break;
        }
        for (const nodeId of ids)
          mapped.push({
            kind: "ACTION",
            action: { action: "setOverlapCorrection", unitRef: nodeId, overlap: command.overlap },
          });
        preview.push(base);
        break;
      }
      case "SET_PRIORITY": {
        const ids = unitIds(command.labels);
        if (!ids?.length) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: `I could not find ${command.labels.join(", ")} in your confirmed scope.`,
          });
          break;
        }
        mapped.push({
          kind: "ACTION",
          action: {
            action: "setPriority",
            nodeIds: ids,
            priority: command.priority,
            prioritySource: "USER_EXPLICIT",
          },
        });
        preview.push(base);
        break;
      }
      case "SET_DIFFICULTY": {
        const ids = unitIds(command.labels);
        if (!ids?.length) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: `I could not find ${command.labels.join(", ")} in your confirmed scope.`,
          });
          break;
        }
        mapped.push({ kind: "ACTION", action: { action: "setDifficulty", nodeIds: ids, difficult: command.difficult } });
        preview.push(base);
        break;
      }
      case "SET_CONSTRAINT":
        mapped.push({
          kind: "ACTION",
          action: {
            action: "setConstraint",
            kind: command.kind,
            strength: command.strength,
            value: command.value,
            ...(command.preferenceWeight !== null ? { preferenceWeight: command.preferenceWeight } : {}),
          },
        });
        preview.push({ ...base, requires: command.strength === "HARD" ? "HARD_CONSTRAINT" : undefined });
        break;
      case "REMOVE_CONSTRAINT":
        mapped.push({
          kind: "ACTION",
          action: {
            action: "setConstraint",
            kind: command.kind,
            strength: "SOFT",
            value: -1,
            remove: true,
          },
        });
        preview.push(base);
        break;
      case "UPDATE_SCOPE": {
        const nodes = flattenScope(input.brief.scope.nodes).units;
        const additions = command.add.map((entry, index) => ({
          nodeId: `copilot-${normalise(entry.label).replace(/ /g, "-").slice(0, 40) || "unit"}-${index + 1}`,
          label: entry.label,
          kind: "TOPIC" as const,
          parentId: null,
          selected: true,
        }));
        const removals: string[] = [];
        for (const label of command.remove) {
          const match = resolveUnitLabels(input.brief, [label]);
          if (match.unresolved.length || match.ambiguous.length || !match.resolved[0]) {
            mapped.push({
              kind: "REFUSED",
              code: "UNKNOWN_REFERENCE",
              detail: `I could not find “${label}” in your confirmed scope.`,
            });
            continue;
          }
          resolved.push(...match.resolved);
          removals.push(...match.resolved[0].nodeIds);
        }
        const renames = command.rename.flatMap((entry) => {
          const match = resolveUnitLabels(input.brief, [entry.from]);
          if (match.resolved.length !== 1 || !match.resolved[0]) return [];
          resolved.push(...match.resolved);
          return match.resolved[0].nodeIds.map((nodeId) => ({ nodeId, label: entry.to }));
        });
        void nodes;
        mapped.push({
          kind: "ACTION",
          action: {
            action: "updateScopeUnits",
            ...(additions.length ? { add: additions } : {}),
            ...(removals.length ? { remove: removals } : {}),
            ...(renames.length ? { rename: renames } : {}),
          },
        });
        preview.push({ ...base, requires: command.remove.length ? "SCOPE_REMOVAL" : undefined });
        break;
      }
      case "REQUEST_SCOPE_RESEARCH":
        mapped.push({ kind: "CAPABILITY", capability: "RESEARCH", payload: { kind: "RESEARCH" } });
        preview.push({ ...base, requires: "RESEARCH" });
        break;
      case "REQUEST_CURRICULUM_COMPARISON":
        mapped.push({
          kind: "CAPABILITY",
          capability: "COMPARISON",
          payload: { kind: "COMPARISON", refresh: command.refresh },
        });
        preview.push({ ...base, requires: "RESEARCH" });
        break;
      case "REQUEST_DRAFT_EDIT": {
        const edits: DraftEditIntent[] = [];
        for (const label of command.labels) {
          const match = resolveUnitLabels(input.brief, [label]);
          if (match.resolved.length !== 1 || !match.resolved[0]) {
            mapped.push({
              kind: "REFUSED",
              code: "UNKNOWN_REFERENCE",
              detail: `I could not tell which unit “${label}” is.`,
            });
            continue;
          }
          resolved.push(...match.resolved);
          edits.push({
            label: match.resolved[0].label,
            edit: command.edit,
            minutes: command.minutes,
            days: command.days,
          });
        }
        if (edits.length)
          mapped.push({ kind: "CAPABILITY", capability: "DRAFT_EDIT", payload: { kind: "DRAFT_EDIT", edits } });
        preview.push({ ...base, requires: "DRAFT_EDIT" });
        break;
      }
      case "REQUEST_REPLAN":
        mapped.push({
          kind: "CAPABILITY",
          capability: "REPLAN",
          payload: { kind: "REPLAN", reason: command.reason },
        });
        preview.push({ ...base, requires: "REPLAN" });
        break;
      case "RELEASE_GENERATED_ITEM": {
        const ids = unitIds(command.labels);
        if (!ids?.length) {
          mapped.push({
            kind: "REFUSED",
            code: "UNKNOWN_REFERENCE",
            detail: `I could not find ${command.labels.join(", ")} in your plan.`,
          });
          break;
        }
        mapped.push({
          kind: "CAPABILITY",
          capability: "RELEASE",
          payload: { kind: "RELEASE", itemKeys: ids, labels: command.labels },
        });
        preview.push({ ...base, requires: "RELEASE" });
        break;
      }
    }
  }

  return { commands: mapped, preview, requires: [...requires], resolved };
}

/** The soft constraint a constraint command implies, for previews and tests. */
export function constraintPreviewValue(constraint: PlannerConstraint): string {
  return `${constraint.kind}=${constraint.value}`;
}

export { matrixPatch, normalise };
