import fs from 'fs'; import path from 'path';
const root='app/api'; const rows=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name==='route.ts')rows.push(p)}}
walk(root);
const out=rows.sort().map(p=>{const s=fs.readFileSync(p,'utf8');
const methods=[...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m=>m[1]);
const reexp=[...s.matchAll(/export\s*\{[^}]*\}/g)].map(m=>m[0]).join(' ');
const g={getSession:/\bgetSession\(/.test(s),cookieSess:/getCookieSession|verifyToken\(/.test(s),admin:/requireAdmin|isAdmin|auth-admin|assertAdmin/.test(s),cron:/CRON_SECRET|cron-auth|verifyCron|isCron/.test(s),notes:/notes\/server|requireNotes|withNotes/.test(s),rate:/rateLimit\(/.test(s),zod:/zod|safeParse|\.parse\(/.test(s),origin:/origin|Origin/.test(s),prisma:/prisma\./.test(s),raw:/\$queryRaw|\$executeRaw/.test(s),unsafe:/Unsafe\(/.test(s),lines:s.split('\n').length};
return {p:p.replace('app/api/','').replace('/route.ts',''),methods,reexp:reexp.slice(0,60),...g}});
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,0));
for(const r of out){const f=Object.entries(r).filter(([k,v])=>v===true).map(([k])=>k).join(',');console.log(r.p.padEnd(58),r.methods.join('/').padEnd(20),r.lines,f,r.reexp?'['+r.reexp+']':'')}
