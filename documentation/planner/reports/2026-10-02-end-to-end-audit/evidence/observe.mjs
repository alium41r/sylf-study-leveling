// Audit-only transparent HTTP observers. No application logic is changed.
import http from 'node:http';
import net from 'node:net';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
const out = import.meta.dirname;
let sequence = 0;
function save(kind, record) { appendFileSync(join(out, kind + '.jsonl'), JSON.stringify(record) + '\n'); }
const observer = http.createServer(async (req, res) => {
  const started=Date.now(); const id=++sequence;
  const recordable = req.url.startsWith('/api/planner') || req.url.startsWith('/api/ai-planner') || req.url.startsWith('/api/ai-usage');
  const requestChunks=[]; const responseChunks=[];
  const upstream=http.request({hostname:'127.0.0.1',port:3100,path:req.url,method:req.method,headers:req.headers}, up => {
    res.writeHead(up.statusCode,up.headers);
    up.on('data', chunk => {if(recordable) responseChunks.push(chunk);res.write(chunk);});
    up.on('end',()=>{
      if(recordable) save('http',{id,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,method:req.method,path:req.url,status:up.statusCode,request:Buffer.concat(requestChunks).toString(),response:Buffer.concat(responseChunks).toString()});
      res.end();
    });
  });
  upstream.on('error',error=>{res.writeHead(502);res.end('Audit observer failed');save('http',{id,path:req.url,error:error.message});});
  req.on('data',chunk=>{if(recordable)requestChunks.push(chunk);upstream.write(chunk);});
  req.on('end',()=>upstream.end());
  res.on('close',()=>{if(!res.writableEnded) upstream.destroy();});
});
// Preserve Next.js's local development HMR handshake. No headers are recorded.
observer.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(3100, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n') + '\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  upstream.on('error',()=>socket.destroy()); socket.on('error',()=>upstream.destroy());
});
observer.listen(3101,'127.0.0.1');
console.log('Local-only audit HTTP observer: 3101 → 127.0.0.1:3100. No external provider forwarding. Authentication bodies and headers are excluded from evidence.');
