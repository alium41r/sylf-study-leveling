import { z } from "zod";
import { DigestV2Schema, DurableIdV2Schema, InstantV2Schema } from "../../contracts/primitives";
import { RoleSchema, type PlannerRole } from "./contracts";
import { hash } from "../../server/database";

const allowance = z.strictObject({ calls: z.number().int().positive().max(10000), inputUnits: z.number().int().positive().max(100000000), completionTokens: z.number().int().positive().max(100000000) });
const counters = z.strictObject({ calls: z.number().int().nonnegative(), inputUnits: z.number().int().nonnegative(), completionTokens: z.number().int().nonnegative() });
export const ResearchToolLimitsSchema = z.strictObject({ researchQueries: z.number().int().positive().max(10000), fetchAttempts: z.number().int().positive().max(20000), selectedSourceCharacters: z.number().int().positive().max(100000000), extractedPages: z.number().int().positive().max(20000), ocrPages: z.number().int().nonnegative().max(20000), followUps: z.number().int().positive().max(10000) });
/** No production default or spending entitlement. Trusted admission must select
 * a sufficient policy and bind it to the same financial root before Phase B. */
export const ResourcePolicySchema = z.strictObject({
  schemaVersion: z.literal(1), policyId: DurableIdV2Schema, authorizationDigest: DigestV2Schema,
  // Trusted per-Attempt capability, not a public flag or a new lifecycle.
  // Absent retains the already admitted Step 5 interpretation and hashes.
  journeyVersion: z.literal(1).optional(),
  spending: z.strictObject({ maximumMicros: z.number().int().positive().max(1000000000), pricingVersion: z.string().min(1).max(100) }).optional(),
  root: allowance, processingMs: z.number().int().positive().max(86400000),
  researchTools: ResearchToolLimitsSchema.optional(),
  roles: z.record(RoleSchema, z.strictObject({
    format: z.enum(["TEXT", "JSON"]), provider: z.literal("deepseek"), model: z.literal("deepseek-flash"),
    effort: z.enum(["LOW", "HIGH", "MAX", "DISABLED", "PROVIDER_DEFAULT"]),
    call: allowance, holdback: allowance,
  })),
}).superRefine((p, ctx) => {
  for (const role of ["RESEARCH", "STRATEGIST", "TRANSLATOR", "REVIEWER"] as const) {
    if (!p.roles[role]) ctx.addIssue({ code: "custom", message: "ALL_ROLE_POLICIES_REQUIRED" });
    else for (const field of ["calls", "inputUnits", "completionTokens"] as const) if (p.roles[role].holdback[field] < p.roles[role].call[field]) ctx.addIssue({ code: "custom", message: "HOLDBACK_MUST_FUND_ROLE_CAPACITY" });
  }
  if (p.roles.STRATEGIST?.format !== "TEXT" || p.roles.TRANSLATOR?.format !== "JSON" || p.roles.REVIEWER?.format !== "JSON") ctx.addIssue({ code: "custom", message: "ROLE_OUTPUT_RESPONSIBILITY" });
});
export type ResourcePolicy = z.infer<typeof ResourcePolicySchema>;
export const ResourceSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), rootRequestId: DurableIdV2Schema, policyDigest: DigestV2Schema,
  lineage: z.array(DurableIdV2Schema).min(1), deadlineAt: InstantV2Schema,
  // A projection from existing accounting receipts. Never a second usage ledger.
  consumed: counters, reserved: counters,
  uncertainDispatch: z.boolean(), accountingDigest: DigestV2Schema,
});
export type ResourceSnapshot = z.infer<typeof ResourceSnapshotSchema>;
type Amount = { calls: number; inputUnits: number; completionTokens: number };
export function admitRoleCall(policy: ResourcePolicy, snapshot: ResourceSnapshot, role: PlannerRole, request: Amount, now: number): void {
  policy = ResourcePolicySchema.parse(policy); snapshot = ResourceSnapshotSchema.parse(snapshot);
  if (snapshot.policyDigest !== hash("resource-policy-v1", policy)) throw new Error("RESOURCE_POLICY_CHANGED");
  if (snapshot.uncertainDispatch || Date.parse(snapshot.deadlineAt) <= now) throw new Error("RESOURCE_BOUNDARY");
  if (request.calls !== 1 || Object.values(request).some(v => !Number.isSafeInteger(v) || v <= 0)) throw new Error("INVALID_RESERVATION");
  const stage = policy.roles[role];
  const downstream: PlannerRole[] = role === "STRATEGIST" || role === "RESEARCH" ? ["TRANSLATOR", "REVIEWER"] : role === "TRANSLATOR" ? ["REVIEWER"] : [];
  for (const field of ["calls", "inputUnits", "completionTokens"] as const) {
    const held = downstream.reduce((n, r) => n + policy.roles[r].holdback[field], 0);
    if (request[field] > stage.call[field] || snapshot.consumed[field] + snapshot.reserved[field] + request[field] + held > policy.root[field]) throw new Error("DOWNSTREAM_CAPACITY_REQUIRED");
  }
}
export function assertResourceContinuation(previous: ResourceSnapshot, next: ResourceSnapshot): void {
  if (previous.rootRequestId !== next.rootRequestId || previous.policyDigest !== next.policyDigest || previous.deadlineAt !== next.deadlineAt ||
    previous.lineage.some((id, i) => next.lineage[i] !== id) || next.lineage.length !== previous.lineage.length + 1 || new Set(next.lineage).size !== next.lineage.length ||
    previous.uncertainDispatch && !next.uncertainDispatch || previous.accountingDigest !== next.accountingDigest ||
    JSON.stringify(previous.consumed) !== JSON.stringify(next.consumed) || JSON.stringify(previous.reserved) !== JSON.stringify(next.reserved)) throw new Error("CONTINUATION_CANNOT_RESET_ACCOUNTING");
}
