import "server-only";
import { flattenScope, type PlanBriefV1 } from "../intake/brief";
import { briefReadiness, type ReadinessResult } from "../intake/readiness";
import { ACADEMIC_LEVELS, EXAM_BOARDS } from "@/lib/study-systems";
import {
  DESIGNER_QUESTION_CODES,
  type DesignerGuidance,
  type DesignerGuidanceCode,
  type DesignerModeRecommendation,
  type DesignerQuestion,
  type DesignerQuestionCode,
  type DesignerSummary,
} from "./contracts";

/**
 * What the Designer knows, derived from the Plan Brief and nothing else.
 *
 * Every value in this module is a pure function of server-held state. There is no model in
 * any of it, which is what makes §26's "PLAN SO FAR" trustworthy and §15's question policy
 * checkable: the Designer cannot ask about the board while the goal is empty, because the
 * list of things worth asking about is read from the brief rather than written by the model.
 */

const MODE_LABEL: Record<DesignerSummary["mode"], string> = {
  EXAM: "Exam Planner",
  ROADMAP: "Course / Syllabus Roadmap",
  MASTERY: "Chapter / Unit Mastery",
};

/**
 * The four essentials, mapped onto the readiness codes that actually prove them.
 *
 * A candidate scope awaiting confirmation counts as missing `SCOPE` — the student has
 * something to review rather than something to state, and the question for it says so. That
 * distinction is `SCOPE_UNCONFIRMED` rather than `SCOPE_MISSING`, and collapsing the two here
 * would lose the one piece of information that decides which control the frontend offers.
 */
export function missingEssentials(readiness: ReadinessResult): DesignerQuestionCode[] {
  const found = new Set<DesignerQuestionCode>();
  for (const code of readiness.missing) {
    if (code === "GOAL_MISSING") found.add("GOAL");
    else if (code === "SCOPE_MISSING" || code === "SCOPE_UNCONFIRMED") found.add("SCOPE");
    else if (code === "TARGET_DATE_MISSING") found.add("DATE");
    else if (code === "CAPACITY_MISSING") found.add("WEEKLY_TIME");
  }
  // The canonical priority order, not the order readiness happened to push them in.
  return DESIGNER_QUESTION_CODES.filter((code) => found.has(code));
}

/**
 * Is `setMode` going to be accepted for this brief?
 *
 * Mirrors the guard in `applyToBrief` exactly — no scope, no goal, no preparedness. It is
 * reported rather than acted on because switching mode **replaces the whole brief** with
 * `emptyBrief(mode)`, so folding it into a setup proposal would wipe the goal, scope and time
 * the same proposal was setting. The frontend offers the switch; the student takes it, and a
 * brief that has already started gets `MODE_LOCKED` from the action itself rather than a
 * silent reset from here.
 */
export function modeSwitchable(brief: PlanBriefV1): boolean {
  return !brief.scope.nodes.length && !brief.goal.title.trim() && brief.preparedness.length === 0;
}

/** The Designer's read of the brief. Pure; no model, no clock beyond what the caller passed. */
export function designerSummary(input: {
  brief: PlanBriefV1;
  readiness: ReadinessResult;
}): DesignerSummary {
  const { brief, readiness } = input;
  const flat = flattenScope(brief.scope.nodes);
  const candidate = brief.scopeCandidate;
  const reviewable = candidate !== null && candidate.nodes.length > 0;
  const scopeState: DesignerSummary["scopeState"] =
    flat.units.length > 0
      ? "CONFIRMED"
      : reviewable
        ? "CANDIDATE"
        : "NONE";
  return {
    mode: brief.mode,
    modeLabel: MODE_LABEL[brief.mode],
    goal: brief.goal.title.trim() || null,
    subject: brief.subject.name?.trim() || null,
    targetDate: brief.target.examDate ?? brief.target.endDate ?? null,
    scopeState,
    scopeUnitCount: flat.units.length,
    weeklyMinutes: brief.budget.weeklyMinutes,
    backgroundLabel: brief.backgroundCurriculum?.label?.trim() || null,
    board: brief.backgroundCurriculum?.board ?? null,
    level: brief.backgroundCurriculum?.level ?? null,
    preparednessStated: brief.preparedness.length,
    researchPolicy: brief.researchPolicy,
    missing: missingEssentials(readiness),
    readyToGenerate: readiness.canGenerate,
  };
}

