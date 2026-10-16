// Read-only aggregates. Never selects user IDs, messages, prompts, URLs or credentials.
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs/promises';
const client = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  const { rows } = await client.query(`SELECT feature, provider, model, count(*)::int AS rows,
    count(*) FILTER (WHERE "usageKnown" = true)::int AS known_usage_rows,
    count(*) FILTER (WHERE "requestId" IS NOT NULL)::int AS dispatch_rows,
    count(*) FILTER (WHERE "rootRequestId" IS NOT NULL)::int AS correlated_rows,
    count(*) FILTER (WHERE "estimatedCostUsd" IS NOT NULL)::int AS priced_rows,
    sum("promptTokens")::text AS recorded_input_tokens,
    sum("completionTokens")::text AS recorded_output_tokens,
    sum("cacheHitTokens")::text AS recorded_cached_tokens,
    sum("reasoningTokens")::text AS recorded_reasoning_tokens,
    sum("estimatedCostUsd") AS recorded_cost_subtotal_usd,
    avg("latencyMs") AS mean_recorded_transport_ms,
    min("createdAt") AS first_recorded, max("createdAt") AS last_recorded
    FROM "AiUsageLog" GROUP BY feature, provider, model ORDER BY count(*) DESC LIMIT 50`);
  const { rows: quality } = await client.query(`SELECT "accountingState", outcome, "usageKnown", count(*)::int AS rows FROM "AiUsageLog" GROUP BY 1,2,3`);
  await client.query('ROLLBACK');
  const evidence = {capturedAt: new Date().toISOString(), source: 'configured hosted database; read-only aggregates', providerCalls: 0, groups: rows, quality};
  await fs.writeFile(new URL('hosted-telemetry.json', import.meta.url), JSON.stringify(evidence, null, 2)+'\n');
  console.log(JSON.stringify(evidence));
} catch { console.error('Read-only telemetry query unavailable; no credentials or raw errors logged.'); process.exitCode=1; }
finally { await client.end().catch(()=>{}); }
