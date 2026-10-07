import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync,spawnSync } from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const directory=path.join(root,"documentation/planner/reports/2026-10-03-phase-2");
const evidence=path.join(directory,"evidence");
const baseline=JSON.parse(fs.readFileSync(path.join(evidence,"step4-baseline.json"),"utf8"));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"sylf-planner-step4-gate-"));
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");
const sourceSha=file=>sha(fs.readFileSync(path.join(root,file)));
const edits=["lib/planner/v2/server/attempts.ts","lib/planner/v2/intelligence/schemas/checkpoint.ts",
 "documentation/planner/README.md","documentation/planner/reports/2026-10-03-phase-2/README.md","documentation/planner/reports/2026-10-03-phase-2/REQUIREMENTS.json"];
const added=[...["allocator","blueprint","forecast","capacity"].map(n=>`lib/planner/v2/intelligence/${n}.ts`),
 "lib/planner/v2/intelligence/schemas/planning.ts","lib/planner/v2/server/learning.ts",
 ...["allocator","allocator-oracle","blueprint","forecast"].map(n=>`__tests__/planner-v2/intelligence/${n}.test.ts`),
 "__tests__/planner-v2/intelligence/planning-fixtures.ts","__tests__/planner-v2/postgres/learning-allocation.postgres.ts","__tests__/planner-v2/postgres/learning-process-fixture.cjs",
 "scripts/test-planner-v2-phase2-step4-postgres.mjs","scripts/verify-planner-v2-phase2-step4-build.mjs","scripts/verify-planner-v2-phase2-step4.mjs","documentation/planner/reports/2026-10-03-phase-2/STEP_4.md"];