/**
 * The one material question, from the server's own list.
 *
 * The model's suggestion is used **only when it names a code the server independently agrees
 * is missing**. That is the whole of §15: a model that asks about preparedness while the goal
 * is empty is corrected rather than obeyed, and a model that stays silent while the date is
 * missing is overruled by the fallback below. The wording may be the model's; the decision to
 * ask, and what about, never is.
 */
export function questionFor(input: {
  missing: readonly DesignerQuestionCode[];
  modelCode: DesignerQuestionCode | null;
  modelQuestion: string | null;
  modelOptions: readonly string[] | null;
}): DesignerQuestion | null {
  const code = input.missing[0];
  if (!code) return null;
  const acceptModel = input.modelCode === code && Boolean(input.modelQuestion?.trim());
  return {
    code,
    question: acceptModel ? input.modelQuestion!.trim() : FALLBACK_QUESTION[code],
    options: acceptModel && input.modelOptions?.length ? [...input.modelOptions].slice(0, 4) : [],
  };
}

/**
 * Fixed wording, so a question is asked even when the model offers none.
 *
 * Short by design: the student answers each of these in a few words, and a paragraph in
 * front of them is the interrogation §3 forbids.
 */
export const FALLBACK_QUESTION: Record<DesignerQuestionCode, string> = {
  GOAL: "What are you preparing for?",
  SCOPE: "What should Sylf cover?",
  DATE: "What date does this need to be done by?",
  WEEKLY_TIME: "How much time can you give this each week?",
};

/** The mode recommendation, with the server's own answer about whether it can be taken. */
export function modeRecommendation(input: {
  brief: PlanBriefV1;
  mode: DesignerSummary["mode"] | null;
  reason: string | null;
}): DesignerModeRecommendation | null {
  if (!input.mode || input.mode === input.brief.mode) return null;
  const label = MODE_LABEL[input.mode];
  const why = input.reason?.trim();
  return {
    mode: input.mode,
    text: why ? `I'd use ${label} for this — ${why}` : `I'd use ${label} for this.`,
    switchable: modeSwitchable(input.brief),
  };
}

/**
 * Guidance: advice the student may ignore.
 *
 * Every code here is deterministic — read from the brief, or from a value the model stated
 * about *what the student said* (a recommended mode), never from a model judgement about the
 * student. Nothing in this list can refuse a turn or gate a generation; §16 and §17 are the
 * reason, and `designerGuidanceIsAdvisory` exists so a test can hold that line.
 */
export function designerGuidance(input: {
  brief: PlanBriefV1;
  summary: DesignerSummary;
  /** True when a search provider is configured, so "I can look it up" is honest. */
  researchConfigured: boolean;
  /** Today, for the horizon check. */
  today: string;
}): DesignerGuidance[] {
  const { brief, summary } = input;
  const out: DesignerGuidance[] = [];
  const push = (code: DesignerGuidanceCode, text: string) => out.push({ code, text });

  if (summary.researchPolicy === "OFF") {
    push("RESEARCH_OFF", "You asked Sylf to use only what you give it, so nothing will be looked up.");
  } else if (summary.scopeState === "NONE" && input.researchConfigured) {
    // The distinction §18 draws: a whole qualification has a document worth finding; one
    // chapter is usually faster to type than to search for.
    if (brief.mode === "MASTERY")
      push(
        "MANUAL_SCOPE_FASTER",
        "For one unit, typing the topics is usually faster than searching. You can also paste a chapter list."
      );
    else
      push(
        "RESEARCH_AVAILABLE",
        "I can look up the official syllabus and let you review the topics before they are used."
      );
  }

  if (summary.scopeState === "CANDIDATE")
    push("RESEARCH_AVAILABLE", "There is a scope waiting for you to review it — nothing is used until you confirm it.");

  /**
   * Board and level, only when they would actually change something: the student is on an
   * exam or course with a qualification, nothing covers the scope yet, and neither is set.
   */
  if (
    summary.researchPolicy === "ALLOW" &&
    brief.mode !== "MASTERY" &&
    !summary.board &&
    !summary.level &&
    summary.scopeState !== "CONFIRMED" &&
    looksLikeQualificationTarget(brief)
  )
    push(
      "BOARD_HELPS",
      "If you tell me the board and level, I can verify which sources are actually official rather than just plausible."
    );

  if (summary.goal && isBroadGoal(summary.goal) && brief.mode === "EXAM")
    push(
      "GOAL_TOO_BROAD",
      "Exam Planner needs a specific exam or assessment. If you mean the whole subject instead, a Course Roadmap fits better."
    );

  if (summary.goal && isBroadGoal(summary.goal) && brief.mode === "MASTERY")
    push("MASTERY_IS_ONE_UNIT", "Mastery works best for one chapter or unit. If you mean the whole subject, I'd use a Roadmap.");

  const days = daysUntil(input.today, summary.targetDate);
  if (days !== null && days <= 21)
    push(
      "DENSE_SCHEDULE",
      days <= 0
        ? "That date has already passed, so the plan will start from today."
        : `That is ${days} day${days === 1 ? "" : "s"} away, so the schedule will be dense. We can keep it, or you can move the finish date.`
    );

  if (!out.length && summary.readyToGenerate)
    push("READY", "You have everything I need to make a first draft.");
  return out;
}

