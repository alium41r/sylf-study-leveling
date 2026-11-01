/** Reproducible actual shared-screen checks. All API grants/accounts are synthetic; no live Drive test. */
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const evidence =
  process.env.NOTES_QA_EVIDENCE ||
  new URL(
    "../../../documentation/notes/reports/phase-5/evidence/",
    import.meta.url
  ).pathname;
mkdirSync(evidence, { recursive: true });
const libraryId = randomUUID(),
  key = Buffer.alloc(32, 71).toString("base64"),
  files = new Map();
let connected = true,
  offline = false,
  owner = 1,
  lost = false;
const user = {
  id: 1,
  email: "synthetic@example.test",
  username: "notes_qa",
  name: "Notes QA",
  hunterRank: "E",
  level: 1,
  currentXP: 0,
  xpToNextLevel: 100,
  hp: 100,
  maxHp: 100,
  streakDays: 1,
  totalStudyMinutes: 0,
  sylph: 100,
  hasCompletedOnboarding: true,
  createdAt: "2026-10-20T00:00:00Z",
};
const connection = () => ({
  descriptor: {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId,
    ownerRef: String(owner),
    bindingGeneration: 1,
    extensions: {},
  },
  binding: {
    provider: "google-drive",
    accountId: "synthetic-google",
    rootId: "synthetic-root",
    generation: 1,
    verifiedAt: new Date().toISOString(),
    probeHash: "0".repeat(64),
  },
  label: "synthetic@example.test",
  status: "ACTIVE",
});
const browser = await chromium.launch({ headless: true });

async function context(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    ...options,
  });
  await ctx.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const json = (v, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(v),
      });
    if (path === "/api/user/stats") return json({ ...user, id: owner });
    if (path === "/api/subjects")
      return json([{ id: 1, name: "Further Mathematics" }]);
    if (path === "/api/notes/connection")
      return json({
        configured: true,
        connection: connected ? connection() : null,
      });
    if (path === "/api/notes/unlock")
      return json({ ...connection(), vaultKey: key, headerVerified: true });
    if (path === "/api/notes/drive") {
      if (offline) return route.abort("internetdisconnected");
      if (url.searchParams.get("action") === "upload") {
        const bytes = request.postDataBuffer(),
          hash = createHash("sha256").update(bytes).digest("hex");
        assert.equal(hash, url.searchParams.get("hash"));
        assert(bytes.length <= 4400000);
        const file = { id: randomUUID(), hash, version: "1" };
        files.set(file.id, { file, bytes });
        if (lost) {
          lost = false;
          return route.abort("failed");
        }
        return json({ file });
      }
      const body = request.postDataJSON();
      if (body.action === "list")
        return json({ files: [...files.values()].map((v) => v.file) });
      if (body.action === "read") {
        const item = files.get(body.fileId);
        return route.fulfill({
          contentType: "application/octet-stream",
          body: item.bytes,
        });
      }
    }
    if (path === "/api/invites") return json([]);
    if (/\/api\/(notifications|calendar\/reminders)/.test(path))
      return json([]);
    if (path === "/api/timer/state") return json({ session: null });
    console.log("OTHER API", path);
    return json({
      success: true,
      items: [],
      notifications: [],
      unreadCount: 0,
    });
  });
  return ctx;
}
const ctx = await context(),
  page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.stack || e.message));
