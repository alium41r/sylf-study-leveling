import { FoundationArchiveSchema, FoundationArtifactSchema, type FoundationArtifact, type FoundationArchive } from "../intelligence/foundation/contracts";
import { archiveDigest, sealFoundationArtifact, validateArchive } from "../intelligence/foundation/validation";
import { allowedRoleTransition, readFoundationCheckpoint } from "../intelligence/foundation/workflow";
import { AttemptService, loadAttempt, type LeaseToken, type AttemptPayload } from "./attempts";
import { hash, rows, reject } from "./database";
import { newFoundationId } from "../intelligence/foundation/validation";
import { loadIntent } from "./intents";
import { loadCompilerVersion } from "./compiler-version";
import { readRetainedArchive, readVersionedArtifacts } from "../intelligence/foundation/readers";
import type { PlannerAttemptV2 } from "../contracts";
import type { Sql } from "./database";
import { assertRoleCheckpoint, assertResearchResponses, readLearningResponse, learningCallRecovery } from "./role-accounting";
import { retainedArtifact } from "../intelligence/foundation/readers";
import { retainedLearningInput, type LearningCheckpoint } from "../intelligence/foundation/validation";
import { assembleNaturalTranslation, naturalTranslationReceipt } from "../intelligence/natural-learning";
import { LearningCompilerService } from "./learning";
import { assertReviewedArtifact } from "./reviewed-learning";

async function assertLearningProduction(sql: Sql, attempt: PlannerAttemptV2, archive: FoundationArchive, artifact: FoundationArtifact) {
  if (!((artifact.kind === "STRATEGY" || artifact.kind === "TRANSLATION") && artifact.value.schemaVersion === 2)) return;
  const origin = retainedArtifact(archive, artifact.value.input, "CHECKPOINT");
  if (origin.value.schemaVersion === 1 || !origin.value.learning.call) reject("INVALID_OUTPUT", "Authored learning requires its exact retained dispatch input.", "RECOVERY");
  const actual = await readLearningResponse(sql, attempt, origin.value.learning.call);
  if (hash("learning-producer", actual.producer) !== hash("learning-producer", artifact.value.producer)) reject("INVALID_OUTPUT", "Learning producer metadata does not match actual accounting.", "RECOVERY");
  if (artifact.kind === "STRATEGY") {
    if (actual.text !== artifact.value.text) reject("INVALID_OUTPUT", "Strategy text differs from its exact complete provider response.", "RECOVERY");
    const parent=origin.value.schemaVersion===3?origin.value.workflow.previousStrategy:null;
    if(artifact.value.parent?.digest!==parent?.digest||artifact.value.version!==(parent?retainedArtifact(archive,parent,"STRATEGY").value.version+1:1))reject("INVALID_OUTPUT","Strategy ancestry differs from its exact retained corrective input.","RECOVERY");
    return;
  }
  const value = artifact.value;
  if (value.schemaVersion !== 2) return;
  const input = retainedLearningInput(archive, origin as LearningCheckpoint), strategy = retainedArtifact(archive, value.strategies[0], "STRATEGY"), capacity = retainedArtifact(archive, value.capacity, "CAPACITY");
  if (capacity.value.schemaVersion !== 2 || !capacity.value.constraints || !capacity.value.facts) reject("INVALID_OUTPUT", "Translation requires real capacity correspondence.", "RECOVERY");
  const assembled = assembleNaturalTranslation(JSON.parse(actual.text), input, strategy.value, capacity.value.constraints, capacity.value.facts);
  const previous = value.previous ? retainedArtifact(archive, value.previous, "TRANSLATION") : undefined;
  const expected = naturalTranslationReceipt(assembled, input, strategy, value.input, actual, value.capacity, previous);
  if (hash("learning-translation", expected) !== hash("learning-translation", value)) reject("INVALID_OUTPUT", "Translation differs from the exact retained provider interpretation.", "RECOVERY");
  for (const checkpoint of Object.values(archive.entries)) if (checkpoint.kind === "CHECKPOINT" && checkpoint.value.schemaVersion !== 1 && checkpoint.value.learning.translation?.id === artifact.id) {
    const proposal = checkpoint.value.learning.translated ?? checkpoint.value.learning.allocated;
    if (proposal && hash("translated-learning", { blueprints: proposal.blueprints, facts: proposal.facts, planning: proposal.planning }) !== hash("translated-learning", assembled.translated)) reject("INVALID_OUTPUT", "Canonical education differs from its actual complete translation.", "RECOVERY");
  }
}

