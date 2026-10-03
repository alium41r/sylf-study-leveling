import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { connect, linked, rollback, waitForLock } from "./database";

describe("REQUIRED: genuine separate PostgreSQL connections and current execution race", () => {
  let first: Client; let second: Client; let observer: Client;
  beforeAll(async () => { first = await connect(); second = await connect(); observer = await connect(); });
  afterAll(async () => { await Promise.all([first, second, observer].filter(Boolean).map(client => client.end())); });

  it("uses three independent backend processes, not a single-user emulation", async () => {
    const identities = await Promise.all([first, second, observer].map(client => client.query("SELECT pg_backend_pid() AS pid,current_setting('server_version_num')::int AS version")));
    expect(new Set(identities.map(result => result.rows[0].pid)).size).toBe(3);
    expect(identities.every(result => result.rows[0].version >= 150000)).toBe(true);
  });

  it("observes cross-connection advisory locking and release at transaction end", async () => {
    await first.query("BEGIN"); await second.query("BEGIN");
    try {
      await first.query("SELECT pg_advisory_xact_lock(18370692,17)");
      expect((await second.query("SELECT pg_try_advisory_xact_lock(18370692,17) AS acquired")).rows[0].acquired).toBe(false);
      await first.query("COMMIT");
      expect((await second.query("SELECT pg_try_advisory_xact_lock(18370692,17) AS acquired")).rows[0].acquired).toBe(true);
    } finally { await Promise.all([rollback(first), rollback(second)]); }
  });

  it("makes a racing authorized reschedule wait, then protects the zero-second Focus start", async () => {
    const fixture = await linked(observer);
    const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await first.query("BEGIN"); await second.query("BEGIN");
    try {
      await first.query("SELECT public.start_study_session($1,$2,NULL,0)", [fixture.userId, fixture.questId]);
      await second.query("SELECT set_config('sylf.planner_manual_quest',$1,true)", [String(fixture.questId)]);
      // Convert rejection to a value immediately so no unhandled promise is created.
      const edit = second.query('UPDATE "Quest" SET "scheduledFor"=\'2026-10-06\' WHERE id=$1', [fixture.questId])
        .then(() => ({ succeeded: true, error: undefined }), error => ({ succeeded: false, error }));
      await waitForLock(observer, secondPid);
      await first.query("COMMIT");
      expect(await edit).toMatchObject({ succeeded: false, error: { code: "23514", message: "PLANNER_EXECUTION_PROTECTED" } });
    } finally { await Promise.all([rollback(first), rollback(second)]); }
    expect((await observer.query('SELECT status,"scheduledFor" FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0])
      .toEqual({ status: "IN_PROGRESS", scheduledFor: "2026-10-05" });
    expect((await observer.query('SELECT count(*)::int AS count,min("durationSeconds") AS seconds FROM "StudySession" WHERE "questId"=$1', [fixture.questId])).rows[0])
      .toEqual({ count: 1, seconds: 0 });
  });
});
