import { blueprintFixture, digest, executionFixture, id, instant } from "../contracts/fixtures";
import type { CandidateBinding, FoundationArchive, FoundationArtifact } from "@/lib/planner/v2/intelligence/foundation/contracts";
import { artifactRef, candidateDigest, sealFoundationArtifact, strategyDocument } from "@/lib/planner/v2/intelligence/foundation/validation";
import { hash } from "@/lib/planner/v2/server/database";
import { envelopeFixture } from "./fixtures";
import { CalendarCapacitySchema } from "@/lib/planner/v2/intelligence/foundation/calendar";

export const producerFixture = (call = 200) => ({ callId: id(call), provider: "deepseek", model: "deepseek-flash", effectiveModel: "scripted-offline", fingerprint: null, promptDigest: digest(), inputDigest: digest(), effort: "HIGH" as const, outputCap: 32768, finishReason: "STOP" as const });
export function foundationFixture() {
  let counter = 100;
  const archive: FoundationArchive = { schemaVersion: 1, compilerVersion: 2, entries: {} };
  const add = (kind: FoundationArtifact["kind"], value: unknown) => {
    const artifact = sealFoundationArtifact({ id: id(counter++), ownerId: 1133, attemptId: id(4), planIds: [id(1)], createdAt: instant, kind, value } as Omit<FoundationArtifact, "digest">);
    archive.entries[artifact.id] = artifact; return artifact;
  };
  const canonical = {
    blueprints: [{ planId: id(1), blueprint: blueprintFixture() }],
    allocation: { schemaVersion: 2, status: "FEASIBLE", placements: [{ planRef: "plan1", activityRef: "practice01", minutes: 30, date: "2026-10-02" }], unscheduled: [], committedMinutes: 30, capacityProof: null, findings: [] },
    execution: [executionFixture()], constraints: envelopeFixture(), calendar: CalendarCapacitySchema.parse({ schemaVersion: 1, timezone: "UTC", intentDigest: digest(), acceptedWindowsDigest: digest(), capturedAt: "2026-10-02T08:00:00Z", validUntil: "2026-10-02T12:00:00Z", policy: { tentative: "BLOCK", allDay: "BLOCK_DATE", transparent: "IGNORE", unavailable: "NEEDS_DECISION" }, sources: [], days: [{ date: "2026-10-02", approved: [{ start: "2026-10-02T10:00:00Z", end: "2026-10-02T11:00:00Z" }], busy: [], allDayBlocked: false, excluded: false }] }), groundStrings: {} as Record<string, string[]>,
  };
  const capacity = add("CAPACITY", { schemaVersion: 1, calendar: canonical.calendar, constraints: canonical.constraints });
  const dossier = add("DOSSIER", { schemaVersion: 1, capacity: artifactRef(capacity), acceptedInstructionDigest: digest(), targets: [{ planId: id(1), requestedIntentId: id(2), resolvedIntentId: id(2), intentDigest: digest(), contextDigest: digest() }], rawEvidenceDigest: digest(), adoptedEvidenceDigest: digest(), constraintsDigest: hash("ai-first-constraints-v1", canonical.constraints), calendarDigest: hash("ai-first-calendar-v1", canonical.calendar), sourcePins: [], unresolved: [] });
  const strategy = add("STRATEGY", strategyDocument({ schemaVersion: 1, dossier: artifactRef(dossier), parent: null, version: 1, producer: producerFixture(), text: '  Solve the supplied task and explain "why". 🧠\n\nStop after success. Extra practice only if the named error persists.\n' }));
  const translation = add("TRANSLATION", { schemaVersion: 1, strategies: [artifactRef(strategy)], producer: producerFixture(201), blueprintDigest: hash("ai-first-blueprints-v1", canonical.blueprints), elements: [
    { ref: "work", strategyId: strategy.id, anchorRef: "p1", meaning: "INSTRUCTION", disposition: "EXECUTION", explanation: "Preserve the supplied task", targets: [{ planId: id(1), kind: "ACTIVITY", ref: "practice01" }] },
    { ref: "condition", strategyId: strategy.id, anchorRef: "p2", meaning: "CONDITION", disposition: "RETAINED_GUIDANCE", explanation: "Unbooked conditional practice", targets: [] },
  ], derivations: [], ambiguities: [] });
  const binding: CandidateBinding = { schemaVersion: 1, dossier: artifactRef(dossier), strategies: [artifactRef(strategy)], translation: artifactRef(translation), blueprintDigest: hash("ai-first-blueprints-v1", canonical.blueprints), allocationDigest: hash("ai-first-allocation-v1", canonical.allocation), executionDigest: hash("ai-first-execution-v1", canonical.execution), constraintsDigest: hash("ai-first-constraints-v1", canonical.constraints), calendarDigest: hash("ai-first-calendar-v1", canonical.calendar), issueHeads: [] };
  const review = add("REVIEW", { schemaVersion: 1, candidateDigest: candidateDigest(binding), producer: producerFixture(202), verdict: "APPROVED", completeResultInspected: true, issueHeads: [], rubricVersion: "offline-fixture-v1", explanation: "Scripted correspondence fixture, not educational qualification" });
  return { archive, add, capacity, dossier, strategy, translation, binding, review, canonical };
}