const empty = (): FoundationArchive => ({ schemaVersion: 1, compilerVersion: 2, entries: {} });
export async function loadAttemptArtifacts(sql: Sql, ownerId: number, attemptId: string) {
  const { attempt, payload } = await loadAttempt(sql, ownerId, attemptId, false);
  const compilerVersion = await loadCompilerVersion(sql, attemptId);
  const row = (await rows<{ intelligenceArtifacts: unknown }>(sql, 'SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE id=$1 AND "userId"=$2', [attemptId, ownerId]))[0];
  try {
    const read = readVersionedArtifacts({ compilerVersion, attempt, archive: row.intelligenceArtifacts, checkpoint: payload.checkpoint });
    if (read.compilerVersion === 2) for (const artifact of Object.values(read.archive.entries)) if (artifact.kind === "DOSSIER") {
      if(artifact.value.schemaVersion===2)await assertResearchResponses(sql,attempt,artifact.value.understanding.calls);
      for (const target of artifact.value.targets) {
      const intent = await loadIntent(sql, ownerId, target.resolvedIntentId);
      if (intent.planId !== target.planId || target.intentDigest !== hash("canonical-intent", intent.intent)) throw new Error("DOSSIER_INTENT_MISMATCH");
      }
    }
    if (read.compilerVersion === 2) for (const artifact of Object.values(read.archive.entries)) { await assertLearningProduction(sql, attempt, read.archive, artifact); await assertReviewedArtifact(sql,attempt,payload,read.archive,artifact); }
    if (read.compilerVersion === 2 && read.checkpoint && read.checkpoint.schemaVersion !== 1 && read.checkpoint.learning.call)
      return { ...read, recovery: await learningCallRecovery(sql, attempt, read.checkpoint.learning.call) };
    if (read.compilerVersion === 2 && read.checkpoint?.pendingCall) {
      const pending = read.checkpoint.pendingCall, receipt = payload.calls?.find(c => c.callId === pending.callId);
      if (attempt.budget.aiFirst) await assertRoleCheckpoint(sql, attempt, pending);
      if (!receipt || receipt.attemptId !== attemptId || receipt.rootRequestId !== attempt.budget.rootRequestId || pending.state === "RESERVED" && !["RESERVED", "CANCELLED_BEFORE_DISPATCH"].includes(receipt.state) ||
        pending.state === "DISPATCHED" && !["DISPATCHED", "SETTLED", "UNKNOWN_SPEND"].includes(receipt.state) ||
        pending.state === "RESPONSE_SAVED" && (receipt.state !== "SETTLED" || payload.providerCalls?.[receipt.callId]?.finishReason !== "STOP")) throw new Error("CHECKPOINT_ACCOUNTING_MISMATCH");
      if (receipt.state === "CANCELLED_BEFORE_DISPATCH") return { ...read, recovery: "EXPLICIT_CONTINUATION_REQUIRED" as const };
    }
    return read;
  } catch { reject("INVALID_OUTPUT", "The retained compiler artifacts failed version, ownership or correspondence validation.", "RECOVERY"); }
}
/** Trusted worker-only artifact retention. No public route or new handler is
 * registered in Phase A. Existing attempts/leases remain the lifecycle owner. */
