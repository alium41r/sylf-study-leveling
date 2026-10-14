import { randomUUID, createHash } from "node:crypto";
import { types, type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { PlannerErrorV2 } from "../contracts";

/** The web and worker share this repository, not a second execution engine. */
export type Sql = Pick<PoolClient, "query">;
export class DurablePlannerError extends Error {
  readonly detail: PlannerErrorV2;
  constructor(code: PlannerErrorV2["code"], message: string, stage: PlannerErrorV2["stage"] = "PERSISTENCE") {
    super(message);
    this.detail = { schemaVersion: 2, code, stage, message, traceId: randomUUID(),
      retryable: ["SAVE_FAILED", "LEASE_EXPIRED", "WORKER_UNAVAILABLE", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT"].includes(code),
      resumable: ["SAVE_FAILED", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT"].includes(code),
      fieldRefs: [], activityRefs: [], dates: [], recoveryAction:
        ["STALE_CONTEXT", "INTENT_CONFLICT", "SUPERSEDED"].includes(code) ? "REVIEW_CHANGED_INTENT" :
        code === "SCHEDULE_CONFLICT" ? "REFRESH_PLACEMENT" :
        ["PROTECTED_EXECUTION", "CAPACITY_SHORTFALL", "ALLOCATION_UNRESOLVED", "QUALITY_BLOCKED", "QUALITY_INCOMPLETE"].includes(code) ? "RESOLVE_CONFLICT" :
        code === "ALREADY_APPLIED" ? "OPEN_ACTIVE_PLAN" :
        code === "WORKER_UNAVAILABLE" ? "WAIT_FOR_WORKER" :
        ["SAVE_FAILED", "PROVIDER_FAILURE", "PROVIDER_TIMEOUT", "LEASE_EXPIRED"].includes(code) ? "RETRY_STAGE" : "NONE" };
  }
}
export function reject(code: PlannerErrorV2["code"], message: string, stage?: PlannerErrorV2["stage"]): never {
  throw new DurablePlannerError(code, message, stage);
}
/** JSON semantics, with recursively sorted keys. Optional properties are absent,
 * never the invalid JSON token `undefined`. Academic prose is left untouched. */
export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter(key => Reflect.get(value, key) !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined || typeof value === "number" && !Number.isFinite(value)) throw new TypeError("CANONICAL_JSON_REQUIRES_FINITE_JSON");
  return encoded;
}
const referenceSets = new Set(["outcomeRefs", "scopeRefs", "scopeKeys", "sourceClaimIds", "hardDependencies", "advisoryOrderAfter", "resourceRefs", "evidenceRefs", "affectedRefs", "requiredAcknowledgements", "restWeekdays", "restDays", "blockedDates", "selectedPages", "ocrPages", "planBases", "quests", "externalActivityDependencies"]);
/** These lists are sets in the frozen contracts. Activity/phase/decision arrays
 * remain ordered; sorting those would erase consequential educational order. */
function canonicalReferences(value: unknown, field = ""): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    const items = value.map(item => canonicalReferences(item));
    if (referenceSets.has(field) || field === "resources") items.sort((a, b) => {
      const left = canonicalJson(a); const right = canonicalJson(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    return items;
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, canonicalReferences(item, key)]));
  return value;
}
export const hash = (domain: string, value: unknown): string => createHash("sha256").update(`sylf-planner-v2:${domain}:`).update(canonicalJson(canonicalReferences(value))).digest("hex");
export async function rows<R extends QueryResultRow>(sql: Sql, text: string, values: unknown[] = []): Promise<R[]> {
  // Prisma's timestamp-without-zone columns represent UTC instants. The pg
  // default parser otherwise treats them as the worker machine's local time.
  return (await sql.query<R>({ text, values, types: { getTypeParser: oid => oid === 1114
    ? (value: string) => new Date(`${value.replace(" ", "T")}Z`) : types.getTypeParser(oid) } })).rows;
}
export async function clock(sql: Sql): Promise<Date> {
  return (await rows<{ now: Date }>(sql, "SELECT clock_timestamp() AS now"))[0].now;
}
export class PlannerDatabase {
  constructor(readonly pool: Pool) {}
  async coordinated<T>(ownerId: number, work: (sql: Sql) => Promise<T>): Promise<T> {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) reject("REFERENCE_NOT_OWNED", "An authenticated owner is required.");
    for (let retry = 0; ; retry++) {
      const sql = await this.pool.connect();
      let ownerLocked = false; let lockAttempted = false; let previousTimeout: string | undefined; let discard = false;
      try {
        // Waiting in a SELECT inside SERIALIZABLE would pin its snapshot before
        // the preceding owner commits. Wait on the same key before BEGIN, then
        // keep the transaction-scoped lock required by the existing SQL guards.
        previousTimeout = (await sql.query("SHOW statement_timeout")).rows[0].statement_timeout;
        await sql.query("SET statement_timeout = '10s'");
        lockAttempted = true;
        await sql.query("SELECT pg_advisory_lock(73641, $1::int)", [ownerId]);
        ownerLocked = true;
        await sql.query("SELECT set_config('statement_timeout',$1,false)", [previousTimeout]);
        await sql.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await sql.query("SET LOCAL TIME ZONE 'UTC'");
        await sql.query("SET LOCAL statement_timeout = '10s'");
        await sql.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        await sql.query("SELECT pg_advisory_xact_lock(73641, $1::int)", [ownerId]);
        await sql.query("SELECT set_config('sylf.planner_v2_core_owner',$1,true)", [String(ownerId)]);
        const result = await work(sql);
        await sql.query("COMMIT");
        return result;
      } catch (error) {
        await sql.query("ROLLBACK").catch(() => { discard = true; });
        if (["40001", "40P01"].includes(String((error as { code?: string }).code)) && retry < 2) {
          await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
          continue;
        }
        throw error;
      } finally {
        try {
          if (lockAttempted) {
            const unlocked = (await sql.query("SELECT pg_advisory_unlock(73641, $1::int) AS unlocked", [ownerId])).rows[0].unlocked;
            if (ownerLocked && !unlocked) discard = true;
          }
          if (previousTimeout !== undefined) await sql.query("SELECT set_config('statement_timeout',$1,false)", [previousTimeout]);
        } catch { discard = true; }
        // Destroying an uncertain backend releases session locks instead of
        // leaking them into the pool. A known committed result stays replayable.
        sql.release(discard);
      }
    }
  }
}
