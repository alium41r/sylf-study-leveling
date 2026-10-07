import { randomUUID } from "node:crypto";
import { CanonicalIntentV2Schema, IntentVersionV2Schema, type CanonicalIntentV2, type IntentVersionV2 } from "../contracts";
import { PlannerDatabase, hash, rows, clock, reject, type Sql } from "./database";
import { verifyOwnedResearchDocuments } from "./documents";
import { supersedePlanAttempts } from "./attempts";

export interface PlanRow {
  id: string; userId: number; mode: string; title: string; state: string; version: number;
  contractVersion: number; conversationVersion: number; workingIntentVersionId: string | null;
  activeRevisionId: string | null; latestDraftRevisionId: string | null;
  subjectId: number | null; goalId: number | null; reservedGoalId: number | null;
  creationHash: string; migrationEvidence: unknown;
  conversation?: unknown; researchDocuments?: unknown;
}
export async function ownedPlan(sql: Sql, ownerId: number, planId: string): Promise<PlanRow> {
  const plan = (await rows<PlanRow>(sql, 'SELECT * FROM "PlannerPlan" WHERE id=$1::uuid AND "userId"=$2 FOR UPDATE', [planId, ownerId]))[0];
  if (!plan) reject("PLAN_NOT_FOUND", "This plan is unavailable.");
  return plan;
}
export async function loadIntent(sql: Sql, ownerId: number, id: string): Promise<IntentVersionV2> {
  const row = (await rows<{ artifact: unknown; digest: string }>(sql, 'SELECT artifact,digest FROM "PlannerIntentVersion" WHERE id=$1::uuid AND "userId"=$2', [id, ownerId]))[0];
  if (!row) reject("REFERENCE_NOT_OWNED", "The intent does not belong to this student.");
  const artifact = IntentVersionV2Schema.parse(row.artifact);
  if (row.digest !== hash("intent-version", artifact)) reject("INVALID_OUTPUT", "Intent integrity verification failed.");
  return artifact;
}
export async function verifyIntentReferences(sql: Sql, ownerId: number, intent: CanonicalIntentV2): Promise<void> {
  for (const [table, id] of [["Subject", intent.subjectId], ["Goal", intent.goalId]] as const) {
    if (id && !(await rows(sql, `SELECT id FROM "${table}" WHERE id=$1 AND "userId"=$2`, [id, ownerId])).length) reject("REFERENCE_NOT_OWNED", "A selected reference is unavailable.");
  }
  if (intent.research) await verifyOwnedResearchDocuments(sql,ownerId,intent.research);
}
/** Public intent input can report preferences/knowledge, but cannot mint
 * verified research or observed execution. Trusted fenced adoption has its own
 * service boundary. Existing attestations may be carried forward unchanged. */
