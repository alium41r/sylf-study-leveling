import type { PlannerAttemptV2 } from "../../contracts/operations";
import { hash } from "../../server/database";
import { FoundationCheckpointSchema } from "./contracts";
import { ResourceSnapshotSchema, assertResourceContinuation } from "./resources";

/** Existing compiler remains the only coordinator. This validates routing; it
 * dispatches no agent, chooses no pedagogy and grants no execution authority. */
export function readFoundationCheckpoint(raw: unknown, attempt: PlannerAttemptV2) {
  const value = FoundationCheckpointSchema.parse(raw);
  if (value.requestHash !== attempt.requestHash || value.rootRequestId !== attempt.budget.rootRequestId || value.authorizationDigest !== attempt.acceptedRequest.targetAuthorizationDigest || value.targetsDigest !== hash("ai-first-targets-v1", attempt.targets)) throw new Error("FOUNDATION_CHECKPOINT_STALE");
  return value;
}
export function recoveryAction(checkpoint: ReturnType<typeof FoundationCheckpointSchema.parse>) {
  if (checkpoint.pendingCall?.state === "DISPATCHED") return "RECONCILE_UNCERTAIN_DISPATCH" as const;
  if (checkpoint.pendingCall?.state === "RESPONSE_SAVED") return "ASSEMBLE_SAVED_RESPONSE" as const;
  if (["INCOMPLETE", "NEEDS_DECISION"].includes(checkpoint.stage)) return "EXPLICIT_CONTINUATION_REQUIRED" as const;
  return "RESUME_STAGE" as const;
}
export function allowedRoleTransition(from: ReturnType<typeof FoundationCheckpointSchema.parse>["stage"], to: ReturnType<typeof FoundationCheckpointSchema.parse>["stage"]): boolean {
  const transitions = {
    RESEARCH: ["STRATEGY", "NEEDS_DECISION", "INCOMPLETE"], STRATEGY: ["TRANSLATION", "RESEARCH", "INCOMPLETE"],
    TRANSLATION: ["ALLOCATION", "STRATEGY", "RESEARCH", "INCOMPLETE"], ALLOCATION: ["REVIEW", "STRATEGY", "INCOMPLETE"],
    REVIEW: ["READY", "REFINEMENT", "NEEDS_DECISION", "INCOMPLETE"], REFINEMENT: ["RESEARCH", "STRATEGY", "TRANSLATION", "ALLOCATION", "REVIEW", "INCOMPLETE"],
    READY: [], INCOMPLETE: [], NEEDS_DECISION: [],
  };
  return (transitions[from] as string[]).includes(to);
}
export function invalidatedArtifacts(change: "EVIDENCE" | "STRATEGY" | "TRANSLATION" | "CALENDAR" | "COSMETIC_PRESENTATION") {
  return ({ EVIDENCE: ["DOSSIER", "STRATEGY", "TRANSLATION", "ALLOCATION", "REVIEW"], STRATEGY: ["TRANSLATION", "ALLOCATION", "REVIEW"], TRANSLATION: ["ALLOCATION", "REVIEW"], CALENDAR: ["ALLOCATION", "REVIEW"], COSMETIC_PRESENTATION: [] })[change];
}
export function assertContinuation(input: { previousIntentDigest: string; requestedIntentDigest: string; originalAuthorizationDigest: string; authorizationDigest: string; changesHardFacts: boolean; verifiedResearchDigest: string | null; studentDecisionDigest: string | null; previousResources: unknown; resources: unknown }) {
  if ((input.changesHardFacts || input.originalAuthorizationDigest !== input.authorizationDigest) && !input.studentDecisionDigest) throw new Error("STUDENT_DECISION_REQUIRED");
  if (input.previousIntentDigest !== input.requestedIntentDigest && !input.studentDecisionDigest && !input.verifiedResearchDigest) throw new Error("IMMUTABLE_INTENT_CONTINUATION_REQUIRED");
  assertResourceContinuation(ResourceSnapshotSchema.parse(input.previousResources), ResourceSnapshotSchema.parse(input.resources));
}
export function credibleProgress(history: readonly { candidateDigest: string; issueSetDigest: string }[], next: { candidateDigest: string; issueSetDigest: string }): boolean {
  return !history.some(previous => previous.candidateDigest === next.candidateDigest && previous.issueSetDigest === next.issueSetDigest);
}
