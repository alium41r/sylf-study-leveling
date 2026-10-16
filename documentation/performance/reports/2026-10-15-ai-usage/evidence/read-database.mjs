import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(process.cwd() + '/package.json');
const { Client } = require('pg');
const output = process.cwd() + '/documentation/performance/reports/2026-10-15-ai-usage/evidence/database-aggregates.json';
const configured = {
 database: Boolean(process.env.DATABASE_POOL_URL || process.env.DATABASE_URL),
 deepseek: Boolean(process.env.DEEPSEEK_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY), groq: Boolean(process.env.GROQ_API_KEY),
 deepseekModelOverride: Boolean(process.env.DEEPSEEK_FLASH_MODEL || process.env.DEEPSEEK_MODEL), groqModelOverride: Boolean(process.env.GROQ_MODEL), customDeepseekEndpoint: Boolean(process.env.DEEPSEEK_BASE_URL),
 durableCore: process.env.PLANNER_V2_DURABLE_CORE_ENABLED === 'true',
 configuredGroqModel: ['openai/gpt-oss-120b','openai/gpt-oss-20b','llama-3.3-70b-versatile','qwen/qwen3.8-27b','llama-3.1-8b-instant'].includes(process.env.GROQ_MODEL) ? process.env.GROQ_MODEL : 'unset or custom (not disclosed)',
};
const result = { collectedAt: new Date().toISOString(), source: 'configured application database; aggregate-only READ ONLY transaction', configured, data: {}, errors: [] };
let client;
try {
 if (!configured.database) throw new Error('DATABASE_NOT_CONFIGURED');
 client = new Client({ connectionString: process.env.DATABASE_POOL_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 8000, statement_timeout: 10000, application_name: 'sylf_readonly_ai_audit' });
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const columns = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='AiUsageLog'`)).rows.map(r => r.column_name);
 result.data.usageColumns = columns;
 const col = (name, fallback) => columns.includes(name) ? '"'+name+'"' : fallback;
 const state = col('accountingState', "'LEGACY'");
 const request = col('requestId','NULL');
 // Syllabus compilation historically puts an academic description in this column.
 // Export only fixed workload labels, even if a future snapshot contains such rows.
 const workload = `CASE WHEN workload IN ('general_chat','focus_chat','simple_factual','planner','calendar','coach','analyst','stem','vision','exam','exam_critic','exam_repair','roadmap','roadmap_critic','roadmap_repair','mastery','mastery_critic','mastery_repair','expansion','expansion_critic','expansion_repair','rebalance','rebalance_critic','rebalance_repair') THEN workload ELSE 'other (redacted)' END`;
 if (columns.length) {
  result.data.coverage = (await client.query(`SELECT COUNT(*)::int AS rows, MIN("createdAt") AS first_row, MAX("createdAt") AS latest_row FROM "AiUsageLog"`)).rows;
  result.data.byFeatureModel30d = (await client.query(`SELECT feature, ${workload} AS workload, provider, model, ${state} AS accounting_state, COUNT(*)::int AS rows, COUNT(${request})::int AS durable_rows, SUM("promptTokens")::bigint AS input_tokens, SUM("completionTokens")::bigint AS output_tokens, SUM("cacheHitTokens")::bigint AS cached_tokens, SUM("estimatedCostUsd") AS stored_estimated_cost_usd, COUNT(*) FILTER (WHERE "estimatedCostUsd" IS NULL)::int AS unknown_cost_rows, COUNT(*) FILTER (WHERE "estimatedCostUsd"=0)::int AS zero_cost_rows, ROUND(AVG("promptTokens"),2) AS avg_input_tokens, ROUND(AVG("completionTokens"),2) AS avg_output_tokens, percentile_cont(0.5) WITHIN GROUP (ORDER BY "promptTokens") AS p50_input_tokens, percentile_cont(0.95) WITHIN GROUP (ORDER BY "promptTokens") AS p95_input_tokens, MAX("promptTokens") AS max_input_tokens, MAX("completionTokens") AS max_output_tokens FROM "AiUsageLog" WHERE "createdAt">=now()-interval '30 days' GROUP BY feature,${workload},provider,model,${state} ORDER BY input_tokens DESC`)).rows;
  result.data.byDayFeature30d = (await client.query(`SELECT date_trunc('day',"createdAt" AT TIME ZONE 'Asia/Karachi')::date AS local_day, feature, COUNT(*)::int AS rows, SUM("promptTokens")::bigint AS input_tokens, SUM("completionTokens")::bigint AS output_tokens, SUM("cacheHitTokens")::bigint AS cached_tokens, SUM("estimatedCostUsd") AS stored_estimated_cost_usd FROM "AiUsageLog" WHERE "createdAt">=now()-interval '30 days' GROUP BY 1,feature ORDER BY 1,feature`)).rows;
 }
 result.data.chatAggregate30d = (await client.query(`SELECT COUNT(*)::int AS sessions_with_user_messages, SUM(turns)::int AS user_messages, ROUND(AVG(turns),2) AS avg_user_messages_per_active_session, percentile_cont(0.5) WITHIN GROUP (ORDER BY turns) AS p50_user_messages, percentile_cont(0.95) WITHIN GROUP (ORDER BY turns) AS p95_user_messages, MAX(turns)::int AS max_user_messages, ROUND(AVG(chars),2) AS avg_user_chars_per_session FROM (SELECT "sessionId",COUNT(*) AS turns,SUM(length(content)) AS chars FROM "SystemMessage" WHERE type='USER' AND "sessionId" IS NOT NULL AND "createdAt">=now()-interval '30 days' GROUP BY "sessionId") s`)).rows;
 result.data.aiSchema = (await client.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name ILIKE '%Planner%' OR table_name='AiUsageLog') AND (column_name ILIKE '%token%' OR column_name ILIKE '%latenc%' OR column_name ILIKE '%duration%' OR column_name ILIKE '%cost%' OR column_name ILIKE '%time%' OR column_name IN ('startedAt','completedAt','createdAt','finishedAt','status','accountingState','stage')) ORDER BY table_name,ordinal_position`)).rows;
 await client.query('ROLLBACK');
} catch (error) {
 result.errors.push({ code: error?.code || 'UNAVAILABLE', name: error?.name || 'Error', note: 'Aggregate read unavailable; connection string, provider keys and database error text intentionally omitted.' });
} finally { if(client) await client.end().catch(()=>{}); }
await writeFile(output, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ configured, aggregateGroups: result.data.byFeatureModel30d?.length ?? null, coverage: result.data.coverage ?? null, errors: result.errors }));