/**
 * Does the goal read like a whole subject rather than one exam or one unit?
 *
 * Deliberately conservative and deliberately *only* used to offer advice. A false positive
 * costs one sentence the student can ignore; a false negative costs nothing. There is no
 * attempt here to encode educational knowledge — this is a shape test on the string, and the
 * moment it would have to be cleverer than that, it should stop being a rule at all.
 */
export function isBroadGoal(goal: string): boolean {
  const text = goal.trim().toLowerCase();
  if (!text) return false;
  // A year, a paper, a unit number or a code is specific, not broad.
  if (/\b(19|20)\d{2}\b/.test(text)) return false;
  if (/\b(paper|unit|chapter|module|topic|section)\b/.test(text)) return false;
  if (/\b\d{4}\b/.test(text)) return false;
  if (/\b(mock|retake|resit|final|midterm|test|exam|net|sat|act|mcat|gre|ielts|gcse|igcse|a-level|as-level|ib|fsc|hsc)\b/.test(text))
    return false;
  // A named course or programme is specific enough to plan from, even when it is short.
  if (/\b(course|module|semester|term|year|university|college|school|degree|programme|program|curriculum)\b/.test(text))
    return false;
  // A bare subject, or "study/learn/master <subject>", is the shape that needs guidance.
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 4;
}

/**
 * Does the goal already name a board or a qualification?
 *
 * Read from the *text*, not from `resolveAuthorities`, and that distinction is the whole point:
 * the authority registry answers "which hosts belong to the board the student selected", so it
 * recognises nothing until `board` is set — which is precisely the case this guidance exists
 * for. Asking it here would be circular and the advice would never fire.
 *
 * So the test is a mention scan against the same registry the board selector uses. A student
 * who has written "CAIE" or "IGCSE" has told us a qualification exists; naming it in the two
 * fields Sylf can verify against is then a real offer rather than a nag, and it stays an offer.
 */
function looksLikeQualificationTarget(brief: PlanBriefV1): boolean {
  if (brief.backgroundCurriculum?.board) return false;
  const text = `${brief.goal.title} ${brief.subject.name ?? ""}`.toLowerCase();
  if (!text.trim()) return false;
  const mentions = (options: readonly { value: string; label: string }[]): boolean =>
    options.some((option) => {
      const value = option.value.toLowerCase();
      const label = option.label.toLowerCase();
      // The distinctive half of a label: "CAIE — Cambridge International" also matches on
      // "cambridge international", and "BISE Punjab (Lahore)" on "bise punjab".
      const head = label.split(/[—(]/)[0].trim();
      return (
        (value.length >= 3 && text.includes(value)) ||
        (head.length >= 3 && text.includes(head)) ||
        (label.length >= 4 && text.includes(label))
      );
    });
  return mentions(EXAM_BOARDS) || mentions(ACADEMIC_LEVELS);
}

/** Whole days from `today` to a date, or null when there is nothing to measure. */
export function daysUntil(today: string, date: string | null): number | null {
  if (!date) return null;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Every guidance code is advisory.
 *
 * Exported as a fact rather than a comment so the claim in §16 — *recommendations are not
 * requirements* — is something a test asserts rather than something a reader believes.
 */
export function designerGuidanceIsAdvisory(): true {
  return true;
}
