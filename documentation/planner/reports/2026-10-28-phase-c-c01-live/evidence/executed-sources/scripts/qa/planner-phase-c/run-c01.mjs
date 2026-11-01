/** Thin one-case caller around the existing isolated PostgreSQL harness. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { reportPath } from "./prepare.mjs";
const root=resolve(import.meta.dirname,"../../.."),args=process.argv.slice(2),mode=args[0];
if(!["SCRIPTED","LONG_REVIEW","LIVE"].includes(mode)||args[1]!=="--output"||!args[2]||args.length!==(mode==="LIVE"?5:3)||mode==="LIVE"&&args[3]!=="--authorization")throw new Error("Use SCRIPTED|LONG_REVIEW --output report-dir; LIVE additionally requires --authorization /private/tmp/file.json");
if(Number(process.versions.node.split('.')[0])!==24)throw new Error("NODE_24_REQUIRED");
const output=resolve(args[2]);if(!output.startsWith(join(root,"documentation/planner/reports/"))||existsSync(output))throw new Error("NEW_REPORT_OUTPUT_REQUIRED");
const hash=b=>createHash("sha256").update(b).digest("hex");
const prepared=JSON.parse(readFileSync(join(root,reportPath,"evidence/prepared-manifest.json"),"utf8"));
for(const [name,digest]of Object.entries(prepared.hashes))if(hash(readFileSync(join(root,reportPath,name)))!==digest)throw new Error("FROZEN_INPUT_CHANGED");
for(const [name,digest]of Object.entries(prepared.qualificationSources))if(hash(readFileSync(join(root,name)))!==digest)throw new Error("PREPARED_SOURCE_CHANGED");
let auth=null;
if(mode==="LIVE"){
  const path=resolve(args[4]);if(!path.startsWith('/private/tmp/')||(statSync(path).mode&0o077)!==0)throw new Error("PRIVATE_AUTHORIZATION_REQUIRED");
  auth=JSON.parse(readFileSync(path,"utf8"));
  if(!auth.approved||auth.caseId!=="C01"||auth.ceilingUsd!==1.75||auth.repetitions!==1||auth.preparedManifestSha256!==hash(readFileSync(join(root,reportPath,"evidence/prepared-manifest.json")))||Date.now()-Date.parse(auth.preflightCheckedAt)>15*60000||Date.now()<Date.parse(auth.preflightCheckedAt)||auth.balanceSufficient!==true||auth.preflightPassed!==true)throw new Error("APPROVAL_OR_FRESH_PREFLIGHT_REQUIRED");
  if(!auth.privateKeyPath?.startsWith('/private/tmp/')||(statSync(auth.privateKeyPath).mode&0o077)!==0)throw new Error("PRIVATE_KEY_CAPSULE_REQUIRED");
  for(const [name,digest]of Object.entries(auth.executionSources??{}))if(hash(readFileSync(join(root,name)))!==digest)throw new Error("EXECUTION_SOURCE_CHANGED");
  const consumed=resolve(root,'documentation/planner/reports/2026-10-28-phase-c-c01-live/evidence/authorization-consumed.json');
  writeFileSync(consumed,JSON.stringify({runId:auth.runId,caseId:'C01',ceilingUsd:1.75,consumedAt:new Date().toISOString(),authorizationSha256:hash(readFileSync(path))},null,2)+'\n',{flag:'wx'});
}
mkdirSync(output,{recursive:true});
const base=readFileSync(join(root,'scripts/test/test-planner-ai-first-foundation.mjs'),'utf8');
const inventory=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});
let source=base.replace('const root = resolve(import.meta.dirname, "../..");',`const root = ${JSON.stringify(root)};`)
 .replace('execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })',JSON.stringify(inventory))
 .replace('join(temporary,"__tests__/planner-v2/postgres/phase-c-preparation.phasec.ts")','join(temporary,"__tests__/planner-v2/postgres/phase-c-execution.phasec.ts")')
 .replace('const original = readFileSync(harness, "utf8"), marker =',`const original = readFileSync(harness, "utf8").replace('"SystemRoot"]','"SystemRoot", "SYLF_C01_MODE", "SYLF_C01_AUTH", "SYLF_C01_OUTPUT"]'), marker =`)
 .replace('["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL"]','["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "SHELL", "SYLF_C01_MODE", "SYLF_C01_AUTH", "SYLF_C01_OUTPUT"]')
 .replace("'env: childEnvironment, timeout: 1_200_000'","'env: childEnvironment, timeout: 14_520_000'")
 .replace('paidCalls: 0, isolation:',`paidCalls: (()=>{try{return JSON.parse(readFileSync(${JSON.stringify(join(output,'network-count.json'))},'utf8')).physicalRequests;}catch{return 0;}})(), isolation:`);
if(source===base||source.includes('const root = resolve(import.meta.dirname, "../..");')||source.includes('join(temporary,"__tests__/planner-v2/postgres/phase-c-preparation.phasec.ts")'))throw new Error("AUDITED_HARNESS_SEAM_CHANGED");
const wrapper=`/private/tmp/sylf-c01-wrapper-${mode}-${Date.now()}.mjs`;writeFileSync(wrapper,source,{flag:'wx'});
cpSync(wrapper,join(output,'executed-wrapper.mjs'));
const pins=Object.fromEntries(['scripts/qa/planner-phase-c/run-c01.mjs','scripts/qa/planner-phase-c/c01-journey.ts','scripts/qa/planner-phase-c/execution-guard.mjs','__tests__/planner-v2/postgres/phase-c-execution.phasec.ts'].map(p=>[p,hash(readFileSync(join(root,p)))]));
writeFileSync(join(output,'execution-source-pins.json'),JSON.stringify({mode,sources:pins,preparedManifestSha256:hash(readFileSync(join(root,reportPath,'evidence/prepared-manifest.json'))),wrapperSha256:hash(source),paidAuthorized:mode==='LIVE',caseId:'C01',ceilingUsd:1.75},null,2)+'\n');
const environment=Object.fromEntries(['PATH','HOME','TMPDIR','USER','LOGNAME','SHELL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const child=spawn(process.execPath,[wrapper,'--phase-c-rehearsal','--native-bin','/private/tmp/sylf-phase-a-runtime/package/native/bin','--evidence-dir',join(output,'harness')],{cwd:root,env:{...environment,SYLF_C01_MODE:mode,SYLF_C01_AUTH:mode==='LIVE'?resolve(args[4]):'',SYLF_C01_OUTPUT:output},stdio:'inherit'});
const stop=()=>child.kill('SIGTERM');process.once('SIGTERM',stop);process.once('SIGINT',stop);
const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',n=>done(n??1));});unlinkSync(wrapper);process.exitCode=code;
