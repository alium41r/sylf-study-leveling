/**
 * The one place that decides what "preparedness" means, including what it means
 * when the student has not said.
 *
 * `covered`, `confidence` and `difficult` are **nullable** on a scope unit, and
 * `null` means *unstated* — never "weak". That distinction is load-bearing rather
 * than cosmetic, because JavaScript reads `null` as 0 in a comparison: an
 * unstated confidence satisfies `confidence <= 2`, so every rule written as a bare
 * comparison would classify a student who simply has not answered as struggling,
 * and would plan more work, earlier, for units we know nothing about.
 *
 * The policy below is the deliberate answer, and every rule in the planner routes
 * through it instead of comparing the raw fields:
 *
 * | Question | Unstated answer | Why |
 * | --- | --- | --- |
 * | `isWeak` | false | Unknown is not weakness: no priority escalation, no catch-up provision |
 * | `isSecure` | false | Unknown is not security: learning is never skipped or refused |
 * | `provisionWeight` | standard (2) | No inflated weight in the breadth/effort heuristic |
 * | `needsLearning` | true | A unit we know nothing about must still be planned as work to learn |
 * | `needsMistakeReview` | false | No *extra* exam work forced by an unanswered question |
 *
 * Note the deliberate asymmetry between `needsLearning`/provision floors and
 * "weakness": an unstated unit is planned with the provision that *includes*
 * learning it (it might be completely new), but it is never treated as a student
 * who is struggling. Planning less than that would silently assume knowledge;
 * escalating it would inflate the plan. Both are avoided here.
 *
 * TypeScript enforces half of this for free: `number | null` compared against a
 * number is a compile error (`TS18047`), so every confidence comparison had to
 * change. A `boolean | null` used as `!topic.covered` is *not* an error and is
 * `true` for `null`, which is why coverage reads go through the named predicates
 * rather than being left to the compiler.
 */

/** Anything carrying the three preparedness fields; structural so modes can pass their own topic type. */
export interface PreparednessFields {
  covered?: boolean | null;
  confidence?: number | null;
  difficult?: boolean | null;
}

/** What the model is told about a unit's preparedness, in one closed vocabulary. */
export const PREPAREDNESS_STATES = ["STATED", "UNKNOWN"] as const;
export type PreparednessState = (typeof PREPAREDNESS_STATES)[number];

/**
 * Has the student said anything about this unit at all?
 *
 * Sparse on purpose: a brief stores an entry only for units the student touched,
 * so a partially answered unit (coverage stated, confidence not) counts as stated
 * for display purposes while each individual rule still reads only the field it
 * needs.
 */
export function isPreparednessStated(topic: PreparednessFields): boolean {
  return (
    topic.covered !== null &&
    topic.covered !== undefined
  ) || (
    topic.confidence !== null && topic.confidence !== undefined
  ) || (
    topic.difficult !== null && topic.difficult !== undefined
  );
}

/** Did the student state coverage explicitly? */
export function isCoverageStated(topic: PreparednessFields): boolean {
  return topic.covered === true || topic.covered === false;
}

/** Stated as already covered — the only case that may suppress learning. */
export function isStatedCovered(topic: PreparednessFields): boolean {
  return topic.covered === true;
}

/** Stated as not covered — a real, user-asserted gap. */
export function isStatedNotCovered(topic: PreparednessFields): boolean {
  return topic.covered === false;
}

/**
 * Weak: a *stated* low confidence. Unstated is never weak.
 *
 * This is the predicate that replaces every `confidence <= 2` comparison, and it
 * is what keeps a high-priority unanswered unit out of the "needs catch-up"
 * treatment.
 */
export function isWeak(topic: PreparednessFields): boolean {
  return (
    topic.confidence !== null &&
    topic.confidence !== undefined &&
    topic.confidence <= 2
  );
}

/**
 * Secure: stated as covered *and* stated as confident. Unstated is never secure.
 *
 * Secure work is not re-taught, gets shorter reinforcement, and is not held to
 * orientation requirements — none of which may be inferred from silence.
 */
export function isSecure(topic: PreparednessFields): boolean {
  return (
    topic.covered === true &&
    topic.confidence !== null &&
    topic.confidence !== undefined &&
    topic.confidence >= 4
  );
}

/**
 * Weight this unit carries in breadth/effort heuristics.
 *
 * A stated gap (`covered: false`) or a stated low confidence carries the heavier
 * weight, because the plan genuinely owes that unit more. An *unstated* unit does
 * not: it takes the standard weight, so an unanswered questionnaire cannot inflate
 * the plan's shape.
 */
export function provisionWeight(topic: PreparednessFields): 2 | 4 {
  return isStatedNotCovered(topic) || isWeak(topic) ? 4 : 2;
}

/**
 * Does the plan still owe this unit its learning step?
 *
 * True unless the student explicitly said the unit is covered. This is the
 * conservative direction on purpose: skipping learning for a unit whose status is
 * unknown would assume knowledge the student never claimed.
 */
export function needsLearning(topic: PreparednessFields): boolean {
  return topic.covered !== true;
}

/**
 * Is *extra* mistake-review work owed because of the student's answer?
 *
 * Only a stated low confidence asks for it. The fixed Mastery progression still
 * contains its REVIEW_MISTAKES stage for any unit being learned — that is the
 * standard progression, not an escalation — but no rule may add work merely
 * because confidence was left unanswered.
 */
export function needsMistakeReview(topic: PreparednessFields): boolean {
  return isWeak(topic);
}

/** Is the unit flagged difficult, with unstated treated as not flagged? */
export function isDifficult(topic: PreparednessFields): boolean {
  return topic.difficult === true;
}

/** The closed marker handed to a model, so it never reads a fabricated number. */
export function preparednessState(topic: PreparednessFields): PreparednessState {
  return isCoverageStated(topic) || isConfidenceStated(topic)
    ? "STATED"
    : "UNKNOWN";
}

/** Did the student state a confidence explicitly? */
export function isConfidenceStated(topic: PreparednessFields): boolean {
  return topic.confidence !== null && topic.confidence !== undefined;
}

/**
 * The model-facing triple for one unit: the real values where stated, explicit
 * nulls where not, and always the closed state marker. Used by every generation
 * payload so an unanswered unit can never arrive as `false`/`1`/`3`.
 */
export function preparednessForModel(topic: PreparednessFields): {
  covered: boolean | null;
  confidence: number | null;
  difficult: boolean | null;
  preparedness: PreparednessState;
} {
  return {
    covered: isCoverageStated(topic) ? (topic.covered as boolean) : null,
    confidence: isConfidenceStated(topic) ? (topic.confidence as number) : null,
    difficult:
      topic.difficult === null || topic.difficult === undefined
        ? null
        : topic.difficult,
    preparedness: preparednessState(topic),
  };
}

/** Counts for the brief's assumption note and telemetry — never labels. */
export function preparednessSummary(
  topics: readonly PreparednessFields[]
): { total: number; stated: number; unstated: number } {
  const stated = topics.filter(isPreparednessStated).length;
  return { total: topics.length, stated, unstated: topics.length - stated };
}