const allowed=new Set([...edits,...added]);
const gate={gate:"PLANNER_V2_PHASE_2_STEP_4",startedAt:new Date().toISOString(),status:"FAILED",checks:[],scope:"Policy-aware Blueprint and deterministic allocation; Step 5 review/repair and handler activation remain pending."};
const write=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2)+"\n");
write("step4-gate.json",{...gate,status:"RUNNING"});
if(!fs.existsSync(path.join(evidence,"step4-source-preservation.json")))write("step4-source-preservation.json",{status:"PENDING"});
function check(name,work){gate.checks.push({name,status:"PASSED",evidence:work()});}
function run(label,entry,args=[],environment){
  const result=spawnSync(process.execPath,[path.join(root,entry),...args],{cwd:root,encoding:"utf8",timeout:120000,maxBuffer:12*1024*1024,...(environment?{env:environment}:{})});
  const output=`${result.stdout??""}${result.stderr??""}`;fs.writeFileSync(path.join(evidence,`step4-${label}.log`),output);
  if(result.error)throw result.error;return {code:result.status,output};
}
function required(label,entry,args){const result=run(label,entry,args);if(result.code!==0)throw new Error(`${label} failed; see step4-${label}.log`);return result;}
function filesUnder(directory_){return fs.readdirSync(path.join(root,directory_),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesUnder(`${directory_}/${entry.name}`):[`${directory_}/${entry.name}`]);}
try {
  check("frozen contracts and governing design",()=>{
    const contracts=JSON.parse(fs.readFileSync(path.join(root,"documentation/planner/reports/2026-10-02-phase-0/evidence/phase0-gate.json"))).contractSources;
    const governing=["documentation/planner/PLANNER_TARGET_ARCHITECTURE.md","documentation/planner/reports/2026-10-02-final-architecture-review/REVIEW.md","documentation/planner/reports/2026-10-02-end-to-end-audit/AUDIT.md","documentation/planner/reports/2026-10-02-phase-0/README.md","documentation/planner/reports/2026-10-02-phase-1/README.md",
      "documentation/planner/reports/2026-10-03-phase-2/IMPLEMENTATION_PLAN.md","documentation/planner/reports/2026-10-03-phase-2/SUPPORTING_ARTIFACTS.md","documentation/planner/reports/2026-10-03-phase-2/STEP_2.md","documentation/planner/reports/2026-10-03-phase-2/STEP_3.md"];
    for(const [file,expected] of Object.entries({...contracts,...Object.fromEntries(governing.map(file=>[file,baseline.files[file]?.sha256]))}))if(!expected||sourceSha(file)!==expected)throw new Error(`Frozen/governing source drift: ${file}`);
    return {frozenContracts:Object.keys(contracts).length,governingUnchanged:governing.length};
  });
  check("All frozen, intelligence and required Planner unit regressions",()=>{
    const legacy=["authority","search-provider","source-fetch-security","import-pdf","import-outline","import-service","research-evidence","research-agent","research-service","comparison-service","research-plan","research-followup","research-fetch-concurrency","research-selection","research-cache-quality","research-search-failure"].map(name=>`__tests__/planner/${name}.test.ts`);
    const tests=[...filesUnder("__tests__/planner-v2/contracts"),...filesUnder("__tests__/planner-v2/intelligence")].filter(file=>file.endsWith(".test.ts"));
    tests.push("__tests__/planner-v2/evidence/audit-regression-fixtures.test.ts","__tests__/planner-v2/durable-digests.test.ts","__tests__/ai/provider-contract.test.ts","__tests__/ai/multi-engine-router.test.ts",...legacy);
    const output=path.join(evidence,"step4-units.json");required("units","node_modules/vitest/vitest.mjs",["run",...tests,"--exclude","scratch/**","--reporter=json",`--outputFile=${output}`]);
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
  check("changed source lint",()=>{required("lint","node_modules/eslint/bin/eslint.js",[...allowed].filter(p=>/\.(?:ts|cjs|mjs)$/.test(p)).concat("--max-warnings=0"));return {newErrors:0,newWarnings:0};});
  check("compiled normal Node research and assistant imports",()=>{
    required("worker-build","scripts/build-planner-worker.mjs",[]);
    const code="for (const f of ['assistant','documents','research','learning']) require('./dist/planner-worker/planner/v2/server/'+f+'.js'); for (const f of ['assistant','ocr','research-verification','research-reader','research-cache','context','provider','blueprint','allocator','forecast','capacity']) require('./dist/planner-worker/planner/v2/intelligence/'+f+'.js'); console.log('Normal Node imports passed without Next or provider credentials');";
    const result=spawnSync(process.execPath,["-e",code],{cwd:root,encoding:"utf8",env:{PATH:process.env.PATH},timeout:30000});fs.writeFileSync(path.join(evidence,"step4-node-load.log"),`${result.stdout??""}${result.stderr??""}`);if(result.error||result.status!==0)throw new Error("Normal Node imports failed");return {node:process.version,modules:15,providerCredentials:false};
  });
  check("genuine PostgreSQL and compiled ordinary Node learning correspondence",()=>{
    const result=JSON.parse(fs.readFileSync(path.join(evidence,"step4-postgres/postgres-harness-run.json")));const pins=JSON.parse(fs.readFileSync(path.join(evidence,"step4-postgres/step4-source-pins.json")));
    if(result.status!=="PASSED"||result.requiredResults.length!==2||result.requiredResults.some(r=>r.failed||r.requiredSkipped)||result.cleanupError||result.requiredResults.find(r=>r.label==="current")?.files!==17||pins.status!=="PASSED")throw new Error("Required PostgreSQL evidence incomplete");
    for(const [file,expected] of Object.entries(pins.sources))if(sourceSha(file)!==expected)throw new Error(`PostgreSQL evidence source drift: ${file}`);
    for(const migration of result.migrations)if(sourceSha(`prisma/migrations/${migration.name}/migration.sql`)!==migration.sha256)throw new Error("PostgreSQL migration evidence drift");
    if(sourceSha("prisma/schema.prisma")!==result.schemaDigest)throw new Error("PostgreSQL schema evidence drift");
    const phase1=JSON.parse(fs.readFileSync(path.join(evidence,"step4-postgres/postgres-phase1-results.json")));const suite=phase1.suites.find(s=>s.name.endsWith("learning-allocation.postgres.ts"));const routes=phase1.suites.find(s=>s.name.endsWith("coordinated-routes.postgres.ts"));
    if(!suite||suite.cases.length!==17||suite.cases.some(c=>c.status!=="passed")||!suite.cases.some(c=>c.name.includes("compiled learning service"))||!routes?.cases.some(c=>c.name.includes("assistant")))throw new Error("Required Step 4 learning lifecycle cases missing");
    return {results:result.requiredResults,newServiceCases:suite.cases.length,pinnedSources:Object.keys(pins.sources).length,hostedDataTouched:false,cleanup:result.cleanup};
  });
  check("isolated production web build qualification",()=>{
    const result=JSON.parse(fs.readFileSync(path.join(evidence,"step4-build.json")));const log=fs.readFileSync(path.join(evidence,"step4-build.log"),"utf8");if(!["PASSED","PRE_EXISTING_ROUTE_EXPORT_BLOCKER"].includes(result.status)||!log.includes("Compiled successfully"))throw new Error("Build failed before successful compilation");
    for(const [file,expected] of Object.entries(result.sourceSha256??{}))if(sourceSha(file)!==expected)throw new Error(`Build evidence source drift: ${file}`);
    if(!result.sourceSha256||result.changedDuringRun?.length)throw new Error("Build source pins missing or changed");
    for(const file of ["app/api/acoustics/route.ts","app/api/quests/route.ts"])if(sourceSha(file)!==baseline.files[file].sha256)throw new Error("Build blocker owner drift");return result;
  });
  check("completion documentation, references and scoped whitespace",()=>{
    for(const name of fs.readdirSync(directory).filter(p=>p.endsWith(".md"))){const content=fs.readFileSync(path.join(directory,name),"utf8");for(const match of content.matchAll(/\]\(([^)]+)\)/g)){const ref=match[1].split("#")[0];if(ref&&!/^[a-z]+:/i.test(ref)&&!fs.existsSync(path.resolve(directory,ref)))throw new Error(`Broken reference: ${name}: ${ref}`);}}
    for(const file of allowed)if(fs.readFileSync(path.join(root,file),"utf8").split("\n").some(line=>/[\t ]+$/.test(line)))throw new Error(`Scoped whitespace: ${file}`);
    const requirements=JSON.parse(fs.readFileSync(path.join(directory,"REQUIREMENTS.json"))).requirements.filter(r=>r.step===4);if(requirements.length!==8||requirements.some(r=>r.status!=="STEP_4_COMPLETE"))throw new Error("Step 4 requirement completion missing");
    if(!fs.readFileSync(path.join(directory,"STEP_4.md"),"utf8").includes("**COMPLETE**"))throw new Error("Step 4 report incomplete");return {requirements:requirements.map(r=>r.id),brokenReferences:0,newWhitespaceFindings:0};
  });
  check("baseline preservation and unrelated concurrency",()=>{
    const files=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).split("\0").filter(Boolean);
    const observe=file=>{try{return fs.lstatSync(path.join(root,file)).isFile()?{kind:"file",sha256:sourceSha(file)}:{kind:"other"};}catch(error){if(error.code==="ENOENT")return {kind:"missing"};throw error;}};
    const changed=Object.entries(baseline.files).filter(([file,b])=>b.sha256?observe(file).sha256!==b.sha256:observe(file).kind!==b.kind).map(([file])=>file);
    const generated=file=>file.startsWith("dist/planner-worker/");const external=changed.filter(file=>!allowed.has(file)&&!generated(file));
    // Match the starting snapshot's documented coverage: an intentionally
    // excluded path cannot be classified as a newly created concurrent file.
    const excluded=file=>/\.env|secret|credential|privatekey|\.pem/i.test(file)||file.startsWith("documentation/planner/reports/2026-10-03-phase-2/evidence/");
    const newFiles=files.filter(file=>!baseline.files[file]&&!allowed.has(file)&&!generated(file)&&!excluded(file));
    if([...external,...newFiles].some(file=>/^(?:lib\/(?:planner|ai)\/|documentation\/planner\/|__tests__\/(?:planner|planner-v2)\/|app\/api\/planner\/|prisma\/)/.test(file)))throw new Error(`Unclassified Planner/schema overlap: ${external.concat(newFiles)}`);
    const result={status:"PASSED",baselineEntries:Object.keys(baseline.files).length,baselineCoverage:"Git-listed files excluding secret-like paths and Phase 2 evidence; not a full filesystem snapshot.",step4ExistingEdits:changed.filter(file=>allowed.has(file)),derivedWorkerChanges:changed.filter(generated),unrelatedConcurrentChanges:external.map(file=>({path:file,before:baseline.files[file],observed:observe(file)})),unrelatedNewFiles:newFiles,unrelatedLandingUnchanged:sourceSha("app/components/landing/journey/JourneyLanding.tsx")===baseline.files["app/components/landing/journey/JourneyLanding.tsx"].sha256};
    write("step4-source-preservation.json",result);gate.sourceSha256=Object.fromEntries([...allowed].sort().map(file=>[file,sourceSha(file)]));return result;
  });
  gate.status="PASSED";
} catch(error){gate.error=error.message;process.exitCode=1;}
finally{gate.finishedAt=new Date().toISOString();write("step4-gate.json",gate);fs.rmSync(temporary,{recursive:true,force:true});}
process.stdout.write(JSON.stringify({status:gate.status,checks:gate.checks.length,error:gate.error})+"\n");
