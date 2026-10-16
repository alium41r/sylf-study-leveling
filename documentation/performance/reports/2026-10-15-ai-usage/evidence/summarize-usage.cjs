// Offline arithmetic over aggregate counters. No credentials or network access.
const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'database-aggregates.json'), 'utf8'));
if (snapshot.errors.length) throw new Error('A successful aggregate snapshot is required.');
const rows = snapshot.data.byFeatureModel30d;
function group(key) {
  const result = {};
  for (const row of rows) {
    const out = result[row[key]] ??= { rows: 0, input: 0, output: 0, cached: 0, stored_usd: 0, zero_rows: 0 };
    for (const [target, source] of Object.entries({ rows: 'rows', input: 'input_tokens', output: 'output_tokens', cached: 'cached_tokens', stored_usd: 'stored_estimated_cost_usd', zero_rows: 'zero_cost_rows' })) out[target] += Number(row[source] ?? 0);
  }
  for (const out of Object.values(result)) {
    out.avg_input = Number((out.input / out.rows).toFixed(2));
    out.avg_output = Number((out.output / out.rows).toFixed(2));
  }
  return result;
}
const summary = { byFeature: group('feature'), byWorkload: group('workload'), byModel: group('model') };
fs.writeFileSync(path.join(dir, 'telemetry-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const features = [];
for (const feature of ['chat', 'planner']) {
  const out = { feature, single_model_log_rows: 0, input_tokens: 0, output_tokens: 0, list_price_estimate_lower_usd: 0, list_price_estimate_upper_usd: 0 };
  for (const row of rows.filter(row => row.feature === feature && row.workload !== 'planner')) {
    const input = Number(row.input_tokens), output = Number(row.output_tokens), hit = Number(row.cached_tokens);
    let lower, upper;
    if (['deepseek-flash', 'deepseek-v4-flash'].includes(row.model)) {
      lower = ((input - hit) * 0.15 + hit * 0.003 + output * 0.6) / 1e6;
      upper = lower * 2;
    } else if (row.model === 'gemini-2.5-flash') {
      lower = upper = (input * 0.3 + output * 2.5) / 1e6;
    } else if (row.model === 'openai/gpt-oss-120b') {
      lower = (input * 0.075 + output * 0.6) / 1e6;
      upper = (input * 0.15 + output * 0.6) / 1e6;
    } else throw new Error('Unpriced model in counter scenario; do not silently price at zero.');
    out.single_model_log_rows += row.rows;
    out.input_tokens += input; out.output_tokens += output;
    out.list_price_estimate_lower_usd += lower;
    out.list_price_estimate_upper_usd += upper;
  }
  out.mean_per_log_row_lower_usd = out.list_price_estimate_lower_usd / out.single_model_log_rows;
  out.mean_per_log_row_upper_usd = out.list_price_estimate_upper_usd / out.single_model_log_rows;
  for (const key of Object.keys(out)) if (key.includes('usd')) out[key] = Number(out[key].toFixed(9));
  features.push(out);
}
const estimates = {
  basis: 'Counter-based repricing scenario at public rates checked 2026-10-15. Not an invoice. DeepSeek all-off-peak vs all-peak bounds; Gemini paid text/image tier assumed with no known cache discount; Groq unknown cache all-hit/all-miss input bounds. Free allowances, grounding/search fees, hidden attempts and six mixed Classic request rows excluded. Historical counters and adapter versions are not retrospectively certified.',
  features,
};
fs.writeFileSync(path.join(dir, 'repricing-estimates.json'), JSON.stringify(estimates, null, 2) + '\n');
console.log(JSON.stringify({ rows: rows.reduce((n, row) => n + row.rows, 0), features }, null, 2));
