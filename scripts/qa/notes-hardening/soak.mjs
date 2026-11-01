/** Reproducible actual shared-screen checks. All API grants/accounts are synthetic; no live Drive test. */
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const evidence =
  process.env.NOTES_QA_EVIDENCE ||
  new URL(
    "../../../documentation/notes/reports/phase-6/evidence/",
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
const errors = [];
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
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  offline = true;
  await page.getByRole("button", { name: "More creation options" }).click();
  await page
    .getByRole("button", { name: "Handwritten notebook", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Handwritten notebook" });
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Sustained writing qualification");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("region", { name: "Handwriting paper" }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Pen"]').disabled
  );
  const cdp = await ctx.newCDPSession(page),
    samples = [];
  const sample = async (i) => {
    await cdp.send("HeapProfiler.collectGarbage");
    const result = {
      strokes: i,
      elapsedMs: Date.now() - started,
      heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters"),
      storage: await page.evaluate(() =>
        window.qa.library.repository.storageStats()
      ),
    };
    samples.push(result);
    console.log("SOAK", i, JSON.stringify(result));
    writeFileSync(
      evidence + "soak-progress.json",
      JSON.stringify(samples, null, 2)
    );
  };
  const started = Date.now(),
    count = Number(process.env.NOTES_SOAK_STROKES || 1200),
    pacing = Number(process.env.NOTES_SOAK_PACING_MS || 250),
    flushTimes = [],
    frames = [];
  await sample(0);
  for (let i = 0; i < count; i++) {
    const at = Date.now();
    const frame = await page
      .getByRole("region", { name: "Handwriting paper" })
      .evaluate(async (host, i) => {
        const r = host.getBoundingClientRect(),
          z = Math.min(1.5, Math.max(0.1, (host.clientWidth - 48) / 800)),
          stamp = performance.now(),
          start = [80 + (i % 8) * 70, 100 + (Math.floor(i / 8) % 12) * 55];
        const send = (type, n) => {
          const e = new PointerEvent(type, {
            pointerType: "pen",
            pointerId: 45,
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: r.left + 24 + (start[0] + n * 2) * z,
            clientY: r.top + 24 + (start[1] + Math.sin(n / 5) * 12) * z,
            pressure: 0.2 + (n % 10) * 0.06,
            tiltX: 15,
            tiltY: -20,
            twist: 45,
          });
          Object.defineProperty(e, "timeStamp", { value: stamp + n * 4 });
          host.dispatchEvent(e);
        };
        send("pointerdown", 0);
        for (let n = 1; n < 32; n++) send("pointermove", n);
        send("pointerup", 32);
        if (i % 100 === 0) {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          );
          return performance.now() - stamp;
        }
        return null;
      }, i);
    if (frame !== null) frames.push(frame);
    if ((i + 1) % 100 === 0) {
      const t = Date.now();
      await page.evaluate(() => window.qa.library.flushEditors());
      flushTimes.push(Date.now() - t);
      await sample(i + 1);
    }
    await page.waitForTimeout(Math.max(0, pacing - (Date.now() - at)));
  }
  const writingMs = Date.now() - started;
  async function inspect(target, id) {
    return target.evaluate(async (id) => {
      const q = window.qa,
        lib = q.library;
      await lib.flushEditors();
      const view = await lib.repository.document(
          id || new URLSearchParams(location.hash.split("?")[1]).get("document")
        ),
        p = view.descriptor.pages[0],
        s = view.descriptor.streams.find((s) => s.streamId === p.streamId),
        loaded = await lib.repository.loadStream(
          view.descriptor.documentId,
          s.streamId,
          s.epoch,
          view.heads
        ),
        model = new q.InkModel(loaded.doc);
      try {
        const strokes = model.strokes(),
          bytes = q.Y.encodeStateAsUpdate(loaded.doc),
          hash = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0")
          ).join("");
        return {
          id: view.descriptor.documentId,
          pageId: p.pageId,
          strokes: strokes.length,
          samples: strokes.reduce((n, s) => n + s.points.length, 0),
          first: strokes[0].points[3],
          hash,
          revisions: (
            await lib.repository.listRevisions(view.descriptor.documentId)
          )
            .map((r) => r.id)
            .sort(),
        };
      } finally {
        model.close();
        loaded.doc.destroy();
      }
    }, id);
  }
  const before = await inspect(page);
  assert.equal(before.strokes, count);
  assert.equal(before.samples, count * 33);
  assert.equal(before.first[4], 15);
  assert.equal(before.first[6], 45);
  await page.reload();
  await page.getByRole("region", { name: "Handwriting paper" }).waitFor();
  const reopened = await inspect(page);
  assert.equal(reopened.hash, before.hash);
  assert.deepEqual(reopened.revisions, before.revisions);
  await page
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recovery and storage", exact: true })
    .click();
  const recovery = page.getByRole("dialog", { name: "Recovery & storage" });
  await recovery
    .getByRole("button", { name: "Check local data", exact: true })
    .click();
  await recovery
    .getByRole("button", { name: "Cancel check", exact: true })
    .click();
  await recovery
    .getByText("Check cancelled. No originals were changed.", { exact: true })
    .waitFor();
  await page.screenshot({ path: evidence + "recovery-cancel-desktop.png" });
  await recovery
    .getByRole("button", { name: "Check local data", exact: true })
    .click();
  await recovery
    .getByText(
      "The retained revisions in this check passed their integrity checks.",
      { exact: true }
    )
    .waitFor();
  const download = page.waitForEvent("download");
  await recovery
    .getByRole("button", { name: "Export entire library", exact: true })
    .click();
  const archive = await download,
    path = evidence + "independent-library.sylfnote";
  await archive.saveAs(path);
  // A fresh profile must complete initial cloud discovery before local import.
  offline = false;
  const fresh = await context(),
    restore = await fresh.newPage();
  restore.on("pageerror", (e) => errors.push(e.message));
  await restore.goto("http://127.0.0.1:4390/#/notes");
  await restore.waitForFunction(() => window.qa?.library?.snapshot().ready);
  assert.equal(
    await restore.evaluate(
      (id) => window.qa.library.snapshot().notes.some((n) => n.id === id),
      before.id
    ),
    false,
    "Fresh profile must not contain source work"
  );
  await restore
    .getByLabel("Choose a portable Notes archive", { exact: true })
    .setInputFiles(path);
  await restore.waitForFunction(
    (id) => window.qa.library.snapshot().notes.some((n) => n.id === id),
    before.id
  );
  const restored = await inspect(restore, before.id);
  assert.equal(restored.hash, before.hash);
  assert.deepEqual(restored.revisions, before.revisions);
  await restore.evaluate(
    ({ libraryId, id, pageId }) =>
      (location.hash = `/notes?library=${libraryId}&document=${id}&page=${pageId}`),
    { libraryId, id: before.id, pageId: before.pageId }
  );
  await restore.getByRole("region", { name: "Handwriting paper" }).waitFor();
  await restore.waitForFunction(
    () => document.querySelector('[aria-label="Pen"]')?.disabled === false
  );
  await restore
    .getByText(`${count.toLocaleString()} strokes ·`, { exact: false })
    .waitFor();
  await restore.screenshot({ path: evidence + "soak-restored-notebook.png" });
  assert.equal(errors.length, 0);
  const result = {
    scope:
      "Paced synthetic pen events through actual shared Notes UI in Chromium with real encrypted IndexedDB. Provider outage, reload, cancellable audit, whole-library download and native import into a separate empty browser profile. This is not hardware or pen-to-photon validation.",
    count,
    pacingMs: pacing,
    writingMs,
    framesMs: frames,
    flushTimesMs: flushTimes,
    samples,
    before,
    reopened,
    restored,
    cloudFiles: files.size,
    errors,
  };
  writeFileSync(
    evidence + "soak-results.json",
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify({ count, writingMs, before, restored, errors }));
  await fresh.close();
} finally {
  await browser.close();
}
