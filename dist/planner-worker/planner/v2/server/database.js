"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlannerDatabase = exports.hash = exports.DurablePlannerError = void 0;
exports.reject = reject;
exports.canonicalJson = canonicalJson;
exports.rows = rows;
exports.clock = clock;
const node_crypto_1 = require("node:crypto");
const pg_1 = require("pg");
class DurablePlannerError extends Error {
    detail;
    constructor(code, message, stage = "PERSISTENCE") {
        super(message);
        this.detail = { schemaVersion: 2, code, stage, message, traceId: (0, node_crypto_1.randomUUID)(),
            retryable: ["SAVE_FAILED", "LEASE_EXPIRED", "WORKER_UNAVAILABLE", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT"].includes(code),
            resumable: ["SAVE_FAILED", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT"].includes(code),
            fieldRefs: [], activityRefs: [], dates: [], recoveryAction: ["STALE_CONTEXT", "INTENT_CONFLICT", "SUPERSEDED"].includes(code) ? "REVIEW_CHANGED_INTENT" :
                code === "SCHEDULE_CONFLICT" ? "REFRESH_PLACEMENT" :
                    ["PROTECTED_EXECUTION", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED", "QUALITY_BLOCKED", "QUALITY_INCOMPLETE"].includes(code) ? "RESOLVE_CONFLICT" :
                        code === "ALREADY_APPLIED" ? "OPEN_ACTIVE_PLAN" :
                            code === "WORKER_UNAVAILABLE" ? "WAIT_FOR_WORKER" :
                                ["SAVE_FAILED", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT", "LEASE_EXPIRED"].includes(code) ? "RETRY_STAGE" : "NONE" };
    }
}
exports.DurablePlannerError = DurablePlannerError;
function reject(code, message, stage) {
    throw new DurablePlannerError(code, message, stage);
}
/** JSON semantics, with recursively sorted keys. Optional properties are absent,
 * never the invalid JSON token `undefined`. Academic prose is left untouched. */
function canonicalJson(value) {
    if (value instanceof Date)
        return JSON.stringify(value.toISOString());
    if (Array.isArray(value))
        return `[${value.map(item => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.keys(value).filter(key => Reflect.get(value, key) !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(",")}}`;
    const encoded = JSON.stringify(value);
    if (encoded === undefined || typeof value === "number" && !Number.isFinite(value))
        throw new TypeError("CANONICAL_JSON_REQUIRES_FINITE_JSON");
    return encoded;
}
const referenceSets = new Set(["outcomeRefs", "scopeRefs", "scopeKeys", "sourceClaimIds", "hardDependencies", "advisoryOrderAfter", "resourceRefs", "evidenceRefs", "affectedRefs", "requiredAcknowledgements", "restWeekdays", "restDays", "blockedDates", "selectedPages", "ocrPages", "planBases", "quests", "externalActivityDependencies"]);
/** These lists are sets in the frozen contracts. Activity/phase/decision arrays
 * remain ordered; sorting those would erase consequential educational order. */
function canonicalReferences(value, field = "") {
    if (value instanceof Date)
        return value;
    if (Array.isArray(value)) {
        const items = value.map(item => canonicalReferences(item));
        if (referenceSets.has(field) || field === "resources")
            items.sort((a, b) => {
                const left = canonicalJson(a);
                const right = canonicalJson(b);
                return left < right ? -1 : left > right ? 1 : 0;
            });
        return items;
    }
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, canonicalReferences(item, key)]));
    return value;
}
const hash = (domain, value) => (0, node_crypto_1.createHash)("sha256").update(`sylf-planner-v2:${domain}:`).update(canonicalJson(canonicalReferences(value))).digest("hex");
exports.hash = hash;
async function rows(sql, text, values = []) {
    // Prisma's timestamp-without-zone columns represent UTC instants. The pg
    // default parser otherwise treats them as the worker machine's local time.
    return (await sql.query({ text, values, types: { getTypeParser: oid => oid === 1114
                ? (value) => new Date(`${value.replace(" ", "T")}Z`) : pg_1.types.getTypeParser(oid) } })).rows;
}
async function clock(sql) {
    return (await rows(sql, "SELECT clock_timestamp() AS now"))[0].now;
}
class PlannerDatabase {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async coordinated(ownerId, work) {
        if (!Number.isSafeInteger(ownerId) || ownerId <= 0)
            reject("REFERENCE_NOT_OWNED", "An authenticated owner is required.");
        for (let retry = 0;; retry++) {
            const sql = await this.pool.connect();
            try {
                await sql.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
                await sql.query("SET LOCAL TIME ZONE 'UTC'");
                await sql.query("SET LOCAL statement_timeout = '10s'");
                await sql.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
                await sql.query("SELECT pg_advisory_xact_lock(73641, $1::int)", [ownerId]);
                await sql.query("SELECT set_config('sylf.planner_v2_core_owner',$1,true)", [String(ownerId)]);
                const result = await work(sql);
                await sql.query("COMMIT");
                return result;
            }
            catch (error) {
                await sql.query("ROLLBACK").catch(() => { });
                if (["40001", "40P01"].includes(String(error.code)) && retry < 2) {
                    await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
                    continue;
                }
                throw error;
            }
            finally {
                sql.release();
            }
        }
    }
}
exports.PlannerDatabase = PlannerDatabase;
