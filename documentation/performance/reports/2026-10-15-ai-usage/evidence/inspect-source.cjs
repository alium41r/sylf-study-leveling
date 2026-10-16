// Offline, synthetic audit. No database access or provider calls are permitted.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = process.cwd();
const output = path.join(root, 'documentation/performance/reports/2026-10-15-ai-usage/evidence');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(root,request.slice(2)) : request, ...args); };
const load = Module._load;
Module._load = function(request, parent, isMain) {
 if(request==='server-only') return {};
 if(request==='@/lib/prisma' || request.endsWith('/lib/prisma')) return {prisma:new Proxy({}, {get(){throw new Error('AUDIT_DATABASE_DISABLED');}})};
 return load.call(this,request,parent,isMain);
};
require.extensions['.ts'] = function(module, filename) {
 const source=fs.readFileSync(filename,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 module._compile(js,filename);
};
global.fetch=async()=>{throw new Error('AUDIT_PROVIDER_NETWORK_DISABLED');};
const {buildSystemInstruction,buildVerbosityDirective}=require(path.join(root,'lib/ai/prompts.ts'));
const {normalizeSylviePage,formatSylviePage,selectSylvieTools}=require(path.join(root,'lib/ai/sylvie/turn-context.ts'));
const {retrieveSylvieKnowledge,formatSylvieKnowledge}=require(path.join(root,'lib/ai/sylvie/knowledge.ts'));
const {classifyWorkload}=require(path.join(root,'lib/ai/agent-router.ts'));
const samples=[['greeting','Hi','/system'],['general_explanation','Explain a quadratic equation','/system'],['timer_documentation','How does Sylf timer work?','/focus'],['statistics_read','Show my stats','/system'],['task_move','Move my Physics task to tomorrow','/calendar']];
const scenarios=samples.map(([name,message,pathname])=>{
 const page=normalizeSylviePage({path:pathname});const route=classifyWorkload(message,undefined,{isFocusMode:pathname==='/focus'});
 const entries=retrieveSylvieKnowledge({message,page});const tools=selectSylvieTools(route.agent,message,[]);
 const prompt=buildSystemInstruction(route.agent,'Local timezone: Asia/Karachi','2026-10-15',[formatSylviePage(page),formatSylvieKnowledge(entries)].filter(Boolean).join('\n\n'))+'\n\n'+buildVerbosityDirective(route.workload,message);
 const toolJson=JSON.stringify(tools);return {name,workload:route.workload,systemChars:prompt.length,toolSchemaJsonChars:toolJson.length,userChars:message.length,estimatedInputTokensCharsDiv4:Math.ceil((prompt.length+toolJson.length+message.length)/4),toolNames:tools.map(t=>t.name),archiveIds:entries.map(e=>e.id)};
});
const components=['persona.md','knowledge.md','capabilities.md'].map(name=>{const text=fs.readFileSync(path.join(root,'lib/ai/sylvie',name),'utf8');return {name,chars:text.length,bytes:Buffer.byteLength(text),estimatedTokensCharsDiv4:Math.ceil(text.length/4)};});
const files=[];const calls=[];const prompts=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next','dist','generated','.git'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|tsx|js|mjs|cjs)$/.test(e.name))files.push(p);}}
for(const dir of ['lib','app','scripts','mobile/src'])walk(path.join(root,dir));
for(const filename of files){
 const text=fs.readFileSync(filename,'utf8');if(!/generateResponse|generateContent|LLMFactory|SYSTEM|systemInstruction|chat\.completions/.test(text))continue;
 const source=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node){
  if(ts.isCallExpression(node)){
   const expression=node.expression.getText(source);
   if(/(?:generateResponse|generateContent|generateContentStream)$|chat\.completions\.create$|LLMFactory\.getAdapter$/.test(expression))calls.push({file:path.relative(root,filename),line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,call:expression,arguments:node.arguments.slice(0,2).map(a=>ts.isStringLiteral(a)?a.text:/^[A-Z][A-Z0-9_.]*$/.test(a.getText(source))?a.getText(source):'<dynamic>')});
  }
  if(ts.isVariableDeclaration(node)&&node.initializer&&/system|prompt/i.test(node.name.getText(source))){
   const value=node.initializer;let chars=0,slots=0;
   if(ts.isNoSubstitutionTemplateLiteral(value)||ts.isStringLiteral(value))chars=value.text.length;
   else if(ts.isTemplateExpression(value)){chars=value.head.text.length+value.templateSpans.reduce((n,s)=>n+s.literal.text.length,0);slots=value.templateSpans.length;}
   if(chars>120)prompts.push({file:path.relative(root,filename),line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,name:node.name.getText(source),staticLiteralChars:chars,dynamicSlots:slots,estimatedStaticTokensCharsDiv4:Math.ceil(chars/4)});
  }
  ts.forEachChild(node,visit);
 }visit(source);
}
const apiRoutes=files.filter(filename=>filename.endsWith('/route.ts')).map(filename=>path.relative(root,filename)).filter(filename=>/^app\/api\/(?:ai-costs|ai-planner|ai-usage|cron\/daily-briefing|planner(?:\/|\/route)|quests(?:\/evaluate-scope|\/route)|subjects\/\[id\]\/compile|system-messages\/chat)/.test(filename)).sort().map(owner=>({path:owner.slice('app'.length).replace(/\/route\.ts$/,''),owner,role:'execution or control; see report feature map'}));
const other_ai_prompt_owners=['lib/planner/v2/intelligence/assistant.ts','lib/planner/v2/intelligence/blueprint.ts','lib/planner/v2/intelligence/quality.ts','lib/planner/v2/intelligence/ocr.ts','lib/planner/v2/intelligence/research-reader.ts','lib/planner/v2/intelligence/context.ts','lib/planner/research/agent.ts','lib/planner/research/comparison.ts','lib/planner/copilot/context.ts','lib/ai/context-engine.ts'];
const result={measurement:'Exact source character counts and call-site inventory; chars/4 is a rough English/JSON token estimate, not a provider tokenizer or measured billing. Synthetic queries only; no network/model/database calls.',components,scenarios,history:{maxMessages:20,maxCharacters:18000,approxTokensCharsDiv4:4500},calls,prompts,apiRoutes,other_ai_prompt_owners,inventory_note:'AST call sites include SDK dispatches and adapter factories, so their count is not the number of features or actual requests. Inline/function-built V2 prompts are indexed separately; template counts omit dynamic data and provider framing. API inventory includes deterministic control/read routes; /api/quests POST can invoke scope evaluation.'};
fs.writeFileSync(path.join(output,'source-measurements.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({components,scenarios,callSites:calls.length,promptLiterals:prompts.length},null,2));
