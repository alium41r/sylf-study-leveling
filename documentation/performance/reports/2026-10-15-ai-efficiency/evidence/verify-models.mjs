// Free metadata GET requests only. Never generates content or prints secrets.
import { writeFile } from 'node:fs/promises';
const providers = [
  { provider: 'deepseek', url: 'https://api.deepseek.com/models', key: process.env.DEEPSEEK_API_KEY,
    models: [process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-flash','deepseek-reasoner','deepseek-v4-flash-vision-exp'], header: 'Authorization' },
  { provider: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', key: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY,
    models: ['gemini-2.5-flash',process.env.GEMINI_REASONING_MODEL].filter(Boolean), header: 'x-goog-api-key' },
  { provider: 'groq', url: 'https://api.groq.com/openai/v1/models', key: process.env.GROQ_API_KEY,
    models: [process.env.GROQ_MODEL || 'openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b'], header: 'Authorization' },
];
const result = { checkedAt: new Date().toISOString(), method: 'Authenticated model-list GET metadata only; no model execution or paid diagnostics.', providers: [] };
for (const entry of providers) {
  if (!entry.key) { result.providers.push({ provider: entry.provider, status: 'credentials_unavailable' }); continue; }
  try {
    const response = await fetch(entry.url, { headers: { [entry.header]: entry.header === 'Authorization' ? `Bearer ${entry.key}` : entry.key }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) { result.providers.push({ provider: entry.provider, status: 'metadata_unavailable', httpStatus: response.status }); continue; }
    const json = await response.json();
    const list = entry.provider === 'gemini' ? json.models : json.data;
    result.providers.push({ provider: entry.provider, status: 'verified_metadata', models: [...new Set(entry.models)].map(model => {
      const metadata = list?.find(item => (item.id || item.name?.replace(/^models\//,'')) === model);
      return { model: /^[a-zA-Z0-9_./:-]{1,128}$/.test(model) ? model : 'custom', listed: Boolean(metadata), ...(entry.provider === 'gemini' && metadata ? { supportsGenerateContent: metadata.supportedGenerationMethods?.includes('generateContent') === true } : {}) };
    }) });
  } catch { result.providers.push({ provider: entry.provider, status: 'network_unavailable' }); }
}
await writeFile(new URL('./model-availability.json', import.meta.url), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
