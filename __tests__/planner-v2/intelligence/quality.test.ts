import { describe, it, expect } from "vitest";
import { buildReviewInput, goalForReview, incompleteQuality, validateQualityReview,
  validateQualityVerification, qualityInstruction, verificationHoldback, modelReviewInput } from "@/lib/planner/v2/intelligence/quality";
import { CompilerCheckpointSchema } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { QualitySupportSchema } from "@/lib/planner/v2/intelligence/schemas/quality";
import { hash } from "@/lib/planner/v2/server/database";
import { readCompilerCheckpoint } from "@/lib/planner/v2/intelligence/checkpoints";
import { expandDeclaredSplits, splitInstructionPrefix } from "@/lib/planner/v2/intelligence/blueprint";
import type { GroundedFinding } from "@/lib/planner/v2/intelligence/schemas/quality";
import { checkpointFixture, checkpointAttempt } from "./fixtures";
import { intentFixture, instant } from "../contracts/fixtures";

function fixture() {
  const checkpoint = checkpointFixture(), p = checkpoint.payload;
  if (!("allocation" in p)) throw new Error();
  const goal = goalForReview(intentFixture());
  const context = { plans: [{ planRef: "physics", learning: [{ evidenceId: "weakness", result: "Method selection is uncertain", reliability: "SELF_REPORTED", demonstratesReadiness: false }],
    savedChecks: [{ ref: "saved_check_1", result: "Self-reported difficulty", sourceRevisionDigest: "original-provenance" }],
    research: { claims: [{ claimId: "claim_1", excerpt: "Specific assessment quotation", verification: { support: "SUPPORTED" } }], sources: [{ sourceId: "source_1", authority: "ISSUER_VERIFIED" }] } }] };
  const input = buildReviewInput([{ planRef: "physics", requested: goal, resolved: goal }], context, { ...p, stage: "ALLOCATION" });
  const finding: GroundedFinding = { issueId: "method_gap", category: "MISSING_PREREQUISITE", severity: "BLOCKING", affectedRefs: ["practice01"], basis: "CONCRETE_VIOLATION",
    grounds: [{ ref: "physics/goal", excerpt: intentFixture().outcome }, { ref: "physics/activity/practice01", excerpt: p.blueprints.plans[0].blueprint.activities[0].instructions }],
    evidence: "The requested independent application lacks the identified method prerequisite", consequence: "The student cannot select the required method", requestedResolution: "Teach the method selection before application", requiresAcknowledgement: false };
  return { checkpoint, input, finding, blank: incompleteQuality(checkpoint) };
}

