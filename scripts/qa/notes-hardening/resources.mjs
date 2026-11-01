/** Reproducible actual shared-screen checks. All API grants/accounts are synthetic; no live Drive test. */
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const evidence = new URL(
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

const ctx = await context();
await ctx.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL),
    live = new Map();
  window.qaResourceUrls = { live, created: 0, revoked: 0 };
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    live.set(url, blob.size);
    window.qaResourceUrls.created++;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    live.delete(url);
    window.qaResourceUrls.revoked++;
    revoke(url);
  };
});
const page = await ctx.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const label = process.env.NOTES_QA_LABEL || "after";
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  offline = true;
  const cdp = await ctx.newCDPSession(page);
  const sample = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    return {
      urls: await page.evaluate(() => ({
        count: window.qaResourceUrls.live.size,
        bytes: [...window.qaResourceUrls.live.values()].reduce(
          (a, b) => a + b,
          0
        ),
        created: window.qaResourceUrls.created,
        revoked: window.qaResourceUrls.revoked,
      })),
      heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters"),
    };
  };
  const initial = await sample(),
    ids = [],
    cycles = [];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/2cAAAAASUVORK5CYII=",
    "base64"
  );
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.locator("[contenteditable=true]").first().waitFor();
    const bytes = Buffer.alloc(2 * 1024 * 1024);
    png.copy(bytes);
    bytes[bytes.length - 1] = i;
    await page.getByLabel("Choose an image", { exact: true }).setInputFiles({
      name: `source-${i}.png`,
      mimeType: "image/png",
      buffer: bytes,
    });
    await page.locator('.bn-editor img[src^="blob:"]').first().waitFor();
    await page.waitForFunction(() => {
      const i = document.querySelector('.bn-editor img[src^="blob:"]');
      return i?.complete && i.naturalWidth > 0;
    });
    await page.evaluate(() => window.qa.library.flushEditors());
    ids.push(
      new URLSearchParams(
        (await page.evaluate(() => location.hash)).split("?")[1]
      ).get("document")
    );
    await page
      .getByRole("button", { name: "Back to notes", exact: true })
      .click();
    await page.locator("[contenteditable=true]").waitFor({ state: "hidden" });
    await page.waitForTimeout(80);
    cycles.push(await sample());
  }
  for (let i = 0; i < 16; i++) {
    await page.evaluate(
      ({ id, libraryId }) => {
        location.hash = `/notes?library=${libraryId}&document=${id}`;
      },
      { id: ids[i % ids.length], libraryId }
    );
    await page.locator('.bn-editor img[src^="blob:"]').first().waitFor();
    await page.waitForFunction(() => {
      const i = document.querySelector('.bn-editor img[src^="blob:"]');
      return i?.complete && i.naturalWidth > 0;
    });
    await page
      .getByRole("button", { name: "Back to notes", exact: true })
      .click();
    await page.locator("[contenteditable=true]").waitFor({ state: "hidden" });
    await page.waitForTimeout(80);
    cycles.push(await sample());
  }
  const final = await sample();
  if (label !== "before")
    assert.equal(
      final.urls.count,
      0,
      "Closed editors must release decoded images"
    );
  assert.equal(errors.length, 0);
  const result = {
    label,
    scope:
      "Actual shared rich-text editor; 8 owned padded valid PNG fixtures, 2 MiB each, 24 open/close cycles. Real encrypted IndexedDB. Synthetic HTTP, not a physical device or total-process memory bound.",
    initial,
    cycles,
    final,
    errors,
  };
  writeFileSync(
    evidence + `resources-${label}.json`,
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify({ label, initial, final, errors }));
} finally {
  await browser.close();
}
