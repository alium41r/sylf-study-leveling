import "server-only";
import type { PlannerCopilotContextV1 } from "./contracts";
import { COPILOT_LIMITS, type CopilotExplanationFact } from "./contracts";
import { CONSTRAINT_KIND_LABEL } from "../constraints";
import { OVERLAP_LABEL } from "../comparison/contracts";
import { MATRIX_STATE_LABEL, type PreparednessMatrixState } from "../preparedness-matrix";
import { sourceTypeIsOfficial } from "../research/sources";
import { sourceTypeLabel } from "../research/sources";

/**
 * Explanations, built from state before a model ever sees them.
 *
 * The rule this module exists to enforce: **a reason must already be true**. Every fact
 * below is derived from the planner's own state — the brief, the confirmed provenance, the
 * execution snapshot — and carries an id. The model's only job in the explanation path is
 * to turn those facts into one or two sentences; it is given no other material, and the
 * ids it used are echoed back so the server can check what the answer was built from.
 *
 * Two consequences worth stating plainly:
 *
 * - **No new web call, ever.** A confirmed source is explained from the record retained at
 *   confirmation (Phase 3.1). If it was not retained, the fact says so, because inventing a
 *   source for an old scope is exactly the fabrication the provenance work ruled out.
 * - **No invented rationale.** If nothing in state explains the thing asked about, the fact
 *   set says that too, and the student is told rather than given a plausible story.
 */

const weekdayName = (day: number): string =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? String(day);

const trim = (value: string): string => value.slice(0, COPILOT_LIMITS.explanationFactChars);

/**
 * The fact base for a question.
 *
 * `subject` is the unit label the student's own words matched, when they matched one: that
 * is what makes "why is Matrices included?" answerable without giving the model the whole
 * scope. The match is done here, deterministically, from the message — never by the model
 * choosing a unit and then being handed facts about it.
 */
