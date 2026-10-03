import "server-only";
import {
  ValidatedDraftV1Schema,
  validateDraft,
  type UserInputV1,
  type ValidatedDraftV1,
} from "../contracts";
import { validateCapacity, type AvailabilitySnapshot } from "../capacity";
import { PlannerError, PlannerValidationError } from "../errors";
import {
  constraintCapacityInput,
  hardSessionLimit,
  hardWeeklyLimit,
  softConstraintViolations,
} from "../constraints";
import { dateOrdinal, weekday } from "../dates";
import {
  acknowledgementFor,
  acknowledgedCode,
  affectedUnitLabels,
  changedUnitLabels,
  isRecommendation,
  recommendationConsequence,
} from "../draft-rules";
import {
  finding,
  verifyAcknowledgements,
  type PlannerFinding,
} from "../intake/findings";

/**
 * Flexible draft editing: run the ordinary validators, then say honestly which of
 * their findings a student may accept.
 *
 * The design has one non-negotiable property: **the validator is not bypassed**. The
 * assessment runs `validateDraft` exactly as generation, repair and confirmation do,
 * observes the code it refuses with, and looks that code up in the §34 audit
 * (`lib/planner/draft-rules.ts`). A blocker ends the assessment — no acknowledgement
 * is even read for it. A recommendation is recorded as a warning and the *same*
 * validator is re-run with only that code suppressed, so every other rule still
 * applies and a blocker standing behind a recommendation is still found. A draft can
 * therefore only be sealed when the student has seen, one by one, exactly what it
 * gives up.
 *
 * This is also why the capacity rules live here rather than in the engine: whether an
 * overrun is a blocker or a tradeoff depends on whether the student *declared a
 * maximum*. A weekly figure is a target (§37) unless an explicit HARD
 * `MAX_WEEKLY_MINUTES` exists; a session length is a recommendation (§36) unless an
 * explicit HARD `MAX_SESSION_MINUTES` exists. The engine keeps enforcing the HARD
 * ones — `validateHardConstraints` throws long before this module is consulted, and
 * the 15–240 minute bounds are an absolute engine limit — so this module decides only
 * what to say about the rest.
 */

/** How many recommendation codes one assessment may discover. Bounded, like everything else. */
const MAX_ASSESSMENT_PASSES = 32;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface DraftAssessment {
  ok: boolean;
  findings: PlannerFinding[];
  warnings: PlannerFinding[];
  blockers: PlannerFinding[];
  /** Acknowledgements that matched a warning actually raised by *this* draft. */
  accepted: string[];
  /** The draft, once it validates under the accepted acknowledgements. */
  draft: ValidatedDraftV1 | null;
}

export interface DraftAssessmentRequest {
  input: UserInputV1;
  draft: unknown;
  /**
   * The draft this edit started from, when there is one.
   *
   * Used for one thing only: naming the units the edit changed, so a warning can say
   * *what* it is about ("this removes the retrieval session for Matrices") instead of
   * speaking in general terms. It never influences which findings are raised.
   */
  base?: unknown;
  /** The student's answers. Empty means "tell me what I would be accepting". */
  acknowledged: readonly string[];
  state?: AvailabilitySnapshot;
  frozen?: Parameters<typeof validateDraft>[2];
  frozenMilestones?: Parameters<typeof validateDraft>[3];
}

/** Minutes, in words: "1 hour 15 minutes", never "75m" inside a sentence. */
export function spokenMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const hour = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (!hours) return `${rest} minute${rest === 1 ? "" : "s"}`;
  if (!rest) return hour;
  return `${hour} ${rest} minute${rest === 1 ? "" : "s"}`;
}

/** The weekly figure a plan is measured against: the sum of the availability grid. */
export function weeklyTargetMinutes(input: UserInputV1): number {
  return input.availability.dailyMinutes.reduce((total, minutes) => total + minutes, 0);
}

export interface CapacityPicture {
  /** Days whose proposal is blocked, or over what that day actually has left. */
  reasons: { date: string; code: "BLOCKED" | "OVER_CAPACITY" }[];
  /** Proposed minutes per date, for the sentences below. */
  proposed: Map<string, number>;
}

/**
 * The capacity picture for a set of items.
 *
 * `validateCapacity` is used for its day-by-day arithmetic and *not* for its verdict:
 * an infeasible result here is a finding to classify, not a refusal. What it *throws*
 * for (a malformed snapshot, an item outside the horizon or outside 15–240 minutes) is
 * rethrown: those are structural facts the engine owns, and none of them may be
 * downgraded into something a student could accept.
 */
export function measureCapacity(
  input: UserInputV1,
  items: readonly { date: string; minutes: number }[],
  state: AvailabilitySnapshot
): CapacityPicture {
  const result = validateCapacity(constraintCapacityInput(input), state, items as never);
  return {
    reasons: result.feasible ? [] : result.reasons,
    proposed: new Map(result.days.map((day) => [day.date, day.proposed])),
  };
}