export class PlannerFoundationService {
  constructor(readonly attempts: AttemptService) {}
  async inspect(ownerId: number, attemptId: string) {
    return this.attempts.db.observed(ownerId, sql => loadAttemptArtifacts(sql, ownerId, attemptId));
  }
  async read(ownerId: number, attemptId: string): Promise<{ archive: FoundationArchive; digest: string }> {
    return this.attempts.db.observed(ownerId, async sql => {
      const { attempt, payload } = await loadAttempt(sql, ownerId, attemptId, false);
      const row = (await rows<{ intelligenceArtifacts: unknown }>(sql, 'SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE id=$1 AND "userId"=$2', [attemptId, ownerId]))[0];
      const archive = readRetainedArchive(row.intelligenceArtifacts, attempt);
      this.assertOwner(archive, ownerId, attemptId);
      for (const artifact of Object.values(archive.entries)) { await assertLearningProduction(sql, attempt, archive, artifact); await assertReviewedArtifact(sql,attempt,payload,archive,artifact); }
      return { archive, digest: archiveDigest(archive) };
    });
  }
  private assertOwner(archive: FoundationArchive, ownerId: number, attemptId: string) {
    if (Object.values(archive.entries).some(a => a.ownerId !== ownerId || a.attemptId !== attemptId)) reject("REFERENCE_NOT_OWNED", "Intelligence artifacts belong to a different operation.");
  }
  async append(token: LeaseToken, expectedDigest: string, kind: FoundationArtifact["kind"], value: unknown): Promise<{ artifact: FoundationArtifact; digest: string }> {
    return this.attempts.mutate(token, (sql, attempt, payload, now) => this.appendAccepted(sql, attempt, payload, now, token, expectedDigest, kind, value));
  }
  /** Caller must be inside AttemptService.mutate: capture and retention share
   * one serializable owner transaction and the existing lease/deadline fence. */
  async appendAccepted(sql: Sql, attempt: PlannerAttemptV2, payload: AttemptPayload, now: Date, token: LeaseToken, expectedDigest: string, kind: FoundationArtifact["kind"], value: unknown): Promise<{ artifact: FoundationArtifact; digest: string }> {
      if (attempt.kind === "RESEARCH_ADVICE" || attempt.acceptedRequest.authorization !== "PLAN_ACTION") reject("INTENT_CONFLICT", "Read-only research cannot create a strategy or executable candidate.");
      if (await loadCompilerVersion(sql, attempt.attemptId) !== 2) reject("INVALID_OUTPUT", "Intelligence writes require compiler v2 admission; existing operations cannot be converted.");
      const row = (await rows<{ intelligenceArtifacts: unknown }>(sql, 'SELECT "intelligenceArtifacts" FROM "PlannerAttempt" WHERE id=$1', [attempt.attemptId]))[0];
      const archive = validateArchive(row.intelligenceArtifacts ?? empty());
      this.assertOwner(archive, attempt.ownerId, attempt.attemptId);
      const replay = Object.values(archive.entries).find(a => a.kind === kind && hash("foundation-write", a.value) === hash("foundation-write", value));
      if (replay) return { artifact: replay, digest: archiveDigest(archive) };
      if (expectedDigest !== archiveDigest(archive)) reject("STALE_CONTEXT", "The retained intelligence archive changed; reload before appending.");
      const artifact = sealFoundationArtifact({ id: newFoundationId(), ownerId: attempt.ownerId, attemptId: attempt.attemptId, planIds: attempt.targets.map(t => t.planId), createdAt: now.toISOString(), kind, value } as Omit<FoundationArtifact, "digest">);
      if (artifact.kind === "DOSSIER" && (artifact.value.acceptedInstructionDigest !== hash("accepted-instruction-v1", attempt.acceptedRequest) || artifact.value.targets.length !== attempt.targets.length || artifact.value.targets.some(t => !attempt.targets.some(owned => owned.planId === t.planId && owned.requestedIntentVersionId === t.requestedIntentId && owned.resolvedIntentVersionId === t.resolvedIntentId && owned.contextDigest === t.contextDigest)))) reject("STALE_CONTEXT", "Dossier must pin the operation's accepted intents and current context.");
      if (artifact.kind === "DOSSIER") for (const target of artifact.value.targets) {
        const intent = await loadIntent(sql, attempt.ownerId, target.resolvedIntentId);
        if (target.intentDigest !== hash("canonical-intent", intent.intent)) reject("STALE_CONTEXT", "Dossier facts must bind the owned accepted intent.");
      }
      if(artifact.kind==="DOSSIER"&&artifact.value.schemaVersion===2)await assertResearchResponses(sql,attempt,artifact.value.understanding.calls);
      await assertLearningProduction(sql, attempt, archive, artifact);
      await assertReviewedArtifact(sql,attempt,payload,archive,artifact,true);
      if (artifact.kind === "CHECKPOINT") {
        if (artifact.value.schemaVersion === 2 && artifact.value.learning.snapshot) {
          const current = await new LearningCompilerService(this.attempts).captureNaturalAccepted(sql, attempt, artifact.value.learning.capacity);
          if (hash("natural-owned-input", current) !== hash("natural-owned-input", artifact.value.learning.snapshot)) reject("INVALID_OUTPUT", "Natural learning input must match complete owned canonical facts.", "PREFLIGHT");
        }
        readFoundationCheckpoint(artifact.value, attempt);
        const pending = artifact.value.pendingCall;
        if (pending) {
          if (attempt.budget.aiFirst) await assertRoleCheckpoint(sql, attempt, pending);
          const receipt = payload.calls?.find(c => c.callId === pending.callId);
          if (!receipt || pending.state === "RESERVED" && receipt.state !== "RESERVED" || pending.state === "DISPATCHED" && !["DISPATCHED", "SETTLED", "UNKNOWN_SPEND"].includes(receipt.state) || pending.state === "RESPONSE_SAVED" && (receipt.state !== "SETTLED" || payload.providerCalls?.[receipt.callId]?.finishReason !== "STOP")) reject("INVALID_OUTPUT", "Checkpoint call must correspond to existing durable accounting.");
        }
        const prior = Object.values(archive.entries).filter(a => a.kind === "CHECKPOINT");
        const head = prior.find(a => !prior.some(next => next.kind === "CHECKPOINT" && next.value.previous?.id === a.id));
        if (head?.kind === "CHECKPOINT") {
          const before = head.value, next = artifact.value;
          if(before.schemaVersion===3&&next.schemaVersion!==3)reject("INVALID_OUTPUT","A complete journey cannot downgrade its checkpoint interpretation.","RECOVERY");
          const reviewedCalendarRefresh=before.schemaVersion===3&&next.schemaVersion===3&&before.stage==="READY"&&next.stage==="REFINEMENT"&&next.workflow.route==="ALLOCATION"&&
            next.workflow.assessment?.digest===before.workflow.assessment?.digest&&next.learning.capacity.digest!==before.learning.capacity.digest;
          if(reviewedCalendarRefresh){let cursor:FoundationArtifact|undefined=archive.entries[next.learning.capacity.id];let linked=false;
            while(cursor?.kind==="CAPACITY"&&cursor.value.schemaVersion===2){if(cursor.digest===before.learning.capacity.digest){linked=true;break;}cursor=cursor.value.previous?archive.entries[cursor.value.previous.id]:undefined;}
            if(!linked)reject("INVALID_OUTPUT","Reviewed reallocation requires explicit retained Calendar ancestry.");
          }
          const rejectedTranslatorContinuation=before.schemaVersion!==1&&before.stage==="TRANSLATION"&&before.learning.call?.role==="TRANSLATOR"&&next.schemaVersion===3&&next.stage==="REFINEMENT"&&!next.learning.call&&next.workflow.authorFeedback?.kind==="REJECTED"&&next.workflow.authorFeedback.source.digest===head.digest&&["STRATEGIST","TRANSLATOR"].includes(next.workflow.route??"");
          const authorContinuation=(before.schemaVersion!==1&&before.stage==="INCOMPLETE"&&next.schemaVersion===3&&next.stage==="REFINEMENT"&&next.workflow.authorFeedback?.source.digest===head.digest&&["STRATEGIST","TRANSLATOR"].includes(next.workflow.route??""))||rejectedTranslatorContinuation;
          if (next.previous?.id !== head.id || next.previous.digest !== head.digest || before.stage !== next.stage && !allowedRoleTransition(before.stage, next.stage)&&!reviewedCalendarRefresh&&!authorContinuation) reject("INVALID_OUTPUT", "Checkpoint routing must extend the current compiler stage.");
          const oldCall = before.pendingCall, call = next.pendingCall;
          if (oldCall && oldCall.state !== "RESPONSE_SAVED" && (!call || call.callId !== oldCall.callId || call.inputDigest !== oldCall.inputDigest || call.role !== oldCall.role ||
            ["RESERVED", "DISPATCHED", "RESPONSE_SAVED"].indexOf(call.state) < ["RESERVED", "DISPATCHED", "RESPONSE_SAVED"].indexOf(oldCall.state))) reject("INVALID_OUTPUT", "Pending dispatch cannot be discarded, rebound or replayed.");
          if (before.schemaVersion !== 1 && before.learning.call && next.schemaVersion !== 1 && hash("learning-call", before.learning.call) !== hash("learning-call", next.learning.call)) {
            const descriptor = before.learning.call;
            const records = await rows<{ reservation: { roleCall?: { key?: string } } }>(sql, 'SELECT reservation FROM "AiUsageLog" WHERE "attemptId"=$1 AND reservation->\'roleCall\'->>\'key\'=$2', [attempt.attemptId, descriptor.key]);
            const correctingRejected=(descriptor.role==="REVIEWER"&&next.schemaVersion===3&&next.workflow.recovery!==null&&next.learning.call?.role==="REVIEWER")||(descriptor.role==="TRANSLATOR"&&rejectedTranslatorContinuation);
            // assertReviewedArtifact has reconstructed this exact rejected STOP
            // response and its concerns. No accepted/uncertain call is waived.
            if (records.length&&!correctingRejected) {
              const response = await readLearningResponse(sql, attempt, descriptor);
              const ref = descriptor.role === "REVIEWER" && next.schemaVersion === 3 ? next.workflow.assessment : descriptor.role === "STRATEGIST" ? next.learning.strategy : next.learning.translation;
              const authored = ref ? retainedArtifact(archive, ref, descriptor.role === "REVIEWER" ? "REVIEW" : descriptor.role === "STRATEGIST" ? "STRATEGY" : "TRANSLATION") : null;
              const incomplete = descriptor.role === "TRANSLATOR" && next.stage === "INCOMPLETE" && !next.learning.call && JSON.parse(response.text).decision === "INCOMPLETE";
              if (!incomplete && (!authored || authored.value.schemaVersion !== 2 || authored.value.input.digest !== head.digest)) reject("INVALID_OUTPUT", "Dispatched learning requires its exact saved output before routing can advance.", "RECOVERY");
            }
          }
        } else if (artifact.value.previous || artifact.value.stage !== "RESEARCH") reject("INVALID_OUTPUT", "The first checkpoint starts at research and understanding.");
      }
      archive.entries[artifact.id] = FoundationArtifactSchema.parse(artifact);
      validateArchive(archive); FoundationArchiveSchema.parse(archive);
      if (artifact.kind === "CHECKPOINT" && artifact.value.schemaVersion !== 1 && artifact.value.learning.translation) await assertLearningProduction(sql, attempt, archive, retainedArtifact(archive, artifact.value.learning.translation, "TRANSLATION"));
      await sql.query("SELECT set_config('sylf.planner_foundation_fence',$1,true)", [String(token.fence)]);
      await sql.query('UPDATE "PlannerAttempt" SET "intelligenceArtifacts"=$2 WHERE id=$1', [attempt.attemptId, archive]);
      return { artifact, digest: archiveDigest(archive) };
  }
}

/** Old compiler/publication must never interpret new archives as old repairs.
 * Phase B replaces this explicit barrier with version-dispatched compilation. */
export async function assertLegacyCompiler(sql: Parameters<typeof rows>[0], attemptId: string): Promise<void> {
  if (await loadCompilerVersion(sql, attemptId) !== 1) reject("INVALID_OUTPUT", "This operation is pinned to compiler v2; legacy execution is prohibited.");
  const row = (await rows<{ intelligenceArtifacts: unknown; compilerVersion: string | null }>(sql, 'SELECT "intelligenceArtifacts",payload->\'checkpoint\'->>\'compilerVersion\' AS "compilerVersion" FROM "PlannerAttempt" WHERE id=$1', [attemptId]))[0];
  if (row && (row.intelligenceArtifacts !== null || row.compilerVersion !== null && row.compilerVersion !== "1")) reject("INVALID_OUTPUT", "This compiler version requires its matching handler; legacy execution is prohibited.");
}
