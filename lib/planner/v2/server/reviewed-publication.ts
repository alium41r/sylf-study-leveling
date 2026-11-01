import { QualityReportV2Schema, type PlannerAttemptV2, type PlannerRevisionV2, type PlanChangeSetV2 } from "../contracts";
import { readReviewedBundle } from "../intelligence/foundation/readers";
import { artifactRef, sealIntelligenceBundle, type ReviewedCheckpoint } from "../intelligence/foundation/validation";
import { reviewedRoleInputV1 } from "../intelligence/reviewed-learning";
import { loadAttemptArtifacts } from "./foundation";
import { headOf } from "./natural-learning";
import { loadAttempt } from "./attempts";
import { educationalDigest, qualityEvidenceDigest } from "./revisions";
import { hash, reject, type Sql } from "./database";
import { DocumentRepository, ownedDocumentMetadata } from "./documents";
import { compileForecast,allocationAggregate } from "./compilation";

export type ReviewedPublication = ReturnType<typeof readReviewedBundle>;

/** Actual complete response and every immutable producing receipt are checked
 * by the archive owner before this projection can acquire publication meaning. */
export async function reviewedPublication(sql: Sql, attempt: PlannerAttemptV2) {
  const retained = await loadAttemptArtifacts(sql, attempt.ownerId, attempt.attemptId);
  const { payload } = await loadAttempt(sql, attempt.ownerId, attempt.attemptId, false);
  if (retained.compilerVersion !== 2 || payload.resourcePolicy?.journeyVersion !== 1) reject("QUALITY_INCOMPLETE", "This Attempt retains its earlier publication boundary.");
  const head = headOf(retained.archive);
  if (head?.value.schemaVersion !== 3 || head.value.stage !== "READY" || !head.value.workflow.assessment) reject("QUALITY_INCOMPLETE", "An exact independently approved complete candidate is required.");
  const review = retained.archive.entries[head.value.workflow.assessment.id];
  if (review?.kind !== "REVIEW" || review.value.schemaVersion !== 2) reject("QUALITY_INCOMPLETE", "The actual complete assessment is unavailable.");
  const allocation = retained.archive.entries[review.value.binding.allocation.id];
  if (allocation?.kind !== "CHECKPOINT" || allocation.value.schemaVersion === 1 || !allocation.value.learning.allocated) reject("QUALITY_INCOMPLETE", "The reviewed actual allocation is unavailable.");
  const allocated = allocation.value.learning.allocated;
  const dossier = retained.archive.entries[review.value.binding.dossier.id];
  if (dossier?.kind !== "DOSSIER" || dossier.value.schemaVersion !== 3) throw new Error("REVIEWED_DOSSIER_REQUIRED");
  const capacity = retained.archive.entries[dossier.value.capacity.id];
  if (capacity?.kind !== "CAPACITY" || capacity.value.schemaVersion !== 2) throw new Error("REVIEWED_CAPACITY_REQUIRED");
  const groundStrings: Record<string, string[]> = {};
  let archive = retained.archive;
  // Inherited closed findings retain their original independent grounds. Their
  // actual linked parent receipts remain authority, not a copied assertion.
  const visited = new Set<string>();
  for (;;) {
    for (const entry of Object.values(archive.entries)) if (entry.kind === "CHECKPOINT" && entry.value.schemaVersion === 3 && entry.value.learning.call?.role === "REVIEWER") {
      const values: string[] = [];
      const strings = (v: unknown): void => { if (typeof v === "string") values.push(v); else if (Array.isArray(v)) v.forEach(strings); else if (v && typeof v === "object") Object.values(v).forEach(strings); };
      strings(reviewedRoleInputV1(archive, entry as ReviewedCheckpoint));
      groundStrings[entry.value.learning.call.inputDigest] = values;
    }
    const parent = Object.values(archive.entries).find(e => e.kind === "ISSUE" && e.value.schemaVersion === 2 && e.value.inherited);
    const parentId = parent?.kind === "ISSUE" && parent.value.schemaVersion === 2 ? parent.value.inherited?.attemptId : null;
    if (!parentId || visited.has(parentId)) break;
    visited.add(parentId);
    const prior = await loadAttemptArtifacts(sql, attempt.ownerId, parentId);
    if (prior.compilerVersion !== 2) throw new Error("INHERITED_ARCHIVE_VERSION_REQUIRED");
    archive = prior.archive;
  }
  const bundle = sealIntelligenceBundle(retained.archive, review.value.binding, artifactRef(review), {
    blueprints: allocated.compiled.map(p => ({ planId: p.planId, blueprint: allocated.blueprints.plans.find(b => b.planRef === p.planRef)!.blueprint })),
    allocation: allocated.allocation, execution: allocated.compiled.flatMap(p => p.specs), constraints: capacity.value.constraints, calendar: capacity.value.calendar, groundStrings,
  });
  return readReviewedBundle(bundle, retained.archive);
}

/** The existing confirmation contract displays current unresolved warnings.
 * Complete correction/withdrawal history remains exact in the durable bundle;
 * a withdrawn objection is never misrepresented as a repaired defect. */
