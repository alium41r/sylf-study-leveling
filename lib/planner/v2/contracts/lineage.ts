import { z } from "zod";
import { DigestV2Schema, DurableIdV2Schema, EntityIdV2Schema, InstantV2Schema, VersionV2Schema, issue } from "./primitives";

/** Evolves the existing QuestLink; remaining disposition belongs to the execution overlay. */
export const QuestLineageV2Schema = z.strictObject({
  schemaVersion: VersionV2Schema,
  linkId: DurableIdV2Schema,
  ownerId: EntityIdV2Schema,
  planId: DurableIdV2Schema,
  activityKey: DurableIdV2Schema,
  questId: EntityIdV2Schema.nullable(),
  createdRevisionId: DurableIdV2Schema,
  appliedRevisionId: DurableIdV2Schema,
  baselineSpecDigest: DigestV2Schema,
  disposition: z.enum(["LIVE", "DETACHED", "DELETED", "USER_RELEASED"]),
  removedAt: InstantV2Schema.nullable(),
}).superRefine((link, ctx) => {
  if (link.disposition === "LIVE" && (link.questId === null || link.removedAt !== null)) issue(ctx, [], "Live lineage requires its Quest and no removal marker");
  if (link.disposition === "DETACHED" && link.questId === null) issue(ctx, [], "Legacy detached lineage retains its Quest");
  if (["DELETED", "USER_RELEASED"].includes(link.disposition) && (link.questId !== null || link.removedAt === null)) issue(ctx, [], "Removed lineage requires a tombstone without a live Quest");
});

export type QuestLineageV2 = z.infer<typeof QuestLineageV2Schema>;

export function validateLineageTransitionV2(before: QuestLineageV2, after: QuestLineageV2): string[] {
  const errors: string[] = [];
  for (const key of ["linkId", "ownerId", "planId", "activityKey", "createdRevisionId", "baselineSpecDigest"] as const) {
    if (before[key] !== after[key]) errors.push(`LINEAGE_IDENTITY_IMMUTABLE:${key}`);
  }
  if (["USER_RELEASED", "DELETED"].includes(before.disposition) && JSON.stringify(before) !== JSON.stringify(after)) errors.push("TOMBSTONE_PERMANENT");
  if (before.disposition === "LIVE" && after.disposition === "LIVE" && before.questId !== after.questId) errors.push("LIVE_QUEST_IDENTITY_IMMUTABLE");
  // A reoffer has a new reviewed activity identity. It never resurrects this tombstone.
  return errors;
}
