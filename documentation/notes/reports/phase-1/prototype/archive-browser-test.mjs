// Experiment: real BlockNote journal -> portable archive -> fresh profile -> offline branch merge.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {archive,readArchive,sha} from './src/contract-probe.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
const errors=[];
try{
 const origin='http://127.0.0.1:4387/';
 async function open(context){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>!!window.probe);return page;}
 async function journal(page){await page.evaluate(()=>window.probe.flush());return page.evaluate(async()=>(await window.probe.db.journal.toArray()).map(e=>({...e,bytes:Array.from(e.bytes)})));}
 const source=await open(await browser.newContext());
 await source.evaluate(()=>window.probe.append('Portable rich text Ω 日本語'));
 const editable=source.locator('[aria-label="Local editor"] .bn-editor');await editable.click();await editable.press('ControlOrMeta+End');await editable.press('ControlOrMeta+b');await source.keyboard.insertText(' bold archive');await editable.press('ControlOrMeta+b');
 const updates=await journal(source),expected=await source.evaluate(()=>window.probe.snapshot().a);
 const pdf=Uint8Array.from(await source.evaluate(async()=>Array.from(new Uint8Array(await(await fetch('/fixture.pdf')).arrayBuffer()))));
 const pdfHash=await sha(pdf),entries={['assets/'+pdfHash]:pdf},refs=[];
 for(const update of updates){const bytes=Uint8Array.from(update.bytes),id=await sha(bytes),path='streams/flow/'+id;entries[path]=bytes;refs.push({path,id,byteLength:bytes.length});}
 const manifest={formatVersion:1,minimumReaderVersion:1,kind:'flow',codec:'yjs13-update-v1',updates:refs,assets:[{path:'assets/'+pdfHash,id:pdfHash,byteLength:pdf.length}]};
 const bytes=archive(manifest,entries),loaded=readArchive(bytes);
 for(const ref of [...loaded.manifest.updates,...loaded.manifest.assets]){assert.equal(await sha(loaded.entries[ref.path]),ref.id);assert.equal(loaded.entries[ref.path].length,ref.byteLength);}
 const restored=updates.map((entry,i)=>({...entry,bytes:Array.from(loaded.entries[refs[i].path])}));
 const dest=await open(await browser.newContext());
 await dest.evaluate(async entries=>{const db=window.probe.db;await db.transaction('rw',db.journal,db.outbox,db.state,db.meta,async()=>{await Promise.all([db.journal.clear(),db.outbox.clear(),db.state.clear(),db.meta.clear()]);await db.journal.bulkPut(entries.map(e=>({...e,bytes:Uint8Array.from(e.bytes)})));});},restored);
 await dest.reload();await dest.waitForFunction(()=>!!window.probe);assert.deepEqual(await dest.evaluate(()=>window.probe.snapshot().a),expected);
 await source.evaluate(()=>window.probe.append('original-offline-after-export'));await dest.evaluate(()=>window.probe.append('imported-offline-after-export'));
 await journal(dest);const originalBranch=await journal(source);
 await dest.evaluate(async entries=>window.probe.db.journal.bulkPut(entries.map(e=>({...e,bytes:Uint8Array.from(e.bytes)}))),originalBranch);
 await dest.reload();await dest.waitForFunction(()=>!!window.probe);const merged=await dest.evaluate(()=>window.probe.snapshot().a);
 assert.match(JSON.stringify(merged),/original-offline-after-export/);assert.match(JSON.stringify(merged),/imported-offline-after-export/);assert.equal(merged.length,expected.length+2);assert.equal(errors.length,0);
 const result={pass:true,browser:browser.version(),scope:'synthetic BlockNote journal and binary archive; not production import implementation',archiveBytes:bytes.length,archiveSha256:await sha(bytes),sourceUpdateCount:updates.length,normalizedRichTextRestored:true,assetBytesHashVerified:true,freshBrowserProfile:true,postImportSameLineageBranchesMerged:true,pageErrors:errors};
 await writeFile(process.env.P1_EVIDENCE_DIR+'/archive-portability.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