/**
 * The capacity findings for a draft, classified by what the student actually declared.
 *
 * Exported because it is the whole of §36/§37 in one readable place: the tests drive it
 * with a synthetic grid rather than through a database.
 */
export function capacityFindings(
  input: UserInputV1,
  items: readonly { date: string; minutes: number }[],
  capacity: CapacityPicture
): PlannerFinding[] {
  const findings: PlannerFinding[] = [];
  const weeklyHard = hardWeeklyLimit(input);
  const minutesOn = (date: string) => capacity.proposed.get(date) ?? 0;
  const workDates = [...new Set(items.map((item) => item.date))].sort();

  /**
   * The rolling seven-day window, anchored on every date that holds work: the same
   * measurement the Roadmap expansion path uses, so a HARD weekly limit means one
   * thing everywhere.
   */
  const weeklyTotals = workDates.map((anchor) => {
    const start = dateOrdinal(anchor);
    let total = 0;
    for (let offset = 0; offset < 7; offset += 1)
      total += minutesOn(new Date((start + offset) * 86400000).toISOString().slice(0, 10));
    return { anchor, total };
  });
  const worstWeek = weeklyTotals.reduce(
    (worst, entry) => (entry.total > worst.total ? entry : worst),
    { anchor: workDates[0] ?? input.startDate, total: 0 }
  );

  /**
   * An explicit HARD weekly maximum stays hard, whatever else is true of the draft.
   *
   * Checked before — and independently of — the daily capacity verdict. A week can be over the
   * student's own ceiling while every one of its days fits their grid, and the finding has to
   * say so; deriving it from the daily reasons meant it was only ever reported alongside a
   * daily overrun, which is exactly the case where it was already known. The authoritative
   * refusal is in `validateHardConstraints`, so this is the explanation rather than the gate.
   */
  if (weeklyHard !== null && worstWeek.total > weeklyHard) {
    findings.push(
      finding(
        "HARD_WEEKLY_LIMIT_EXCEEDED",
        { kind: "PLAN" },
        `The week of ${worstWeek.anchor} holds ${spokenMinutes(worstWeek.total)}, above the hard weekly maximum of ${spokenMinutes(weeklyHard)} you set. Raise or remove that maximum to keep this change.`
      )
    );
  }

  // The rest are consequences of the daily grid, and only exist when it was overrun.
  if (!capacity.reasons.length) return findings;

  const target = weeklyTargetMinutes(input);
  /**
   * One finding per *reason*, not per affected day.
   *
   * A draft that overruns a small grid can be over on nine days at once, and nine
   * copies of the same sentence would read as nine problems. The student is told the
   * shape of what happened — how far over the week is, or which day is heaviest — and
   * the count travels in the sentence.
   */
  const blocked = capacity.reasons.filter((entry) => entry.code === "BLOCKED").map((entry) => entry.date).sort();
  if (blocked.length)
    findings.push(
      finding(
        "SCHEDULED_ON_REST_DAY",
        { kind: "PLAN", ref: blocked[0] },
        blocked.length === 1
          ? `${blocked[0]} is a ${WEEKDAY_NAMES[weekday(blocked[0])]} you keep free. The work stays there unless you move it.`
          : `${blocked.length} days this plan uses are days you keep free, starting with ${blocked[0]}. The work stays there unless you move it.`
      )
    );

  const overDays = capacity.reasons
    .filter((entry) => entry.code === "OVER_CAPACITY")
    .map((entry) => entry.date)
    .sort();
  if (overDays.length) {
    const overshoot = worstWeek.total - target;
    if (target > 0 && overshoot > 0) {
      findings.push(
        finding(
          "WEEKLY_TARGET_OVERRUN",
          { kind: "PLAN" },
          `This plan is about ${spokenMinutes(overshoot)} above your ${spokenMinutes(target)} weekly target. That target is yours to exceed — it is not a hard limit.`
        )
      );
    } else {
      const busiest = overDays.reduce<string | null>(
        (worst, date) => (worst === null || minutesOn(date) > minutesOn(worst) ? date : worst),
        null
      );
      findings.push(
        finding(
          "DAILY_TARGET_OVERRUN",
          { kind: "PLAN", ...(busiest ? { ref: busiest } : {}) },
          busiest
            ? `${busiest} carries ${spokenMinutes(minutesOn(busiest))}, more than your usual daily amount. The week as a whole still fits your target.`
            : "This puts more work on one day than your usual daily amount."
        )
      );
    }
  }
  return findings;
}

/**
 * Evaluate an edited draft: what validates, what it trades away, and what the student
 * has actually accepted.
 *
 * The returned `draft` is the sealable candidate, and is non-null only when `ok` is true.
 */
