/** Selected only by the one-case execution runner, never by ordinary regressions. */
import { afterAll,beforeAll,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import pg from "pg";
import { connect } from "./database";
import { runC01 } from "@/scripts/qa/planner-phase-c/c01-journey";
let client:pg.Client,pool:pg.Pool;
beforeAll(async()=>{client=await connect();pool=new pg.Pool({connectionString:process.env.PLANNER_TEST_DATABASE_URL,max:6});});
afterAll(async()=>{await pool?.end();await client?.end();});
it("retains exactly one owned C01 journey and its actual finance under the approved execution boundary",async()=>{
  const mode=process.env.SYLF_C01_MODE;
  if(!["LIVE","SCRIPTED","LONG_REVIEW"].includes(mode??""))throw new Error("EXPLICIT_EXECUTION_MODE_REQUIRED");
  const auth=mode==="LIVE"?JSON.parse(readFileSync(process.env.SYLF_C01_AUTH!,"utf8")):null;
  if(mode==="LIVE"&&(!auth?.approved||auth.caseId!=="C01"||auth.ceilingUsd!==1.75||auth.repetitions!==1))throw new Error("LIVE_AUTHORIZATION_REQUIRED");
  const result=await runC01(client,pool,{mode:mode as "LIVE"|"SCRIPTED"|"LONG_REVIEW",output:process.env.SYLF_C01_OUTPUT!,runId:auth?.runId??`unpaid-${mode}`,privateKeyPath:auth?.privateKeyPath,ceilingUsd:1.75,approved:auth?.approved??false});
  expect(result.unselectedTaskPreserved).toBe(true);
  expect(result.attempts.length).toBeGreaterThan(0);
  expect(result.attempts.every(a=>a.artifact.budget.rootRequestId===result.rootRequestId)).toBe(true);
  expect(result.physicalRequests).toBeLessThanOrEqual(48);
  if(mode!=="LIVE")expect(result.paidCalls).toBe(0);
  if(mode==="SCRIPTED"){expect(result.attempts.at(-1)?.artifact.state).toBe("SUCCEEDED");expect(result.apply).toMatchObject({status:"APPLIED",replayMatched:true});}
  if(mode==="LONG_REVIEW"){expect(result.stopReason).toBe("REVIEW_CALENDAR_EXPIRED_AFTER_COMPLETE_RESPONSE");expect(result.attempts.some(a=>a.artifact.state==="CANCELLED")).toBe(true);expect(result.revisions).toEqual([]);expect(result.apply).toBeNull();expect(result.usageLogs.filter(r=>r.reservation?.roleCall?.role==="REVIEWER")).toHaveLength(1);}
},14580000);
