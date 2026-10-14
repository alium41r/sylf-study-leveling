import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync,spawnSync } from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const directory=path.join(root,"documentation/planner/reports/2026-10-03-phase-2");
const evidence=path.join(directory,"evidence");
const baseline=JSON.parse(fs.readFileSync(path.join(evidence,"step6-baseline.json"),"utf8"));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"sylf-planner-step6-gate-"));
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
const sourceSha=file=>sha(fs.readFileSync(path.join(root,file)));
const edits=[...["attempts","intents","web","research","context","revisions"].map(n=>`lib/planner/v2/server/${n}.ts`),"app/api/planner/generate/route.ts","lib/planner/v2/intelligence/context.ts","lib/planner/v2/intelligence/research-verification.ts","__tests__/planner-v2/intelligence/research-verification.test.ts","__tests__/planner-v2/postgres/compiler-quality.postgres.ts","lib/planner/v2/intelligence/blueprint.ts","lib/planner/v2/intelligence/quality.ts","__tests__/planner-v2/intelligence/quality.test.ts","__tests__/planner-v2/intelligence/blueprint.test.ts","lib/ai/providers/gemini.ts","lib/ai/providers/deepseek.ts","lib/ai/providers/types.ts","__tests__/ai/provider-contract.test.ts","lib/planner/v2/intelligence/provider.ts","__tests__/planner-v2/intelligence/provider.test.ts","__tests__/planner-v2/intelligence/allocator.test.ts","lib/planner/v2/intelligence/allocator.ts","lib/planner/v2/intelligence/research-cache.ts","lib/planner/v2/server/learning.ts","__tests__/planner-v2/postgres/learning-allocation.postgres.ts",
 "__tests__/planner-v2/postgres/intelligence-boundary.postgres.ts","__tests__/planner-v2/postgres/proposal-fixture.ts","__tests__/planner-v2/postgres/durable-core.postgres.ts","__tests__/planner-v2/postgres/coordinated-routes.postgres.ts","__tests__/planner-v2/postgres/lifecycle-projection.postgres.ts","__tests__/planner-v2/postgres/assistant-research.postgres.ts","__tests__/planner-v2/intelligence/serialization.test.ts","scripts/test-planner-v2-phase1-postgres.mjs",
 "documentation/planner/README.md","documentation/planner/reports/2026-10-03-phase-2/README.md","documentation/planner/reports/2026-10-03-phase-2/REQUIREMENTS.json"];
const added=["__tests__/ai/deepseek-reasoning-controls.test.ts","lib/planner/v2/server/generation.ts","__tests__/planner-v2/postgres/generation-integration.postgres.ts","__tests__/planner-v2/postgres/maximum-envelope.postgres.ts","__tests__/planner-v2/postgres/research-limits.postgres.ts","__tests__/planner-v2/postgres/compiler-qualification.live.ts",
 "vitest.planner-v2-live.config.ts","scripts/test-planner-v2-phase2-step6-postgres.mjs","scripts/test-planner-v2-phase2-live.mjs","scripts/verify-planner-v2-phase2-step6-build.mjs","scripts/verify-planner-v2-phase2-step6.mjs",
 "documentation/planner/reports/2026-10-03-phase-2/STEP_6.md","documentation/planner/reports/2026-10-03-phase-2/STEP_6_CONTINUATION.md","documentation/planner/reports/2026-10-03-phase-2/STEP_6_BLOCKERS.md","documentation/planner/reports/2026-10-03-phase-2/HIGH_REASONING.md","documentation/planner/reports/2026-10-03-phase-2/STEP_6_BOUNDARY_FIXES.md","documentation/planner/reports/2026-10-03-phase-2/COMPLETION.md","documentation/planner/reports/2026-10-03-phase-2/LIVE_QUALIFICATION.md","documentation/planner/reports/2026-10-03-phase-2/DEVELOPMENT_CORPUS.json"];
