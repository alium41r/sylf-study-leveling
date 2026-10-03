"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentService = void 0;
exports.ownedPlan = ownedPlan;
exports.loadIntent = loadIntent;
exports.verifyIntentReferences = verifyIntentReferences;
exports.appendIntent = appendIntent;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("../contracts");
const database_1 = require("./database");
const attempts_1 = require("./attempts");
async function ownedPlan(sql, ownerId, planId) {
    const plan = (await (0, database_1.rows)(sql, 'SELECT * FROM "PlannerPlan" WHERE id=$1::uuid AND "userId"=$2 FOR UPDATE', [planId, ownerId]))[0];
    if (!plan)
        (0, database_1.reject)("PLAN_NOT_FOUND", "This plan is unavailable.");
    return plan;
}
async function loadIntent(sql, ownerId, id) {
    const row = (await (0, database_1.rows)(sql, 'SELECT artifact,digest FROM "PlannerIntentVersion" WHERE id=$1::uuid AND "userId"=$2', [id, ownerId]))[0];
    if (!row)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "The intent does not belong to this student.");
    const artifact = contracts_1.IntentVersionV2Schema.parse(row.artifact);
    if (row.digest !== (0, database_1.hash)("intent-version", artifact))
        (0, database_1.reject)("INVALID_OUTPUT", "Intent integrity verification failed.");
    return artifact;
}
async function verifyIntentReferences(sql, ownerId, intent) {
    for (const [table, id] of [["Subject", intent.subjectId], ["Goal", intent.goalId]]) {
        if (id && !(await (0, database_1.rows)(sql, `SELECT id FROM "${table}" WHERE id=$1 AND "userId"=$2`, [id, ownerId])).length)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "A selected reference is unavailable.");
    }
    for (const source of intent.research?.sources ?? []) {
        // Upload storage is a later research boundary. A number supplied in JSON is
        // not proof that a document exists or belongs to this student.
        if (source.location.kind === "OWNED_DOCUMENT")
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "Document adoption requires the verified upload repository; caller-supplied ownership is insufficient.", "RESEARCH");
    }
}
/** Public intent input can report preferences/knowledge, but cannot mint
 * verified research or observed execution. Trusted fenced adoption has its own
 * service boundary. Existing attestations may be carried forward unchanged. */
