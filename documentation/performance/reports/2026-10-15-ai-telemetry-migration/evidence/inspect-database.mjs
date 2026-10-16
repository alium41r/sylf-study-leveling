import {createRequire} from 'node:module';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(process.cwd()+'/package.json');
const {Client}=require('pg');
const dir='documentation/performance/reports/2026-10-15-ai-telemetry-migration/evidence';
const queries={
 migrations:`SELECT migration_name, checksum, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at`,
 columns:`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='AiUsageLog' ORDER BY ordinal_position`,
 indexes:`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='AiUsageLog' ORDER BY indexname`,
 constraints:`SELECT conname,contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public."AiUsageLog"'::regclass ORDER BY conname`,
 access:`SELECT c.relrowsecurity AS rls,has_table_privilege('postgres','public."AiUsageLog"','SELECT,INSERT,UPDATE,DELETE') AS backend_access,has_table_privilege('anon','public."AiUsageLog"','SELECT') AS anon_read,has_table_privilege('authenticated','public."AiUsageLog"','SELECT') AS browser_read FROM pg_class c WHERE c.oid='public."AiUsageLog"'::regclass`,
 legacy:`SELECT COUNT(*)::int AS total_rows,COUNT(*) FILTER (WHERE "requestId" IS NULL AND "estimatedCostUsd"=0)::int AS legacy_zero_cost_rows,COUNT(*) FILTER (WHERE "estimatedCostUsd" IS NULL)::int AS unknown_cost_rows FROM "AiUsageLog"`,
 chatSchema:`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ChatSession','SystemMessage') ORDER BY table_name,ordinal_position`
};
const out={checkedAt:new Date().toISOString(),method:'Supabase session-pool PostgreSQL read-only transaction',target:new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,data:{},errors:[]};
let client;
try{
 client=new Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:8000,statement_timeout:15000,application_name:'sylf_ai_telemetry_preflight'});
 await client.connect();await client.query('BEGIN READ ONLY');
 for(const [key,sql] of Object.entries(queries))out.data[key]=(await client.query(sql)).rows;
 await client.query('ROLLBACK');
}catch(e){out.errors.push({code:e.code||'UNAVAILABLE',operation:'session-pool connection/read',details:'Raw database messages intentionally omitted'});}
finally{await client?.end().catch(()=>{});}
if(!out.errors.length){
 const local=[];
 for(const name of (await readdir('prisma/migrations')).filter(n=>/^\d/.test(n)).sort()){
  const sql=await readFile(`prisma/migrations/${name}/migration.sql`);
  local.push({name,checksum:createHash('sha256').update(sql).digest('hex')});
 }
 const applied=new Map(out.data.migrations.filter(r=>r.applied&&!r.rolled_back).map(r=>[r.migration_name,r]));
 out.pending=local.filter(r=>!applied.has(r.name)).map(r=>r.name);
 out.checksumMismatches=local.filter(r=>applied.has(r.name)&&applied.get(r.name).checksum!==r.checksum).map(r=>r.name);
 out.failed=out.data.migrations.filter(r=>!r.applied&&!r.rolled_back).map(r=>r.migration_name);
 out.appliedNotInRepository=[...applied.keys()].filter(name=>!local.some(r=>r.name===name));
}
await writeFile(dir+'/'+(process.argv[2] || 'inspection-latest')+'.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({target:out.target,pending:out.pending,failed:out.failed,checksumMismatches:out.checksumMismatches,appliedNotInRepository:out.appliedNotInRepository,columns:out.data.columns?.length,access:out.data.access,legacy:out.data.legacy,errors:out.errors}));