export function explanationFacts(input: {
  context: PlannerCopilotContextV1;
  question: string;
  /** Units the question names, already resolved against the confirmed scope. */
  matchedUnits?: readonly string[];
  /** Items the student previously released, so an explanation can say so. */
  released?: readonly { itemKey: string; label: string }[];
}): CopilotExplanationFact[] {
  const facts: CopilotExplanationFact[] = [];
  const { context } = input;
  const push = (id: string, text: string) => {
    if (facts.length >= COPILOT_LIMITS.explanationFacts) return;
    if (facts.some((fact) => fact.id === id)) return;
    facts.push({ id, text: trim(text) });
  };

  const units = context.scopeUnits;
  const named = input.matchedUnits ?? [];
  const asked = named.length ? units.filter((unit) => named.includes(unit.label)) : [];

  // ── Why a specific unit is in the plan ────────────────────────────────────────
  for (const unit of asked) {
    const why: string[] = [`“${unit.label}” is one of the units you confirmed for this plan.`];
    if (context.comparison?.state === "READY" && unit.overlap)
      why.push(`Your background curriculum ${OVERLAP_LABEL[unit.overlap].toLowerCase()}.`);
    if (context.comparison?.state === "STALE")
      why.push("Your comparison with your background curriculum no longer applies to this scope.");
    why.push(
      unit.preparedness === "UNKNOWN"
        ? "You have not said how well you know it, so Sylf plans it as work to learn."
        : `You marked it ${MATRIX_STATE_LABEL[unit.preparedness as PreparednessMatrixState].toLowerCase()}.`
    );
    if (unit.priority !== "NEUTRAL") why.push(`You set its priority to ${unit.priority.toLowerCase()}.`);
    if (unit.difficult) why.push("You marked it difficult.");
    push(`unit:${unit.label}`, why.join(" "));
  }

  // ── Where a confirmed scope came from ─────────────────────────────────────────
  if (context.confirmedSources.length) {
    const described = context.confirmedSources
      .map((source) => {
        const who = source.publisherOrDomain ?? source.title ?? "an unnamed source";
        const type = sourceTypeLabel(source.sourceType).toLowerCase();
        const authority = sourceTypeIsOfficial(source.sourceType)
          ? "the verified authority for this target"
          : source.sourceType === "INSTITUTIONAL"
            ? "a credible institution, but not the verified authority for this target"
            : source.sourceType === "USER_UPLOAD"
              ? "material you supplied"
              : "not an authority";
        return `${who} (${type}: ${authority})`;
      })
      .join("; ");
    push(
      "provenance:confirmed",
      `You confirmed this scope from ${context.confirmedSources.length} source${context.confirmedSources.length === 1 ? "" : "s"}: ${described}.`
    );
  } else if (context.scopeConfirmed) {
    // Retained provenance is what makes this answerable; an old scope without it is said
    // so plainly rather than dressed up with a source Sylf no longer holds.
    push(
      "provenance:absent",
      "This scope was confirmed without a retained source record, so Sylf cannot say which material it was confirmed from."
    );
  }

  // ── Availability and capacity ─────────────────────────────────────────────────
  if (context.unavailableWeekdays.length)
    push(
      "availability:closed",
      `${context.unavailableWeekdays.map(weekdayName).join(", ")} ${context.unavailableWeekdays.length === 1 ? "is" : "are"} unavailable in your confirmed availability, so nothing is planned on those days.`
    );
  push(
    "capacity:weekly",
    context.weeklyMinutes === null
      ? "You have not set a weekly study target yet."
      : `Your weekly study target is ${(context.weeklyMinutes / 60).toFixed(1)} hours${
          context.hardWeeklyMinutes !== null
            ? `, with a hard maximum of ${(context.hardWeeklyMinutes / 60).toFixed(1)} hours`
            : " and no hard weekly maximum"
        }.`
  );
  if (context.softPreferences.length)
    push(
      "preferences:soft",
      `Preferences you set: ${context.softPreferences
        .map((entry) => `${CONSTRAINT_KIND_LABEL[entry.kind as keyof typeof CONSTRAINT_KIND_LABEL] ?? entry.kind}`)
        .join(", ")}.`
    );

  // ── Comparison, draft and plan state ──────────────────────────────────────────
  if (context.comparison)
    push(
      "comparison:state",
      `Your background curriculum comparison is ${context.comparison.state.toLowerCase()} with status ${context.comparison.status}${
        context.comparison.status === "WEAK"
          ? ": it is usable, but none of it could be checked against the examination authority's own material"
          : ""
      }.`
    );
  else push("comparison:none", "You have not compared this scope with a background curriculum.");

  if (context.draft)
    push(
      "draft:state",
      `The draft you are reviewing holds ${context.draft.items} item${context.draft.items === 1 ? "" : "s"}${
        context.draft.warnings ? ` and ${context.draft.warnings} warning${context.draft.warnings === 1 ? "" : "s"} you have not answered` : ""
      }.`
    );

  if (context.confirmedPlan)
    push(
      "plan:state",
      `Your confirmed plan holds ${context.confirmedPlan.items} item${context.confirmedPlan.items === 1 ? "" : "s"}: ${context.confirmedPlan.execution.pending} pending, ${context.confirmedPlan.execution.started} started, ${context.confirmedPlan.execution.completed} completed, ${context.confirmedPlan.execution.released} released.`
    );

  if (input.released?.length)
    push(
      "released:items",
      `You released ${input.released.map((item) => `“${item.label}”`).join(", ")}. Releasing is recorded, so Sylf will not quietly put ${input.released.length === 1 ? "it" : "them"} back.`
    );

  if (!facts.length)
    push(
      "state:none",
      "Nothing in your current plan explains that, so Sylf has no grounded answer; it will not invent one."
    );

  return facts.slice(0, COPILOT_LIMITS.explanationFacts);
}

/** A deterministic answer, used when the model cannot phrase one. Never a fabrication. */
export const deterministicExplanation = (facts: readonly CopilotExplanationFact[]): string =>
  facts.map((fact) => fact.text).join(" ");