function verifyClientIntentFacts(intent, previous) {
    if (intent.research && (0, database_1.hash)("research-input", intent.research) !== (0, database_1.hash)("research-input", previous?.research ?? null))
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "Research evidence must come from the trusted research-adoption boundary.", "RESEARCH");
    for (const evidence of intent.evidence) {
        const old = previous?.evidence.find(value => value.evidenceId === evidence.evidenceId);
        if (old && (0, database_1.hash)("evidence-input", old) === (0, database_1.hash)("evidence-input", evidence))
            continue;
        if (!["SELF_REPORT", "STUDENT_NOTE"].includes(evidence.source) || evidence.reliability !== "SELF_REPORTED" || evidence.resourceRef || evidence.demonstratesReadiness)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "Observed execution and readiness checks must come from owned application evidence.", "PREFLIGHT");
    }
}
async function appendIntent(sql, plan, intent, reason) {
    await verifyIntentReferences(sql, plan.userId, intent);
    const version = (await (0, database_1.rows)(sql, 'SELECT COALESCE(MAX(version),0)+1 AS version FROM "PlannerIntentVersion" WHERE "planId"=$1::uuid', [plan.id]))[0].version;
    const artifact = contracts_1.IntentVersionV2Schema.parse({ schemaVersion: 2, intentVersionId: (0, node_crypto_1.randomUUID)(), planId: plan.id, ownerId: plan.userId,
        parentIntentVersionId: plan.workingIntentVersionId, version, acceptedAt: (await (0, database_1.clock)(sql)).toISOString(), changeReason: reason, intent });
    await sql.query('INSERT INTO "PlannerIntentVersion" (id,"planId","userId","parentId",version,artifact,digest) VALUES ($1,$2,$3,$4,$5,$6,$7)', [artifact.intentVersionId, plan.id, plan.userId, artifact.parentIntentVersionId, version, artifact, (0, database_1.hash)("intent-version", artifact)]);
    await sql.query('UPDATE "PlannerPlan" SET "workingIntentVersionId"=$2, title=$3,"subjectId"=$4,mode=$5,"updatedAt"=clock_timestamp() WHERE id=$1', [plan.id, artifact.intentVersionId, intent.title, intent.subjectId ?? null, intent.policy]);
    return artifact;
}
class IntentService {
    db;
    constructor(db) {
        this.db = db;
    }
    async create(ownerId, key, raw) {
        const intent = contracts_1.CanonicalIntentV2Schema.parse(raw);
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
            (0, database_1.reject)("INVALID_OUTPUT", "Invalid request identity.");
        const requestHash = (0, database_1.hash)("create-plan", intent);
        return this.db.coordinated(ownerId, async (sql) => {
            const existing = (await (0, database_1.rows)(sql, 'SELECT * FROM "PlannerPlan" WHERE "userId"=$1 AND "creationKey"=$2 FOR UPDATE', [ownerId, key]))[0];
            if (existing) {
                if (existing.creationHash !== requestHash || existing.contractVersion !== 2)
                    (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "This request key belongs to different input.");
                const initial = (await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerIntentVersion" WHERE "planId"=$1 AND version=1', [existing.id]))[0];
                return { plan: existing, intent: await loadIntent(sql, ownerId, initial.id) };
            }
            verifyClientIntentFacts(intent);
            await verifyIntentReferences(sql, ownerId, intent);
            const reserved = intent.goalId ?? Number((await (0, database_1.rows)(sql, `SELECT nextval(pg_get_serial_sequence('"Goal"','id')) AS id`))[0].id);
            if (intent.goalId && (await (0, database_1.rows)(sql, 'SELECT id FROM "PlannerPlan" WHERE "userId"=$1 AND ("goalId"=$2 OR "reservedGoalId"=$2)', [ownerId, reserved])).length)
                (0, database_1.reject)("INTENT_CONFLICT", "This goal already belongs to a plan.");
            const id = (0, node_crypto_1.randomUUID)();
            await sql.query('INSERT INTO "PlannerPlan" (id,"userId",mode,title,state,"subjectId","goalId",version,"creationKey","creationHash","contractVersion","reservedGoalId","updatedAt") VALUES ($1,$2,$3,$4,\'DRAFT\',$5,$6,0,$7,$8,2,$9,clock_timestamp())', [id, ownerId, intent.policy, intent.title, intent.subjectId ?? null, intent.goalId ?? null, key, requestHash, reserved]);
            const artifact = await appendIntent(sql, await ownedPlan(sql, ownerId, id), intent, "INITIAL");
            return { plan: await ownedPlan(sql, ownerId, id), intent: artifact };
        });
    }
    async archive(ownerId, planId, expectedVersion) {
        return this.db.coordinated(ownerId, async (sql) => {
            const plan = await ownedPlan(sql, ownerId, planId);
            if (plan.contractVersion !== 2)
                (0, database_1.reject)("INTENT_CONFLICT", "This plan has not been adopted.");
            if (plan.state === "ARCHIVED")
                return plan;
            if (plan.version !== expectedVersion)
                (0, database_1.reject)("INTENT_CONFLICT", "The plan changed before archive.");
            await (0, attempts_1.supersedePlanAttempts)(sql, ownerId, [planId]);
            await sql.query('UPDATE "PlannerPlan" SET state=\'ARCHIVED\',version=version+1,"latestDraftRevisionId"=NULL,"updatedAt"=clock_timestamp() WHERE id=$1', [planId]);
            return ownedPlan(sql, ownerId, planId);
        });
    }
    async edit(ownerId, planId, expectedVersion, expectedIntentId, raw) {
        const intent = contracts_1.CanonicalIntentV2Schema.parse(raw);
        return this.db.coordinated(ownerId, async (sql) => {
            const plan = await ownedPlan(sql, ownerId, planId);
            if (plan.contractVersion !== 2 || plan.state === "ARCHIVED" || plan.version !== expectedVersion || plan.workingIntentVersionId !== expectedIntentId)
                (0, database_1.reject)("INTENT_CONFLICT", "The plan changed. Reload its current intent.");
            if ((intent.goalId ?? null) !== plan.goalId && intent.goalId !== undefined)
                (0, database_1.reject)("INTENT_CONFLICT", "A plan cannot silently change its execution goal.");
            const previous = await loadIntent(sql, ownerId, expectedIntentId);
            verifyClientIntentFacts(intent, previous.intent);
            if ((0, database_1.hash)("canonical-intent", previous.intent) === (0, database_1.hash)("canonical-intent", intent))
                return previous;
            const artifact = await appendIntent(sql, plan, intent, "USER_EDIT");
            await sql.query('UPDATE "PlannerPlan" SET version=version+1 WHERE id=$1', [planId]);
            await (0, attempts_1.supersedePlanAttempts)(sql, ownerId, [planId]);
            return artifact;
        });
    }
}
exports.IntentService = IntentService;
