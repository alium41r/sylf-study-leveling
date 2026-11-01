/** Non-generating reachability/account preflight. No model, Search or Fetch calls. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const origin = "https://api.deepseek.com";
export const allowedPaths = Object.freeze(["/models", "/user/balance"]);
// Match the existing DeepSeekAdapter's in-memory credential sanitation.
const cleanKey = value => value.replace(/[^\x20-\x7E]/g, "").trim();
export function readKey(root, environment = process.env) {
  if (environment.DEEPSEEK_API_KEY?.trim()) return cleanKey(environment.DEEPSEEK_API_KEY);
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*(.*?)\s*$/);
      if (match) return cleanKey(match[1].replace(/^(["'])(.*)\1$/, "$2"));
    }
  }
  return null;
}
export async function getMetadata(path, key, request = fetch) {
  if (!allowedPaths.includes(path) || !key) throw new Error("METADATA_GET_ONLY");
  try {
    const response = await request(origin + path, { method: "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) { await response.body?.cancel(); return { path, status: response.status, ok: false }; }
    if (!response.body || Number(response.headers.get("content-length") ?? 0) > 65536) throw new Error("METADATA_TOO_LARGE");
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 65536) throw new Error("METADATA_TOO_LARGE"); chunks.push(chunk.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return { path, status: response.status, ok: true, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch (error) {
    const code = error?.cause?.code ?? error?.code ?? error?.name;
    return { path, ok: false, error: typeof code === "string" && /^[A-Z_a-z0-9]+$/.test(code) ? code : "TRANSPORT_FAILURE" };
  }
}
export async function preflight(root, { request = fetch, key = readKey(root) } = {}) {
  if (!key) return { schemaVersion: 1, status: "CREDENTIAL_UNAVAILABLE", paidCalls: 0, metadataRequests: [], checkedAt: new Date().toISOString() };
  const metadataRequests = [];
  // Sequential and bounded: no automatic retries or provider endpoint probing.
  for (const path of allowedPaths) metadataRequests.push(await getMetadata(path, key, request));
  const models = metadataRequests.find(r => r.path === "/models")?.data?.data;
  const balance = metadataRequests.find(r => r.path === "/user/balance")?.data;
  const model = Array.isArray(models) ? models.find(m => m.id === "deepseek-flash") : null;
  const capabilitiesReady = Number.isSafeInteger(model?.context_window) && model.context_window >= 565536 &&
    Number.isSafeInteger(model?.max_output_tokens) && model.max_output_tokens >= 65536 && model.effort?.supported_levels?.includes("high");
  return { schemaVersion: 1, status: metadataRequests.every(r => r.ok) && capabilitiesReady && typeof balance?.is_available === "boolean" ? "METADATA_REACHABLE" : "INCOMPLETE",
    paidCalls: 0, fixedOrigin: origin, credentialRecorded: false,
    metadataRequests: metadataRequests.map(r => ({ path: r.path, ok: r.ok, ...(r.status === undefined ? {} : { status: r.status }), ...(r.error ? { error: r.error } : {}) })),
    model: model ? { id: model.id, name: model.name ?? null, contextWindow: model.context_window ?? null,
      maxOutputTokens: model.max_output_tokens ?? null, effort: model.effort ?? null } : null,
    balance: balance ? { isAvailable: balance.is_available, balances: balance.balance_infos } : null,
    limitations: ["Metadata GET success does not prove generation delivery, model quality, tool delivery or long-running streaming reliability."], checkedAt: new Date().toISOString() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--private-output" || !resolve(args[1]).startsWith("/private/tmp/")) throw new Error("Use --private-output /private/tmp/name.json; this contains private account balance data.");
  const result = await preflight(process.cwd());
  writeFileSync(args[1], JSON.stringify(result, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ status: result.status, paidCalls: 0, metadataRequests: result.metadataRequests, model: result.model, privateReceipt: args[1] }));
  if (result.status !== "METADATA_REACHABLE") process.exitCode = 1;
}
