import { z } from "zod";
import { RoleSchema } from "./contracts";
import { DigestV2Schema } from "../../contracts/primitives";
import type { ResourcePolicy } from "./resources";
export const ProviderReasoningSchema=z.strictObject({schemaVersion:z.literal(1),source:z.literal("DEEPSEEK_REASONING_CONTENT"),text:z.string().max(2*1024*1024),digest:DigestV2Schema});

export const RoleCallSchema = z.strictObject({
  schemaVersion: z.literal(1), key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/), role: RoleSchema,
  policyDigest: DigestV2Schema, inputDigest: DigestV2Schema, promptDigest: DigestV2Schema,
  format: z.enum(["TEXT", "JSON"]), effort: z.enum(["LOW", "HIGH", "MAX", "DISABLED", "PROVIDER_DEFAULT"]),
  purpose: z.enum(["RESEARCH", "OCR", "BLUEPRINT", "ADAPTATION", "REPAIR", "REVIEW", "VERIFICATION"]),
}).superRefine((call, ctx) => {
  const allowed = { RESEARCH: ["RESEARCH", "OCR"], STRATEGIST: ["BLUEPRINT", "ADAPTATION", "REPAIR"], TRANSLATOR: ["BLUEPRINT", "REPAIR"], REVIEWER: ["REVIEW", "VERIFICATION"] };
  if (!allowed[call.role].includes(call.purpose)) ctx.addIssue({ code: "custom", message: "ROLE_PURPOSE_MISMATCH" });
});
export type RoleCall = z.infer<typeof RoleCallSchema>;

/** Explicit offline qualification profile, never installed in web composition.
 * These are safety ceilings, not educational targets or an efficiency policy. */
export function offlineResourcePolicy(authorizationDigest: string, policyId: string): ResourcePolicy {
  const call = { calls: 1, inputUnits: 1500000, completionTokens: 65536 };
  const role = (format: "TEXT" | "JSON", held: number) => ({ format, provider: "deepseek" as const, model: "deepseek-flash" as const,
    effort: "HIGH" as const, call: { ...call }, holdback: { calls: held, inputUnits: call.inputUnits * held, completionTokens: call.completionTokens * held } });
  return { schemaVersion: 1, policyId, authorizationDigest, processingMs: 4 * 3600000,
    root: { calls: 256, inputUnits: 64000000, completionTokens: 16000000 },
    roles: { RESEARCH: role("JSON", 1), STRATEGIST: role("TEXT", 1), TRANSLATOR: role("JSON", 2), REVIEWER: role("JSON", 3) } };
}
