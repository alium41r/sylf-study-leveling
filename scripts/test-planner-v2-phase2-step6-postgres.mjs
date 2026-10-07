/** Reuse the disposable harness with separate Step 6 evidence. */
import { execFileSync,spawn } from "node:child_process";
import { readFileSync,writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"..");
const evidence=resolve(root,"documentation/planner/reports/2026-10-03-phase-2/evidence/step6-postgres");
const sources=execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{cwd:root,encoding:"utf8"}).split("\0").filter(file=>/^(?:lib\/(?:planner|ai)\/|app\/api\/planner\/|__tests__\/(?:planner|planner-v2)\/|prisma\/migrations\/)/.test(file)&&/\.(?:ts|tsx|cjs|sql)$/.test(file));
sources.push("prisma/schema.prisma","lib/prisma.ts","tsconfig.planner-worker.json","vitest.config.ts","scripts/test-planner-v2-phase1-postgres.mjs","scripts/test-planner-v2-phase2-step6-postgres.mjs","scripts/build-planner-worker.mjs");
const snapshot=()=>Object.fromEntries([...new Set(sources)].sort().map(file=>[file,createHash("sha256").update(readFileSync(resolve(root,file))).digest("hex")]));
const before=snapshot();const startedAt=new Date().toISOString();
const child=spawn(process.execPath,["scripts/test-planner-v2-phase1-postgres.mjs",...process.argv.slice(2),"--evidence-dir",resolve(root,"documentation/planner/reports/2026-10-03-phase-2/evidence/step6-postgres"),"--extra-suite","__tests__/planner-v2/postgres/intelligence-boundary.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/assistant-research.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/learning-allocation.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/compiler-quality.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/generation-integration.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/research-limits.postgres.ts","--extra-suite","__tests__/planner-v2/postgres/maximum-envelope.postgres.ts"],{cwd:root,stdio:"inherit"});
child.on("exit",code=>{const after=snapshot();const changed=Object.keys(before).filter(file=>before[file]!==after[file]);writeFileSync(resolve(evidence,"step6-source-pins.json"),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),status:code===0&&!changed.length?"PASSED":"FAILED",sources:before,changedDuringRun:changed},null,2)+"\n");process.exitCode=changed.length?1:code??1;});child.on("error",error=>{process.stderr.write(error.message+"\n");process.exitCode=1;});
