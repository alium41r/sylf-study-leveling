/** Reproducible actual shared-screen checks. All API grants/accounts are synthetic; no live Drive test. */
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const evidence = new URL(
  "../../../documentation/notes/reports/phase-3/evidence/",
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

async function context() {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
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
try {
  offline = false;
  await page.goto("http://127.0.0.1:4390/#/notes");
  // First unlock needs successful discovery; then keep this synthetic library offline for local measurements.

  await page.waitForFunction(
    () => window.qa?.library?.snapshot().ready,
    {},
    { timeout: 30000 }
  );
  offline = true;
  const measurements = await page.evaluate(async () => {
    const lib = window.qa.library,
      repo = lib.repository,
      native = await window.qa.initialRichTextUpdate("");
    const start = performance.now();
    let first;
    for (let i = 0; i < 1000; i++) {
      const id = crypto.randomUUID(),
        streamId = crypto.randomUUID(),
        descriptor = {
          format: "sylf-notes",
          formatVersion: 1,
          minimumReaderVersion: 1,
          libraryId: repo.libraryId,
          documentId: id,
          kind: "flow",
          title: "Scale document " + String(i).padStart(4, "0"),
          schemaVersion: 1,
          folderId: null,
          subjectId: null,
          streams: [
            {
              streamId,
              epoch: 1,
              codec: "yjs13-update-v1",
              adapter: "blocknote/0.56.0",
              schemaVersion: 1,
              projection: { root: "body", type: "xml" },
            },
          ],
          pages: [],
          assets: [],
          requiredFeatures: [],
          extensions: {},
        };
      await repo.save({
        operationId: crypto.randomUUID(),
        documentId: id,
        parents: [],
        kind: "create",
        descriptor,
        updates: [{ streamId, epoch: 1, bytes: native }],
      });
      first ||= descriptor;
    }
    const seedMs = performance.now() - start;
    let at = performance.now();
    await lib.refresh();
    if (lib.snapshot().notes.length < 1000) await lib.refresh();
    const coldCatalogMs = performance.now() - at;
    at = performance.now();
    await lib.refresh();
    const warmCatalogMs = performance.now() - at;
    const opened = await lib.open(first.documentId),
      latencies = [];
    for (let i = 0; i < 50; i++) {
      const at = performance.now();
      opened.stream.doc.getMap("benchmark").set("counter", i);
      await opened.stream.flush();
      latencies.push(performance.now() - at);
    }
    opened.release();
    latencies.sort((a, b) => a - b);
    const stats = await repo.storageStats();
    return {
      documents: lib.snapshot().notes.length,
      seedMs,
      coldCatalogMs,
      warmCatalogMs,
      saveP50Ms: latencies[25],
      saveP95Ms: latencies[47],
      stats,
    };
  });
  await page
    .getByRole("button", { name: "Open Scale document 0000", exact: true })
    .waitFor();
  const rendered = await page
    .getByRole("button", { name: /^Open Scale document/ })
    .count();
  assert.equal(rendered, 50);
  assert.equal(measurements.documents, 1000);
  const result = {
    ...measurements,
    renderedCards: rendered,
    environment:
      "Chromium desktop headless; synthetic empty documents; actual encrypted production repository; no network latency, tablet or IME claim",
  };
  writeFileSync(
    evidence + "performance-results.json",
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await ctx.close();
  await browser.close();
}