function expandGoals(model: ReturnType<typeof modelReviewInput>) {
  return model.goals.map((goal,i)=>({...goal,resolved:goal.resolved&&typeof goal.resolved==='object'&&'sameAsPath' in goal.resolved&&goal.resolved.sameAsPath===`goals[${i}].requested`?goal.requested:goal.resolved}));
}
describe("independent grounded quality boundary", () => {
  it("loads original goal, raw evidence/provenance, source excerpts and actual schedule independently", () => {
    const f = fixture(); expect(f.input.goals[0].requested).toMatchObject({ outcome: intentFixture().outcome });
    expect(f.input.grounding.find(g => g.ref === "physics/check/saved_check_1")?.text).toContain("original-provenance");
    expect(f.input.grounding.find(g => g.ref === "physics/claim/claim_1")?.text).toContain("Specific assessment quotation");
    expect(f.input.grounding.find(g => g.ref === "allocation")?.text).toContain("2026-10-05");
    expect(qualityInstruction).toContain("Generator explanations are claims to check");
  });
  it("derives a cleared report only from a complete exact selected-target review", () => {
    const f = fixture(); expect(validateQualityReview({ plans: [{ planRef: "physics", issues: [] }] }, f.input, f.blank).reports[0].report.status).toBe("PASSED");
    expect(() => validateQualityReview({ plans: [{ planRef: "foreign", issues: [] }] }, f.input, f.blank)).toThrow();
    expect(() => validateQualityReview({ plans: [{ planRef: "physics", issues: [], status: "PASSED" }] }, f.input, f.blank)).toThrow();
  });
  it("retains concrete IDs, references, evidence, consequence and requested resolution", () => {
    const f = fixture(), r = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank);
    expect(r.reports[0].report).toMatchObject({ status: "BLOCKED", issues: [{ issueId: "method_gap", resolution: "OPEN", verification: null }] });
    expect(r.findings[0].finding.requestedResolution).toBe(f.finding.requestedResolution);
  });
  it("demotes vague more-practice preference without a lexical content rule or repair", () => {
    const f = fixture(); f.finding.basis = "PREFERENCE"; f.finding.evidence = "Needs more practice"; f.finding.requiresAcknowledgement = true;
    const r = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank);
    expect(r.reports[0].report).toMatchObject({ status: "PASSED", requiredAcknowledgements: [], issues: [{ category: "ADVISORY", severity: "ADVISORY" }] });
    expect(f.input.proposal.blueprints.plans[0].blueprint.activities).toHaveLength(1);
  });
  it("retains reasonable uncertainty without inventing remedial work", () => {
    const f = fixture(); f.finding.basis = "REASONABLE_UNCERTAINTY";
    expect(validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank).reports[0].report)
      .toMatchObject({ status: "PASSED", issues: [{ severity: "WARNING", resolution: "ACCEPTED_UNCERTAINTY" }] });
  });
  it("rejects fabricated grounds, unknown references and a blocker supported only by a generator claim", () => {
    const f = fixture(), raw = () => ({ plans: [{ planRef: "physics", issues: [f.finding] }] });
    f.finding.grounds[0].excerpt = "Invented assessment requirement"; expect(() => validateQualityReview(raw(), f.input, f.blank)).toThrow();
    f.finding.grounds.shift(); expect(() => validateQualityReview(raw(), f.input, f.blank)).toThrow(/blocker/);
    f.finding.basis = "PREFERENCE"; f.finding.affectedRefs = ["unknown"]; expect(() => validateQualityReview(raw(), f.input, f.blank)).toThrow(/unknown/);
  });
  it("rejects duplicate issue IDs across joint targets", () => {
    const f = fixture(); f.input.goals.push({ ...f.input.goals[0], planRef: "maths" });
    const p = structuredClone(f.input.proposal.blueprints.plans[0]); p.planRef = "maths"; f.input.proposal.blueprints.plans.push(p);
    expect(() => validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }, { planRef: "maths", issues: [f.finding] }] }, f.input, f.blank)).toThrow(/unique/);
  });
  it("warnings require only their exact named acknowledgment, not consent to mutation", () => {
    const f = fixture(); f.finding.severity = "WARNING"; f.finding.requiresAcknowledgement = true;
    const r = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank).reports[0].report;
    expect(r.status).toBe("PASSED"); expect(r.requiredAcknowledgements).toEqual(["method_gap"]);
  });
  it("verifies every exact issue once and binds resolution to concrete repaired evidence", () => {
    const f = fixture(), previous = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank).reports;
    f.input.stage = "VERIFICATION"; f.input.repairIssueIds = ["method_gap"];
    const resolution = { issueId: "method_gap", result: "RESOLVED", explanation: "The method is now explained before the allocated application", grounds: f.finding.grounds };
    const r = validateQualityVerification({ plans: [{ planRef: "physics", resolutions: [resolution], newIssues: [] }] }, f.input, previous, f.blank, instant);
    expect(r.reports[0].report).toMatchObject({ status: "PASSED", issues: [{ issueId: "method_gap", resolution: "REPAIRED", verification: { result: "RESOLVED", verifiedAt: instant } }] });
    for (const resolutions of [[], [{ ...resolution, issueId: "renamed" }], [resolution, resolution]]) expect(() => validateQualityVerification({ plans: [{ planRef: "physics", resolutions, newIssues: [] }] }, f.input, previous, f.blank, instant)).toThrow();
  });
  it("a false repair success, remaining blocker or new blocker cannot pass", () => {
    const f = fixture(), previous = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding] }] }, f.input, f.blank).reports;
    f.input.stage = "VERIFICATION"; f.input.repairIssueIds = ["method_gap"];
    const resolution = { issueId: "method_gap", result: "UNRESOLVED", explanation: "The same missing prerequisite remains", grounds: f.finding.grounds };
    expect(validateQualityVerification({ plans: [{ planRef: "physics", resolutions: [resolution], newIssues: [] }] }, f.input, previous, f.blank, instant).reports[0].report.status).toBe("BLOCKED");
    resolution.result = "RESOLVED";
    expect(validateQualityVerification({ plans: [{ planRef: "physics", resolutions: [resolution], newIssues: [{ ...f.finding, issueId: "new_blocker" }] }] }, f.input, previous, f.blank, instant).reports[0].report.status).toBe("BLOCKED");
    resolution.grounds = [{ ref: "physics/activity/practice01", excerpt: "An edit that is not present" }];
    expect(() => validateQualityVerification({ plans: [{ planRef: "physics", resolutions: [resolution], newIssues: [] }] }, f.input, previous, f.blank, instant)).toThrow();
  });
  it("verifies only named blockers while retaining original advisory findings without claiming they were repaired", () => {
    const f = fixture(), advisory = { ...f.finding, issueId: "advice", basis: "PREFERENCE" as const, severity: "ADVISORY" as const };
    const review = validateQualityReview({ plans: [{ planRef: "physics", issues: [f.finding, advisory] }] }, f.input, f.blank);
    f.input.stage = "VERIFICATION"; f.input.repairIssueIds = ["method_gap"]; f.input.originalFindings = review.findings;
    const resolution = { issueId: "method_gap", result: "RESOLVED", explanation: "The named discrepancy is resolved in the actual proposal", grounds: f.finding.grounds };
    const raw = { plans: [{ planRef: "physics", resolutions: [resolution], newIssues: [] }] };
    const report = validateQualityVerification(raw, f.input, review.reports, f.blank, instant).reports[0].report;
    expect(report.issues.find(i => i.issueId === "advice")).toMatchObject({ severity: "ADVISORY", resolution: "OPEN", verification: null });
    expect(report.issues.find(i => i.issueId === "method_gap")?.verification?.result).toBe("RESOLVED");
    expect(() => validateQualityVerification({ plans: [{ ...raw.plans[0], resolutions: [resolution, { ...resolution, issueId: "advice" }] }] }, f.input, review.reports, f.blank, instant)).toThrow(/exact named/);
  });
  it("a pending quality checkpoint cannot contain a passed report", () => {
    const f = fixture(); if (!("quality" in f.checkpoint.payload)) throw new Error();
    f.checkpoint.payload.reviewSupport = { phase: "REVIEW_PENDING", identityDigest:"d".repeat(64), reviewInputDigest: "a".repeat(64), findings: [] };
    expect(CompilerCheckpointSchema.safeParse(f.checkpoint).success).toBe(false);
    f.checkpoint.payload.quality = f.blank; expect(CompilerCheckpointSchema.safeParse(f.checkpoint).success).toBe(true);
  });
  it("reserves a separate verification call and growth allowance before repair", () => {
    const f = fixture(); const hold = verificationHoldback(f.input, new AbortController().signal);
    expect(hold.outputTokens).toBe(4096); expect(hold.inputTokens).toBeGreaterThan(8 * 1024);
  });
  it("preserves full facts and split receipts once while grounding paths remove only duplicate text", () => {
    const f=fixture(),p=f.input.proposal;
    p.planning={detail:{days:14,checkpoint:'Specific split checkpoint'},tradeOffExplanation:'A meaningful declared split',adaptation:'NOT_REQUESTED',forecasts:[],splits:[{planRef:'physics',originalRef:'original_task',pieceRefs:['part_a','part_b'],originalActivity:{...p.blueprints.plans[0].blueprint.activities[0],localId:'original_task'},requiresReview:true}]};
    const input=buildReviewInput(f.input.goals,f.input.context,p),model=modelReviewInput(input);
    expect(model.context).toEqual(input.context);expect({...model.proposal,envelope:input.proposal.envelope}).toEqual(input.proposal);expect(expandGoals(model)).toEqual(input.goals);
    expect(input.grounding.find(g=>g.ref==='physics/split/original_task')?.text).toContain('requiresReview');
    expect(model.grounding.find(g=>g.ref==='physics/split/original_task')).toEqual({ref:'physics/split/original_task',kind:'PROPOSAL',path:'proposal.planning.splits[0]'});
  });
  it("round-trips every calendar fact, unknown field and ordered day without trimming provenance or protected work", () => {
    const f=fixture();
    const days=[{date:'2026-10-05',ceilingMinutes:60,otherCommittedMinutes:10,protectedTargetMinutes:20,recoveryMinutes:0,availableMinutes:30,excluded:false,futureFact:'owned'},
      {date:'2026-10-06',ceilingMinutes:60,otherCommittedMinutes:0,protectedTargetMinutes:0,recoveryMinutes:5,availableMinutes:0,excluded:true,futureFact:'owned'}];
    const context={...(f.input.context as object),envelope:{window:{end:'2026-11-01'},days,protectedExecution:[{ref:'running',minutes:20}]}};
    const input={...f.input,context,proposal:{...f.input.proposal,envelope:{...f.input.proposal.envelope,days}}};
    const original=structuredClone(input),model=modelReviewInput(input);
    const expand=(value:unknown)=>{const envelope=value as {days:{constantFields:Record<string,unknown>;columns:string[];rows:unknown[][]}};
      return {...envelope,days:envelope.days.rows.map(row=>({...envelope.days.constantFields,...Object.fromEntries(envelope.days.columns.map((key,i)=>[key,row[i]]))}))};};
    expect({...model.context as object,envelope:expand((model.context as {envelope:unknown}).envelope)}).toEqual(context);
    expect({...model.proposal,envelope:expand(model.proposal.envelope)}).toEqual(input.proposal);
    expect(expandGoals(model)).toEqual(input.goals);expect(input).toEqual(original);
    expect(JSON.stringify(model)).toContain('original-provenance');expect(JSON.stringify(model)).toContain('Specific assessment quotation');
  });
  it("retains irregular calendars verbatim and reduces repeated transport bytes while preserving the verification margin", () => {
    const f=fixture(),signal=new AbortController().signal;
    f.input.context={envelope:{days:[{date:'first',excluded:false},{date:'second',excluded:true,protectedTargetMinutes:20}]}};
    expect(modelReviewInput(f.input).context).toEqual(f.input.context);
    const days=Array.from({length:28},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,ceilingMinutes:60,otherCommittedMinutes:0,protectedTargetMinutes:0,recoveryMinutes:0,availableMinutes:60,excluded:false}));
    f.input.context={envelope:{days}};f.input.proposal.envelope.days=days;
    const model=modelReviewInput(f.input),uncompressed={...f.input,grounding:model.grounding};
    expect(Buffer.byteLength(JSON.stringify(model))).toBeLessThan(Buffer.byteLength(JSON.stringify(uncompressed))-4000);
    const reserve=verificationHoldback(f.input,signal);
    expect(reserve.outputTokens).toBe(4096);expect(reserve.inputTokens).toBeGreaterThan(8192);
  });
  it("grounds the actual enforced shared edge without inventing a foreign same-Plan dependency", () => {
    const f=fixture();
    const dependent=structuredClone(f.input.proposal.blueprints.plans[0]);
    dependent.planRef='maths';dependent.blueprint.activities[0]={...dependent.blueprint.activities[0],localId:'report',title:'Use the shared method in a report',purpose:'Apply the prerequisite to the distinct report outcome',instructions:'Produce the report using the previously learned method',completionCriterion:'The report applies the method correctly',hardDependencies:[]};
    dependent.digest=hash('blueprint',dependent.blueprint);
    f.input.proposal.blueprints.plans.push(dependent);
    f.input.goals.push({...f.input.goals[0],planRef:'maths'});
    f.input.proposal.blueprints.sharedDependencies=[{prerequisite:{planRef:'physics',activityId:'practice01'},dependent:{planRef:'maths',activityId:'report'},strength:'HARD',reason:'Reuse the one owned prerequisite'}];
    const input=buildReviewInput(f.input.goals,f.input.context,f.input.proposal),model=modelReviewInput(input);
    expect(input.grounding.find(g=>g.ref==='shared_dependency_1')).toMatchObject({kind:'PROPOSAL',path:'proposal.blueprints.sharedDependencies[0]',text:JSON.stringify(input.proposal.blueprints.sharedDependencies[0])});
    expect(model.proposal.blueprints.sharedDependencies).toEqual(input.proposal.blueprints.sharedDependencies);
    expect(model.proposal.blueprints.plans[0].blueprint.activities[0].hardDependencies).toEqual(f.input.proposal.blueprints.plans[0].blueprint.activities[0].hardDependencies);
    expect(model.proposal.blueprints.plans[1].blueprint.activities[0].hardDependencies).toEqual([]);
  });
  it("round-trips all split instruction segments without changing criteria, effort, dependencies or source receipts", () => {
    const f=fixture(),before=f.input.proposal.blueprints.plans[0].blueprint.activities[0];
    const original={...before,timeboxMinutes:60,instructions:'Use the learner’s original "circuit" artifact.\nKeep the source quotation, measurements and corrections exactly.\n'+before.instructions.repeat(8),
      splitPoints:[{afterMinutes:20,completionCriterion:'Explain the setup'},{afterMinutes:40,completionCriterion:'Record the measurements'}]};
    f.input.proposal.blueprints.plans[0].blueprint.activities=[original];
    const expanded=expandDeclaredSplits(f.input.proposal.blueprints,{...f.input.proposal.envelope,days:f.input.proposal.envelope.days.map(d=>({...d,availableMinutes:20}))});
    f.input.proposal.blueprints=expanded.snapshot;
    f.input.proposal.planning={detail:{days:14,checkpoint:'The original demonstrated outcome'},tradeOffExplanation:'Continue only at declared boundaries',adaptation:'NOT_REQUESTED',forecasts:[],splits:expanded.splits};
    const input=buildReviewInput(f.input.goals,f.input.context,f.input.proposal),snapshot=structuredClone(input),model=modelReviewInput(input);
    const activities=model.proposal.blueprints.plans[0].blueprint.activities;
    const restored=activities.map(a=>({...a,instructions:typeof a.instructions==='string'?a.instructions:a.instructions.textSegments.map(segment=>
      'literal' in segment?segment.literal:model.proposal.planning!.splits[0].originalActivity.instructions).join('')}));
    expect(restored).toEqual(input.proposal.blueprints.plans[0].blueprint.activities);
    expect(model.proposal.planning!.splits).toEqual(expanded.splits);expect(input).toEqual(snapshot);
    expect(activities.map(a=>typeof a.instructions==='string'?a.instructions:a.instructions.textSegments[1])).toEqual(Array(3).fill({sameAsPath:'proposal.planning.splits[0].originalActivity.instructions'}));
    expect(restored[1].instructions).toBe(splitInstructionPrefix(original.localId,1,3)+original.instructions);
    expect(input.grounding.find(g=>g.ref===`physics/activity/${restored[1].localId}`)?.text).toContain('Continue the same task');
    expect(Buffer.byteLength(JSON.stringify(model))).toBeLessThan(Buffer.byteLength(JSON.stringify({...model,proposal:{...model.proposal,blueprints:input.proposal.blueprints}})));
  });
  it("leaves changed or foreign split instructions verbatim instead of referring to a merely similar body", () => {
    const f=fixture(),p=f.input.proposal,activity=p.blueprints.plans[0].blueprint.activities[0];
    const text=splitInstructionPrefix('source_task',0,2)+activity.instructions;
    p.planning={detail:{days:14,checkpoint:'Owned split result'},tradeOffExplanation:'Only exact copies may be referenced',adaptation:'NOT_REQUESTED',forecasts:[],splits:[{planRef:'physics',originalRef:'source_task',pieceRefs:[activity.localId,'part_b'],originalActivity:{...activity,localId:'source_task'},requiresReview:true}]};
    p.blueprints.plans[0].blueprint.activities[0]={...activity,instructions:text+' A changed requirement.'};
    const other=structuredClone(p.blueprints.plans[0]);other.planRef='other';other.blueprint.activities[0].instructions=text;p.blueprints.plans.push(other);
    const model=modelReviewInput(f.input);
    expect(model.proposal.blueprints.plans[0].blueprint.activities[0].instructions).toBe(text+' A changed requirement.');
    expect(model.proposal.blueprints.plans[1].blueprint.activities[0].instructions).toBe(text);
    expect(model.proposal.planning!.splits[0].originalActivity.instructions).toBe(activity.instructions);
  });
  it("losslessly references identical original/resolved facts while preserving their roles and grounds", () => {
    const f=fixture(),before=structuredClone(f.input),model=modelReviewInput(f.input);
    expect(model.goals[0].resolved).toEqual({sameAsPath:'goals[0].requested'});
    expect({...model.goals[0],resolved:model.goals[0].requested}).toEqual(before.goals[0]);
    expect(f.input).toEqual(before);
    const finding={...f.finding,grounds:[{ref:'physics/accepted',excerpt:intentFixture().outcome},f.finding.grounds[1]]};
    expect(validateQualityReview({plans:[{planRef:'physics',issues:[finding]}]},f.input,f.blank).reports[0].report.status).toBe('BLOCKED');
    expect(Buffer.byteLength(JSON.stringify(model))).toBeLessThan(Buffer.byteLength(JSON.stringify({...model,goals:f.input.goals}))-200);
  });
  it("never aliases a resolved goal with changed scope, exclusions or provenance", () => {
    const f=fixture(),requested=f.input.goals[0].requested;
    f.input.goals[0].resolved={...(requested as Record<string,unknown>),scope:[{ref:'scope01',inclusion:'EXCLUDED',sourceClaimIds:['owned_claim']}],provenance:{contentHash:'verified-source'}};
    const model=modelReviewInput(f.input);
    expect(model.goals[0].requested).toEqual(requested);
    expect(model.goals[0].resolved).toEqual(f.input.goals[0].resolved);
    expect(model.goals[0].resolved).not.toHaveProperty('sameAsPath');
  });
  it("requires accepted repair bytes and matching content receipts before recovery", () => {
    const support={phase:'REPAIR_ACCEPTED',identityDigest:'d'.repeat(64),reviewInputDigest:'a'.repeat(64),repairInputDigest:'b'.repeat(64),findings:[],verificationReserve:{inputTokens:16000,outputTokens:4096}};
    expect(QualitySupportSchema.safeParse(support).success).toBe(false);
    expect(QualitySupportSchema.safeParse({...support,acceptedRepair:'á'.repeat(17000),acceptedRepairDigest:'c'.repeat(64)}).success).toBe(false);
    const f=fixture(),review=validateQualityReview({plans:[{planRef:'physics',issues:[f.finding]}]},f.input,f.blank);
    if(!('quality' in f.checkpoint.payload))throw new Error();f.checkpoint.repairs=1;f.checkpoint.repairIssueIds=['method_gap'];
    f.checkpoint.payload={...f.checkpoint.payload,stage:'REPAIR',quality:review.reports.map(q=>({...q,report:{...q.report,status:'INCOMPLETE'}})),reviewSupport:{...support,phase:'REPAIR_ACCEPTED',findings:review.findings,acceptedRepair:'{}',acceptedRepairDigest:hash('accepted-repair','different')}};
    expect(readCompilerCheckpoint(f.checkpoint,checkpointAttempt(f.checkpoint),f.checkpoint.binding)).toEqual({ok:false,reason:'ARTIFACT_DIGEST_MISMATCH'});
  });
});
