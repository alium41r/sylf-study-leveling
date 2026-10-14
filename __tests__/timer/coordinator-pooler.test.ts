/** @vitest-environment node */
import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
function pooler(attempts: boolean[]) {
  const statements: string[] = []; const releases: boolean[] = []; let attempt = 0; let transaction = false;
  const query = vi.fn(async (text: string) => {
    statements.push(text);
    if (text.startsWith("BEGIN")) { transaction = true; attempt++; }
    else if (text === "COMMIT" || text === "ROLLBACK") transaction = false;
    else if (!transaction) throw new Error("Transaction pooler switched backends outside BEGIN");
    if (/pg_advisory_lock\(|pg_advisory_unlock\(/.test(text)) throw new Error("Session lock leaks on transaction poolers");
    return { rows: text.includes("pg_try_advisory_xact_lock") ? [{ locked: attempts[attempt - 1] ?? true }] : [] };
  });
  const client = { query, release: vi.fn((discard: boolean) => { releases.push(discard); }) };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, statements, releases, query };
}
it("keeps all coordination state inside one backend-bound transaction and releases it at commit", async () => {
  const fixture = pooler([true]);
  expect(await new PlannerDatabase(fixture.pool).coordinated(7, async sql => { await sql.query("SELECT 1"); return "accepted"; })).toBe("accepted");
  expect(fixture.statements[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE"); expect(fixture.statements.at(-1)).toBe("COMMIT"); expect(fixture.releases).toEqual([false]);
});
it("rolls a busy snapshot back and starts fresh before running work, returning its connection before retry", async () => {
  const fixture = pooler([false, true]); const work = vi.fn(async () => "accepted");
  expect(await new PlannerDatabase(fixture.pool).coordinated(7, work)).toBe("accepted");
  expect(work).toHaveBeenCalledOnce(); expect(fixture.statements.filter(x => x.startsWith("BEGIN"))).toHaveLength(2);
  expect(fixture.statements).toContain("ROLLBACK"); expect(fixture.releases).toEqual([false, false]);
});
it("rolls failed writes back without leaving any session-level lock or settings behind", async () => {
  const fixture = pooler([true]);
  await expect(new PlannerDatabase(fixture.pool).coordinated(7, async () => { throw new Error("injected failure"); })).rejects.toThrow("injected failure");
  expect(fixture.statements.at(-1)).toBe("ROLLBACK"); expect(fixture.releases).toEqual([false]);
});