// The user separately authorized the deployed timer defect during Step 6.
// Classify that work explicitly; it is neither unrelated concurrency nor
// evidence that the Planner's educational acceptance gate has passed.
const adjacentTimerFiles=new Set(["app/api/sessions/route.ts","lib/planner/v2/server/settlement.ts","__tests__/timer/session-route.test.ts","__tests__/planner-v2/postgres/durable-core.postgres.ts","documentation/planner/reports/2026-10-07-timer-settlement/README.md"]);
const adjacentTimerEvidence=file=>file.startsWith("documentation/planner/reports/2026-10-07-timer-settlement/evidence/");
const allowed=new Set([...edits,...added,...adjacentTimerFiles]);
const gate={gate:"PLANNER_V2_PHASE_2_STEP_6",startedAt:new Date().toISOString(),status:"FAILED",checks:[],scope:"Existing generation activation, atomic admission, supervised compiler-to-ApplyService, maximum envelopes and live development qualification. No later phase activation."};
const write=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+"\n");
write("step6-gate.json",{...gate,status:"RUNNING"});
if(!fs.existsSync(path.join(evidence,"step6-source-preservation.json")))write("step6-source-preservation.json",{status:"PENDING"});
function check(name,work){try{gate.checks.push({name,status:"PASSED",evidence:work()});}catch(error){gate.checks.push({name,status:"FAILED",error:error.message});}}
function run(label,entry,args=[],environment){
  const result=spawnSync(process.execPath,[path.join(root,entry),...args],{cwd:root,encoding:"utf8",timeout:120000,maxBuffer:12*1024*1024,...(environment?{env:environment}:{})});
  const output=`${result.stdout??""}${result.stderr??""}`;fs.writeFileSync(path.join(evidence,`step6-${label}.log`),output);
  if(result.error)throw result.error;return {code:result.status,output};
}
function required(label,entry,args){const result=run(label,entry,args,label==="units"?{...process.env,PLANNER_SERIALIZATION_EVIDENCE:path.join(evidence,"step6-serialization.json")}:undefined);if(result.code!==0)throw new Error(`${label} failed; see step6-${label}.log`);return result;}
function filesUnder(directory_){return fs.readdirSync(path.join(root,directory_),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesUnder(`${directory_}/${entry.name}`):[`${directory_}/${entry.name}`]);}
try {
  check("frozen contracts and governing design",()=>{
    const contracts=JSON.parse(fs.readFileSync(path.join(root,"documentation/planner/reports/2026-10-02-phase-0/evidence/phase0-gate.json"))).contractSources;
    const governing=["documentation/planner/PLANNER_TARGET_ARCHITECTURE.md","documentation/planner/reports/2026-10-02-final-architecture-review/REVIEW.md","documentation/planner/reports/2026-10-02-end-to-end-audit/AUDIT.md","documentation/planner/reports/2026-10-02-phase-0/README.md","documentation/planner/reports/2026-10-02-phase-1/README.md",
      "documentation/planner/reports/2026-10-03-phase-2/IMPLEMENTATION_PLAN.md","documentation/planner/reports/2026-10-03-phase-2/SUPPORTING_ARTIFACTS.md","documentation/planner/reports/2026-10-03-phase-2/STEP_2.md","documentation/planner/reports/2026-10-03-phase-2/STEP_3.md","documentation/planner/reports/2026-10-03-phase-2/STEP_4.md","documentation/planner/reports/2026-10-03-phase-2/STEP_5.md"];
    for(const [file,expected] of Object.entries({...contracts,...Object.fromEntries(governing.map(file=>[file,baseline.files[file]?.sha256]))}))if(!expected||sourceSha(file)!==expected)throw new Error(`Frozen/governing source drift: ${file}`);
    return {frozenContracts:Object.keys(contracts).length,governingUnchanged:governing.length};
  });
  check("All frozen, intelligence and required Planner unit regressions",()=>{
    const legacy=["authority","search-provider","source-fetch-security","import-pdf","import-outline","import-service","research-evidence","research-agent","research-service","comparison-service","research-plan","research-followup","research-fetch-concurrency","research-selection","research-cache-quality","research-search-failure"].map(name=>`__tests__/planner/${name}.test.ts`);
    const tests=[...filesUnder("__tests__/planner-v2/contracts"),...filesUnder("__tests__/planner-v2/intelligence")].filter(file=>file.endsWith(".test.ts"));
    tests.push("__tests__/ai/deepseek-reasoning-controls.test.ts","__tests__/planner-v2/evidence/audit-regression-fixtures.test.ts","__tests__/planner-v2/durable-digests.test.ts","__tests__/ai/provider-contract.test.ts","__tests__/ai/multi-engine-router.test.ts",...legacy);
    const output=path.join(evidence,"step6-units.json");required("units","node_modules/vitest/vitest.mjs",["run",...tests,"--exclude","scratch/**","--reporter=json",`--outputFile=${output}`]);
    const result=JSON.parse(fs.readFileSync(output));if(!result.success||result.numFailedTests||result.numPendingTests||result.testResults.length!==tests.length||tests.some(file=>!result.testResults.some(r=>r.name.endsWith(file)))||result.testResults.some(r=>r.assertionResults.some(t=>t.status!=="passed")))throw new Error("Unit failure, missing suite or required skip");
    return {files:result.testResults.length,passed:result.numPassedTests,requiredSkipped:0,independentOracleFixtures:500};
  });
  check("isolated intelligence, worker and whole source TypeScript",()=>{
    required("typecheck","node_modules/typescript/bin/tsc",["-p","tsconfig.planner-v2-phase2.json"]);
    required("worker-typecheck","node_modules/typescript/bin/tsc",["-p","tsconfig.planner-worker.json","--noEmit"]);
    const base=JSON.parse(fs.readFileSync(path.join(root,"tsconfig.json")));const config=path.join(temporary,"source.json");
    fs.writeFileSync(config,JSON.stringify({extends:path.join(root,"tsconfig.json"),compilerOptions:{incremental:false,noEmit:true},exclude:[...base.exclude.map(p=>path.join(root,p)),path.join(root,".next")]}));
    required("source-typecheck","node_modules/typescript/bin/tsc",["-p",config]);return {source:"PASSED",generatedNextTypesExcluded:true};
  });
  check("whole repository typecheck classified against unchanged owners",()=>{
    const result=run("full-typecheck","node_modules/typescript/bin/tsc",["--noEmit","--incremental","false"]);if(result.code===0)return {status:"PASSED"};
    const actual=result.output.split("\n").filter(line=>line.includes("error TS"));
    const unrelated=new Set(["app/api/acoustics/route.ts","app/api/quests/route.ts","app/api/subjects/[id]/compile/route.ts","app/api/subjects/[id]/forge-apex/route.ts","app/api/subjects/[id]/nodes/route.ts","app/api/subjects/[id]/restore/route.ts","app/api/subjects/[id]/route.ts","app/api/user/focus-backgrounds/route.ts","app/goals/page.tsx"]);const verified={};
    if(result.code!==2||!actual.length)throw new Error("Unclassified typecheck failure");
    for(const error of actual){const match=error.match(/^\.next\/(?:dev\/)?types\/(app\/.+)\.ts\(\d+,\d+\): error TS(?:2344|2559):/);if(!match)throw new Error("Non-generated typecheck failure");const file=[match[1]+".ts",match[1]+".tsx"].find(p=>fs.existsSync(path.join(root,p)));if(!unrelated.has(file)||!baseline.files[file]?.sha256||sourceSha(file)!==baseline.files[file].sha256)throw new Error(`Changed/unclassified typecheck owner: ${file}`);verified[file]=sourceSha(file);}
    return {status:"PRE_EXISTING_GENERATED_FAILURES_UNCHANGED",errors:actual,verifiedUnchangedSources:verified,generatedFilesModified:false};
  });
  check("changed source lint with hash-verified pre-existing diagnostics",()=>{
    const existing=["lib/ai/providers/gemini.ts","lib/ai/providers/deepseek.ts","lib/ai/providers/types.ts","__tests__/ai/provider-contract.test.ts"];
    required("lint","node_modules/eslint/bin/eslint.js",[...allowed].filter(p=>/\.(?:ts|cjs|mjs)$/.test(p)&&!existing.includes(p)).concat("--max-warnings=0"));
    const observations=[];
    for(const file of existing){
      const baselineRevision="5a275f73c2413aa59b5cb7e8bb097d90da3077f5";
      const before=execFileSync("git",["show",`${baselineRevision}:${file}`],{cwd:root,encoding:"utf8"});if(sha(before)!==baseline.files[file].sha256)throw new Error(`Cannot prove original lint source: ${file}`);
      const inspect=source=>{const r=spawnSync(process.execPath,[path.join(root,"node_modules/eslint/bin/eslint.js"),"--stdin","--stdin-filename",file,"--format=json"],{cwd:root,input:source,encoding:"utf8",timeout:30000});if(r.error||![0,1].includes(r.status))throw new Error("Lint diagnostics unavailable");const out=JSON.parse(r.stdout)[0];if(out.messages.some(m=>m.fatal))throw new Error("Fatal lint finding");return out.messages.map(m=>({...m,sourceLine:source.split("\n")[m.line-1]}));};
      const previous=inspect(before),current=inspect(fs.readFileSync(path.join(root,file),"utf8"));
      const fingerprints=messages=>messages.map(({ruleId,severity,message,column,sourceLine})=>JSON.stringify({ruleId,severity,message,column,sourceLine})).sort();
      if(JSON.stringify(fingerprints(previous))!==JSON.stringify(fingerprints(current)))throw new Error(`New changed-source lint finding: ${file}`);
      observations.push({file,baselineRevision,baselineSha256:sha(before),existingDiagnostics:previous,currentDiagnostics:current});
    }
    write("step6-lint-baseline.json",{status:"NO_NEW_DIAGNOSTICS",observations});return {newErrors:0,newWarnings:0,preExistingDiagnostics:observations.reduce((n,o)=>n+o.existingDiagnostics.length,0)};
  });
  check("compiled normal Node research and assistant imports",()=>{
    required("worker-build","scripts/build-planner-worker.mjs",[]);
    const code="for (const f of ['assistant','documents','research','learning','compiler','compilation','generation']) require('./dist/planner-worker/planner/v2/server/'+f+'.js'); for (const f of ['assistant','ocr','research-verification','research-reader','research-cache','context','provider','blueprint','allocator','forecast','capacity','quality']) require('./dist/planner-worker/planner/v2/intelligence/'+f+'.js'); console.log('Normal Node imports passed without Next or provider credentials');";
    const result=spawnSync(process.execPath,["-e",code],{cwd:root,encoding:"utf8",env:{PATH:process.env.PATH},timeout:30000});fs.writeFileSync(path.join(evidence,"step6-node-load.log"),`${result.stdout??""}${result.stderr??""}`);if(result.error||result.status!==0)throw new Error("Normal Node imports failed");return {node:process.version,modules:19,providerCredentials:false};
  });
  check("genuine PostgreSQL and compiled ordinary Node learning correspondence",()=>{
    const result=JSON.parse(fs.readFileSync(path.join(evidence,"step6-postgres/postgres-harness-run.json")));const pins=JSON.parse(fs.readFileSync(path.join(evidence,"step6-postgres/step6-source-pins.json")));
    if(result.status!=="PASSED"||result.requiredResults.length!==2||result.requiredResults.some(r=>r.failed||r.requiredSkipped)||result.cleanupError||result.requiredResults.find(r=>r.label==="current")?.files!==17||pins.status!=="PASSED")throw new Error("Required PostgreSQL evidence incomplete");
    for(const [file,expected] of Object.entries(pins.sources))if(sourceSha(file)!==expected)throw new Error(`PostgreSQL evidence source drift: ${file}`);
    for(const migration of result.migrations)if(sourceSha(`prisma/migrations/${migration.name}/migration.sql`)!==migration.sha256)throw new Error("PostgreSQL migration evidence drift");
    if(sourceSha("prisma/schema.prisma")!==result.schemaDigest)throw new Error("PostgreSQL schema evidence drift");
    const phase1=JSON.parse(fs.readFileSync(path.join(evidence,"step6-postgres/postgres-phase1-results.json")));const suite=phase1.suites.find(s=>s.name.endsWith("compiler-quality.postgres.ts"));const routes=phase1.suites.find(s=>s.name.endsWith("coordinated-routes.postgres.ts"));
    if(!suite||suite.cases.length!==29||suite.cases.some(c=>c.status!=="passed")||!suite.cases.some(c=>c.name.includes("compiled ordinary Node supervised handlers"))||!routes?.cases.some(c=>c.name.includes("assistant")))throw new Error("Required Step 6 compiler lifecycle cases missing");
    const integration=phase1.suites.find(s=>s.name.endsWith("generation-integration.postgres.ts")),maximum=phase1.suites.find(s=>s.name.endsWith("maximum-envelope.postgres.ts"));
    if(!integration||integration.cases.length<16||integration.cases.some(c=>c.status!=="passed")||!maximum||maximum.cases.length!==2||maximum.cases.some(c=>c.status!=="passed"))throw new Error("Step 6 integration/max cases incomplete");
    const witness=JSON.parse(fs.readFileSync(path.join(evidence,"step6-maximum-postgres.json")));if(witness.status!=="PASSED"||witness.quests!==400||witness.newActivitiesAtFinalPublish!==60||witness.retainedActivitiesAtFinalPublish!==340||witness.maximumCompilerContext.upstreamAttempts!==0)throw new Error("Actual maximum qualification incomplete");
    return {results:result.requiredResults,compilerCases:suite.cases.length,integrationCases:integration.cases.length,maximumCases:maximum.cases.length,pinnedSources:Object.keys(pins.sources).length,hostedDataTouched:false,cleanup:result.cleanup};
  });
  check("isolated production web build qualification",()=>{
    const result=JSON.parse(fs.readFileSync(path.join(evidence,"step6-build.json")));const log=fs.readFileSync(path.join(evidence,"step6-build.log"),"utf8");if(!["PASSED","PRE_EXISTING_ROUTE_EXPORT_BLOCKER"].includes(result.status)||!log.includes("Compiled successfully"))throw new Error("Build failed before successful compilation");
    for(const [file,expected] of Object.entries(result.sourceSha256??{}))if((fs.existsSync(path.join(root,file))?sourceSha(file):null)!==expected)throw new Error(`Build evidence source drift: ${file}`);
    if(!result.sourceSha256||result.changedDuringRun?.length)throw new Error("Build source pins missing or changed");
    for(const file of ["app/api/acoustics/route.ts","app/api/quests/route.ts"])if(sourceSha(file)!==baseline.files[file].sha256)throw new Error("Build blocker owner drift");return result;
  });
  check("real-provider development qualification and independent educational evaluation",()=>{
    const evaluation=JSON.parse(fs.readFileSync(path.join(evidence,"step6-live-evaluation.json")));
    if(!/^step6-live-[-a-zA-Z0-9]+$/.test(evaluation.selectedRunDirectory))throw new Error("Unowned live evidence path");
    const liveDirectory=path.join(evidence,evaluation.selectedRunDirectory),live=JSON.parse(fs.readFileSync(path.join(liveDirectory,"live-corpus.json")));
    if(evaluation.status!=="PASSED"||evaluation.corpusSha256!==live.corpusSha256||!evaluation.cases.length||evaluation.cases.some(c=>c.status!=="PASSED"))throw new Error("Actual educational qualification incomplete");
    const corpusBytes=fs.readFileSync(path.join(directory,"DEVELOPMENT_CORPUS.json")),registered=JSON.parse(corpusBytes).cases;
    const exactCases=cases=>cases.length===registered.length&&new Set(cases.map(c=>c.id)).size===registered.length&&registered.every(c=>cases.some(observed=>observed.id===c.id));
    if(!exactCases(live.cases)||!exactCases(evaluation.cases)||live.corpusSha256!==sha(corpusBytes)||evaluation.liveCorpusSha256!==sourceSha(path.relative(root,path.join(liveDirectory,"live-corpus.json"))))throw new Error("Live/evaluation corpus identity mismatch");
    const policies=new Set(live.cases.map(c=>c.input?.[0]?.policy).filter(Boolean));if(policies.size!==4||live.cases.some(c=>["RUNNING","QUEUED"].includes(c.observedOutcome)))throw new Error("Live policy/corpus coverage incomplete");
    if(!evaluation.coverage?.adaptation?.length||!evaluation.coverage?.repairAndVerification?.length)throw new Error("Actual live adaptation/repair/verification qualification missing");
    const purposes=c=>Object.values(c.providerMetadata??{}).map(m=>m.purpose);
    for(const id of evaluation.coverage.adaptation){const c=live.cases.find(c=>c.id===id);if(!c||!purposes(c).includes("ADAPTATION")||c.checkpoint?.adaptations!==1||!evaluation.cases.some(c=>c.id===id&&c.status==="PASSED"))throw new Error("Claimed live adaptation lacks actual bounded evidence");}
    for(const id of evaluation.coverage.repairAndVerification){const c=live.cases.find(c=>c.id===id),issues=c?.checkpoint?.payload?.quality?.flatMap(q=>q.report.issues)??[],named=c?.checkpoint?.repairIssueIds??[];if(!c||c.observedOutcome!=="SUCCEEDED"||c.apply?.status!=="APPLIED"||c.checkpoint?.repairs!==1||!purposes(c).includes("REPAIR")||!purposes(c).includes("VERIFICATION")||!named.length||named.some(id=>!issues.some(i=>i.issueId===id&&i.resolution==="REPAIRED"&&i.verification?.result==="RESOLVED")))throw new Error("Claimed live repair lacks exact independent verification and canonical apply");}
    const pins=JSON.parse(fs.readFileSync(path.join(liveDirectory,"live-source-pins.json")));if(pins.status!=="PASSED"||pins.changedDuringRun.length)throw new Error("Live run source correspondence failed");for(const [file,expected] of Object.entries(pins.sources).filter(([file])=>/^(?:lib\/(?:planner|ai)\/|app\/api\/planner\/|prisma\/)/.test(file)))if(sourceSha(file)!==expected)throw new Error(`Live source drift: ${file}`);
    return {cases:live.cases.length,policies:[...policies],evaluation:"Actual outputs evaluated separately from model self-review",operationalFailures:evaluation.operationalFailures,latency:evaluation.latency,hostedDataTouched:false};
  });
  check("completion documentation, references and scoped whitespace",()=>{
    for(const name of fs.readdirSync(directory).filter(p=>p.endsWith(".md"))){const content=fs.readFileSync(path.join(directory,name),"utf8");for(const match of content.matchAll(/\]\(([^)]+)\)/g)){const ref=match[1].split("#")[0];if(ref&&!/^[a-z]+:/i.test(ref)&&!fs.existsSync(path.resolve(directory,ref)))throw new Error(`Broken reference: ${name}: ${ref}`);}}
    for(const file of allowed)if(fs.readFileSync(path.join(root,file),"utf8").split("\n").some(line=>/[\t ]+$/.test(line)))throw new Error(`Scoped whitespace: ${file}`);
    const requirements=JSON.parse(fs.readFileSync(path.join(directory,"REQUIREMENTS.json"))).requirements.filter(r=>r.step===6);if(requirements.length!==5)throw new Error("Step 6 requirement map missing");
    return {requirements:requirements.map(r=>({id:r.id,status:r.status})),brokenReferences:0,newWhitespaceFindings:0};
  });
  check("baseline preservation and unrelated concurrency",()=>{
    const concurrentSchema=JSON.parse(fs.readFileSync(path.join(evidence,"step6-concurrent-schema-preservation.json"),"utf8"));
    if(concurrentSchema.status!=="PRESERVED_UNRELATED_SCHEMA_CHANGE"||!concurrentSchema.userChangeOnlyPixelRelation||!concurrentSchema.poolChangeOnlySchemaVersion||Object.values(concurrentSchema.protectedModelCorrespondence).some(v=>v!==true))throw new Error("Concurrent schema changes require explicit semantic inspection");
    const auditedConcurrentSources=concurrentSchema.preservedSources;
    for(const [file,expected] of Object.entries(auditedConcurrentSources))if(sourceSha(file)!==expected)throw new Error(`Concurrent source changed after inspection: ${file}`);
    const files=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
    const observe=file=>{try{return fs.lstatSync(path.join(root,file)).isFile()?{kind:"file",sha256:sourceSha(file)}:{kind:"other"};}catch(error){if(error.code==="ENOENT")return {kind:"missing"};throw error;}};
    const changed=Object.entries(baseline.files).filter(([file,b])=>b.sha256?observe(file).sha256!==b.sha256:observe(file).kind!==b.kind).map(([file])=>file);
    const generated=file=>file.startsWith("dist/planner-worker/");const external=changed.filter(file=>!allowed.has(file)&&!generated(file));
    // Match the starting snapshot's documented coverage: an intentionally
    // excluded path cannot be classified as a newly created concurrent file.
    const excluded=file=>/\.env|secret|credential|privatekey|\.pem/i.test(file)||file.startsWith("documentation/planner/reports/2026-10-03-phase-2/evidence/");
    const newFiles=files.filter(file=>!baseline.files[file]&&!allowed.has(file)&&!generated(file)&&!excluded(file)&&!adjacentTimerEvidence(file));
    if([...external,...newFiles].some(file=>!Object.hasOwn(auditedConcurrentSources,file)&&/^(?:lib\/(?:planner|ai)\/|documentation\/planner\/|__tests__\/(?:planner|planner-v2)\/|app\/api\/planner\/|prisma\/)/.test(file)))throw new Error(`Unclassified Planner/schema overlap: ${external.concat(newFiles)}`);
    const result={status:"PASSED",baselineEntries:Object.keys(baseline.files).length,baselineCoverage:"Git-listed files excluding secret-like paths and Phase 2 evidence; not a full filesystem snapshot.",step6ExistingEdits:changed.filter(file=>allowed.has(file)&&!adjacentTimerFiles.has(file)),authorizedAdjacentTimerChanges:changed.filter(file=>adjacentTimerFiles.has(file)),authorizedAdjacentTimerNewFiles:files.filter(file=>!baseline.files[file]&&(adjacentTimerFiles.has(file)||adjacentTimerEvidence(file))),derivedWorkerChanges:changed.filter(generated),unrelatedConcurrentChanges:external.map(file=>({path:file,before:baseline.files[file],observed:observe(file)})),unrelatedNewFiles:newFiles,unrelatedLandingUnchanged:sourceSha("app/components/landing/journey/JourneyLanding.tsx")===baseline.files["app/components/landing/journey/JourneyLanding.tsx"].sha256};
    write("step6-source-preservation.json",result);gate.sourceSha256=Object.fromEntries([...allowed].sort().map(file=>[file,sourceSha(file)]));return result;
  });
  check("Phase 2 completion certification",()=>{
    const requirements=JSON.parse(fs.readFileSync(path.join(directory,"REQUIREMENTS.json"))).requirements.filter(r=>r.step===6);
    if(requirements.some(r=>r.status!=="STEP_6_COMPLETE")||!fs.readFileSync(path.join(directory,"COMPLETION.md"),"utf8").includes("Status: **COMPLETE**"))throw new Error("Phase 2 remains incomplete until every required live quality gate passes");
    return {phase2:"COMPLETE"};
  });
  gate.status=gate.checks.every(c=>c.status==="PASSED")?"PASSED":"FAILED";
  if(gate.status==="FAILED"){gate.error=gate.checks.filter(c=>c.status==="FAILED").map(c=>c.name).join("; ");process.exitCode=1;}
} catch(error){gate.error=error.message;process.exitCode=1;}
finally{gate.finishedAt=new Date().toISOString();write("step6-gate.json",gate);fs.rmSync(temporary,{recursive:true,force:true});}
process.stdout.write(JSON.stringify({status:gate.status,checks:gate.checks.length,error:gate.error})+"\n");
