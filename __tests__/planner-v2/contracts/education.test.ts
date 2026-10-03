import { describe, expect, it } from "vitest";
import { CanonicalIntentV2Schema, JointLearningBlueprintV2Schema, LearningBlueprintV2Schema, LearningEvidenceV2Schema,
  ModelLearningBlueprintV2Schema, ResearchEvidenceV2Schema, validateBlueprintReferences } from "@/lib/planner/v2/contracts";
import { blueprintFixture, digest, id, instant, intentFixture } from "./fixtures";

describe("Planner V2 educational freedom and hard evidence boundaries", () => {
  it("accepts tiny/ready scopes with zero new work, without filling capacity", () => {
    const blueprint = blueprintFixture();
    expect(ModelLearningBlueprintV2Schema.safeParse({ ...blueprint, activities: [], strategy: { ...blueprint.strategy, phases: [], recommendedEffort: { lowMinutes: 0, likelyMinutes: 0, highMinutes: 0 } } }).success).toBe(true);
    expect(CanonicalIntentV2Schema.safeParse({ ...intentFixture(), policy: "GENERAL", deadline: { kind: "NONE" } }).success).toBe(true);
  });
  it("rejects durable mutation/schedule/reward fields in the model response", () => {
    const blueprint = blueprintFixture();
    for (const field of ["questId", "scheduledFor", "xpReward"]) {
      expect(ModelLearningBlueprintV2Schema.safeParse({ ...blueprint, activities: [{ ...blueprint.activities[0], [field]: field === "questId" ? id(7) : 99 }] }).success).toBe(false);
    }
  });
  it("uses one activity bound shared across joint targets and a larger immutable assembled envelope", () => {
    const base = blueprintFixture();
    const make = (n: number) => ({ ...base, activities: Array.from({ length: n }, (_, i) => ({ ...base.activities[0], localId: `practice_${i}` })) });
    expect(ModelLearningBlueprintV2Schema.safeParse(make(60)).success).toBe(true);
    expect(ModelLearningBlueprintV2Schema.safeParse(make(61)).success).toBe(false);
    expect(LearningBlueprintV2Schema.safeParse(make(200)).success).toBe(true);
    expect(LearningBlueprintV2Schema.safeParse(make(201)).success).toBe(false);
    expect(JointLearningBlueprintV2Schema.safeParse({ schemaVersion: 2, plans: [{ planRef: "exam_a", blueprint: make(31) }, { planRef: "exam_b", blueprint: make(30) }], sharedDependencies: [], tradeOffExplanation: "Prioritize the earlier exam" }).success).toBe(false);
  });
  it("preserves user exclusions rather than treating an allowlisted scope as permission", () => {
    const blueprint = blueprintFixture();
    const context = { scopeRefs: ["scope_electricity"], excludedScopeRefs: ["scope_electricity"], evidenceRefs: [], resourceRefs: [] };
    expect(validateBlueprintReferences(blueprint, context)).toContain("EXPLICIT_EXCLUSION_CHANGED:scope_electricity");
    expect(validateBlueprintReferences(blueprint, context)).toContain("EXCLUDED_SCOPE_ACTIVITY:scope_electricity");
  });
  it("retains uncertain effort and evidence without lexical activity rituals", () => {
    const blueprint = blueprintFixture();
    expect(ModelLearningBlueprintV2Schema.safeParse({ ...blueprint, activities: [{ ...blueprint.activities[0], activityType: "METHOD_SELECTION_DIAGNOSTIC", completionCriterion: "Recognize when symmetry is useful and explain the choice." }] }).success).toBe(true);
    expect(ModelLearningBlueprintV2Schema.safeParse({ ...blueprint, activities: [{ ...blueprint.activities[0], effort: { lowMinutes: 50, likelyMinutes: 30, highMinutes: 60 } }] }).success).toBe(false);
  });
  it("does not let committed work depend on an unscheduled conditional branch", () => {
    const blueprint = blueprintFixture();
    const optional = { ...blueprint.activities[0], localId: "optional_theory", commitment: { category: "OPTIONAL", reason: "Only useful if the diagnostic fails" } };
    expect(ModelLearningBlueprintV2Schema.safeParse({ ...blueprint, activities: [optional, { ...blueprint.activities[0], hardDependencies: ["optional_theory"] }] }).success).toBe(false);
  });
  it("allows bounded dependencies on owned existing activity aliases and rejects unknown references", () => {
    const blueprint = blueprintFixture();
    blueprint.activities[0].advisoryOrderAfter = ["existing_review"];
    const context = { scopeRefs: ["scope_electricity"], excludedScopeRefs: [], evidenceRefs: [], resourceRefs: [], externalActivityRefs: ["existing_review"] };
    expect(validateBlueprintReferences(blueprint, context)).toEqual([]);
    expect(validateBlueprintReferences(blueprint, { ...context, externalActivityRefs: [] })).toContain("UNKNOWN_ACTIVITY:existing_review");
    const cyclic = { ...blueprint, activities: [{ ...blueprint.activities[0], hardDependencies: ["second"] }, { ...blueprint.activities[0], localId: "second", hardDependencies: ["practice01"] }] };
    expect(ModelLearningBlueprintV2Schema.safeParse(cyclic).success).toBe(false);
  });
  it("does not interpret time or completion as proof of mastery", () => {
    const evidence = { evidenceId: "study_time", scopeKeys: [id(10)], source: "SESSION_PACE", observedAt: instant, reliability: "OBSERVED_EXECUTION", statement: "Finished faster", demonstratesReadiness: true };
    expect(LearningEvidenceV2Schema.safeParse(evidence).success).toBe(false);
    expect(LearningEvidenceV2Schema.safeParse({ ...evidence, demonstratesReadiness: false }).success).toBe(true);
  });
  it("requires retrieved, applicable, excerpt-verified provenance for adoption", () => {
    const source = { sourceId: "syllabus", location: { kind: "PUBLIC_URL", finalUrl: "https://example.org/course.pdf" }, title: "Synthetic syllabus", authority: "UNKNOWN", retrievedAt: instant, contentHash: digest(), applicability: {},
      extraction: { status: "COMPLETE_RELEVANT_SECTIONS", selectedPages: [52], ocrPages: [], gaps: [] } };
    const claim = { claimId: "electricity_scope", sourceId: "syllabus", statement: "Electricity is assessed", excerpt: "Electricity", anchor: { page: 52 }, verification: { excerpt: "VERIFIED", support: "SUPPORTED", applicability: "MATCHED" }, kind: "ASSESSED_SCOPE", status: "ADOPTED" };
    const bundle = { schemaVersion: 2, assessment: {}, sources: [source], claims: [claim], completeAssessedScope: true, unresolvedGaps: [] };
    expect(ResearchEvidenceV2Schema.safeParse(bundle).success).toBe(true);
    expect(ResearchEvidenceV2Schema.safeParse({ ...bundle, claims: [{ ...claim, verification: { ...claim.verification, excerpt: "UNVERIFIED" } }] }).success).toBe(false);
    expect(ResearchEvidenceV2Schema.safeParse({ ...bundle, sources: [{ ...source, authority: "VERIFIED_OFFICIAL" }] }).success).toBe(false);
    expect(ResearchEvidenceV2Schema.safeParse({ ...bundle, completeAssessedScope: true, unresolvedGaps: ["An assessment table was not extracted"] }).success).toBe(false);
  });
});
