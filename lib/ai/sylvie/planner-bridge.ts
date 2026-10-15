/**
 * Sylvie carries a student's request to the existing Planner. This boundary only
 * selects and bounds their words; the Planner still interprets, proposes and applies.
 * It is client safe and contains no provider, persistence or scheduling code.
 */
import { z } from "zod";
import { COPILOT_LIMITS } from "@/lib/planner/copilot/contracts";

export const SylviePlannerHandoffSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(8).max(60).regex(/^[a-zA-Z0-9_-]+$/),
  request: z.string().trim().min(1).max(COPILOT_LIMITS.maxMessageChars),
  mode: z.enum(["EXAM", "ROADMAP", "MASTERY"]),
  kind: z.enum(["NEW_PLAN", "REPLAN"]),
  recent: z.array(z.strictObject({ role: z.literal("STUDENT"), text: z.string().min(1).max(300) }))
    .max(COPILOT_LIMITS.maxRecentTurns),
});
export type SylviePlannerHandoff = z.infer<typeof SylviePlannerHandoffSchema>;

type ConversationTurn = { role: string; content?: string; text?: string };
type StatedPreference = { key: string; value: string; source: string };

const ACADEMIC = /\b(stud(?:y|ying|ies)|revision|revis(?:e|ing)|exam|test|finals|course|syllabus|learn(?:ing)?|chapter|topic|unit|homework|assignment)\b/i;
const REQUEST = /\b(plan|schedule|timetable|routine|roadmap|replan|rebalance)\b/i;
const ACTION = /\b(make|create|build|design|generate|organize|arrange|help|need|want|prepare|prep|plan|replan|rebalance|adjust)\b/i;
const REPLAN = /\b(replan|replanning|rebalance|rebalancing)\b|\b(?:adjust|change|revise|update)\b.{0,50}\b(?:my|existing|current|this|the) (?:study )?(?:plan|schedule|timetable)\b|\b(?:my|this|the) (?:study )?plan\b.{0,40}\b(?:lighter|behind|less time|more time|deadline)\b/i;
const FACT = /\b(?:hours?|minutes?)\b.{0,25}\b(?:week|day|daily|weekly)\b|\b(?:weekly|daily|week|day)\b.{0,25}\b(?:hours?|minutes?)\b|\b(?:weak|rusty|confident) (?:at|in|with)\b|\b(?:deadline|exam|syllabus|course|chapter|topics?|mornings?|afternoons?|evenings?|nights?|weekends?|weekdays?|sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?)\b|\b(?:before|after) (?:work|school|classes)\b|\b(?:free|available) (?:after|before|from|until|at)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
const QUICK_ACTION = /\b(?:move|swap|complete|finish|delete|remove|rename)\b.{0,35}\b(?:quest|task|goal)\b/i;
const DOCUMENTATION = /^(?:what (?:is|are|does)|how (?:does|do)|explain|describe|introduce|give (?:me )?(?:a )?(?:short |brief )?(?:intro|introduction))\b/i;

const said = (turn: ConversationTurn): string => (turn.content ?? turn.text ?? "").trim();

/** Narrow action detection: explaining the Planner or reading a schedule stays in chat. */
export function isPlanningRequest(message: string, history: readonly ConversationTurn[] = []): boolean {
  const text = message.trim();
  if (!text || QUICK_ACTION.test(text)) return false;
  if (DOCUMENTATION.test(text) && !/\bhow (?:do|can|should) i\b/i.test(text)) return false;
  if (REPLAN.test(text)) return true;
  if (/\b(?:prepare|prep|revise|study) for (?:my |an? |the )?(?:\w+\s+){0,5}(?:exam|test|finals|assessment)\b/i.test(text)) return true;
  if (/\b(?:how (?:do|can|should) i|help me)\s+(?:prepare|revise|plan)\b/i.test(text) && ACADEMIC.test(text)) return true;
  if (REQUEST.test(text) && ACTION.test(text) && (ACADEMIC.test(text) || /\bmy (?:week|month|schedule|plan)\b/i.test(text))) return true;
  if (/\b(?:create|make|add|generate)\b.{0,25}\b(?:multiple|several|a batch of|[2-9]|two|three|four|five|six|seven|eight|nine|ten)\b.{0,15}\b(?:tasks|quests)\b/i.test(text)) return true;
  if (text.length < 180 && REQUEST.test(text) && ACTION.test(text)) {
    for (const turn of history.slice(-6).toReversed()) {
      if (turn.role !== "user") continue;
      if (ACADEMIC.test(said(turn))) return true;
      if (!FACT.test(said(turn))) break;
    }
  }
  const followup = /\b(?:make it lighter|less time|more time|behind|rework it|adjust it|change it|plan it|schedule it|do that|yes please)\b/i.test(text);
  return followup && history.slice(-6).some((turn) => turn.role === "user" && REQUEST.test(said(turn)) && ACADEMIC.test(said(turn)));
}

/**
 * Preserve stated context, never assistant suggestions or inferred memories.
 * The user's final request stays verbatim, within the Planner's existing bounds.
 */
export function preparePlannerHandoff(input: {
  message: string;
  history?: readonly ConversationTurn[];
  preferences?: readonly StatedPreference[];
  id?: string;
}): SylviePlannerHandoff {
  const request = input.message.trim().slice(0, COPILOT_LIMITS.maxMessageChars);
  const recent: SylviePlannerHandoff["recent"] = [];
  const seen = new Set<string>([request]);
  const add = (text: string) => {
    const bounded = text.trim().slice(0, 300);
    if (!bounded || seen.has(bounded)) return;
    seen.add(bounded);
    recent.push({ role: "STUDENT", text: bounded });
  };
  for (const preference of input.preferences ?? []) {
    if (preference.source === "user_stated" && /study|schedule|availability|session|learning|exam|rest/i.test(preference.key) && FACT.test(preference.value))
      add(preference.value);
  }
  // Stop at the last unrelated user turn rather than importing every prior topic.
  const relevant: string[] = [];
  for (const turn of (input.history ?? []).slice(-12).toReversed()) {
    if (turn.role !== "user") continue;
    if (!ACADEMIC.test(said(turn)) && !FACT.test(said(turn))) break;
    relevant.unshift(said(turn));
  }
  for (const text of relevant) add(text);
  const boundedRecent = recent.slice(-COPILOT_LIMITS.maxRecentTurns);
  const context = [...boundedRecent.map((turn) => turn.text), request].join(" ");
  const kind = REPLAN.test(request) || (/\b(?:lighter|behind|less time|more time|rework|adjust it|change it)\b/i.test(request) && REQUEST.test(context))
    ? "REPLAN" : "NEW_PLAN";
  const mode = /\b(?:exam|test|finals|assessment|mock)\b/i.test(context)
    ? "EXAM"
    : /\b(?:master|mastery|one topic|single topic|chapter|one unit|single unit)\b/i.test(context) && !/\b(?:whole|entire|full) (?:course|syllabus)\b/i.test(context)
      ? "MASTERY" : "ROADMAP";
  return SylviePlannerHandoffSchema.parse({
    schemaVersion: 1,
    id: input.id ?? crypto.randomUUID(),
    request,
    mode,
    kind,
    recent: boundedRecent,
  });
}
