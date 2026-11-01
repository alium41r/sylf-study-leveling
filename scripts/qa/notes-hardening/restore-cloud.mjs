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
    "../../../documentation/notes/reports/phase-6/evidence/",
    import.meta.url
  ).pathname;
mkdirSync(evidence, { recursive: true });
const fixture = JSON.parse(
  readFileSync(evidence + "soak-results.json", "utf8")
);
const { unzipSync } = await import("fflate");
const archiveManifest = JSON.parse(
  new TextDecoder().decode(
    unzipSync(readFileSync(evidence + "independent-library.sylfnote"))[
      "manifest.json"
    ]
  )
);
const libraryId = archiveManifest.library.libraryId,
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
  await page
    .getByLabel("Choose a portable Notes archive", { exact: true })
    .setInputFiles(evidence + "independent-library.sylfnote");
  await page.waitForFunction(
    (id) => window.qa.library.snapshot().notes.some((n) => n.id === id),
    fixture.before.id
  );
  const recoveryViews = [];
  for (const view of [
    {
      name: "desktop-dark",
      width: 1440,
      height: 960,
      mode: "dark",
      background: "#000000",
      accent: "#8b5cf6",
    },
    {
      name: "tablet-light",
      width: 1024,
      height: 900,
      mode: "light",
      background: "#ffffff",
      accent: "#2563eb",
    },
    {
      name: "phone-custom-light",
      width: 390,
      height: 844,
      mode: "dark",
      background: "#e8f0da",
      accent: "#923a74",
    },
    {
      name: "phone-custom-dark",
      width: 320,
      height: 800,
      mode: "light",
      background: "#152638",
      accent: "#e6b568",
    },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.evaluate(
      (v) => window.qa.applyAppearance({ ...v, persistLocal: true }),
      view
    );
    await page
      .getByRole("button", { name: "Recovery and storage", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Recovery & storage" });
    await dialog
      .getByRole("button", { name: "Check local data", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Cancel check", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await dialog
      .getByText("Check cancelled. No originals were changed.", { exact: true })
      .waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
    await page.screenshot({
      path: evidence + "recovery-cancel-" + view.name + ".png",
    });
    await dialog
      .getByRole("button", { name: "Check local data", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Cancel check", exact: true })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    recoveryViews.push({
      name: view.name,
      keyboardCancel: true,
      closeDuringScan: true,
      noHorizontalOverflow: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  offline = false;
  const begin = Date.now(),
    batches = [];
  for (let pass = 0; pass < 30; pass++) {
    const at = Date.now();
    await page.evaluate(() => window.qa.library.retrySync());
    const stats = await page.evaluate(() =>
      window.qa.library.repository.storageStats()
    );
    batches.push({ pass, ms: Date.now() - at, ...stats });
    console.log("CATCHUP", JSON.stringify(batches.at(-1)));
    if (!stats.pending) break;
  }
  const source = await page.evaluate(() =>
    window.qa.library.repository.storageStats()
  );
  assert.equal(source.pending, 0);
  const publishMs = Date.now() - begin;
  const fresh = await context(),
    restore = await fresh.newPage();
  restore.on("pageerror", (e) => errors.push(e.message));
  const started = Date.now();
  await restore.goto("http://127.0.0.1:4390/#/notes");
  await restore.waitForFunction(
    (id) =>
      window.qa?.library?.snapshot().ready &&
      window.qa.library.snapshot().notes.some((n) => n.id === id),
    fixture.before.id,
    { timeout: 120000 }
  );
  const restored = await restore.evaluate(async (id) => {
    const q = window.qa,
      view = await q.library.repository.document(id),
      p = view.descriptor.pages[0],
      s = view.descriptor.streams.find((s) => s.streamId === p.streamId),
      loaded = await q.library.repository.loadStream(
        id,
        s.streamId,
        s.epoch,
        view.heads
      ),
      ink = new q.InkModel(loaded.doc);
    try {
      return {
        strokes: ink.strokes().length,
        samples: ink.sampleCount(),
        hash: Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              q.Y.encodeStateAsUpdate(loaded.doc)
            )
          ),
          (b) => b.toString(16).padStart(2, "0")
        ).join(""),
        revisions: (await q.library.repository.listRevisions(id))
          .map((r) => r.id)
          .sort(),
      };
    } finally {
      ink.close();
      loaded.doc.destroy();
    }
  }, fixture.before.id);
  assert.equal(restored.hash, fixture.before.hash);
  assert.equal(restored.strokes, fixture.count);
  assert.deepEqual(restored.revisions, fixture.before.revisions);
  const restoreMs = Date.now() - started;
  await restore.evaluate(
    ({ libraryId, id, pageId }) => {
      location.hash = `/notes?library=${libraryId}&document=${id}&page=${pageId}`;
    },
    { libraryId, id: fixture.before.id, pageId: fixture.before.pageId }
  );
  await restore.waitForFunction(
    () => document.querySelector('[aria-label="Pen"]')?.disabled === false
  );
  await restore
    .getByText(`${fixture.count.toLocaleString()} strokes ·`, { exact: false })
    .waitFor();
  await restore.screenshot({
    path: evidence + "soak-cloud-restored-notebook.png",
  });
  assert.equal(errors.length, 0);
  const result = {
    scope:
      "Actual NotesLibrary foreground synchronization after importing the sustained-session native backup. Real encrypted Chromium storage; simulated Google pack requests. Separate fresh profile reconstructs only from provider packs.",
    publishMs,
    recoveryViews,
    batches,
    source,
    packs: files.size,
    restoreMs,
    restoredEditorReady: true,
    restored,
    errors,
  };
  writeFileSync(
    evidence + "ink-cloud-catchup.json",
    JSON.stringify(result, null, 2)
  );
  console.log(
    JSON.stringify({
      publishMs,
      source,
      packs: files.size,
      restoreMs: result.restoreMs,
      strokes: restored.strokes,
      errors,
    })
  );
  await fresh.close();
} finally {
  await browser.close();
}
