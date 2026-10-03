import { z } from "zod";
import { DateKeySchema } from "./contracts";
import { ROADMAP_INTENTS } from "./roadmap-fields";
import { ROADMAP_LIMITS } from "./roadmap-fields";
import { retrievalProposalMetadata } from "./retrieval";

/**
 * Selected-period expansion provider contract.
 *
 * An expansion is a small, explicitly requested operation on ONE milestone: the
 * model returns actionable study items and nothing else, so it cannot renumber
 * periods, retitle milestones or touch a neighbouring month.
 */
export const EXPANSION_INTENTS = ROADMAP_INTENTS;
export const ExpansionIntentSchema = z.enum(ROADMAP_INTENTS);

const ref = z.string().min(1).max(60).regex(/^[a-zA-Z0-9_-]+$/);
export const ExpansionItemSchema = z.strictObject({
  ref,
  topicRef: ref,
  relatedTopicRefs: z.array(ref).max(50).optional(),
  type: ExpansionIntentSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(240),
  rationale: z.string().min(1).max(500),
  completionCriteria: z.string().trim().min(12).max(240).optional(),
  date: DateKeySchema,
  minutes: z.number().int().min(15).max(240),
  dependsOn: z.array(ref).max(60),
  ...retrievalProposalMetadata,
});
export const ExpansionProposalV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(ExpansionItemSchema).min(1).max(ROADMAP_LIMITS.milestones),
});
export type ExpansionProposalV1 = z.infer<typeof ExpansionProposalV1Schema>;
export type ExpansionItem = ExpansionProposalV1["items"][number];

/** Item-level repair patch for an expansion; the same fields, same refs. */
export const ExpansionRepairItemSchema = z.strictObject({
  ref: ref,
  topicRef: ref,
  relatedTopicRefs: z.array(ref).max(50),
  type: ExpansionIntentSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(240),
  rationale: z.string().min(1).max(500),
  completionCriteria: z.string().trim().min(12).max(240),
  date: DateKeySchema,
  minutes: z.number().int().min(15).max(240),
  dependsOn: z.array(ref).max(60),
  ...retrievalProposalMetadata,
});
export const ExpansionRepairPatchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(ExpansionRepairItemSchema).min(1).max(20),
});
export type ExpansionRepairPatch = z.infer<typeof ExpansionRepairPatchSchema>;
