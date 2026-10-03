import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { connect, linked, plan, revision, rollback, user } from "./database";

describe("REQUIRED: actual current Planner security, RPC and SQL invariants (not V2 apply)", () => {
  let db: Client;
  beforeAll(async () => { db = await connect(); });
  afterAll(async () => { await db?.end(); });

  it("installs the actual final timer/reward RPCs and Planner trigger functions", async () => {
    const functions = (await db.query("SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1)",
      [["start_study_session", "settle_study_session_atomic", "claim_quest_reward", "planner_revision_guard", "planner_quest_guard", "planner_ownership_guard"]])).rows;
    expect(functions.map(row => row.proname)).toHaveLength(6);
    const definition = (name: string) => functions.find(row => row.proname === name)?.definition;
    expect(definition("start_study_session")).toContain("S2 identity guard");
    expect(definition("start_study_session")).toContain("1800");
    expect(definition("settle_study_session_atomic")).toContain("v_level_up_sp");
    expect(definition("planner_quest_guard")).toContain("PLANNER_EXECUTION_PROTECTED");
    expect(definition("planner_ownership_guard")).toContain("USER_RELEASED");
    expect((await db.query("SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='claim_session_reward_atomic'")).rows[0].count).toBe(0);
  });

  it("keeps Planner records RLS-enabled and inaccessible to browser roles", async () => {
    const rows = (await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname=ANY($1)", [["PlannerPlan", "PlannerRevision", "PlannerQuestLink"]])).rows;
    expect(rows).toHaveLength(3); expect(rows.every(row => row.relrowsecurity)).toBe(true);
    const permissions = (await db.query("SELECT has_table_privilege('anon','\"PlannerPlan\"','SELECT') AS anon_read, has_table_privilege('authenticated','\"PlannerRevision\"','UPDATE') AS browser_write, has_function_privilege('anon','public.start_study_session(integer,integer,integer,integer)','EXECUTE') AS anon_rpc")).rows[0];
    expect(permissions).toEqual({ anon_read: false, browser_write: false, anon_rpc: false });
    await db.query("SET ROLE anon");
    try { await expect(db.query("SELECT public.start_study_session(1,NULL,NULL,0)")).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.query("RESET ROLE"); }
  });

  it("rejects foreign Subject and Goal references at the actual SQL boundary", async () => {
    const owner = await user(db); const stranger = await user(db);
    const subject = (await db.query('INSERT INTO "Subject" ("userId",name,code) VALUES ($1,\'Foreign subject\',$2) RETURNING id', [stranger, randomUUID()])).rows[0].id;
    const goal = (await db.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Foreign goal\',1) RETURNING id', [stranger])).rows[0].id;
    await expect(plan(db, owner, subject)).rejects.toMatchObject({ code: "23514", message: "PLANNER_OWNERSHIP" });
    await expect(plan(db, owner, null, goal)).rejects.toMatchObject({ code: "23514", message: "PLANNER_OWNERSHIP" });
  });

  it("rejects an active revision from a different Plan at deferred commit", async () => {
    const owner = await user(db); const a = await plan(db, owner); const b = await plan(db, owner); const foreignRevision = await revision(db, b);
    await db.query("BEGIN");
    try {
      await db.query('UPDATE "PlannerPlan" SET "activeRevisionId"=$1 WHERE id=$2', [foreignRevision, a]);
      await expect(db.query("COMMIT")).rejects.toMatchObject({ code: "23503" });
    } finally { await rollback(db); }
    expect((await db.query('SELECT "activeRevisionId" FROM "PlannerPlan" WHERE id=$1', [a])).rows[0].activeRevisionId).toBeNull();
  });

  it("prevents mutation of sealed input, educational output and operation identity", async () => {
    const fixture = await linked(db);
    for (const assignment of ['"inputSnapshot"=\'{"changed":true}\'', '"outputSnapshot"=\'{"changed":true}\'', '"operationKey"=\'different-operation-key\'']) {
      await expect(db.query(`UPDATE "PlannerRevision" SET ${assignment} WHERE id=$1`, [fixture.revisionId]))
        .rejects.toMatchObject({ code: "23514", message: "PLANNER_IMMUTABLE" });
    }
  });

  it("allows exactly one immutable confirmation receipt", async () => {
    const fixture = await linked(db);
    await db.query('UPDATE "PlannerRevision" SET "confirmationKey"=$2,"confirmationHash"=$3,"confirmationReceipt"=\'{"questIds":[]}\',"confirmedAt"=now() WHERE id=$1',
      [fixture.revisionId, randomUUID(), "d".repeat(64)]);
    await expect(db.query('UPDATE "PlannerRevision" SET "confirmationReceipt"=\'{"rewritten":true}\' WHERE id=$1', [fixture.revisionId]))
      .rejects.toMatchObject({ code: "23514", message: "PLANNER_RECEIPT_IMMUTABLE" });
  });

  it("blocks generic structural Quest edits without review capability", async () => {
    const fixture = await linked(db);
    await expect(db.query('UPDATE "Quest" SET description=\'Different instructions\' WHERE id=$1', [fixture.questId]))
      .rejects.toMatchObject({ code: "23514", message: "PLANNER_REVIEW_REQUIRED" });
    await expect(db.query('DELETE FROM "Quest" WHERE id=$1', [fixture.questId]))
      .rejects.toMatchObject({ code: "23514", message: "PLANNER_REVIEW_REQUIRED" });
  });

  it("protects a zero-second started Quest through the actual Focus RPC", async () => {
    const fixture = await linked(db);
    const result = (await db.query("SELECT public.start_study_session($1,$2,NULL,0) AS session", [fixture.userId, fixture.questId])).rows[0].session;
    expect(result.durationSeconds).toBe(0);
    expect((await db.query('SELECT status FROM "Quest" WHERE id=$1', [fixture.questId])).rows[0].status).toBe("IN_PROGRESS");
    await db.query("BEGIN");
    try {
      await db.query("SELECT set_config('sylf.planner_manual_quest',$1,true)", [String(fixture.questId)]);
      await expect(db.query('UPDATE "Quest" SET "scheduledFor"=\'2026-10-06\' WHERE id=$1', [fixture.questId]))
        .rejects.toMatchObject({ code: "23514", message: "PLANNER_EXECUTION_PROTECTED" });
    } finally { await rollback(db); }
  });

  it("rejects foreign execution references through the actual start RPC", async () => {
    const fixture = await linked(db); const stranger = await user(db);
    await expect(db.query("SELECT public.start_study_session($1,$2,NULL,0)", [stranger, fixture.questId]))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("preserves a permanent user-release tombstone", async () => {
    const fixture = await linked(db);
    await db.query('UPDATE "PlannerQuestLink" SET disposition=\'USER_RELEASED\',"questId"=NULL,"removedAt"=now() WHERE id=$1', [fixture.linkId]);
    await expect(db.query('UPDATE "PlannerQuestLink" SET disposition=\'LIVE\',"questId"=$2,"removedAt"=NULL WHERE id=$1', [fixture.linkId, fixture.questId]))
      .rejects.toMatchObject({ code: "23514", message: "PLANNER_LINEAGE_IMMUTABLE" });
  });

  it("rolls back ordinary execution writes and Plan pointers together on an injected SQL failure", async () => {
    const owner = await user(db); const planId = await plan(db, owner); const revisionId = await revision(db, planId);
    await db.query("BEGIN");
    try {
      const goalId = (await db.query('INSERT INTO "Goal" ("userId",title,"targetWeeks") VALUES ($1,\'Rollback fixture\',1) RETURNING id', [owner])).rows[0].id;
      await db.query('INSERT INTO "Quest" ("userId","goalId",title) VALUES ($1,$2,\'Rollback work\')', [owner, goalId]);
      await db.query('UPDATE "PlannerPlan" SET "activeRevisionId"=$1,"goalId"=$2 WHERE id=$3', [revisionId, goalId, planId]);
      await expect(db.query("SELECT 1/0")).rejects.toMatchObject({ code: "22012" });
    } finally { await rollback(db); }
    expect((await db.query('SELECT count(*)::int AS count FROM "Quest" WHERE "userId"=$1', [owner])).rows[0].count).toBe(0);
    expect((await db.query('SELECT count(*)::int AS count FROM "Goal" WHERE "userId"=$1', [owner])).rows[0].count).toBe(0);
    expect((await db.query('SELECT "activeRevisionId","goalId" FROM "PlannerPlan" WHERE id=$1', [planId])).rows[0]).toEqual({ activeRevisionId: null, goalId: null });
  });
  it("retires unused historical progression, forge and integer-skill reward bypasses", async () => {
    const signatures=["public.commit_focus_progression(integer,integer,integer,integer,integer,integer,integer)","public.commit_forge_progress(text,integer,integer)","public.unlock_skill_node(integer)"];
    for(const signature of signatures) expect((await db.query("SELECT to_regprocedure($1) AS function",[signature])).rows[0].function).toBeNull();
    expect((await db.query("SELECT to_regprocedure('public.unlock_skill_node_atomic(text,text,integer,text[])') AS function")).rows[0].function).toBeTruthy();
  });

});
