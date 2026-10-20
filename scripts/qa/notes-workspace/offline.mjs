/** Actual production SW; disposable loopback server/browser. No authenticated content is cached. */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/sw.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(readFileSync(new URL("../../../public/sw.js", import.meta.url)));
  } else if (path === "/notes-offline.html") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      readFileSync(
        new URL("../../../public/notes-offline.html", import.meta.url)
      )
    );
  } else if (path === "/api/private") {
    res.setHeader("Cache-Control", "private, no-store");
    res.end("PRIVATE-API");
  } else {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "private, no-store");
    res.end(
      '<!doctype html><title>QA private route</title>PRIVATE-NAVIGATION<script>navigator.serviceWorker.register("/sw.js")</script>'
    );
  }
});
await new Promise((resolve) => server.listen(4391, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true }),
  ctx = await browser.newContext(),
  page = await ctx.newPage();
try {
  await page.goto("http://127.0.0.1:4391/notes?document=synthetic");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.evaluate(() => fetch("/api/private"));
  const cached = await page.evaluate(async () => {
    const rows = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys())
        rows.push(new URL(request.url).pathname);
    }
    return rows;
  });
  assert.deepEqual(cached, ["/notes-offline.html"]);
  await ctx.setOffline(true);
  await page.reload();
  assert((await page.locator("body").innerText()).includes("Reconnect"));
  assert(!(await page.locator("body").innerText()).includes("PRIVATE"));
  await page.screenshot({
    path: new URL(
      "../../../documentation/notes/reports/phase-3/evidence/offline-locked.png",
      import.meta.url
    ).pathname,
  });
  const result = {
    passed: true,
    cached,
    authenticatedResponsesCached: false,
    offlineContentUnlock: false,
  };
  writeFileSync(
    new URL(
      "../../../documentation/notes/reports/phase-3/evidence/offline-results.json",
      import.meta.url
    ),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
