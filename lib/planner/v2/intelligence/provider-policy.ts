import { z } from "zod";
import { PLANNER_V2_BUDGETS, type RuntimeBudgetV2 } from "../contracts";
import { reject } from "../server/database";

const reserve = z.strictObject({ inputTokens: z.number().int().positive(), outputTokens: z.number().int().positive() });
export const ProviderPolicySchema = z.strictObject({
  purpose: z.enum(["INTERPRETATION", "BLUEPRINT", "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "RESEARCH", "OCR"]),
  reviewReserve: reserve.optional(), verificationReserve: reserve.optional(),
});
export type ProviderPolicy = z.infer<typeof ProviderPolicySchema>;
export interface ProviderGuard {
  reviewReserve?: { inputTokens: number; outputTokens: number };
  reviewCompleted?: boolean;
  verificationReserve?: { inputTokens: number; outputTokens: number };
  researchDeadlineAt?: string;
}
export const providerCategory = (purpose: ProviderPolicy["purpose"]) =>
  purpose === "RESEARCH" ? "RESEARCH" as const : ["INTERPRETATION", "OCR"].includes(purpose) ? "OTHER" as const : "PLANNING" as const;

/** Holdbacks are future capacity, not fictitious dispatched reservations. They
 * live in supporting metadata and are checked atomically with each real call. */
export function reserveProviderCapacity(budget: RuntimeBudgetV2, previous: ProviderGuard, raw: ProviderPolicy,
  now: Date, needsReview: boolean, pendingPlanningCalls = 0): ProviderGuard {
  const policy = ProviderPolicySchema.parse(raw); const guard = structuredClone(previous);
  if (["ADVICE", "CALENDAR_ONLY"].includes(budget.profile) && !["INTERPRETATION"].includes(policy.purpose))
    reject("BUDGET_EXHAUSTED", "This root profile does not authorize educational or research generation.");
  const hold = (key: "reviewReserve" | "verificationReserve", value: ProviderPolicy["reviewReserve"]) => {
    if (!value) return;
    if (guard[key] && (value.inputTokens < guard[key]!.inputTokens || value.outputTokens < guard[key]!.outputTokens))
      reject("BUDGET_EXHAUSTED", "Reserved review capacity cannot be reduced.");
    guard[key] = value;
  };
  hold("reviewReserve", policy.reviewReserve); hold("verificationReserve", policy.verificationReserve);
  if (needsReview && !guard.reviewCompleted && !guard.reviewReserve) reject("BUDGET_EXHAUSTED", "Educational work must retain explicit capacity for its mandatory review.");
  if (policy.purpose === "REPAIR" && (!guard.reviewCompleted || !guard.verificationReserve)) reject("BUDGET_EXHAUSTED", "Repair needs an initial review and reserved verification capacity.");
  if (policy.purpose === "VERIFICATION" && !guard.verificationReserve) reject("INVALID_OUTPUT", "No repair verification was reserved.");
  if (guard.verificationReserve && !["REPAIR", "VERIFICATION"].includes(policy.purpose)) reject("INVALID_OUTPUT", "Reserved repair verification must complete before other model work.");
  if (["RESEARCH", "OCR"].includes(policy.purpose)) {
    guard.researchDeadlineAt ??= new Date(Math.min(Date.parse(budget.executionDeadlineAt ?? new Date(now.getTime() + 120000).toISOString()), now.getTime() + 120000)).toISOString();
    if (Date.parse(guard.researchDeadlineAt) <= now.getTime()) reject("BUDGET_EXHAUSTED", "The research processing window expired.", "RESEARCH");
  }
  const held = [needsReview && !guard.reviewCompleted && policy.purpose !== "REVIEW" ? guard.reviewReserve : undefined,
    policy.purpose !== "VERIFICATION" ? guard.verificationReserve : undefined].filter(v => v !== undefined);
  const limit = PLANNER_V2_BUDGETS[budget.profile];
  if (budget.consumed.modelCalls + budget.reserved.modelCalls + held.length > limit.modelCalls ||
    budget.consumed.planningCalls + pendingPlanningCalls + held.length > 5 ||
    budget.consumed.inputTokens + budget.reserved.inputTokens + held.reduce((n, h) => n + h.inputTokens, 0) > limit.inputTokens ||
    budget.consumed.outputTokens + budget.reserved.outputTokens + held.reduce((n, h) => n + h.outputTokens, 0) > limit.outputTokens)
    reject("BUDGET_EXHAUSTED", "This call would consume capacity reserved for review or verification.");
  return guard;
}