function verifyClientIntentFacts(intent: CanonicalIntentV2, previous?: CanonicalIntentV2): void {
  if (intent.research && hash("research-input", intent.research) !== hash("research-input", previous?.research ?? null))
    reject("REFERENCE_NOT_OWNED", "Research evidence must come from the trusted research-adoption boundary.", "RESEARCH");
  for (const evidence of intent.evidence) {
    const old = previous?.evidence.find(value => value.evidenceId === evidence.evidenceId);
    if (old && hash("evidence-input",old) === hash("evidence-input",evidence)) continue;
    if (!["SELF_REPORT","STUDENT_NOTE"].includes(evidence.source) || evidence.reliability !== "SELF_REPORTED" || evidence.resourceRef || evidence.demonstratesReadiness)
      reject("REFERENCE_NOT_OWNED", "Observed execution and readiness checks must come from owned application evidence.", "PREFLIGHT");
  }
}
export async function appendIntent(sql: Sql, plan: PlanRow, intent: CanonicalIntentV2, reason: IntentVersionV2["changeReason"]): Promise<IntentVersionV2> {
  await verifyIntentReferences(sql, plan.userId, intent);
  const version = (await rows<{ version: number }>(sql, 'SELECT COALESCE(MAX(version),0)+1 AS version FROM "PlannerIntentVersion" WHERE "planId"=$1::uuid', [plan.id]))[0].version;
  const artifact = IntentVersionV2Schema.parse({ schemaVersion: 2, intentVersionId: randomUUID(), planId: plan.id, ownerId: plan.userId,
    parentIntentVersionId: plan.workingIntentVersionId, version, acceptedAt: (await clock(sql)).toISOString(), changeReason: reason, intent });
  await sql.query('INSERT INTO "PlannerIntentVersion" (id,"planId","userId","parentId",version,artifact,digest) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [artifact.intentVersionId, plan.id, plan.userId, artifact.parentIntentVersionId, version, artifact, hash("intent-version", artifact)]);
  await sql.query('UPDATE "PlannerPlan" SET "workingIntentVersionId"=$2, title=$3,"subjectId"=$4,mode=$5,"updatedAt"=clock_timestamp() WHERE id=$1',
    [plan.id, artifact.intentVersionId, intent.title, intent.subjectId ?? null, intent.policy]);
  return artifact;
}

export class IntentService {
  constructor(readonly db: PlannerDatabase) {}
  async create(ownerId: number, key: string, raw: unknown): Promise<{ plan: PlanRow; intent: IntentVersionV2 }> {
    return this.db.coordinated(ownerId,sql=>this.createAccepted(sql,ownerId,key,raw));
  }
  /** Called only inside the existing coordinated owner transaction. */
  async createAccepted(sql:Sql,ownerId:number,key:string,raw:unknown):Promise<{plan:PlanRow;intent:IntentVersionV2}> {
    const intent = CanonicalIntentV2Schema.parse(raw);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) reject("INVALID_OUTPUT", "Invalid request identity.");
    const requestHash = hash("create-plan", intent);
    const existing = (await rows<PlanRow>(sql, 'SELECT * FROM "PlannerPlan" WHERE "userId"=$1 AND "creationKey"=$2 FOR UPDATE', [ownerId, key]))[0];
    if (existing) {
      if (existing.creationHash !== requestHash || existing.contractVersion !== 2) reject("IDEMPOTENCY_MISMATCH", "This request key belongs to different input.");
      const initial = (await rows<{ id: string }>(sql, 'SELECT id FROM "PlannerIntentVersion" WHERE "planId"=$1 AND version=1', [existing.id]))[0];
      return { plan: existing, intent: await loadIntent(sql, ownerId, initial.id) };
    }
    verifyClientIntentFacts(intent);
    await verifyIntentReferences(sql, ownerId, intent);
    const reserved = intent.goalId ?? Number((await rows<{ id: string }>(sql, `SELECT nextval(pg_get_serial_sequence('"Goal"','id')) AS id`))[0].id);
    if (intent.goalId && (await rows(sql, 'SELECT id FROM "PlannerPlan" WHERE "userId"=$1 AND ("goalId"=$2 OR "reservedGoalId"=$2)', [ownerId, reserved])).length) reject("INTENT_CONFLICT", "This goal already belongs to a plan.");
    const id = randomUUID();
    await sql.query('INSERT INTO "PlannerPlan" (id,"userId",mode,title,state,"subjectId","goalId",version,"creationKey","creationHash","contractVersion","reservedGoalId","updatedAt") VALUES ($1,$2,$3,$4,\'DRAFT\',$5,$6,0,$7,$8,2,$9,clock_timestamp())',
      [id, ownerId, intent.policy, intent.title, intent.subjectId ?? null, intent.goalId ?? null, key, requestHash, reserved]);
    const artifact = await appendIntent(sql, await ownedPlan(sql, ownerId, id), intent, "INITIAL");
    return { plan: await ownedPlan(sql, ownerId, id), intent: artifact };
  }
  async archive(ownerId: number, planId: string, expectedVersion: number): Promise<PlanRow> {
    return this.db.coordinated(ownerId, async sql => {
      const plan = await ownedPlan(sql, ownerId, planId);
      if (plan.contractVersion !== 2) reject("INTENT_CONFLICT", "This plan has not been adopted.");
      if (plan.state === "ARCHIVED") return plan;
      if (plan.version !== expectedVersion) reject("INTENT_CONFLICT", "The plan changed before archive.");
      await supersedePlanAttempts(sql, ownerId, [planId]);
      await sql.query('UPDATE "PlannerPlan" SET state=\'ARCHIVED\',version=version+1,"latestDraftRevisionId"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1', [planId]);
      return ownedPlan(sql, ownerId, planId);
    });
  }
  async edit(ownerId: number, planId: string, expectedVersion: number, expectedIntentId: string, raw: unknown): Promise<IntentVersionV2> {
    return this.db.coordinated(ownerId,sql=>this.editAccepted(sql,ownerId,planId,expectedVersion,expectedIntentId,raw));
  }
  /** Final accepted intent and generation admission share this same transaction. */
  async editAccepted(sql:Sql,ownerId:number,planId:string,expectedVersion:number,expectedIntentId:string,raw:unknown):Promise<IntentVersionV2> {
    const intent = CanonicalIntentV2Schema.parse(raw);
    const plan = await ownedPlan(sql, ownerId, planId);
    if (plan.contractVersion !== 2 || plan.state === "ARCHIVED" || plan.version !== expectedVersion || plan.workingIntentVersionId !== expectedIntentId) reject("INTENT_CONFLICT", "The plan changed. Reload its current intent.");
    if ((intent.goalId ?? null) !== plan.goalId && intent.goalId !== undefined) reject("INTENT_CONFLICT", "A plan cannot silently change its execution goal.");
    const previous = await loadIntent(sql, ownerId, expectedIntentId);
    verifyClientIntentFacts(intent, previous.intent);
    if (hash("canonical-intent", previous.intent) === hash("canonical-intent", intent)) return previous;
    const artifact = await appendIntent(sql, plan, intent, "USER_EDIT");
    await sql.query('UPDATE "PlannerPlan" SET version=version+1 WHERE id=$1', [planId]);
    await supersedePlanAttempts(sql, ownerId, [planId]);
    return artifact;
  }
}
