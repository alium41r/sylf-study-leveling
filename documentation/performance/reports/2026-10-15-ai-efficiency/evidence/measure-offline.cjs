// Synthetic local arithmetic and receipt flow only; no provider/database access.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = process.cwd(), originalLoad = Module._load;
Module._load = function(request, parent, isMain) { if (request === 'server-only') return {}; return originalLoad.call(this, request, parent, isMain); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
global.fetch = async () => { throw Error('OFFLINE_AUDIT_NETWORK_DISABLED'); };
const { boundSylvieToolResult } = require(path.join(root, 'lib/ai/sylvie/tool-context.ts'));
const fixture = { totalQuests: 50, quests: Array.from({length: 50}, (_, id) => ({id: id + 1, title: 'Mechanics practice '+id, scheduledFor: '2026-10-15', status: 'PENDING', requiredMinutes: 45, description: 'Solve energy and power problems; check units and explain the method. '.repeat(4)})) };
const before = JSON.stringify(fixture).length, after = JSON.stringify(boundSylvieToolResult(fixture)).length;
const evidence = {basis: 'Controlled synthetic fixtures, not production averages, provider tokenizers, billed savings or model-quality tests.', toolContext: {fixtureRows: 50, beforeJsonChars: before, afterJsonChars: after, beforeApproxTokensCharsDiv4: Math.ceil(before/4), afterApproxTokensCharsDiv4: Math.ceil(after/4), truncationDisclosed: true}, defaults: {serverChatDeadlineMs:120000,clientChatDeadlineMs:125000,toolResultMaxChars:8000,toolContextMaxCharsPerEngineAttempt:24000}, costAndProviderLatency: 'Not measured. No model dispatches were made.'};
fs.writeFileSync(path.join(__dirname,'offline-measurements.json'), JSON.stringify(evidence,null,2)+'\n'); console.log(JSON.stringify(evidence));