export function reviewedQuality(retained: ReviewedPublication) {
  return retained.allocated.compiled.map(plan => {
    const blueprint = retained.allocated.blueprints.plans.find(p => p.planRef === plan.planRef)!.blueprint;
    const intent = retained.ownedLearning.targets.find(t => t.planRef === plan.planRef)!.intent;
    const heads = retained.issues.filter(i => i.value.schemaVersion === 2 && i.value.planRef === plan.planRef && ["OPEN", "ADDRESSED"].includes(i.value.disposition));
    const issues = heads.map(i => {
      if (i.value.schemaVersion !== 2 || i.value.severity === "BLOCKING") throw new Error("UNVERIFIED_BLOCKER");
      const v = i.value;
      return { issueId: `issue_${v.issueId.replaceAll("-", "")}`, category: v.finding.category, severity: v.severity,
        affectedRefs: v.finding.affectedRefs, evidence: v.finding.evidence, consequence: v.consequence, resolution: "OPEN", verification: null };
    });
    return { planRef: plan.planRef, report: QualityReportV2Schema.parse({ schemaVersion: 2, reportId: retained.review.id, status: "PASSED",
      evidenceDigest: qualityEvidenceDigest(intent), educationalContentDigest: educationalDigest({ blueprint, context: plan.context }), issues,
      requiredAcknowledgements: heads.filter(i => i.value.schemaVersion === 2 && i.value.severity === "WARNING" && i.value.finding.requiresAcknowledgement).map(i => `issue_${i.value.issueId.replaceAll("-", "")}`) }) };
  });
}

export function assertReviewedRevisions(retained: ReviewedPublication, revisions: readonly PlannerRevisionV2[]) {
  const quality = reviewedQuality(retained);
  if (revisions.length !== retained.allocated.compiled.length) reject("INVALID_OUTPUT", "Every reviewed target must seal together.");
  for (const revision of revisions) {
    const plan = retained.allocated.compiled.find(p => p.planId === revision.planId);
    const target = retained.dossier.value.targets.find(t => t.planId === revision.planId);
    if (!plan || !target || revision.requestedIntentVersionId !== target.requestedIntentId || revision.resolvedIntentVersionId !== target.resolvedIntentId ||
      hash("reviewed-sealed-content", { blueprint: revision.blueprint, executable: revision.executable, context: revision.context, quality: revision.quality,forecast:revision.forecast }) !==
      hash("reviewed-sealed-content", { blueprint: retained.allocated.blueprints.plans.find(p => p.planRef === plan.planRef)!.blueprint, executable: plan.specs, context: plan.context, quality: quality.find(q => q.planRef === plan.planRef)!.report,forecast:compileForecast(retained.allocated.planning,plan.planRef) })) reject("QUALITY_INCOMPLETE", "The revision differs from the exact independently reviewed education and allocation.");
  }
}
export function assertReviewedChangeSet(retained:ReviewedPublication,changeSet:PlanChangeSetV2){
  const reports=reviewedQuality(retained).map(q=>q.report),actual=changeSet.quality,{reportId:_id,...quality}=actual;void _id;
  const expected={schemaVersion:2,status:"PASSED",evidenceDigest:hash("joint-quality-evidence",reports.map(r=>r.evidenceDigest)),educationalContentDigest:hash("joint-quality-content",reports.map(r=>r.educationalContentDigest)),issues:reports.flatMap(r=>r.issues),requiredAcknowledgements:reports.flatMap(r=>r.requiredAcknowledgements)};
  if(hash("reviewed-joint-quality",quality)!==hash("reviewed-joint-quality",expected)||hash("reviewed-aggregate",changeSet.aggregate)!==hash("reviewed-aggregate",allocationAggregate({blueprints:retained.allocated.blueprints,envelope:retained.allocated.envelope,allocation:{report:retained.allocated.allocation,digest:hash("allocation",retained.allocated.allocation)}})))reject("QUALITY_INCOMPLETE","Confirmation must retain the exact reviewed joint quality and mathematical capacity.");
}

export function reviewedSources(retained: ReviewedPublication) {
  return [...retained.research.value.understanding.sources.map(s => s.source), ...retained.ownedLearning.targets.flatMap(t => t.intent.research?.sources ?? []),...retained.ownedLearning.retainedResources?.map(r=>r.source)??[]];
}
export async function verifyReviewedDocuments(retained: ReviewedPublication, ownerId: number, documents: DocumentRepository) {
  for (const source of reviewedSources(retained)) if (source.location.kind === "OWNED_DOCUMENT") {
    if (source.location.ownerId !== ownerId) reject("REFERENCE_NOT_OWNED", "The reviewed document belongs to another student.");
    const actual = await documents.read(ownerId, source.location.documentId);
    if (actual.metadata.contentHash !== source.contentHash) reject("STALE_CONTEXT", "The original reviewed document changed.");
  }
}
export async function verifyReviewedDocumentMetadata(sql: Sql, retained: ReviewedPublication, ownerId: number) {
  for (const source of reviewedSources(retained)) if (source.location.kind === "OWNED_DOCUMENT") {
    const metadata = await ownedDocumentMetadata(sql, ownerId, source.location.documentId);
    if (source.location.ownerId !== ownerId || metadata.contentHash !== source.contentHash) reject("STALE_CONTEXT", "The reviewed document provenance changed.");
  }
}
