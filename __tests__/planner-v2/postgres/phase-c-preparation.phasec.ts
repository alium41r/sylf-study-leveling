/** Explicitly selected scripted rehearsal; never a paid/live test. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { connect, user } from "./database";
import { intentFixture } from "./intent-fixture";
import { CanonicalIntentV2Schema, PlanChangeSetV2Schema } from "@/lib/planner/v2/contracts";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { GenerationService } from "@/lib/planner/v2/server/generation";
import { IntentService } from "@/lib/planner/v2/server/intents";
import { AttemptService, loadAttempt } from "@/lib/planner/v2/server/attempts";
import { DocumentRepository } from "@/lib/planner/v2/server/documents";
import { ResearchService } from "@/lib/planner/v2/server/research";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { createCompilerHandlers } from "@/lib/planner/v2/server/compiler";
import { ApplyService } from "@/lib/planner/v2/server/apply";
import { PlannerFoundationService } from "@/lib/planner/v2/server/foundation";
import { offlineResourcePolicy } from "@/lib/planner/v2/intelligence/foundation/role-calls";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays, localTimeToISO } from "@/lib/calendar/dates";
import { naturalProposal } from "../intelligence/natural-learning-fixture";
import type { LearningInput } from "@/lib/planner/v2/intelligence/schemas/natural-learning";
import type { StrategyDocument } from "@/lib/planner/v2/intelligence/foundation/contracts";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import { funding, modelPacket, reportPath } from "../../../scripts/qa/planner-phase-c/prepare.mjs";

let client: pg.Client, pool: pg.Pool;
beforeAll(async () => { client = await connect(); pool = new pg.Pool({ connectionString: process.env.PLANNER_TEST_DATABASE_URL, max: 6 }); });
afterAll(async () => { await pool?.end(); await client?.end(); });
it("rehearses the frozen two-subject pilot through real research, worker, capacity, strategy, translation, review, publication and disposable Apply with no external requests", async () => {
  expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  const bank = JSON.parse(readFileSync(`${reportPath}/CASE_BANK.json`, "utf8")), c = modelPacket(bank.cases.find((x: { id: string }) => x.id === "C01"));
  const owner = await user(client), db = new PlannerDatabase(pool), attempts = new AttemptService(db), timezone = c.availability.timezone;
  await client.query('UPDATE "User" SET timezone=$2,"restDays"=\'{}\' WHERE id=$1', [owner, timezone]);
  const today = TimezoneService.getUserLocalDate(timezone), anchor = addDays(today, 1);
  const frozenPilot = JSON.parse(readFileSync(`${reportPath}/PILOT_INPUT.json`, "utf8"));
  expect(anchor).toBe(frozenPilot.anchor);
  const windows = { schemaVersion: 1, weekly: c.availability.studyWindows, overrides: [{ date: today, windows: [] }] };
  const intents = c.goals.map((g: { title: string; outcome: string; deadlineOffsetDays: number; scope: string[] }) => CanonicalIntentV2Schema.parse({
    ...intentFixture(), title: g.title, outcome: g.outcome, policy: "GENERAL", policySelection: "USER_OVERRIDE",
    deadline: { kind: "FIXED", date: addDays(anchor, g.deadlineOffsetDays), examDayStudyAllowed: false },
    scope: g.scope.map((title, i) => ({ scopeKey: randomUUID(), modelRef: `scope_${i + 1}`, title, parentKey: null, inclusion: "REQUESTED", sourceClaimIds: [] })),
    availability: { ...c.availability, studyWindows: windows },
    preferences: { pacing: "SPREAD", desiredIntensity: "MODERATE", preferredTimeboxMinutes: 40, maximumTimeboxMinutes: 60 },
  }));
  const selected = await Promise.all(intents.map((intent: ReturnType<typeof CanonicalIntentV2Schema.parse>) => new IntentService(db).create(owner, randomUUID(), intent)));
  expect(intents.map((intent: ReturnType<typeof CanonicalIntentV2Schema.parse>) => intent.deadline)).toEqual(frozenPilot.goals.map((g: { deadline: unknown }) => g.deadline));
  const bytes = new Map<string, Uint8Array>(), documents = new DocumentRepository(db, { write: async (path, value) => { bytes.set(path, value); }, read: async path => bytes.get(path)!, remove: async path => { bytes.delete(path); } });
  const uploaded = [];
  for (const m of c.materials) uploaded.push(await documents.upload(owner, selected[0].plan.id, randomUUID(), m.title, "text/plain", Buffer.from(m.text)));
  let events = 0;
  for (let i = 0; i < 28; i++) {
    const date = addDays(anchor, i), weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const event of c.calendar.filter((e: { weekday: number }) => e.weekday === weekday)) {
      const time = (m: number) => localTimeToISO(date, `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, timezone);
      await client.query('INSERT INTO "CalendarEvent" (id,"userId",title,"allDay","startDate","endDate","startsAt","endsAt",timezone,"updatedAt") VALUES ($1,$2,$3,false,$4,$4,$5,$6,$7,now())', [randomUUID(), owner, event.title, date, time(event.startMinute), time(event.endMinute), timezone]); events++;
    }
  }
  const englishDate = Array.from({ length: 7 }, (_, i) => addDays(anchor, i)).find(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 0)!;
  const english = await db.coordinated(owner, async sql => (await sql.query('INSERT INTO "Quest" ("userId",title,description,status,"scheduledFor","targetMinutes","requiredMinutes") VALUES ($1,\'English reading submission\',\'Keep this unselected commitment\',\'PENDING\',$2,35,35) RETURNING *', [owner, englishDate])).rows[0]);
  const { authorizationDigest: _authorization, ...resources } = offlineResourcePolicy("a".repeat(64), randomUUID()); void _authorization;
  resources.journeyVersion = 1; resources.root = { calls: funding.maxCalls, inputUnits: funding.inputUnits, completionTokens: funding.completionTokens }; resources.processingMs = funding.processingMs;
  for (const role of Object.values(resources.roles)) { const held = role.holdback.calls; role.call.inputUnits = funding.roleInputUnits; role.call.completionTokens = funding.roleCompletionTokens; role.holdback.inputUnits = held * funding.roleInputUnits; role.holdback.completionTokens = held * funding.roleCompletionTokens; }
  resources.researchTools = { researchQueries: 1, fetchAttempts: 1, selectedSourceCharacters: 500000, extractedPages: 1000, ocrPages: 0, followUps: 100 };
  const admitted = await new GenerationService(db, { compilerVersion: 2, resources }).accept(owner, { schemaVersion: 2, requestKey: randomUUID(),
    text: c.acceptedInstructions + "\nStudent context: " + JSON.stringify(c.student), researchRequested: true, documentIds: uploaded.map(d => d.documentId),
    targets: selected.map(s => ({ kind: "EXISTING", planId: s.plan.id, expectedIntentVersionId: s.intent.intentVersionId, expectedPlanningVersion: 0, baseActiveRevisionId: null })) });
  const trace: { role: string; inputBytes: number; content: string }[] = [];
  const strategy = `Scripted offline rehearsal only; this is not a live educational-quality result.\n\nChemistry: use the teacher packet to correct mass/molar-mass, volume conversion and reaction-extent errors; justify the units and independently solve a changed example before stopping. Do not infer mastery from video time.\n\nBiology: explain the direction and sign of mass change, distinguish active transport energy, control an enzyme investigation and separate observations from mechanisms. Use the actual packet and an independent changed-data check. Preserve both fixed deadlines and Friday rest.\n\nIf independent explanation fails, remediate that specific error conditionally. Do not turn every optional branch into compulsory work.`;
  const adapter: LLMAdapter = { generateResponse: async (messages, instruction) => {
    const packet = JSON.parse(messages[0].content!), role = instruction.startsWith("Independently") ? "VERIFICATION" : instruction.startsWith("Check the complete") ? "SYNTHESIS" : instruction.includes("You are Sylf's Research & Understanding role.") ? "RESEARCH" : instruction.startsWith("You are Sylf's DeepSeek") ? "STRATEGIST" : instruction.startsWith("You are Sylf's independent educational reviewer") ? "REVIEWER" : "TRANSLATOR";
    trace.push({ role, inputBytes: Buffer.byteLength(JSON.stringify(messages) + instruction), content: JSON.stringify(packet) });
    const batches = [{ planRef: "plan_1", sourceRefs: c.materials.map((_: unknown, i: number) => `source_${i + 1}`), extraction: { identities: [], claims: c.materials.map((m: { text: string }, i: number) => ({ sourceId: `source_${i + 1}`, statement: m.text.split(". ")[0] + ".", excerpt: m.text.split(". ")[0] + ".", anchor: { section: "Document" }, kind: "RESOURCE" })), completeSourceIds: [], gaps: [], answer: "The supplied teacher materials and actual diagnostic are retained for both selected subjects." } }];
    let value: unknown;
    if (role === "RESEARCH") value = { action: "COMPLETE", summary: { goals: c.goals.map((g: { outcome: string }) => g.outcome).join("; "), background: c.student.background, strengths: "Some elementary responses are correct; full independent transfer remains uncertain.", weaknesses: "The supplied diagnostic identifies chemical-method and biological-explanation errors.", resources: "The three actual uploaded packets", constraints: "Fixed deadlines, native commitments, Friday rest and shared capacity", preferences: "Meaningful independent application; no filler", uncertainty: "Self-report and study time do not establish mastery." }, batches, unresolved: [] };
    else if (role === "VERIFICATION") value = { claims: packet.candidates.map((x: { claimId: string }) => ({ claimId: x.claimId, support: "SUPPORTED", applicability: "MATCHED", reason: "The exact source excerpt is present in the accepted original packet." })), identities: [], completeSourceIds: [], conflicts: [], answer: "The original packets are applicable resources, not external-board verification.", scopeBindings: packet.candidates.map((x: { claimId: string }) => ({ claimId: x.claimId, scopeRefs: [], disposition: "RESOURCE_ONLY" })) };
    else if (role === "SYNTHESIS") value = { supported: true, explanation: "Original resources, diagnostic work, claims and uncertainty are distinct.", issues: [] };
    else if (role === "STRATEGIST") value = strategy;
    else if (role === "TRANSLATOR") { const response = naturalProposal(packet.ownedLearning as LearningInput, packet.strategy as StrategyDocument); response.proposal.detail.days = 28; for (const [i, plan] of response.proposal.plans.entries()) { plan.strategy.outcome = c.goals[i].outcome; plan.strategy.explanation = "Scripted interface rehearsal; no educational acceptance claim."; plan.activities[0].title = `Independent ${i === 0 ? "chemistry" : "biology"} application`; plan.activities[0].purpose = "Apply the actual teacher material independently."; plan.activities[0].instructions = strategy.split("\n\n")[i + 1]; plan.activities[0].completionCriterion = "Justify the method and explain a changed-data answer without copying the worked solution."; } value = response; }
    else value = { plans: packet.input.goals.map((g: { planRef: string }) => ({ planRef: g.planRef, issues: [] })), routes: [], dispositions: [], verdict: "APPROVED", completeResultInspected: true, explanation: "Scripted mechanical verdict, not independent educational acceptance.", next: null, questions: [] };
    return { text: typeof value === "string" ? value : JSON.stringify(value), model: "deepseek-flash", fingerprint: "scripted-phase-c-rehearsal", finishReason: "STOP", usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200, reasoningTokens: 50, cacheHitTokens: 0 } };
  } };
  let externalRequests = 0; const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalRequests++; throw new Error("SCRIPTED_REHEARSAL_EXTERNAL_REQUEST_FORBIDDEN"); };
  const provider = { adapter: () => adapter }, research = new ResearchService(attempts, { provider, documents, search: null, fetch: async () => { throw new Error("WEB_PERMISSION_ABSENT"); } });
  const worker = new PlannerWorker(attempts, createCompilerHandlers(attempts, { provider, research }), () => {});
  try {
    await worker.tick(); const end = Date.now() + 60000;
    for (;;) { const current = await attempts.read(owner, admitted.attempt.attemptId); if (!["RUNNING", "QUEUED"].includes(current.state)) break; if (Date.now() >= end) throw new Error("SCRIPTED_WORKER_NOT_FINISHED"); await new Promise(r => setTimeout(r, 50)); }
    const stored = await db.coordinated(owner, sql => loadAttempt(sql, owner, admitted.attempt.attemptId)); expect(stored.attempt.error).toBeNull(); expect(stored.attempt.state).toBe("SUCCEEDED");
    const change = PlanChangeSetV2Schema.parse(stored.payload.changeSet); expect(change.targets).toHaveLength(2);
    const applied = await new ApplyService(db, undefined, documents).apply(owner, { attemptId: stored.attempt.attemptId, changeSetId: change.changeSetId, acknowledgements: change.quality.requiredAcknowledgements });
    expect(await new ApplyService(db, undefined, documents).apply(owner, { attemptId: stored.attempt.attemptId, changeSetId: change.changeSetId, acknowledgements: change.quality.requiredAcknowledgements })).toEqual(applied);
    expect((await client.query('SELECT * FROM "Quest" WHERE id=$1', [english.id])).rows[0]).toEqual(english);
    const archive = (await new PlannerFoundationService(attempts).read(owner, stored.attempt.attemptId)).archive;
    const capacities = Object.values(archive.entries).flatMap(a => a.kind === "CAPACITY" ? [a] : []);
    const capacity = capacities.find(a => !capacities.some(next => next.value.schemaVersion === 2 && next.value.previous?.id === a.id));
    if (!capacity || capacity.value.schemaVersion !== 2 || !capacity.value.constraints) throw new Error("PILOT_CAPACITY_EVIDENCE_REQUIRED");
    expect(Object.values(archive.entries).filter(a => a.kind === "STRATEGY")).toHaveLength(1);
    expect(Object.values(archive.entries).some(a => a.kind === "REVIEW" && a.value.schemaVersion === 2 && a.value.verdict === "APPROVED")).toBe(true);
    expect(trace.map(t => t.role)).toEqual(expect.arrayContaining(["RESEARCH", "VERIFICATION", "SYNTHESIS", "STRATEGIST", "TRANSLATOR", "REVIEWER"]));
    expect(Math.max(...trace.map(t => t.inputBytes))).toBeLessThan(funding.roleInputUnits); expect(externalRequests).toBe(0);
    const manifest = { schemaVersion: 1, status: "SCRIPTED_REHEARSAL_PASSED", educationalConclusion: "NONE", paidCalls: 0, externalRequests, compilerVersion: 2, journeyVersion: 1, anchor, targets: change.targets.length, uploadedMaterialHashes: uploaded.map(d => d.contentHash), calendarEvents: events, unselectedTaskPreserved: true, appliedAndReplayed: true, capacityEvidence: { window: capacity.value.constraints.window, weeklyCeilingMinutes: capacity.value.constraints.weeklyCeilingMinutes, days: capacity.value.constraints.days }, roleTrace: trace.map(t => ({ role: t.role, inputBytes: t.inputBytes })), caseBankSha256: createHash("sha256").update(readFileSync(`${reportPath}/CASE_BANK.json`)).digest("hex") };
    // The historical harness copies its complete evidence directory out of this disposable source tree.
    writeFileSync("documentation/planner/reports/2026-10-25-ai-first-phase-a/evidence/postgres/phase-c-rehearsal.json", JSON.stringify(manifest, null, 2) + "\n");
  } finally { await worker.shutdown(); globalThis.fetch = originalFetch; const current = await attempts.read(owner, admitted.attempt.attemptId); if (["RUNNING", "QUEUED", "NEEDS_DECISION"].includes(current.state)) await attempts.cancel(owner, current.attemptId); }
}, 90000);
