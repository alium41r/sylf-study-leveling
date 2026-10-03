// Executes the existing cache in an isolated VM with synthetic responses; no app edits/network.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('lib/client-data-cache.ts','utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness() {
  let now=100000, requests=0, version=1;
  const entries=new Map(), pending=[];
  const storage={get length(){return entries.size},key:i=>[...entries.keys()][i],getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  const transportContext=vm.createContext({exports:{}});
  vm.runInContext(ts.transpileModule(fs.readFileSync('lib/api-transport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,transportContext);
  const context=vm.createContext({exports:{}, require:(name)=>{if(name==='./api-transport')return transportContext.exports;throw Error('Unexpected import');}, Date:{now:()=>now}, window:{localStorage:storage}, fetch:()=>{requests++; return new Promise(resolve=>pending.push(()=>resolve({ok:true,json:async()=>({version})})));}});
  vm.runInContext(js, context);
  return {cache:context.exports, advance:ms=>now+=ms, version:v=>version=v, requests:()=>requests, flush:async()=>{while(pending.length) pending.shift()(); for(let i=0;i<8;i++) await Promise.resolve();},entries};
}
const results=[];
for(const storageKey of [undefined,'social:friends:7']) {
 const h=harness(); const a=h.cache.fetchCachedJSON('/api/friends',{}, {storageKey}); const b=h.cache.fetchCachedJSON('/api/friends',{}, {storageKey}); await h.flush(); await Promise.all([a,b]);
 results.push({case:'two simultaneous reads',storageKey:storageKey??null,networkRequests:h.requests()});
}
{
 const h=harness(); const p=h.cache.fetchCachedJSON('/api/friends'); await h.flush(); const initial=await p;
 h.advance(11000); h.version(2); const visible=await h.cache.fetchCachedJSON('/api/friends'); await h.flush(); const nextRead=await h.cache.fetchCachedJSON('/api/friends');
 results.push({case:'stale revalidation does not notify existing caller',initial,visibleAfterBackgroundCompletion:visible,nextRead,networkRequests:h.requests()});
}
{
 const h=harness(); const p=h.cache.fetchCachedJSON('/api/friends',{}, {storageKey:'social:friends:7'}); await h.flush(); await p;
 h.cache.invalidateClientCache('/api/friends'); const data=await h.cache.fetchCachedJSON('/api/friends',{}, {storageKey:'social:friends:7'});
 results.push({case:'URL invalidation misses storage-key entry',data,networkRequests:h.requests(),storageEntries:h.entries.size});
}
{
 const h=harness(); const p=h.cache.fetchCachedJSON('/api/friends',{}, {storageKey:'social:friends:7'}); h.cache.clearClientCache(); await h.flush(); await p;
 results.push({case:'inflight completion after logout clear restores payload',storageEntries:h.entries.size});
}
{
 const h=harness(); const p=h.cache.fetchCachedJSON('/api/system-messages?sessionId=7',{}, {storageKey:'sys-msgs:7'}); await h.flush(); await p;
 results.push({case:'AI transcript storage key passes no-persist guard',storageEntries:h.entries.size});
}
fs.writeFileSync('documentation/performance/phase-0/artifacts/cache-reproductions-20260914.json',JSON.stringify({at:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results,null,2));
