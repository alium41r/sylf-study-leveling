import { describe, expect, it } from "vitest";
import { ProviderCallReservationV2Schema, QuestLineageV2Schema, validateLineageTransitionV2 } from "@/lib/planner/v2/contracts";
import { digest, id, instant } from "./fixtures";

describe("Planner V2 durable lineage and truthful provider accounting", () => {
  const live = () => QuestLineageV2Schema.parse({ schemaVersion: 2, linkId: id(80), ownerId: 1133, planId: id(1), activityKey: id(20), questId: 8,
    createdRevisionId: id(3), appliedRevisionId: id(3), baselineSpecDigest: digest(), disposition: "LIVE", removedAt: null });
  it("preserves live Quest identity and original baseline while allowing reviewed applied revision changes", () => {
    const before = live();
    expect(validateLineageTransitionV2(before, { ...before, appliedRevisionId: id(90) })).toEqual([]);
    expect(validateLineageTransitionV2(before, { ...before, questId: 9 })).toContain("LIVE_QUEST_IDENTITY_IMMUTABLE");
    expect(validateLineageTransitionV2(before, { ...before, baselineSpecDigest: digest("b") })).toContain("LINEAGE_IDENTITY_IMMUTABLE:baselineSpecDigest");
  });
  it("keeps deletion/release permanent without losing actual session history", () => {
    const before = live();
    for (const disposition of ["DELETED", "USER_RELEASED"] as const) {
      const tombstone = QuestLineageV2Schema.parse({ ...before, disposition, questId: null, removedAt: instant });
      expect(validateLineageTransitionV2(tombstone, before)).toContain("TOMBSTONE_PERMANENT");
    }
    expect(QuestLineageV2Schema.safeParse({ ...before, disposition: "USER_RELEASED" }).success).toBe(false);
  });
  it("records actual token usage with unknown pricing instead of fabricating zero cost", () => {
    const call = { schemaVersion: 2, callId: id(71), rootRequestId: id(50), attemptId: id(4), fence: 1, stage: "BLUEPRINT",
      provider: "synthetic-provider", model: "unpriced-model", reservedInputTokens: 80000, reservedOutputTokens: 24000,
      state: "SETTLED", actualInputTokens: 38761, actualOutputTokens: 40287, costUsd: null, pricing: "UNKNOWN", settlementKey: "call-usage-001" };
    expect(ProviderCallReservationV2Schema.safeParse(call).success).toBe(true);
    expect(ProviderCallReservationV2Schema.safeParse({ ...call, costUsd: 0 }).success).toBe(false);
    expect(ProviderCallReservationV2Schema.safeParse({ ...call, state: "UNKNOWN_SPEND", costUsd: 0 }).success).toBe(false);
  });
});
