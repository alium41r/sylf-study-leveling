import{writeFile,copyFile,readdir,mkdir}from'node:fs/promises';import{PDFDocument}from'pdf-lib';
await mkdir('public',{recursive:true});
await copyFile(process.env.SYLF_SOURCE_ROOT+'/lib/color-utils.ts','src/sylf-color.ts');
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/pdf.worker.mjs');
const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawText('Notes Phase 1 PDF worker');await writeFile('public/fixture.pdf',await pdf.save());
if(process.argv.includes('--shell')){
 const assets=['/','/index.html','/fixture.pdf','/pdf.worker.mjs',...(await readdir('dist-vite/assets')).map(f=>'/assets/'+f)];
 const source='const ALLOWED='+JSON.stringify(assets)+';const CACHE="notes-p1-static-v2";self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ALLOWED)).then(()=>self.skipWaiting())));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method==="GET"&&u.origin===self.location.origin&&ALLOWED.includes(u.pathname))e.respondWith(caches.match(e.request,{ignoreVary:true}).then(r=>r||fetch(e.request)));});';
 await writeFile('dist-vite/probe-sw.js',source);
}

