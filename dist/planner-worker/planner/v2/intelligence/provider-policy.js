"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerCategory = exports.ProviderPolicySchema = void 0;
exports.reserveProviderCapacity = reserveProviderCapacity;
const zod_1 = require("zod");
const contracts_1 = require("../contracts");
const database_1 = require("../server/database");
const reserve = zod_1.z.strictObject({ inputTokens: zod_1.z.number().int().positive(), outputTokens: zod_1.z.number().int().positive() });
exports.ProviderPolicySchema = zod_1.z.strictObject({
    purpose: zod_1.z.enum(["INTERPRETATION", "BLUEPRINT", "ADAPTATION", "REVIEW", "REPAIR", "VERIFICATION", "RESEARCH", "OCR"]),
    reviewReserve: reserve.optional(), verificationReserve: reserve.optional(),
});
const providerCategory = (purpose) => purpose === "RESEARCH" ? "RESEARCH" : ["INTERPRETATION", "OCR"].includes(purpose) ? "OTHER" : "PLANNING";
exports.providerCategory = providerCategory;
/** Holdbacks are future capacity, not fictitious dispatched reservations. They
 * live in supporting metadata and are checked atomically with each real call. */
function reserveProviderCapacity(budget, previous, raw, now, needsReview, pendingPlanningCalls = 0) {
    const policy = exports.ProviderPolicySchema.parse(raw);
    const guard = structuredClone(previous);
    if (["ADVICE", "CALENDAR_ONLY"].includes(budget.profile) && !["INTERPRETATION"].includes(policy.purpose))
        (0, database_1.reject)("BUDGET_EXHAUSTED", "This root profile does not authorize educational or research generation.");
    if (["RESEARCH", "OCR"].includes(policy.purpose) && budget.profile !== "RESEARCH")
        (0, database_1.reject)("BUDGET_EXHAUSTED", "Research requires an explicit research profile escalation.", "RESEARCH");
    const hold = (key, value) => {
        if (!value)
            return;
        if (guard[key] && (value.inputTokens < guard[key].inputTokens || value.outputTokens < guard[key].outputTokens))
            (0, database_1.reject)("BUDGET_EXHAUSTED", "Reserved review capacity cannot be reduced.");
        guard[key] = value;
    };
    hold("reviewReserve", policy.reviewReserve);
    hold("verificationReserve", policy.verificationReserve);
    if (needsReview && !guard.reviewCompleted && !guard.reviewReserve)
        (0, database_1.reject)("BUDGET_EXHAUSTED", "Educational work must retain explicit capacity for its mandatory review.");
    if (policy.purpose === "REPAIR" && (!guard.reviewCompleted || !guard.verificationReserve))
        (0, database_1.reject)("BUDGET_EXHAUSTED", "Repair needs an initial review and reserved verification capacity.");
    if (policy.purpose === "VERIFICATION" && !guard.verificationReserve)
        (0, database_1.reject)("INVALID_OUTPUT", "No repair verification was reserved.");
    if (guard.verificationReserve && !["REPAIR", "VERIFICATION"].includes(policy.purpose))
        (0, database_1.reject)("INVALID_OUTPUT", "Reserved repair verification must complete before other model work.");
    if (["RESEARCH", "OCR"].includes(policy.purpose)) {
        guard.researchDeadlineAt ??= new Date(Math.min(Date.parse(budget.executionDeadlineAt ?? new Date(now.getTime() + 120000).toISOString()), now.getTime() + 120000)).toISOString();
        if (Date.parse(guard.researchDeadlineAt) <= now.getTime())
            (0, database_1.reject)("BUDGET_EXHAUSTED", "The research processing window expired.", "RESEARCH");
    }
    const held = [needsReview && !guard.reviewCompleted && policy.purpose !== "REVIEW" ? guard.reviewReserve : undefined,
        policy.purpose !== "VERIFICATION" ? guard.verificationReserve : undefined].filter(v => v !== undefined);
    const limit = contracts_1.PLANNER_V2_BUDGETS[budget.profile];
    if (budget.consumed.modelCalls + budget.reserved.modelCalls + held.length > limit.modelCalls ||
        budget.consumed.planningCalls + pendingPlanningCalls + held.length > 5 ||
        budget.consumed.inputTokens + budget.reserved.inputTokens + held.reduce((n, h) => n + h.inputTokens, 0) > limit.inputTokens ||
        budget.consumed.outputTokens + budget.reserved.outputTokens + held.reduce((n, h) => n + h.outputTokens, 0) > limit.outputTokens)
        (0, database_1.reject)("BUDGET_EXHAUSTED", "This call would consume capacity reserved for review or verification.");
    return guard;
}
