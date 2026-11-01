// Static portability audit of lib/: transitive imports + runtime API usage.
import fs from "node:fs"; import path from "node:path";
const ROOT = process.cwd();
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(p);} })(path.join(ROOT,"lib"));
const API = {
  dom: /\b(document\.|window\.|HTMLElement|HTMLCanvasElement|OffscreenCanvas|requestAnimationFrame|getComputedStyle)/,
  storage: /\b(localStorage|sessionStorage|indexedDB|Dexie|navigator\.storage|FileSystemHandle|getDirectory\()/,
  webcrypto: /crypto\.subtle/,
  locks: /navigator\.locks|BroadcastChannel/,
  workers: /new Worker\(|postMessage\(/,
  webaudio: /AudioContext|AudioWorklet|MediaElementAudioSource/,
  pointer: /PointerEvent|getCoalescedEvents|getPredictedEvents|navigator\.ink/,
  intlTz: /timeZone/,
  streams: /ReadableStream|TextDecoderStream|getReader\(/,
  structuredClone: /structuredClone\(/,
  blob: /\bnew Blob\(|URL\.createObjectURL|FileReader/,
};
const SERVER = /@prisma\/client|@\/lib\/prisma|\.\/prisma"|server-only|auth-server|lib\/[^"]*\/server\/|"\.\/server\/|"pg"|nodemailer|bcryptjs|node:|@upstash|sharp/;
const FRAMEWORK = /"next\/|"react"|"react-dom"|framer-motion|@blocknote|lucide-react/;
const info = {};
for (const f of files) {
  const src = fs.readFileSync(f,"utf8");
  const imports = [...src.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(m=>m[1]||m[2]);
  const local = [];
  for (const s of imports) {
    let base = null;
    if (s.startsWith("@/")) base = path.join(ROOT, s.slice(2)); else if (s.startsWith(".")) base = path.resolve(path.dirname(f), s);
    if (!base) continue;
    for (const c of [base+".ts", base+".tsx", path.join(base,"index.ts"), path.join(base,"index.tsx")]) if (fs.existsSync(c)) { local.push(c); break; }
  }
  const apis = Object.entries(API).filter(([,re])=>re.test(src)).map(([k])=>k);
  info[f] = { local, server: SERVER.test(imports.map(i=>`"${i}"`).join(" ")) || /from\s+["'](@\/lib\/prisma|@prisma\/client|server-only)["']/.test(src), framework: FRAMEWORK.test(imports.map(i=>`"${i}"`).join(" ")), apis, external: imports.filter(s=>!s.startsWith(".")&&!s.startsWith("@/")) };
}
const memo = {};
function closure(f, seen=new Set()) { if (seen.has(f)) return; seen.add(f); for (const d of info[f]?.local||[]) closure(d, seen); return seen; }
const rows = [];
for (const f of files) {
  const c = closure(f); let server=false, framework=false; const apis=new Set(); const ext=new Set();
  for (const d of c) { const i=info[d]; if(!i) continue; server ||= i.server; framework ||= i.framework; i.apis.forEach(a=>apis.add(a)); i.external.forEach(e=>ext.add(e)); }
  const cls = server ? "server" : framework ? "framework" : [...apis].some(a=>a!=="intlTz"&&a!=="structuredClone") ? "adapter" : "portable";
  rows.push({ file: path.relative(ROOT,f), cls, apis:[...apis].sort().join(","), ext:[...ext].filter(e=>!e.startsWith("node:")).sort().join(",") });
}
const by = rows.reduce((a,r)=>(a[r.cls]=(a[r.cls]||0)+1,a),{});
fs.writeFileSync(process.argv[2], JSON.stringify({ generatedAt:new Date().toISOString(), counts:by, rows }, null, 2));
console.log(by);
for (const dir of ["lib/notes","lib/planner","lib/ai","lib/calendar","lib/pixel-display","lib"]) {
  const r = rows.filter(x=> dir==="lib" ? path.dirname(x.file)==="lib" : x.file.startsWith(dir+"/"));
  const c = r.reduce((a,x)=>(a[x.cls]=(a[x.cls]||0)+1,a),{}); console.log(dir, JSON.stringify(c));
}