export function assessDraftEdit(request: DraftAssessmentRequest): DraftAssessment {
  const suppressed = new Set<string>();
  const raised: PlannerFinding[] = [];
  let validated: ValidatedDraftV1 | null = null;

  // Parsed separately, for labelling only: it never decides anything, and a malformed
  // draft simply yields general sentences instead of unit names.
  const forLabels = ValidatedDraftV1Schema.safeParse(request.draft);
  const baseLabels = request.base ? ValidatedDraftV1Schema.safeParse(request.base) : null;

  for (let pass = 0; pass < MAX_ASSESSMENT_PASSES; pass += 1) {
    try {
      validated = validateDraft(
        request.input,
        request.draft,
        request.frozen ?? [],
        request.frozenMilestones ?? [],
        { suppress: suppressed }
      );
      break;
    } catch (error) {
      if (!(error instanceof PlannerValidationError)) throw error;
      const code = error.message;
      // The conservative default: anything not audited as a recommendation — including
      // a code this phase has never seen — is reported as a blocker and refused.
      if (!isRecommendation(code) || suppressed.has(code)) {
        raised.push(
          finding(
            code,
            { kind: "DRAFT" },
            "This change cannot be saved as it stands. Undo it, or adjust it so the plan stays valid."
          )
        );
        validated = null;
        break;
      }
      const unit = forLabels.success
        ? affectedUnitLabels(code, forLabels.data)[0] ??
          (baseLabels?.success ? changedUnitLabels(baseLabels.data, forLabels.data)[0] : undefined) ??
          null
        : null;
      raised.push(
        finding(
          code,
          unit ? { kind: "UNIT", ref: unit } : { kind: "DRAFT" },
          recommendationConsequence(code, unit)
        )
      );
      suppressed.add(code);
    }
  }

  if (validated) {
    // Soft preferences were already advisory; stating them on an edit is what makes
    // §36's "longer than you prefer" a warning rather than silence.
    for (const violation of softConstraintViolations(
      request.input,
      validated.items.filter((item) => !item.removed)
    ))
      raised.push(
        finding(
          violation.kind === "SESSION_LENGTH_PREFERENCE"
            ? "SESSION_LONGER_THAN_PREFERRED"
            : "SOFT_PREFERENCE_UNHONORED",
          { kind: "DRAFT" },
          violation.explanation
        )
      );
    if (request.state) {
      const active = validated.items.filter((item) => !item.removed);
      raised.push(...capacityFindings(request.input, active, measureCapacity(request.input, active, request.state)));
    }
  }

  /**
   * Normalise the student's answers before checking them.
   *
   * A client accepts a warning by sending that warning's own acknowledgement code
   * (`ACK:CODE`), so that is the accepted spelling. But an attempt to accept a *blocker*
   * must be answered as exactly that — "this cannot be accepted" — rather than as a code
   * nobody raised, whichever prefix it used to ask. Anything else that names no raised
   * warning is an unknown acknowledgement.
   */
  const blockerCodes = new Set(
    raised.filter((entry) => entry.severity === "BLOCKER").map((entry) => entry.code)
  );
  const normalised: string[] = [];
  for (const value of request.acknowledged) {
    const code = acknowledgedCode(value) ?? (value.startsWith("BLOCK:") ? value.slice(6) : value);
    if (blockerCodes.has(code)) throw new PlannerError(422, "BLOCKER_NOT_ACKNOWLEDGEABLE");
    normalised.push(`ACK:${code}`);
  }

  const envelope = verifyAcknowledgements(raised, normalised);
  if (envelope.unknown.length) throw new PlannerError(422, "UNKNOWN_ACKNOWLEDGEMENT");
  if (envelope.blocked.length) throw new PlannerError(422, "BLOCKER_NOT_ACKNOWLEDGEABLE");

  const warnings = raised.filter((entry) => entry.severity === "WARNING");
  const blockers = raised.filter((entry) => entry.severity === "BLOCKER");
  const accepted = envelope.accepted;
  const pending = warnings.filter((entry) => !accepted.includes(entry.acknowledgementCode));
  return {
    ok: blockers.length === 0 && pending.length === 0 && validated !== null,
    findings: raised,
    warnings,
    blockers,
    accepted,
    draft: blockers.length === 0 && pending.length === 0 ? validated : null,
  };
}

/** The session and weekly ceilings a draft must respect, for explaining §36 honestly. */
export function hardCeilings(input: UserInputV1): { session: number | null; weekly: number | null } {
  return { session: hardSessionLimit(input), weekly: hardWeeklyLimit(input) };
}

/** Is this acknowledgement value one this phase audited as a recommendation? */
export function acknowledgementIsKnown(value: string): boolean {
  const code = acknowledgedCode(value);
  if (!code) return false;
  return isRecommendation(code) && value === acknowledgementFor(code);
}
