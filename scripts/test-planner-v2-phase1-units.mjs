/** Required Phase 1 unit/contract checks. Explicit local-only file allowlist;
 * never selects historical live database scripts by a substring such as focus.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const root=resolve(import.meta.dirname,"..");
const evidence=join(root,"documentation/planner/reports/2026-10-02-phase-1/evidence");
const files=[
  ...["contracts","evidence"].flatMap(dir=>readdirSync(join(root,"__tests__/planner-v2",dir)).filter(name=>name.endsWith(".test.ts")).map(name=>`__tests__/planner-v2/${dir}/${name}`)),
  ...["focus","timer","calendar"].flatMap(dir=>readdirSync(join(root,"__tests__",dir)).filter(name=>/\.test\.tsx?$/.test(name)).map(name=>`__tests__/${dir}/${name}`)),
  ...["planner-v2/session-client","planner-v2/durable-digests","auth/onboarding","auth/danger-zone","settings/achievements-claim",
    "subjects/subject-edit-delete","subjects/subject-lifecycle","subjects/quest-progress-reconciliation","economy/shop-inventory",
    "quests/quest-completion-atomicity","security/s4-settle-guard","skills/skill-tree","goals/goals-api","ai/calendar-tools",
    "ai/unlimited-ai-quota","ai/unlimited-ai-entitlement"].map(name=>`__tests__/${name}.test.ts`),
];
const env=Object.fromEntries(["PATH","HOME","TMPDIR","USER","LOGNAME","SHELL","SystemRoot"].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
// Vite/Next may load dotenv themselves. Mask names without forwarding values.
for(const name of [".env",".env.local",".env.test",".env.test.local"]) {
  const file=join(root,name);if(existsSync(file))for(const match of readFileSync(file,"utf8").matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm))env[match[1]]="";
}
Object.assign(env,{NODE_ENV:"test",JWT_SECRET:"phase1-owned-unit-fixture",JWT_ISSUER:"sylf",JWT_AUDIENCE:"sylf-app",CRON_SECRET:"phase1-owned-cron",TOOL_CONFIRMATION_SECRET:"phase1-owned-tools",
  DATABASE_URL:"postgresql://127.0.0.1:1/phase1_no_unit_database",DIRECT_URL:"postgresql://127.0.0.1:1/phase1_no_unit_database"});
const report=join(evidence,"unit-results.raw.json");let error;
try {execFileSync(join(root,"node_modules/.bin/vitest"),["run",...files,"--reporter=json","--outputFile",report],{cwd:root,env,encoding:"utf8",stdio:"pipe",timeout:180000});}
catch(failure){error=failure;}
const result=JSON.parse(readFileSync(report,"utf8"));
const actual=result.testResults.map(file=>file.name.slice(root.length+1));
const assertions=result.testResults.flatMap(file=>file.assertionResults);
const missing=files.filter(file=>!actual.includes(file));const unexpected=actual.filter(file=>!files.includes(file));
const summary={schemaVersion:1,finishedAt:new Date().toISOString(),files:actual.length,passed:assertions.filter(test=>test.status==="passed").length,
  failed:assertions.filter(test=>test.status==="failed").length,requiredSkipped:assertions.filter(test=>!["passed","failed"].includes(test.status)).length,missing,unexpected,
  failures:assertions.filter(test=>test.status==="failed").map(test=>({name:test.fullName,messages:test.failureMessages})),database:"No database/provider credentials; database suites run exclusively in the disposable PostgreSQL harness."};
writeFileSync(join(evidence,"unit-results.json"),JSON.stringify(summary,null,2)+"\n");
if(error||summary.failed||summary.requiredSkipped||missing.length||unexpected.length) {
  console.error(JSON.stringify(summary));process.exitCode=1;
} else console.log(`Phase 1 units/contracts: ${summary.passed} passed across ${summary.files} files, zero required skips.`);
