// Read-only production diagnostics. No prompts, conversations, user IDs or image URLs.
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs/promises';
const db=new pg.Client({connectionString:process.env.DIRECT_URL,connectionTimeoutMillis:15000});
try {
 await db.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 const {rows}=await db.query(`SELECT "createdAt",workload,provider,model,stage,"finishReason",outcome,"accountingState","usageKnown","promptTokens","completionTokens","reasoningTokens","cacheHitTokens","latencyMs",("requestId" IS NOT NULL) AS "dispatchTracked" FROM "AiUsageLog" WHERE feature='chat' AND "createdAt">now()-interval '24 hours' ORDER BY "createdAt" DESC LIMIT 30`);
 await db.query('ROLLBACK');
 const evidence={capturedAt:new Date().toISOString(),source:'configured hosted database, last 24h chat dispatch metadata only',providerCalls:0,rows};
 await fs.writeFile(new URL('hosted-completions.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} catch {console.error('Read-only completion diagnostics unavailable; no raw errors or credentials logged.');process.exitCode=1;}
finally {await db.end().catch(()=>{});}
