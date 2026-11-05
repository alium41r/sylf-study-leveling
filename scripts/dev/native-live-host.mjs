/** Serves Sylf Native's web export in an ordinary browser, wired to a LOCAL backend the way Electron's host wires it, so the app can be driven and
 * screenshotted with live data. It is the Electron main process reduced to a Node server: the same `createBackendProxy` holds the session and adds the
 * bearer header, so the page never sees a token. It refuses any origin that is not this machine. Development only: the session lives in memory.
 *   node scripts/dev/native-live-host.mjs [--port 3200] [--backend http://127.0.0.1:3111] [--dist native/apps/sylf/dist]
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { createBackendProxy, parseBackendOrigin } from "../../native/apps/desktop/src/backend-proxy.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const port = Number(value("--port", "3200"));
const backend = parseBackendOrigin(value("--backend", "http://127.0.0.1:3111"));
const dist = resolve(value("--dist", "native/apps/sylf/dist"));
if (!backend || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(backend)) throw new Error("This host only talks to a backend on this machine.");

let held = null;
const vault = { durable: async () => false, read: async () => held, write: async (next) => { held = next; }, clear: async () => { held = null; } };
const proxy = createBackendProxy({ origin: backend, fetch: (input, init) => globalThis.fetch(input, init), vault, clientName: "Sylf for Mac (browser dev host)", log: (event) => console.log(`SYLF_BACKEND ${event}`) });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const BRIDGE = `<script>window.sylfDesktop=Object.freeze({platform:"darwin",versions:Object.freeze({electron:"dev",chrome:"browser",os:"dev"})});</script>`;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (proxy.handles(url.pathname)) {
      const body = ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Readable.toWeb(req);
      const response = await proxy.handle(new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
      return;
    }
    const requested = extname(url.pathname) ? url.pathname : "/index.html";
    const file = normalize(join(dist, requested));
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end("Not found"); return; }
    let data = readFileSync(file);
    if (file.endsWith("index.html")) data = Buffer.from(data.toString("utf8").replace("<head>", `<head>${BRIDGE}`));
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (error) { res.writeHead(500).end(String(error)); }
}).listen(port, "127.0.0.1", () => console.log(`Native live host on http://127.0.0.1:${port}, backend ${backend}`));
