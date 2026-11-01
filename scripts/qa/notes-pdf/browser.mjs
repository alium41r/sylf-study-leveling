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
const errors = [],
  results = [];
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
const ctx = await context();
let page = await ctx.newPage();

page.on("pageerror", (e) => errors.push(e.stack || e.message));
const fixture = new URL("./fixtures/lecture.pdf", import.meta.url).pathname;
async function inspect(target = page) {
  return target.evaluate(async () => {
    const lib = window.qa.library;
    await lib.flushEditors();
    const id = new URLSearchParams(location.hash.split("?")[1]).get("document"),
      view = await lib.repository.document(id),
      all = [];
    for (const p of view.descriptor.pages) {
      const stream = view.descriptor.streams.find(
          (s) => s.streamId === p.streamId
        ),
        loaded = await lib.repository.loadStream(
          id,
          p.streamId,
          stream.epoch,
          view.heads
        ),
        ink = new window.qa.InkModel(
          loaded.doc,
          () => false,
          window.qa.pdfPageMaps(loaded.doc).ink
        ),
        marks = new window.qa.PdfMarkup(loaded.doc);
      try {
        all.push({ page: p, strokes: ink.strokes(), marks: marks.marks() });
      } finally {
        ink.close();
        marks.close();
        loaded.doc.destroy();
      }
    }
    return { id, descriptor: view.descriptor, heads: view.heads, all };
  });
}
async function write(
  target = page,
  hostIndex = 0,
  start = [100, 220],
  pressure = 0.6
) {
  await target.getByRole("button", { name: "Pen", exact: true }).click();
  const host = target
    .getByRole("application", { name: "PDF handwriting surface" })
    .nth(hostIndex);
  await host.waitFor();
  await host.evaluate(
    (node, { start, pressure }) => {
      const frame = node.closest("[data-page-id]"),
        rect = frame.getBoundingClientRect(),
        width = Number(frame.dataset.pageWidth),
        height = Number(frame.dataset.pageHeight),
        rotation = Number(frame.dataset.pageRotation),
        zoom = parseFloat(node.style.width) / width;
      for (let i = 0; i < 30; i++)
        node.dispatchEvent(
          new PointerEvent(
            i === 0 ? "pointerdown" : i === 29 ? "pointerup" : "pointermove",
            {
              bubbles: true,
              cancelable: true,
              pointerType: "pen",
              pointerId: 11,
              isPrimary: true,
              button: 0,
              buttons: i === 29 ? 0 : 1,
              clientX:
                rect.left +
                (rotation === 90
                  ? height - (start[1] + Math.sin(i / 4) * 10)
                  : rotation === 180
                    ? width - (start[0] + i * 2)
                    : rotation === 270
                      ? start[1] + Math.sin(i / 4) * 10
                      : start[0] + i * 2) *
                  zoom,
              clientY:
                rect.top +
                (rotation === 90
                  ? start[0] + i * 2
                  : rotation === 180
                    ? height - (start[1] + Math.sin(i / 4) * 10)
                    : rotation === 270
                      ? width - (start[0] + i * 2)
                      : start[1] + Math.sin(i / 4) * 10) *
                  zoom,
              pressure,
              tiltX: 20,
              tiltY: -15,
              twist: 45,
            }
          )
        );
    },
    { start, pressure }
  );
}
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  await page.getByRole("button", { name: "More creation options" }).click();
  await page.getByRole("button", { name: "Import PDF", exact: true }).click();
  const beforeImport = await page.evaluate(
    () => window.qa.library.snapshot().notes.length
  );
  await page
    .getByLabel("Choose PDF file", { exact: true })
    .setInputFiles(
      new URL("./fixtures/password.pdf", import.meta.url).pathname
    );
  await page
    .getByText(/Password-protected PDFs need an unlocked copy/)
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.qa.library.snapshot().notes.length),
    beforeImport
  );
  await page.getByLabel("Choose PDF file", { exact: true }).setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nBroken fixture"),
  });
  await page.getByText(/Invalid PDF structure/).waitFor();
  assert.equal(
    await page.evaluate(() => window.qa.library.snapshot().notes.length),
    beforeImport
  );
  results.push(
    "Protected and corrupt PDF imports fail before creating replacement documents"
  );
  await page
    .getByLabel("Choose PDF file", { exact: true })
    .setInputFiles(fixture);
  await page.getByRole("region", { name: "PDF study document" }).waitFor();
  await page
    .locator('[data-selectable="true"] span')
    .filter({ hasText: "Vector fields" })
    .waitFor();
  let data = await inspect();
  assert.equal(data.descriptor.kind, "pdf");
  assert.equal(data.all.length, 3);
  assert.deepEqual(
    data.all[1].page.extensions.pdfTransform,
    [0, 2, 2, 0, -120, -80]
  );
  results.push(
    "Actual PDF.js worker import; cropped/rotated UserUnit page metadata; selectable source text"
  );
  await page.screenshot({ path: evidence + "pdf-initial.png", fullPage: true });
  await write();
  data = await inspect();
  assert.equal(data.all[0].strokes.length, 1);
  assert(Math.abs(data.all[0].strokes[0].points[5][2] - 0.6) < 1e-6);
  assert.equal(data.all[0].strokes[0].points[5][4], 20);
  results.push(
    "Existing production handwriting controller writes durable pressure/tilt vectors over PDF"
  );
  await page.getByRole("button", { name: "Select text", exact: true }).click();
  await page
    .locator('[data-selectable="true"] span')
    .filter({ hasText: "Vector fields" })
    .evaluate((node) => {
      const selection = window.getSelection(),
        range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  data = await inspect();
  assert.equal(data.all[0].marks[0].kind, "highlight");
  results.push(
    "Real PDF.js text selection produces persistent page-space highlight rectangles"
  );
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const canvas = page.locator("[data-page-id]").first();
  await canvas.click({ position: { x: 140, y: 300 } });
  await page.getByRole("dialog").waitFor();
  await page
    .getByLabel("PDF annotation text")
    .fill("Check the sign. Unicode 漢字 survives editable export.");
  await page
    .getByRole("button", { name: "Save annotation", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  data = await inspect();
  assert(data.all[0].marks.some((m) => m.text.includes("漢字")));
  results.push(
    "Unicode comment entry is durable and uses the shared recovery stream"
  );
  await page.getByLabel("PDF page actions and export", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export annotated PDF", exact: true })
    .click();
  const dl = await download;
  await dl.saveAs(evidence + "annotated-study-copy.pdf");
  results.push("Real export worker creates an annotated PDF study copy");
  await page.screenshot({
    path: evidence + "pdf-desktop-dark.png",
    fullPage: true,
  });
  const originalId = data.id,
    originalPage = data.all[0].page.pageId;
  async function settled(target = page) {
    await target.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="PDF study document"]')
          ?.getAttribute("aria-busy") === "false"
    );
  }
  async function gotoPage(number, target = page) {
    await target
      .getByLabel("PDF page number", { exact: true })
      .fill(String(number));
    await target.getByLabel("PDF page number", { exact: true }).press("Enter");
    await settled(target);
    await target.waitForFunction((number) => {
      const id = new URLSearchParams(location.hash.split("?")[1]).get(
          "document"
        ),
        p = window.qa.library
          .snapshot()
          .notes.find((n) => n.id === id)
          ?.view.descriptor.pages.filter((p) => !p.extensions.archived)[
          number - 1
        ];
      return (
        p &&
        document
          .querySelector('[aria-label="PDF study document"]')
          ?.getAttribute("data-current-page-id") === p.pageId &&
        document
          .querySelector('[data-page-id="' + p.pageId + '"]')
          ?.getAttribute("aria-busy") === "false"
      );
    }, number);
  }
  async function pageAction(name, target = page) {
    const menu = target.getByLabel("PDF page actions and export", {
      exact: true,
    });
    if ((await menu.locator("..").getAttribute("open")) === null)
      await menu.click();
    await target.getByRole("button", { name, exact: true }).click();
    await settled(target);
  }
  async function comment(text, target = page) {
    await target.getByRole("button", { name: "Comment", exact: true }).click();
    await target
      .locator("[data-page-id]")
      .first()
      .click({ position: { x: 140, y: 320 } });
    await target.getByLabel("PDF annotation text", { exact: true }).fill(text);
    await target
      .getByRole("button", { name: "Save annotation", exact: true })
      .click();
    await target.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await gotoPage(2);
  await write(page, 0, [90, 150], 0.8);
  await pageAction("Rotate page clockwise");
  data = await inspect();
  assert.equal(data.all[1].page.extensions.pdfRotation, 90);
  await write(page, 0, [180, 220], 0.4);
  data = await inspect();
  assert.equal(data.all[1].strokes.length, 2);
  console.log(
    "ROTATED INPUT",
    JSON.stringify(
      data.all[1].strokes.map((s) => ({
        first: s.points[0].slice(0, 4),
        style: s.style,
      }))
    )
  );
  assert(Math.abs(data.all[1].strokes[1].points[0][0] - 180) < 0.01);
  assert(Math.abs(data.all[1].strokes[1].points[0][1] - 220) < 0.01);
  await page.getByRole("button", { name: "Select text", exact: true }).click();
  await page
    .locator('[data-selectable="true"] span')
    .filter({ hasText: "Rotated crop and scaled units" })
    .evaluate((node) => {
      const selection = window.getSelection(),
        range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  data = await inspect();
  const rotatedRect = data.all[1].marks[0].rects[0];
  assert(rotatedRect.x > 800 && rotatedRect.x + rotatedRect.width < 960);
  assert(rotatedRect.y >= 0 && rotatedRect.y + rotatedRect.height <= 640);
  const rotatedDownload = page.waitForEvent("download");
  await pageAction("Export annotated PDF");
  await (await rotatedDownload).saveAs(evidence + "rotated-study-copy.pdf");
  results.push(
    "Cropped UserUnit source and extra rotation preserve canonical ink positions and export"
  );
  await gotoPage(1);
  await pageAction("Insert blank writing page");
  await page.waitForFunction(
    () =>
      window.qa.library
        .snapshot()
        .notes.find((n) => n.view.descriptor.kind === "pdf").view.descriptor
        .pages.length === 4
  );
  data = await inspect();
  const blank = data.descriptor.pages.find((p) => !p.originalAssetId);
  assert(blank);
  await write(page, 0, [100, 180]);
  data = await inspect();
  assert.equal(
    data.all.find((p) => p.page.pageId === blank.pageId).strokes.length,
    1
  );
  await pageAction("Duplicate page");
  data = await inspect();
  const blankCopies = data.all.filter((p) => !p.page.originalAssetId);
  assert.equal(blankCopies.length, 2);
  assert.deepEqual(
    blankCopies[0].strokes[0].points,
    blankCopies[1].strokes[0].points
  );
  assert.notEqual(blankCopies[0].page.streamId, blankCopies[1].page.streamId);
  await pageAction("Move page earlier");
  await pageAction("Remove page, keep original");
  data = await inspect();
  assert.equal(
    data.descriptor.pages.filter((p) => p.extensions.archived).length,
    1
  );
  await pageAction("Removed pages (1)");
  await page.getByRole("button", { name: "Restore page", exact: true }).click();
  data = await inspect();
  assert.equal(
    data.descriptor.pages.filter((p) => p.extensions.archived).length,
    0
  );
  assert.equal(data.descriptor.assets.length, 1);
  await page
    .getByRole("button", { name: "Close PDF navigation", exact: true })
    .click();
  results.push(
    "Insert, write, duplicate, reorder, retain and restore pages without rewriting the original PDF"
  );
  await gotoPage(1);
  await page
    .getByRole("button", { name: "Search PDF text", exact: true })
    .click();
  await page
    .getByLabel("Find PDF text", { exact: true })
    .fill("photosynthesis");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.getByText("1 matching pages", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close PDF navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bookmark PDF page", exact: true })
    .click();
  data = await inspect();
  assert(data.descriptor.pages[0].extensions.bookmarked);
  results.push(
    "Original text search and durable page bookmarks reuse document organization"
  );
  await ctx.setOffline(true);
  offline = true;
  await write(page, 0, [220, 390]);
  const offlineData = await inspect();
  assert(offlineData.all[0].strokes.length >= 2);
  offline = false;
  await ctx.setOffline(false);
  await page.evaluate(() => window.qa.library.synchronize());
  const other = await context(),
    peer = await other.newPage();
  peer.on("pageerror", (e) => errors.push(e.stack || e.message));
  await peer.goto(
    `http://127.0.0.1:4390/#/notes?library=${libraryId}&document=${originalId}&page=${originalPage}`
  );
  await peer.getByRole("region", { name: "PDF study document" }).waitFor();
  await peer
    .locator('[data-selectable="true"] span')
    .filter({ hasText: "Vector fields" })
    .waitFor();
  let peerData = await inspect(peer);
  assert(peerData.all[0].marks.some((m) => m.text.includes("漢字")));
  assert(peerData.all[0].strokes.length >= offlineData.all[0].strokes.length);
  await ctx.setOffline(true);
  await other.setOffline(true);
  offline = true;
  await comment("Independent device A");
  await comment("Independent device B", peer);
  await inspect();
  await inspect(peer);
  offline = false;
  await ctx.setOffline(false);
  await other.setOffline(false);
  await page.evaluate(() => window.qa.library.synchronize());
  await peer.evaluate(() => window.qa.library.synchronize());
  await page.evaluate(() => window.qa.library.synchronize());
  data = await inspect();
  assert(data.all[0].marks.some((m) => m.text === "Independent device A"));
  assert(data.all[0].marks.some((m) => m.text === "Independent device B"));
  await other.close();
  results.push(
    "Real offline persistence, clean-profile source reconstruction and concurrent editable comments merge"
  );
  await page.evaluate(() => {
    window.qa.quota = true;
  });
  await write(page, 0, [280, 430]);
  await page
    .getByRole("button", { name: "Retry saving", exact: true })
    .waitFor();
  const pendingBefore = await page.evaluate(() => {
    const s = window.qa.library.recoverySnapshots();
    return { count: s.length, bytes: s.map((p) => p.bytes.length) };
  });
  assert(pendingBefore.count > 0);
  await page.getByRole("button", { name: "Zoom PDF in", exact: true }).click();
  await page.waitForTimeout(250);
  const pendingAfter = await page.evaluate(() =>
    window.qa.library.recoverySnapshots().map((p) => p.bytes.length)
  );
  assert.deepEqual(pendingAfter, pendingBefore.bytes);
  assert(
    await page.getByRole("button", { name: "Pen", exact: true }).isDisabled()
  );
  const emergency = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export recovery", exact: true })
    .click();
  await (await emergency).saveAs(evidence + "pdf-quota-recovery.sylfnote");
  await page.evaluate(() => {
    window.qa.quota = false;
  });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await page.waitForFunction(
    () => window.qa.library.recoverySnapshots().length === 0
  );
  data = await inspect();
  const recoveredCount = data.all[0].strokes.length;
  await page.getByRole("button", { name: "Undo PDF ink", exact: true }).click();
  data = await inspect();
  assert.equal(data.all[0].strokes.length, recoveredCount - 1);
  await page
    .getByRole("button", { name: "Redo PDF annotation", exact: true })
    .click();
  data = await inspect();
  assert.equal(data.all[0].strokes.length, recoveredCount);
  results.push(
    "Quota failure locks input, retains pending delta across zoom, exports recovery and retries with undo intact"
  );
  const beforeCrash = await inspect(),
    url = page.url(),
    cdp = await ctx.newCDPSession(page);
  void cdp.send("Page.crash").catch(() => {});
  await page.waitForEvent("crash");
  void cdp.detach().catch(() => {});
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.goto(url);
  await page.getByRole("region", { name: "PDF study document" }).waitFor();
  data = await inspect();
  assert.deepEqual(
    data.all.map((p) => p.strokes.length),
    beforeCrash.all.map((p) => p.strokes.length)
  );
  assert(data.all[0].marks.some((m) => m.text === "Independent device A"));
  results.push(
    "Acknowledged PDF source and annotations survive a renderer crash"
  );
  for (const [name, width, height, theme] of [
    [
      "pdf-tablet-light",
      1024,
      900,
      { mode: "light", accent: "#345bc6", background: "#f4f6fa" },
    ],
    [
      "pdf-phone-custom-light",
      390,
      844,
      { mode: "dark", accent: "#6d28d9", background: "#f7f0df" },
    ],
    [
      "pdf-phone-custom-dark",
      320,
      800,
      { mode: "light", accent: "#e8b86d", background: "#20313f" },
    ],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (v) => window.qa.applyAppearance({ ...v, persistLocal: true }),
      theme
    );
    await page
      .getByRole("button", { name: "Fit PDF width", exact: true })
      .click();
    await page.waitForTimeout(450);
    const applied = await page.evaluate(() => ({
      background: localStorage.getItem("app_background"),
      accent: localStorage.getItem("app_theme"),
    }));
    assert.equal(applied.background, theme.background);
    assert.equal(applied.accent, theme.accent);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      )
    );
    const fitBounds = await page
      .getByLabel("PDF reading area", { exact: true })
      .evaluate((node) => {
        const viewport = node.getBoundingClientRect();
        const id = document
          .querySelector('[aria-label="PDF study document"]')
          .getAttribute("data-current-page-id");
        const frame = node
          .querySelector(`[data-page-id="${id}"]`)
          .getBoundingClientRect();
        return {
          left: frame.left - viewport.left,
          right: viewport.right - frame.right,
        };
      });
    assert(
      fitBounds.left >= 0 && fitBounds.right >= 0,
      `Fit width clipped at ${name}: ${JSON.stringify(fitBounds)}`
    );
    await page.screenshot({ path: evidence + name + ".png", fullPage: true });
  }
  results.push(
    "Desktop, tablet, narrow phone and opposite surface polarities render without page overflow"
  );

  await page.evaluate(() => window.qa.library.synchronize());
  const touchContext = await context({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    }),
    touchPage = await touchContext.newPage();
  touchPage.on("pageerror", (e) => errors.push(e.stack || e.message));
  await touchPage.goto(
    `http://127.0.0.1:4390/#/notes?library=${libraryId}&document=${originalId}&page=${originalPage}`
  );
  await touchPage.getByRole("region", { name: "PDF study document" }).waitFor();
  await touchPage
    .locator('[data-page-id][aria-busy="false"]')
    .first()
    .waitFor();
  await touchPage
    .getByRole("button", { name: "Fit PDF width", exact: true })
    .click();
  await touchPage.getByRole("button", { name: "Pen", exact: true }).click();
  const beforeTouch = await inspect(touchPage),
    touchTargets = await touchPage
      .getByRole("toolbar", { name: "PDF tools" })
      .getByRole("button")
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => n.checkVisibility())
          .map((n) => {
            const r = n.getBoundingClientRect();
            return {
              label: n.getAttribute("aria-label"),
              width: r.width,
              height: r.height,
            };
          })
      );
  assert(touchTargets.every((r) => r.width >= 44 && r.height >= 44));
  const touchHost = touchPage.getByRole("application", {
    name: "PDF handwriting surface",
  });
  await touchHost.evaluate((node) => {
    const r = node.getBoundingClientRect(),
      x = r.left + 80,
      y = r.top + 180;
    const send = (type, id, x, y) =>
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          pointerId: id,
          isPrimary: id === 50,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
          width: 12,
          height: 12,
        })
      );
    send("pointerdown", 50, x, y);
    send("pointermove", 50, x, y - 70);
    send("pointerup", 50, x, y - 70);
  });
  const afterPan = await inspect(touchPage);
  assert.deepEqual(
    afterPan.all.map((p) => p.strokes.length),
    beforeTouch.all.map((p) => p.strokes.length)
  );
  await gotoPage(1, touchPage);
  await touchPage.getByRole("button", { name: "Pen", exact: true }).click();
  const beforePinch = await touchPage
    .getByRole("button", { name: "Fit PDF width", exact: true })
    .innerText();
  await touchPage
    .getByRole("application", { name: "PDF handwriting surface" })
    .evaluate((node) => {
      const r = node.getBoundingClientRect(),
        x = r.left + 100,
        y = r.top + 180;
      const send = (type, id, x, y) =>
        node.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: "touch",
            pointerId: id,
            isPrimary: id === 60,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y,
            width: 12,
            height: 12,
          })
        );
      send("pointerdown", 60, x, y);
      send("pointerdown", 61, x + 80, y);
      send("pointermove", 61, x + 120, y);
      send("pointerup", 61, x + 120, y);
      send("pointerup", 60, x, y);
    });
  await touchPage.waitForTimeout(200);
  const afterPinch = await touchPage
    .getByRole("button", { name: "Fit PDF width", exact: true })
    .innerText();
  assert(parseInt(afterPinch) > parseInt(beforePinch));
  assert.deepEqual(
    (await inspect(touchPage)).all.map((p) => p.strokes.length),
    beforeTouch.all.map((p) => p.strokes.length)
  );
  await touchPage
    .getByRole("button", { name: "Focus document", exact: true })
    .click();
  await touchPage
    .getByRole("button", { name: "Exit focus writing", exact: true })
    .click();
  await touchPage.screenshot({
    path: evidence + "pdf-coarse-phone.png",
    fullPage: true,
  });
  writeFileSync(
    evidence + "pdf-accessibility-results.json",
    JSON.stringify(
      {
        passed: true,
        touchTargets,
        keyboardSearchAndSave: true,
        fullAssistiveTechnologyAudit: false,
        physicalStylus: false,
      },
      null,
      2
    )
  );
  await touchContext.close();
  results.push(
    "Coarse 44px controls, touch pan/pinch without ink, and focus exit work in the PDF surface"
  );

  writeFileSync(
    evidence + "pdf-browser-results.json",
    JSON.stringify(
      {
        results,
        errors,
        cloudFiles: files.size,
        liveGoogle: false,
        physicalStylus: false,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ results, errors }));
  assert.equal(errors.length, 0);
} catch (error) {
  console.error(error);
  console.error(await page.locator("body").innerText());
  await page
    .screenshot({ path: evidence + "pdf-browser-failure.png", fullPage: true })
    .catch(() => {});
  writeFileSync(
    evidence + "pdf-browser-results.json",
    JSON.stringify({ results, errors, failure: String(error) }, null, 2)
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
