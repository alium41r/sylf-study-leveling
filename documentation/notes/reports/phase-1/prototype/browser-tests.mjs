import assert from 'node:assert/strict';
import {writeFile,mkdir}from'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.P1_EVIDENCE_DIR||'/private/tmp/sylf-notes-phase1/browser-evidence';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){const start=performance.now();try{const detail=await fn();results.push({name,pass:true,elapsedMs:performance.now()-start,detail});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:String(e.stack),elapsedMs:performance.now()-start});console.log('FAIL '+name+' '+e.message);}}
await page.goto('http://127.0.0.1:4387/');
await page.waitForFunction(()=>!!window.probe,{timeout:20000});
await check('browser capability and real OPFS write/read',async()=>{const d=await page.evaluate(()=>window.probe.storageProbe());assert.equal(d.opfsRead,true);return {...d,firstNavigationBootMs:await page.evaluate(()=>window.probe.bootMs)};});
await check('real BlockNote peer edits merge through Yjs',async()=>{
 await page.evaluate(()=>{window.probe.append('offline-A');window.probe.append('offline-B','b');window.probe.merge();});
 await page.evaluate(()=>window.probe.flush());const state=await page.evaluate(()=>window.probe.snapshot());
 assert.deepEqual(state.a,state.b);assert.match(JSON.stringify(state.a),/offline-A/);assert.match(JSON.stringify(state.a),/offline-B/);return{blocks:state.a.length};
});
await check('keyboard formatting and Unicode insertion',async()=>{
 const editable=page.locator('[aria-label="Local editor"] .bn-editor');
 await editable.click();await editable.press('ControlOrMeta+End');await page.keyboard.insertText(' keyboard Ω اردو 日本語');
 await editable.press('ControlOrMeta+b');await page.keyboard.insertText(' bold-probe');await editable.press('ControlOrMeta+b');
 await page.evaluate(()=>window.probe.flush());const state=await page.evaluate(()=>window.probe.snapshot());assert.match(JSON.stringify(state.a),/اردو 日本語/);assert.match(JSON.stringify(state.a),/"bold":true/);return{unicode:true,bold:true,realOSIME:false,updateToJournalAckMs:state.saveSamples};
});
await check('real IndexedDB reload recovery',async()=>{
 const before=await page.evaluate(()=>window.probe.snapshot().a);await page.reload();await page.waitForFunction(()=>!!window.probe);const after=await page.evaluate(()=>window.probe.snapshot().a);assert.deepEqual(after,before);return{restoredBlocks:after.length};
});
await check('two independent tabs preserve both offline update branches on reopen',async()=>{
 const second=await context.newPage();await second.goto('http://127.0.0.1:4387/');await second.waitForFunction(()=>!!window.probe);
 await Promise.all([page.evaluate(()=>window.probe.append('tab-A-marker')),second.evaluate(()=>window.probe.append('tab-B-marker'))]);
 await Promise.all([page.evaluate(()=>window.probe.flush()),second.evaluate(()=>window.probe.flush())]);await second.close();await page.reload();await page.waitForFunction(()=>!!window.probe);
 const restored=await page.evaluate(()=>window.probe.snapshot().a);assert.match(JSON.stringify(restored),/tab-A-marker/);assert.match(JSON.stringify(restored),/tab-B-marker/);return{bothBranchesRestored:true,liveTabBroadcast:false};
});
await check('PDF.js worker renders and extracts text',async()=>{
 const detail=await page.evaluate(()=>window.probe.pdfProbe());assert.equal(detail.pages,1);assert.match(detail.text,/Notes Phase 1/);return detail;
});
await check('ink geometry timings',()=>page.evaluate(()=>window.probe.inkBenchmark()));
await check('10,000 entry IndexedDB catalog paging',()=>page.evaluate(()=>window.probe.catalogProbe()));
for(const [label,bg,accent,mode,width]of[
 ['desktop-light','#ffffff','#7c3aed','light',1440],
 ['desktop-dark','#000000','#e879f9','dark',1440],
 ['tablet-custom-light','#f5e5c8','#22804c','dark',820],
 ['phone-custom-dark','#152e38','#ffb000','light',390]
]){
 await check('appearance '+label,async()=>{
  await page.setViewportSize({width,height:1000});const theme=await page.evaluate(([b,a,m])=>window.probe.theme(b,a,m),[bg,accent,mode]);
  assert.ok(theme.contrast>=4.5);const rendered=await page.evaluate(()=>window.probe.renderedTheme());assert.ok(rendered.bodyContrast>=4.5);assert.ok(rendered.editorContrast>=4.5);const layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,editorVisible:[...document.querySelectorAll('.bn-editor')].every(e=>e.getBoundingClientRect().width>100)}));
  assert.ok(layout.scrollWidth<=layout.viewport);assert.ok(layout.editorVisible);await page.screenshot({path:out+'/'+label+'.png',fullPage:true});return{theme,rendered,layout};
 });
}
await check('generic static shell precache excludes authenticated APIs',async()=>{
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/probe-sw.js');await navigator.serviceWorker.ready;});
 await page.reload();await page.waitForFunction(()=>!!window.probe && !!navigator.serviceWorker.controller);
 const detail=await page.evaluate(async()=>({controlled:!!navigator.serviceWorker.controller,apiCached:!!await caches.match('/api/calendar/personal')}));
 assert.equal(detail.apiCached,false);return detail;
});
await check('offline edit and offline cold reload in isolated shell',async()=>{
 await context.setOffline(true);
 await page.evaluate(()=>window.probe.append('offline-reload-marker'));await page.evaluate(()=>window.probe.flush());const before=await page.evaluate(()=>window.probe.snapshot().a);
 try {await page.reload();await page.waitForFunction(()=>!!window.probe,{timeout:15000});const after=await page.evaluate(()=>window.probe.snapshot().a);assert.deepEqual(before,after);return{offlineReload:true,productionSylfShell:false};} finally {await context.setOffline(false);await page.reload();await page.waitForFunction(()=>!!window.probe);}
});
await check('real transaction rollback leaves no partial outbox',async()=>{
 // Failure injection runs against the real browser database.
 const counts=await page.evaluate(async()=>{const db=window.probe.db;const before=await db.journal.count();try{await db.transaction('rw',db.journal,db.outbox,async()=>{await db.journal.put({id:'abort-probe',owner:1});throw new Error('abort');});}catch{}return{before,after:await db.journal.count(),partial:!!await db.journal.get('abort-probe')};});
 assert.equal(counts.partial,false);assert.equal(counts.before,counts.after);return counts;
});
await check('production Next.js client-only load without hydration error',async()=>{
 const nextPage=await context.newPage();const nextErrors=[];nextPage.on('pageerror',e=>nextErrors.push(e.message));nextPage.on('console',m=>{if(m.type()==='error' && /hydration|hydrating|did not match|didn't match/i.test(m.text()))nextErrors.push(m.text());});
 await nextPage.goto('http://127.0.0.1:4388/');await nextPage.waitForFunction(()=>!!window.probe,{timeout:20000});
 const detail=await nextPage.evaluate(()=>({editors:document.querySelectorAll('.bn-editor').length,reactReady:!!window.probe.editor}));assert.equal(detail.editors,2);assert.equal(nextErrors.length,0);await nextPage.close();return detail;
});
await check('acknowledged edit survives isolated renderer crash',async()=>{
 const crashBrowser=await chromium.launch({headless:true});try{const c=await crashBrowser.newContext();const p=await c.newPage();await p.goto('http://127.0.0.1:4387/');await p.waitForFunction(()=>!!window.probe);await p.evaluate(()=>window.probe.append('renderer-crash-marker'));await p.evaluate(()=>window.probe.flush());const cdp=await c.newCDPSession(p);await Promise.race([cdp.send('Page.crash').catch(()=>{}),new Promise(r=>setTimeout(r,2000))]);await p.close().catch(()=>{});const reopened=await c.newPage();await reopened.goto('http://127.0.0.1:4387/');await reopened.waitForFunction(()=>!!window.probe);assert.match(JSON.stringify(await reopened.evaluate(()=>window.probe.snapshot().a)),/renderer-crash-marker/);return{rendererCrash:true,powerFailure:false};}finally{await crashBrowser.close();}
});
await check('explicit database clearing removes local-only data (negative control)',async()=>{const d=await page.evaluate(async()=>{const db=window.probe.db;await window.probe.flush();const before=await db.journal.count();await db.delete();await db.open();return{before,after:await db.journal.count()};});assert.ok(d.before>0);assert.equal(d.after,0);return d;});
await writeFile(out+'/browser-results.json',JSON.stringify({browser:browser.version(),platform:process.platform,runtime:process.version,results,pageErrors:errors},null,2));
console.log(JSON.stringify({browser:browser.version(),checks:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).map(r=>({name:r.name,error:r.error})),pageErrors:errors}));
await browser.close();if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;

