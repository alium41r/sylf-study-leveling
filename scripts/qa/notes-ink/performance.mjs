/** Reproducible actual shared-screen checks. All API grants/accounts are synthetic; no live Drive test. */
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const evidence = new URL(
  "../../../documentation/notes/reports/phase-4/evidence/",
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
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  const result = await page.evaluate(async () => {
    document.getElementById("root").style.display = "none";
    const { InkModel, InkRenderer, Y } = window.qa,
      doc = new Y.Doc(),
      ink = new InkModel(doc),
      style = {
        tool: "pen",
        color: "#242830",
        width: 2.8,
        input: "pen",
        brush: "perfect-freehand/1.2.3:sylf-1",
      };
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      ink.begin(style);
      ink.append(
        Array.from({ length: 64 }, (_, p) => [
          20 + (i % 20) * 36 + p * 0.4,
          40 + (Math.floor(i / 20) % 42) * 24 + Math.sin(p / 5) * 8,
          0.2 + (p % 10) * 0.06,
          p * 4,
          15,
          -20,
          45,
          0,
        ])
      );
      ink.finish();
    }
    const buildMs = performance.now() - start,
      encoded = Y.encodeStateAsUpdate(doc),
      copy = new Y.Doc(),
      hydrateStart = performance.now();
    Y.applyUpdate(copy, encoded);
    const loaded = new InkModel(copy),
      hydrateMs = performance.now() - hydrateStart;
    const base = document.createElement("canvas"),
      live = document.createElement("canvas"),
      renderer = new InkRenderer(base, live, 800, 1100);
    renderer.resize(1024, 768);
    renderer.fit();
    const strokes = loaded.strokes();
    const cold = performance.now();
    renderer.draw(strokes, loaded.paper());
    const coldRenderMs = performance.now() - cold;
    const pan = [];
    for (let i = 0; i < 20; i++) {
      renderer.pan(-2, -2);
      const t = performance.now();
      renderer.draw(strokes, loaded.paper());
      pan.push(performance.now() - t);
    }
    const active = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      renderer.overlay({ points: strokes[i].points, style });
      active.push(performance.now() - t);
    }
    const longPoints = Array.from({ length: 4096 }, (_, i) => [
        100 + i * 0.1,
        180 + Math.sin(i / 12) * 10,
        0.2 + (i % 10) * 0.06,
        i * 4,
        0,
        0,
        0,
        0,
      ]),
      longFrames = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      renderer.overlay({ points: longPoints, style });
      longFrames.push(performance.now() - t);
    }
    const stats = (list) => {
      list.sort((a, b) => a - b);
      return {
        p50Ms: list[Math.floor(list.length * 0.5)],
        p95Ms: list[Math.floor(list.length * 0.95)],
        maxMs: list.at(-1),
      };
    };
    const answer = {
      strokes: strokes.length,
      samples: ink.sampleCount(),
      encodedBytes: encoded.length,
      buildMs,
      hydrateMs,
      coldRenderMs,
      pan: stats(pan),
      activeLayer: stats(active),
      active4096Samples: stats(longFrames),
      cache: renderer.metrics(),
      environment:
        "Headless Chromium desktop; 5,000 strokes / 320,000 original samples; isolated production model/renderer. No physical input-to-display claim.",
    };
    const lib = window.qa.library,
      id = await lib.create("Dense ink qualification", "notebook", null, "ink"),
      opened = await lib.open(id);
    Y.applyUpdate(opened.stream.doc, encoded);
    await opened.stream.flush();
    const persisted = new InkModel(opened.stream.doc),
      saves = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      persisted.begin(style);
      persisted.append(
        Array.from({ length: 12 }, (_, p) => [
          100 + p,
          300 + i,
          0.5,
          p * 4,
          0,
          0,
          0,
          0,
        ])
      );
      persisted.finish();
      await opened.stream.flush();
      saves.push(performance.now() - t);
    }
    answer.encryptedNativeSaves = stats(saves);
    await lib.mutate(id, (d) => {
      d.title = "Dense ink after metadata change";
    });
    const afterMetadata = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      persisted.begin(style);
      persisted.append([[200 + i, 450, 0.5, 0, 0, 0, 0, 0]]);
      persisted.finish();
      await opened.stream.flush();
      afterMetadata.push(performance.now() - t);
    }
    answer.afterMetadataSaves = stats(afterMetadata);
    answer.storage = await lib.repository.storageStats();
    const navigationId = await lib.create(
      "300 page qualification",
      "notebook",
      null,
      "ink"
    );
    await lib.mutate(navigationId, (d) => {
      for (let i = 1; i < 300; i++) {
        const streamId = crypto.randomUUID();
        d.streams.push({
          streamId,
          epoch: 1,
          codec: "yjs13-update-v1",
          adapter: "sylf-ink/1",
          schemaVersion: 1,
          projection: { root: "ink", type: "map" },
        });
        d.pages.push({
          pageId: crypto.randomUUID(),
          streamId,
          width: 800,
          height: 1100,
          extensions: {},
        });
      }
    });
    const pages = (await lib.repository.document(navigationId)).descriptor
        .pages,
      navigation = [];
    for (let i = 0; i < 12; i++) {
      const t = performance.now(),
        handle = await lib.open(navigationId, pages[(i * 23) % 300].pageId);
      const pageModel = new InkModel(handle.stream.doc);
      pageModel.close();
      handle.release();
      navigation.push(performance.now() - t);
    }
    answer.pageNavigation = {
      pages: pages.length,
      measurements: stats(navigation),
      scope:
        "300 empty independent page streams; no dense-page or cloud latency extrapolation",
    };
    persisted.close();
    opened.release();
    renderer.close();
    loaded.close();
    copy.destroy();
    ink.close();
    doc.destroy();
    return answer;
  });
  writeFileSync(
    evidence + "ink-performance-results.json",
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
