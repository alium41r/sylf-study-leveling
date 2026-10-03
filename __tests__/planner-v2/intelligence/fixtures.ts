import { hash } from "@/lib/planner/v2/server/database";
import { type CompilerCheckpoint } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { type SchedulingEnvelope } from "@/lib/planner/v2/intelligence/schemas/scheduling";
import { type ResearchProcessing } from "@/lib/planner/v2/intelligence/schemas/research";
import { attemptFixture, blueprintFixture, digest, id, instant, qualityFixture } from "../contracts/fixtures";

export function envelopeFixture(): SchedulingEnvelope {
  return {
    schemaVersion: 2, timezone: "Asia/Karachi", today: "2026-10-03",
    window: { start: "2026-10-05", end: "2026-10-06" }, capacityDigest: digest("c"),
    basis: "CONFIRMED_AVAILABILITY", weeklyCeilingMinutes: 600, recoveryPercent: 15,
    targets: [{ planRef: "physics", deadline: { kind: "NONE" }, perGoalWeeklyCeilingMinutes: null }],
    days: ["2026-10-05", "2026-10-06"].map(date => ({ date, ceilingMinutes: 120, otherCommittedMinutes: 20, protectedTargetMinutes: 20, recoveryMinutes: 18, availableMinutes: 62, excluded: false })),
    protectedExecution: [{ planRef: "physics", activityRef: "active01", contentDigest: digest(), executionVersion: 1, actualSeconds: 900,
      remainingMinutes: 20, state: "PAUSED", remainingDisposition: "OPEN", date: "2026-10-05" }],
    timeboxRange: { minMinutes: 5, maxMinutes: 240 },
  };
}

export function researchFixture(): ResearchProcessing {
  return {
    schemaVersion: 2, queries: ["Physics assessment syllabus"], fetchAttempts: 1, elapsedMs: 500, followUps: 0,
    selectedSources: [{ sourceId: "syllabus", contentHash: digest(), selectedCharacters: 1200, selectedPages: [2], ocrPages: [] }],
    evidence: {
      schemaVersion: 2, assessment: { syllabusCode: "9702" },
      sources: [{ sourceId: "syllabus", location: { kind: "PUBLIC_URL", finalUrl: "https://example.org/syllabus.pdf" },
        title: "Physics syllabus", authority: "UNKNOWN", retrievedAt: instant, contentHash: digest(), applicability: { syllabusCode: "9702" },
        extraction: { status: "PARTIAL", selectedPages: [2], ocrPages: [], gaps: ["Assessment structure is not extracted"] } }],
      claims: [{ claimId: "claim_electricity", sourceId: "syllabus", statement: "Electricity is assessed", excerpt: "Electricity", anchor: { page: 2 },
        verification: { excerpt: "VERIFIED", support: "SUPPORTED", applicability: "MATCHED" }, kind: "ASSESSED_SCOPE", status: "ADOPTED" }],
      completeAssessedScope: false, unresolvedGaps: ["Assessment structure is not extracted"],
    },
  };
}

export function checkpointFixture(): CompilerCheckpoint {
  const attempt = attemptFixture();
  const envelope = envelopeFixture();
  const blueprint = blueprintFixture();
  const report = { schemaVersion: 2 as const, status: "FEASIBLE" as const,
    placements: [{ planRef: "physics", activityRef: "practice01", date: "2026-10-05", minutes: 30 }],
    unscheduled: [], committedMinutes: 30, capacityProof: null, findings: [] };
  const context = { intentDigest: digest(), capacityDigest: envelope.capacityDigest, evidence: [], quests: [],
    planBases: [{ planId: id(1), revisionId: null, planningVersion: 0 }], externalActivityDependencies: [] };
  return {
    schemaVersion: 2, compilerVersion: 1,
    binding: { attemptId: attempt.attemptId, ownerId: attempt.ownerId, requestHash: attempt.requestHash, rootRequestId: attempt.budget.rootRequestId,
      targetAuthorizationDigest: attempt.acceptedRequest.targetAuthorizationDigest,
      targets: [{ ...attempt.targets[0], planRef: "physics", resolvedIntentVersionId: id(2), resolvedPlanningVersion: 0,
        resolution: "UNCHANGED", contextDigest: digest(), requestedIntentDigest: digest(), resolvedIntentDigest: digest(), qualityEvidenceDigest: digest(), context }],
      sourceDigests: [], envelopeDigest: hash("scheduling-envelope", envelope) },
    adaptations: 0, repairs: 0, repairIssueIds: [],
    payload: { stage: "REVIEW", research: null, envelope,
      blueprints: { plans: [{ planRef: "physics", blueprint, digest: hash("blueprint", blueprint) }], sharedDependencies: [] },
      allocation: { report, digest: hash("allocation", report) }, reviewedAllocationDigest: hash("allocation", report),
      quality: [{ planRef: "physics", report: { ...qualityFixture(), educationalContentDigest: hash("educational-content", { blueprint, externalDependencies: [] }) } }] },
  };
}

export function checkpointAttempt(checkpoint: CompilerCheckpoint) {
  return { ...attemptFixture(), targets: checkpoint.binding.targets.map(target => ({
    planId: target.planId, requestedIntentVersionId: target.requestedIntentVersionId, resolvedIntentVersionId: target.resolvedIntentVersionId,
    resolution: target.resolution, baseActiveRevisionId: target.baseActiveRevisionId, sourceCandidateRevisionId: target.sourceCandidateRevisionId,
    planningVersion: target.planningVersion, resolvedPlanningVersion: target.resolvedPlanningVersion, contextDigest: target.contextDigest,
  })),
    checkpoint: { stage: checkpoint.payload.stage, digest: hash("checkpoint", checkpoint), persistedAt: instant } };
}
