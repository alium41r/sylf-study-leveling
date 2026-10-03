// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AssistantResponseSchema } from "@/lib/planner/v2/intelligence/schemas/assistant";
import { CompilerCheckpointSchema } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { ResearchProcessingSchema } from "@/lib/planner/v2/intelligence/schemas/research";
import { AllocationReportSchema, SchedulingEnvelopeSchema } from "@/lib/planner/v2/intelligence/schemas/scheduling";
import { readCompilerCheckpoint } from "@/lib/planner/v2/intelligence/checkpoints";
import { hash } from "@/lib/planner/v2/server/database";
import { digest, id } from "../contracts/fixtures";
import { checkpointAttempt, checkpointFixture, envelopeFixture, researchFixture } from "./fixtures";

describe("assistant output boundary", () => {
  it.each([
    { kind: "ANSWER", message: "Use a short diagnostic before adding work." },
    { kind: "QUESTION", message: "One answer changes the recommendation.", questions: ["Which component is assessed?"] },
    { kind: "SUGGESTED_CHANGE", message: "A shorter task could help.", planRefs: ["physics"], change: "Replace redundant practice with one check." },
    { kind: "PROPOSAL", message: "Prepare a proposal for review.", planRefs: ["physics"], change: "Address the observed circuit error.", researchRequested: false },
  ])("accepts $kind without executable authority", response => {
    expect(AssistantResponseSchema.safeParse(response).success).toBe(true);
    expect(AssistantResponseSchema.safeParse({ ...response, authorization: "PLAN_ACTION" }).success).toBe(false);
    expect(AssistantResponseSchema.safeParse({ ...response, questId: 1 }).success).toBe(false);
  });

  it("rejects durable target identity, excess questions and an empty proposal", () => {
    const proposal = { kind: "PROPOSAL", message: "Prepare a proposal.", planRefs: [id(1)], change: "Shorten practice.", researchRequested: false };
    expect(AssistantResponseSchema.safeParse(proposal).success).toBe(false);
    expect(AssistantResponseSchema.safeParse({ ...proposal, planRefs: [] }).success).toBe(false);
    expect(AssistantResponseSchema.safeParse({ kind: "QUESTION", message: "Tell me more.", questions: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("deterministic scheduling artifacts", () => {
  it("keeps an open goal deadline and accounts for existing work and reserve once", () => {
    const envelope = SchedulingEnvelopeSchema.parse(envelopeFixture());
    expect(envelope.targets[0].deadline).toEqual({ kind: "NONE" });
    expect(envelope.days[0].availableMinutes).toBe(62);
    for (const availableMinutes of [80, 44]) {
      const invalid = structuredClone(envelope);
      invalid.days[0].availableMinutes = availableMinutes;
      expect(SchedulingEnvelopeSchema.safeParse(invalid).success).toBe(false);
    }
    expect(SchedulingEnvelopeSchema.safeParse({ ...envelope, protectedExecution: undefined }).success).toBe(false);
  });

  it("rejects unavailable dates and inconsistent execution facts", () => {
    const envelope = envelopeFixture();
    envelope.days[0].excluded = true;
    expect(SchedulingEnvelopeSchema.safeParse(envelope).success).toBe(false);
    envelope.days[0].availableMinutes = 0;
    expect(SchedulingEnvelopeSchema.safeParse(envelope).success).toBe(true);
    envelope.protectedExecution[0].executionVersion = 0;
    expect(SchedulingEnvelopeSchema.safeParse(envelope).success).toBe(false);
    envelope.protectedExecution[0].executionVersion = 1;
    envelope.protectedExecution[0].remainingMinutes = 0;
    expect(SchedulingEnvelopeSchema.safeParse(envelope).success).toBe(false);
  });

  it("distinguishes a capacity proof from an unresolved allocation search", () => {
    const checkpoint = checkpointFixture();
    if (!("allocation" in checkpoint.payload)) throw new Error("fixture stage");
    const report = checkpoint.payload.allocation.report;
    report.status = "CAPACITY_SHORTFALL";
    expect(AllocationReportSchema.safeParse(report).success).toBe(false);
    report.capacityProof = { planRefs: ["physics"], dates: ["2026-10-05"], requiredMinutes: 30, availableMinutes: 20, explanation: "Required work exceeds the usable capacity bound." };
    expect(AllocationReportSchema.safeParse(report).success).toBe(true);
    report.capacityProof.availableMinutes = 30;
    expect(AllocationReportSchema.safeParse(report).success).toBe(false);
    report.status = "ALLOCATION_UNRESOLVED";
    report.capacityProof = null;
    expect(AllocationReportSchema.safeParse(report).success).toBe(true);
  });

  it("cannot call partially allocated committed work feasible", () => {
    const checkpoint = checkpointFixture();
    if (!("allocation" in checkpoint.payload)) throw new Error("fixture stage");
    const report = checkpoint.payload.allocation.report;
    report.unscheduled = report.placements.map(({ planRef, activityRef, minutes }) => ({ planRef, activityRef, minutes }));
    report.placements = [];
    expect(AllocationReportSchema.safeParse(report).success).toBe(false);
    report.status = "ALLOCATION_UNRESOLVED";
    expect(AllocationReportSchema.safeParse(report).success).toBe(true);
  });
});

describe("research extraction receipts", () => {
  it("preserves partial extraction and rejects claims of complete assessed scope", () => {
    const research = researchFixture();
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(true);
    research.evidence!.completeAssessedScope = true;
    research.evidence!.unresolvedGaps = [];
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(false);
  });

  it.each(["hash", "pages", "ocr"])("rejects an extraction %s mismatch", field => {
    const research = researchFixture();
    if (field === "hash") research.selectedSources[0].contentHash = digest("b");
    if (field === "pages") research.selectedSources[0].selectedPages = [3];
    if (field === "ocr") research.selectedSources[0].ocrPages = [2];
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(false);
  });

  it("enforces extraction bounds across sources, including OCR", () => {
    const research = researchFixture();
    research.evidence = null;
    research.selectedSources.push({ ...research.selectedSources[0], sourceId: "other", selectedCharacters: 72000 });
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(false);
    research.selectedSources[1].selectedCharacters = 0;
    research.selectedSources[0].selectedPages = Array.from({ length: 40 }, (_, i) => i + 1);
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(false);
    research.selectedSources[0].selectedPages = [1, 2, 3, 4];
    research.selectedSources[0].ocrPages = [1, 2, 3, 4];
    research.selectedSources[1].selectedPages = [1, 2, 3];
    research.selectedSources[1].ocrPages = [1, 2, 3];
    expect(ResearchProcessingSchema.safeParse(research).success).toBe(false);
  });
});

describe("compiler checkpoint recovery boundary", () => {
  it("round-trips a grounded reviewed checkpoint and reuses Phase 1's digest", () => {
    const checkpoint = checkpointFixture();
    const stored = JSON.parse(JSON.stringify(checkpoint));
    expect(readCompilerCheckpoint(stored, checkpointAttempt(checkpoint), checkpoint.binding)).toEqual({ ok: true, checkpoint });
  });

  it("supports unresolved research and a zero-target research advice checkpoint", () => {
    const checkpoint = checkpointFixture();
    checkpoint.binding.targets = [];
    checkpoint.binding.envelopeDigest = null;
    checkpoint.payload = { stage: "RESEARCH", research: researchFixture() };
    checkpoint.binding.sourceDigests = [{ sourceId: "syllabus", contentHash: digest() }];
    const attempt = { ...checkpointAttempt(checkpoint), kind: "RESEARCH_ADVICE" as const,
      acceptedRequest: { text: "Check this syllabus", authorization: "RESEARCH_ONLY" as const, researchRequested: true, targetAuthorizationDigest: digest() } };
    expect(readCompilerCheckpoint(checkpoint, attempt, checkpoint.binding).ok).toBe(true);
  });

  it.each(["ownerId", "requestHash", "rootRequestId", "targetAuthorizationDigest"] as const)("rejects an altered %s binding even with a new outer digest", field => {
    const checkpoint = checkpointFixture();
    const attempt = checkpointAttempt(checkpoint);
    if (field === "ownerId") checkpoint.binding.ownerId += 1;
    else checkpoint.binding[field] = field === "rootRequestId" ? id(99) : digest("d");
    attempt.checkpoint.digest = hash("checkpoint", checkpoint);
    expect(readCompilerCheckpoint(checkpoint, attempt, checkpoint.binding)).toEqual({ ok: false, reason: "ATTEMPT_BINDING_MISMATCH" });
  });

  it.each(["requestedIntentVersionId", "resolvedIntentVersionId", "baseActiveRevisionId", "sourceCandidateRevisionId", "planningVersion", "resolvedPlanningVersion", "contextDigest"] as const)("rejects a changed attempt target %s", field => {
    const checkpoint = checkpointFixture();
    const attempt = checkpointAttempt(checkpoint);
    const target = attempt.targets[0];
    if (field === "planningVersion" || field === "resolvedPlanningVersion") target[field] = 9;
    else target[field] = field === "contextDigest" ? digest("e") : id(98);
    expect(readCompilerCheckpoint(checkpoint, attempt, checkpoint.binding)).toEqual({ ok: false, reason: "ATTEMPT_BINDING_MISMATCH" });
  });

  it("rejects stale protected execution, source or intent dependencies", () => {
    const checkpoint = checkpointFixture();
    for (const change of ["intent", "quest", "source"] as const) {
      const expected = structuredClone(checkpoint.binding);
      if (change === "intent") {
        expected.targets[0].requestedIntentDigest = digest("d");
        expected.targets[0].resolvedIntentDigest = digest("d");
        expected.targets[0].context!.intentDigest = digest("d");
      }
      if (change === "quest") expected.targets[0].context!.quests.push({ questId: 123, contentDigest: digest("e"), executionVersion: 2 });
      if (change === "source") expected.sourceDigests.push({ sourceId: "new_source", contentHash: digest("f") });
      expect(readCompilerCheckpoint(checkpoint, checkpointAttempt(checkpoint), expected)).toEqual({ ok: false, reason: "STALE_COMPILER_BINDING" });
    }
  });

  it.each(["blueprint", "allocation", "quality", "envelope"])("rejects %s artifact tampering after outer rehash", artifact => {
    const checkpoint = checkpointFixture();
    if (!("quality" in checkpoint.payload)) throw new Error("fixture stage");
    if (artifact === "blueprint") checkpoint.payload.blueprints.plans[0].blueprint.activities[0].instructions = "Different learning work";
    if (artifact === "allocation") checkpoint.payload.allocation.report.placements[0].date = "2026-10-06";
    if (artifact === "quality") checkpoint.payload.quality[0].report.evidenceDigest = digest("d");
    if (artifact === "envelope") checkpoint.payload.envelope.weeklyCeilingMinutes = 500;
    expect(readCompilerCheckpoint(checkpoint, checkpointAttempt(checkpoint), checkpoint.binding)).toEqual({ ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" });
  });

  it("rejects malformed, truncated and stage-mismatched checkpoints", () => {
    const checkpoint = checkpointFixture();
    const attempt = checkpointAttempt(checkpoint);
    expect(readCompilerCheckpoint({ ...checkpoint, compilerVersion: 2 }, attempt, checkpoint.binding)).toEqual({ ok: false, reason: "MALFORMED_CHECKPOINT" });
    expect(readCompilerCheckpoint({}, attempt, checkpoint.binding).ok).toBe(false);
    attempt.checkpoint.digest = digest("f");
    expect(readCompilerCheckpoint(checkpoint, attempt, checkpoint.binding)).toEqual({ ok: false, reason: "CHECKPOINT_DIGEST_MISMATCH" });
    attempt.checkpoint.digest = hash("checkpoint", checkpoint);
    attempt.checkpoint.stage = "BLUEPRINT";
    expect(readCompilerCheckpoint(checkpoint, attempt, checkpoint.binding).ok).toBe(false);
  });

  it("forbids dropping committed work and booking optional work", () => {
    const checkpoint = checkpointFixture();
    if (!("allocation" in checkpoint.payload)) throw new Error("fixture stage");
    const payload = checkpoint.payload;
    payload.allocation.report.placements = [];
    payload.allocation.report.committedMinutes = 0;
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(false);
    payload.allocation.report.placements = [{ planRef: "physics", activityRef: "practice01", date: "2026-10-05", minutes: 30 }];
    payload.allocation.report.committedMinutes = 30;
    payload.blueprints.plans[0].blueprint.activities[0].commitment = { category: "OPTIONAL", reason: "Useful enrichment" };
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(false);
  });

  it("bounds adaptation and repair and requires named issue correspondence", () => {
    const checkpoint = checkpointFixture();
    expect(CompilerCheckpointSchema.safeParse({ ...checkpoint, adaptations: 2 }).success).toBe(false);
    expect(CompilerCheckpointSchema.safeParse({ ...checkpoint, repairs: 1 }).success).toBe(false);
    expect(CompilerCheckpointSchema.safeParse({ ...checkpoint, repairs: 1, repairIssueIds: ["invented_issue"] }).success).toBe(false);
  });

  it("cannot pass a repaired warning until its named verification succeeds", () => {
    const checkpoint = checkpointFixture();
    if (!("quality" in checkpoint.payload)) throw new Error("fixture stage");
    checkpoint.repairs = 1;
    checkpoint.repairIssueIds = ["criterion_issue"];
    checkpoint.payload.stage = "VERIFICATION";
    checkpoint.payload.quality[0].report.issues = [{ issueId: "criterion_issue", category: "WEAK_CRITERION", severity: "WARNING",
      affectedRefs: ["practice01"], evidence: "The requested check is ambiguous.", consequence: "The student cannot tell when to stop.", resolution: "OPEN", verification: null }];
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(false);
    checkpoint.payload.quality[0].report.status = "INCOMPLETE";
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    Object.assign(checkpoint.payload.quality[0].report.issues[0], { resolution: "REPAIRED", verification: { result: "RESOLVED", verifiedAt: "2026-10-03T10:00:00Z", explanation: "The revised criterion names an observable circuit explanation." } });
    checkpoint.payload.quality[0].report.status = "PASSED";
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    checkpoint.payload.stage = "REPAIR";
    expect(CompilerCheckpointSchema.safeParse(checkpoint).success).toBe(false);
  });

  it("rejects a cross-target prerequisite cycle", () => {
    const checkpoint = checkpointFixture();
    if (!("blueprints" in checkpoint.payload)) throw new Error("fixture stage");
    const blueprints = checkpoint.payload.blueprints;
    blueprints.plans.push({ ...structuredClone(blueprints.plans[0]), planRef: "maths" });
    blueprints.sharedDependencies = [
      { prerequisite: { planRef: "physics", activityId: "practice01" }, dependent: { planRef: "maths", activityId: "practice01" }, strength: "HARD", reason: "Required skill" },
      { prerequisite: { planRef: "maths", activityId: "practice01" }, dependent: { planRef: "physics", activityId: "practice01" }, strength: "HARD", reason: "Required skill" },
    ];
    const result = CompilerCheckpointSchema.safeParse(checkpoint);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message === "DEPENDENCY_CYCLE")).toBe(true);
  });
});
