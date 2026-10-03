// Phase 0 artifact inventory; no application files are changed.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import ts from 'typescript';
const out=process.env.SYLF_AUDIT_OUT||'documentation/performance/phase-0/artifacts';
fs.mkdirSync(out,{recursive:true});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=[...walk('app'),...walk('lib')].filter(f=>/\.(tsx?|css)$/.test(f));
const calls=[], imports=[], sourceFiles=[];
for(const file of files){
 const text=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 sourceFiles.push({file,bytes:Buffer.byteLength(text),lines:text.split('\n').length,client:/^["']use client["']/.test(text),sha256:crypto.createHash('sha256').update(text).digest('hex')});
 function visit(n){
  if(ts.isImportDeclaration(n)) imports.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,module:n.moduleSpecifier.text});
  if(ts.isCallExpression(n)){
   const name=n.expression.getText(ast);
   if(/^(fetch|fetchCachedJSON|invalidateClientCache|clearClientCache|setInterval|setTimeout|createContext|dynamic|lazy|useAuth|useAcoustics|usePostgresChanges|useRealtimePresence|useFocusPartyRealtime)$/.test(name)) calls.push({file,line:ast.getLineAndCharacterOfPosition(n.getStart()).line+1,name,args:n.arguments.map(a=>a.getText(ast).slice(0,700))});
  }
  ts.forEachChild(n,visit);
 }visit(ast);
}
fs.writeFileSync(`${out}/frontend-inventory.json`,JSON.stringify({at:new Date().toISOString(),sourceFiles,calls,imports},null,2));
const sizes=f=>{const b=fs.readFileSync(f); return {file:f,bytes:b.length,gzipBytes:zlib.gzipSync(b).length,brotliBytes:zlib.brotliCompressSync(b).length};};
const chunks=walk('.next/static/chunks').filter(f=>f.endsWith('.js')).map(sizes).sort((a,b)=>b.bytes-a.bytes);
const routes=[];
for(const name of ['index','dashboard','goals','social','focus','system','locker','timer']){
 const htmlPath=`.next/server/app/${name}.html`;
 if(!fs.existsSync(htmlPath))continue;
 const html=fs.readFileSync(htmlPath,'utf8');
 const scriptPaths=[...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]))];
 const scripts=scriptPaths.map(p=>sizes('.next/'+p.replace(/^\/_next\//,'')));
 const cssPaths=[...new Set([...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(m=>m[1]))];
 routes.push({route:name==='index'?'/':'/'+name,htmlBytes:Buffer.byteLength(html),scriptCount:scripts.length,scripts,scriptBytes:scripts.reduce((s,x)=>s+x.bytes,0),scriptGzipBytes:scripts.reduce((s,x)=>s+x.gzipBytes,0),css:cssPaths.map(p=>sizes('.next/'+p.replace(/^\/_next\//,'')))});
}
const modules={};
for(const f of walk('.next/server/app').filter(f=>f.endsWith('client-reference-manifest.js'))){
 const ctx={}; vm.runInNewContext(fs.readFileSync(f,'utf8'),ctx);
 for(const [route,m] of Object.entries(ctx.__RSC_MANIFEST||{})) if(['/dashboard/page','/page','/focus/page','/system/page','/social/page','/locker/page'].includes(route)) modules[route]=m.clientModules;
}
const assets=walk('public').map(f=>{const stat=fs.statSync(f);let dimensions; if(f.endsWith('.png')){const b=fs.readFileSync(f);if(b.length>24&&b.toString('ascii',1,4)==='PNG')dimensions={width:b.readUInt32BE(16),height:b.readUInt32BE(20),decodedRgbaBytes:b.readUInt32BE(16)*b.readUInt32BE(20)*4};}return {file:f,bytes:stat.size,...dimensions};}).sort((a,b)=>b.bytes-a.bytes);
fs.writeFileSync(`${out}/bundle-assets.json`,JSON.stringify({at:new Date().toISOString(),buildId:fs.readFileSync('.next/BUILD_ID','utf8').trim(),note:'HTML script declarations and on-disk compressed estimates, not executed bytes. Lazy chunks and prefetch traffic require a trace.',routes,chunks,modules,assets},null,2));
console.log(JSON.stringify({sources:files.length,fetchSites:calls.filter(c=>c.name==='fetch').length,cachedSites:calls.filter(c=>c.name==='fetchCachedJSON').length,routes:routes.map(r=>({route:r.route,js:r.scriptBytes,gzip:r.scriptGzipBytes,count:r.scriptCount})),largestChunks:chunks.slice(0,7),assetCount:assets.length,totalAssetBytes:assets.reduce((n,a)=>n+a.bytes,0)},null,2));
