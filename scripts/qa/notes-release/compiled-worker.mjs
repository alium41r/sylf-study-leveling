import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
const root = process.cwd(),
  require = createRequire(root + "/package.json"),
  { PDFDocument } = require("pdf-lib");
const dist = join(
    root,
    process.env.NOTES_NEXT_BUILD_DIR || "dist/.notes-phase7-default-build"
  ),
  chunks = join(dist, "static/chunks");
let factory;
for (const file of readdirSync(chunks).filter((f) => f.endsWith(".js"))) {
  const code = readFileSync(join(chunks, file), "utf8"),
    match = code.match(
      /\.b\(\w+,"(static\/chunks\/turbopack-worker-[^"]+)",(\["static\/chunks\/[^\]]+\]),\w+\)/
    );
  if (match && code.includes("PDF export")) {
    factory = { file, bootstrap: match[1], chunks: JSON.parse(match[2]) };
    break;
  }
}
if (!factory) throw Error("Compiled worker factory missing");
const { default: config } = await import(
  pathToFileURL(root + "/next.config.ts")
);
const headers = (await config.headers())[0].headers,
  csp = headers.find((h) => h.key === "Content-Security-Policy").value;
if (csp.includes("'unsafe-eval'")) throw Error("Production policy required");
const fixture = await PDFDocument.create();
fixture.addPage([612, 792]);
const asset = process.env.NOTES_WORKER_FIXTURE
    ? readFileSync(process.env.NOTES_WORKER_FIXTURE)
    : Buffer.from(await fixture.save()),
  assetId = createHash("sha256").update(asset).digest("hex"),
  pageId = randomUUID();
const job = {
  title: "Phase 7 compiled worker test",
  assets: [{ id: assetId, bytes: [...asset] }],
  pages: [
    {
      page: {
        pageId,
        streamId: randomUUID(),
        width: 612,
        height: 792,
        sourcePage: 0,
        originalAssetId: assetId,
        extensions: { pdfTransform: [1, 0, 0, -1, 0, 792], pdfRotation: 0 },
      },
      strokes: [],
      paper: {
        template: "blank",
        color: "#ffffff",
        rule: "#cccccc",
        spacing: 28,
      },
      marks: [],
      textImages: [],
    },
  ],
};
const html = `<!doctype html><title>Phase 7 compiled PDF worker</title><h1>Compiled PDF worker under production CSP</h1><button id="run">Run compiled worker check</button><p id="status">Ready</p><pre id="result"></pre><script>const factory=${JSON.stringify(factory)},job=${JSON.stringify(job)};document.getElementById('run').onclick=()=>{document.getElementById('status').textContent='Running';const u=new URL('/_next/'+factory.bootstrap,location.origin);u.hash='#params='+encodeURIComponent(JSON.stringify([factory.chunks.map(c=>'/_next/'+c).reverse(),'','','']));const worker=new Worker(u);job.assets.forEach(a=>a.bytes=new Uint8Array(a.bytes));worker.onmessage=async e=>{if(e.data.progress)return;if(e.data.error){document.getElementById('status').textContent='Failed';document.getElementById('result').textContent=e.data.error;worker.terminate();return;}const r=await(await fetch('/result',{method:'POST',body:e.data.bytes})).json();document.getElementById('status').textContent=r.passed?'Passed':'Failed';document.getElementById('result').textContent=JSON.stringify(r,null,2);worker.terminate();};worker.onerror=e=>{document.getElementById('status').textContent='Failed';document.getElementById('result').textContent=e.message;worker.terminate();};worker.postMessage(job);};</script>`;
const server = createServer(async (req, res) => {
  for (const h of headers) res.setHeader(h.key, h.value);
  const p = new URL(req.url, "http://localhost").pathname;
  if (p === "/result" && req.method === "POST") {
    const parts = [];
    let size = 0;
    for await (const b of req) {
      size += b.length;
      if (size > 5000000) {
        res.writeHead(413);
        return res.end();
      }
      parts.push(b);
    }
    try {
      const bytes = Buffer.concat(parts),
        pdf = await PDFDocument.load(bytes),
        result = {
          passed: pdf.getPageCount() === 1,
          outputPages: pdf.getPageCount(),
          exportBytes: bytes.length,
          productionCsp: csp,
          compiledFactory: factory,
          scope:
            "Actual compiled Turbopack worker on a loopback fixture; no hosted authentication or Google test",
        };
      writeFileSync(
        root +
          "/documentation/notes/reports/phase-7/evidence/compiled-worker-results.json",
        JSON.stringify(result, null, 2) + "\n"
      );
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(result));
    } catch {
      res.writeHead(500);
      return res.end('{"passed":false}');
    }
  }
  if (p === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end(html);
  }
  const file = resolve(dist, "." + p.replace(/^\/_next/, ""));
  if (
    !p.startsWith("/_next/static/") ||
    !file.startsWith(resolve(dist, "static") + "/")
  ) {
    res.writeHead(404);
    return res.end();
  }
  try {
    res.setHeader("Content-Type", "application/javascript");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(4396, "127.0.0.1", () =>
  console.log("Compiled worker fixture ready at http://127.0.0.1:4396")
);
process.once("SIGTERM", () => server.close(() => process.exit(0)));
