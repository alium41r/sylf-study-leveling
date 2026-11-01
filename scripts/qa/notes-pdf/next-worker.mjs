/** Exercise actual Next/Turbopack export chunks under the configured production CSP. */
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
const root = resolve(import.meta.dirname, "../../.."),
  chunks = join(root, ".next/static/chunks");
// Match the generated factory, then reproduce its bootstrap arguments rather
// than adding a production test route or bypassing authenticated Notes access.
let factory;
for (const file of readdirSync(chunks).filter((f) => f.endsWith(".js"))) {
  const code = readFileSync(join(chunks, file), "utf8");
  const match = code.match(
    /\.b\(\w+,"(static\/chunks\/turbopack-worker-[^"]+)",(\["static\/chunks\/[^\]]+\]),\w+\)/
  );
  if (match && code.includes("PDF export")) {
    factory = { file, bootstrap: match[1], chunks: JSON.parse(match[2]) };
    break;
  }
}
assert(factory, "Build the production Next app before worker qualification.");
const { default: config } = await import("../../../next.config.ts");
const headers = (await config.headers())[0].headers;
const csp = headers.find((h) => h.key === "Content-Security-Policy").value;
assert(!csp.includes("'unsafe-eval'"), "Run with NODE_ENV=production.");
const server = createServer((req, res) => {
  for (const { key, value } of headers) res.setHeader(key, value);
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      "<!doctype html><title>Sylf compiled worker qualification</title>"
    );
  }
  const file = resolve(root, ".next", "." + path.replace(/^\/_next/, ""));
  if (
    !path.startsWith("/_next/static/") ||
    !file.startsWith(resolve(root, ".next/static") + "/")
  ) {
    res.statusCode = 404;
    return res.end();
  }
  try {
    res.setHeader("Content-Type", "application/javascript");
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const asset = Array.from(
    readFileSync(join(import.meta.dirname, "fixtures/lecture.pdf"))
  );
  const bytes = await page.evaluate(
    async ({ factory, asset, id }) => {
      const url = new URL("/_next/" + factory.bootstrap, location.origin);
      url.hash =
        "#params=" +
        encodeURIComponent(
          JSON.stringify([
            factory.chunks.map((c) => "/_next/" + c).reverse(),
            "",
            "",
            "",
          ])
        );
      const worker = new Worker(url);
      try {
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Compiled worker timed out")),
            15000
          );
          worker.onmessage = (e) => {
            if (e.data.progress) return;
            clearTimeout(timeout);
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(Array.from(e.data.bytes));
          };
          worker.onerror = (e) => {
            clearTimeout(timeout);
            reject(new Error(e.message));
          };
          worker.postMessage({
            title: "Compiled worker study copy",
            assets: [{ id, bytes: new Uint8Array(asset) }],
            pages: [
              {
                page: {
                  pageId: id,
                  streamId: id,
                  width: 600,
                  height: 800,
                  sourcePage: 0,
                  originalAssetId: id,
                  extensions: {
                    pdfTransform: [1, 0, 0, -1, 0, 800],
                    pdfRotation: 0,
                  },
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
              {
                page: {
                  pageId: id,
                  streamId: id,
                  width: 960,
                  height: 640,
                  sourcePage: 1,
                  originalAssetId: id,
                  extensions: {
                    pdfTransform: [0, 2, 2, 0, -120, -80],
                    pdfRotation: 90,
                  },
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
          });
        });
      } finally {
        worker.terminate();
      }
    },
    { factory, asset, id: randomUUID() }
  );
  const pdf = await PDFDocument.load(new Uint8Array(bytes));
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getPage(1).getRotation().angle, 180);
  assert.equal(errors.length, 0);
  const result = {
    passed: true,
    productionCsp: csp,
    generatedFactory: factory,
    outputPages: 2,
    bytes: bytes.length,
    errors,
    scope:
      "Actual compiled export worker; isolated static host. Not deployed OAuth/cookies or full production-route acceptance.",
  };
  writeFileSync(
    resolve(
      root,
      (process.env.NOTES_QA_EVIDENCE ||
        "documentation/notes/reports/phase-5/evidence/") +
        "next-worker-results.json"
    ),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