const corpus = readFileSync(
  new URL("./fixtures/large-300.pdf", import.meta.url)
);
await ctx.route("**/qa-pdf-corpus", (route) =>
  route.fulfill({ contentType: "application/pdf", body: corpus })
);
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  const seed = await page.evaluate(async () => {
    const qa = window.qa,
      lib = qa.library,
      bytes = new Uint8Array(
        await (await fetch("/qa-pdf-corpus")).arrayBuffer()
      );
    const inspectStart = performance.now(),
      pages = await qa.inspectPdf(bytes, lib.session.signal),
      inspectMs = performance.now() - inspectStart,
      saveStart = performance.now(),
      id = await lib.importPdf(bytes, pages, "300 page qualification.pdf");
    return {
      id,
      pages: pages.length,
      sourceBytes: bytes.length,
      inspectMs,
      importCommitMs: performance.now() - saveStart,
    };
  });
  const started = Date.now();
  await page.evaluate((id) => {
    location.hash = "/notes?document=" + id;
  }, seed.id);
  await page.waitForFunction(() =>
    document.querySelector('[data-page-id][aria-busy="false"]')
  );
  const firstPageMs = Date.now() - started;
  const navigation = [];
  for (const number of [50, 100, 150, 200, 250, 300]) {
    const start = Date.now();
    await page
      .getByLabel("PDF page number", { exact: true })
      .fill(String(number));
    await page.getByLabel("PDF page number", { exact: true }).press("Enter");
    await page.waitForFunction((number) => {
      const id = new URLSearchParams(location.hash.split("?")[1]).get(
          "document"
        ),
        p = window.qa.library.snapshot().notes.find((n) => n.id === id).view
          .descriptor.pages[number - 1],
        root = document.querySelector('[aria-label="PDF study document"]');
      return (
        root?.dataset.currentPageId === p.pageId &&
        root.querySelector(
          '[data-page-id="' + p.pageId + '"][aria-busy="false"]'
        )
      );
    }, number);
    navigation.push(Date.now() - start);
  }
  await page.waitForTimeout(300);
  const bounded = await page.evaluate(() => {
    const root = document.querySelector('[aria-label="PDF study document"]'),
      canvases = [...root.querySelectorAll("canvas")];
    return {
      mountedPages: root.querySelectorAll("[data-page-id]").length,
      canvases: canvases.length,
      attachedCanvasPixels: canvases.reduce(
        (n, c) => n + c.width * c.height,
        0
      ),
      heapUsed: performance.memory?.usedJSHeapSize,
      scope:
        "Attached canvas backing and main-window JS heap only; offscreen rasters, worker heap, GPU/process memory excluded.",
    };
  });
  assert(bounded.mountedPages <= 5);
  await page
    .getByRole("button", { name: "Search PDF text", exact: true })
    .click();
  await page
    .getByLabel("Find PDF text", { exact: true })
    .fill("photosynthesis");
  const searchStart = Date.now();
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByText("1 matching pages", { exact: true }).waitFor();
  const searchMs = Date.now() - searchStart;
  await page
    .getByRole("button", { name: "Close PDF navigation", exact: true })
    .click();
  const download = page.waitForEvent("download");
  const exported = await page.evaluate(async (id) => {
    const start = performance.now(),
      bytes = await window.qa.exportAnnotatedPdf(window.qa.library, id),
      durationMs = performance.now() - start;
    const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "large-study-copy.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { bytes: bytes.length, durationMs };
  }, seed.id);
  await (await download).saveAs(evidence + "large-300-study-copy.pdf");
  assert(exported.bytes < seed.sourceBytes * 1.5 + 300000);
  const sorted = [...navigation].sort((a, b) => a - b),
    result = {
      environment:
        "Headless Chromium desktop, 1440x960; synthetic 300-page source with vectors and a repeated 6MP image. No physical stylus, native, or live provider latency claim.",
      ...seed,
      firstPageMs,
      navigation: {
        samples: navigation,
        medianMs:
          (sorted[Math.floor((sorted.length - 1) / 2)] +
            sorted[Math.floor(sorted.length / 2)]) /
          2,
        maxMs: sorted.at(-1),
      },
      searchMs,
      bounded,
      exported,
      errors,
    };
  writeFileSync(
    evidence + "pdf-performance-results.json",
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
  assert.equal(errors.length, 0);
} catch (e) {
  console.error(e);
  console.error(await page.locator("body").innerText());
  await page
    .screenshot({
      path: evidence + "pdf-performance-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
