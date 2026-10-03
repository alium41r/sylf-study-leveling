/** Reproducible local Phase 1 gate. Never uses hosted/provider credentials. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
const root=resolve(import.meta.dirname,"..");
const report="documentation/planner/reports/2026-10-02-phase-1";
const evidence=join(root,report,"evidence");
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=="--native-bin"||!isAbsolute(args[1])))throw new Error("Usage: node scripts/verify-planner-v2-phase1.mjs [--native-bin /absolute/bin]");
const env=Object.fromEntries(["PATH","HOME","TMPDIR","USER","LOGNAME","SHELL","SystemRoot"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
for(const dir of [".","mobile"])for(const name of [".env",".env.local",".env.test",".env.test.local",".env.production",".env.production.local",".env.development",".env.development.local"]) {
  const file=join(root,dir,name);if(existsSync(file))for(const match of readFileSync(file,"utf8").matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm))env[match[1]]="";
}
Object.assign(env,{NODE_ENV:"production",DATABASE_URL:"postgresql://127.0.0.1:1/no_gate_database",DIRECT_URL:"postgresql://127.0.0.1:1/no_gate_database",DATABASE_POOL_URL:"postgresql://127.0.0.1:1/no_gate_database",NEXT_TELEMETRY_DISABLED:"1",VITE_ENABLE_MOCK_API:"false"});
const read=path=>readFileSync(join(root,path),"utf8");
const json=path=>JSON.parse(read(path));
const sha=value=>createHash("sha256").update(value).digest("hex");
const walk=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);
const outcome={schemaVersion:2,gate:"PLANNER_V2_PHASE_1",startedAt:new Date().toISOString(),status:"RUNNING",checks:[],limitations:[],sourceSha256:{}};
function check(name,work){work();outcome.checks.push({name,status:"PASSED"});console.log(`Passed: ${name}`);}
function run(name,file,arguments_,timeout=180000,environment=env) {
  let output="",code=0;
  try{output=execFileSync(file,arguments_,{cwd:root,env:environment,encoding:"utf8",stdio:"pipe",timeout});}
  catch(error){code=error.status??1;output=String(error.stdout??"")+String(error.stderr??"");}
  writeFileSync(join(evidence,`${name}.log`),output);
  return {code,output};
}
function required(name,file,args_,timeout){const result=run(name,file,args_,timeout);if(result.code)throw new Error(`${name} failed; inspect ${report}/evidence/${name}.log`);return result;}
const bin=name=>join(root,"node_modules/.bin",name);
const start=json(`${report}/evidence/start-source-manifest.json`);
const phase0=json("documentation/planner/reports/2026-10-02-phase-0/evidence/phase0-gate.json");
const ownTypeConfig=`tsconfig.planner-phase1-source-${randomUUID()}.json`;
const ownDist=`.next-planner-phase1-build-${randomUUID()}`;
function removeOwnIncludes() {
  const path=join(root,"tsconfig.json");const content=readFileSync(path,"utf8");
  const own=new RegExp(`^\\s*"${ownDist.replaceAll(".","\\.")}/[^"\\n]+"[,]?\\n`,"gm");
  const cleaned=content.replace(own,"").replace(/,(\s*\])/g,"$1");if(content!==cleaned)writeFileSync(path,cleaned);
}
try {
  check("frozen contracts, audit corpus and historical migrations unchanged",()=>{
    for(const [path,digest]of Object.entries(phase0.contractSources))if(sha(read(path))!==digest)throw new Error(`Frozen contract changed: ${path}`);
    for(const [path,digest]of Object.entries(start.sourceSha256).filter(([path])=>path.startsWith("prisma/migrations/")))if(sha(read(path))!==digest)throw new Error(`Historical migration changed: ${path}`);
    const corpus=json("documentation/planner/reports/2026-10-02-phase-0/fixtures/audit-regressions.v2.json");
    if(corpus.findings.length!==34||sha(read(corpus.source.path))!==corpus.source.sha256)throw new Error("Audit fixture correspondence changed");
    outcome.auditFindings=34;
  });
  check("all 36 writer groups and migration/runtime dispositions",()=>{
    const inventory=json(`${report}/writer-dispositions.json`);const expected=json("documentation/planner/reports/2026-10-02-phase-0/execution-writers.json").curated_writers;
    if(inventory.groups.length!==36||expected.some(item=>!inventory.groups.some(group=>group.id===item.id&&group.guarantee&&group.qualification)))throw new Error("Writer disposition incomplete");
    for(const group of inventory.groups)for(const path of group.owners)read(path);
    for(const name of ["EXECUTION_WRITERS.md","WORKER_RUNTIME.md","MIGRATION_ADOPTION.md"])if(read(`${report}/${name}`).length<1000)throw new Error(`Incomplete ${name}`);
    outcome.writerGroups=36;
  });
  check("required units, contracts and audit fixtures with zero skips",()=>{
    required("units",process.execPath,["scripts/test-planner-v2-phase1-units.mjs"]);
    const units=json(`${report}/evidence/unit-results.json`);if(units.failed||units.requiredSkipped||units.missing.length||units.unexpected.length)throw new Error("Required unit coverage absent");outcome.units=units;
  });
  check("actual implementation TypeScript",()=>{
    writeFileSync(join(root,ownTypeConfig),JSON.stringify({extends:"./tsconfig.json",compilerOptions:{incremental:false},include:["**/*.ts","**/*.tsx","**/*.mts"],exclude:["node_modules","ai-agent","archive","scratch","dist","mobile/dist",".next",".next-*/**"]},null,2));
    required("source-typecheck",bin("tsc"),["--noEmit","-p",ownTypeConfig,"--pretty","false"]);
  });
  check("whole-repository TypeScript introduces no errors beyond the two recorded baseline exports",()=>{
    const result=run("repository-typecheck",bin("tsc"),["--noEmit","--incremental","false","--pretty","false"]);
    const errors=result.output.match(/^.*error TS\d+.*$/gm)??[];
    if(result.code && (errors.length!==2||!errors.every(line=>/\.next\/dev\/types\/app\/api\/(acoustics|quests)\/route\.ts/.test(line))||!result.output.includes("CURATED_SOUNDSCAPES")||!result.output.includes("calculateScopeWeight")))throw new Error("Unqualified repository type error");
    if(result.code){
      for(const [path,symbol]of [["app/api/acoustics/route.ts","CURATED_SOUNDSCAPES"],["app/api/quests/route.ts","calculateScopeWeight"]])if(!readFileSync(join(start.baselineCopy,path),"utf8").includes(symbol))throw new Error("Baseline export evidence missing");
      outcome.limitations.push("Whole-repository Next route types retain two baseline invalid custom exports: CURATED_SOUNDSCAPES and calculateScopeWeight. Actual implementation typecheck passes.");
    }
  });
  check("durable core, tests and harness ESLint",()=>required("lint",bin("eslint"),["lib/planner/v2","lib/execution-coordination.ts","lib/achievement-facts.ts","lib/ai/quota-accounting.ts","lib/ai/entitlement-policy.ts","lib/ai/entitlements.ts","__tests__/planner-v2",...['test-planner-v2-phase1-postgres','test-planner-v2-phase1-units','verify-planner-v2-phase1-browser','verify-planner-v2-phase1','build-planner-worker','dev-planner'].map(name=>`scripts/${name}.mjs`),"--max-warnings","0"]));
  check("compiled worker and production mobile build/security",()=>{
    required("worker-build",process.execPath,["scripts/build-planner-worker.mjs"]);
    required("mobile-build",process.execPath,["node_modules/vite/bin/vite.js","build","mobile"]);
    required("mobile-verify",process.execPath,["scripts/verify-mobile-bundle.mjs"]);
  });
  check("production web compilation and recorded baseline build boundary",()=>{
    const result=run("web-build",process.execPath,["node_modules/next/dist/bin/next","build","--webpack"],180000,{...env,SYLF_TEST_DIST_DIR:ownDist});
    if(result.code && !(result.output.includes("Compiled successfully")&&result.output.includes('"CURATED_SOUNDSCAPES" is not a valid Route export field.')&&!result.output.includes("Module not found")))throw new Error("Unqualified production web build failure");
    outcome.webBuild={status:result.code?"BLOCKED_BASELINE_ROUTE_EXPORT":"PASSED",exitCode:result.code};
    if(result.code)outcome.limitations.push("Production web bundle compiles; deployment build remains blocked by the unchanged Acoustics custom route export. No type suppression enabled.");
    rmSync(join(root,ownDist),{recursive:true,force:true});removeOwnIncludes();
  });
  // Remove the source-only config before Next's browser type generation.
  rmSync(join(root,ownTypeConfig),{force:true});
  check("real PostgreSQL services, process recovery, concurrency, current regression and browser gates",()=>{
    required("postgres-and-browser",process.execPath,["scripts/test-planner-v2-phase1-postgres.mjs",...args,"--browser"],360000);
    const pg=json(`${report}/evidence/postgres-harness-run.json`);const browser=json(`${report}/evidence/browser/results.json`);
    if(pg.status!=="PASSED"||pg.requiredSkippedTests!==0||pg.browser!=="PASSED"||pg.cleanupError||browser.status!=="PASSED"||browser.screenshots.length!==6||browser.checks.some(item=>!item.ok))throw new Error("Required runtime evidence incomplete");
    outcome.postgres=pg.requiredResults;outcome.browser={status:browser.status,checks:browser.checks.length,screenshots:browser.screenshots};
  });
  outcome.limitations.push("Local audited PostgreSQL bootstrap is not a full historical migration-chain replay. Hosted migration ledger/catalog/grants, actual distributed Android builds, provider intelligence and release performance remain later gates; no hosted operation was performed.");
  for(const path of new Set([...Object.keys(start.sourceSha256).filter(path=>/^(app|lib|prisma|mobile|__tests__)\//.test(path)),...walk("lib/planner/v2"),...walk("__tests__/planner-v2"),...walk("prisma/migrations/20261002000000_planner_v2_durable_core"),...['test-planner-v2-phase1-postgres','test-planner-v2-phase1-units','verify-planner-v2-phase1-browser','verify-planner-v2-phase1','build-planner-worker','dev-planner'].map(name=>`scripts/${name}.mjs`),"next.config.ts","package.json","package-lock.json","tsconfig.planner-worker.json"]))if(existsSync(join(root,path)))outcome.sourceSha256[path]=sha(readFileSync(join(root,path)));
  outcome.status="PASSED";
} catch(error){outcome.status="FAILED";outcome.error=error.message;process.exitCode=1;console.error(error.message);}
finally{rmSync(join(root,ownTypeConfig),{force:true});rmSync(join(root,ownDist),{recursive:true,force:true});removeOwnIncludes();outcome.finishedAt=new Date().toISOString();writeFileSync(join(evidence,"phase1-gate.json"),JSON.stringify(outcome,null,2)+"\n");}
