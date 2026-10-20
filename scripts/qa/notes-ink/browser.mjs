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
const DEFAULT_COLOR = "#fffdf7";
const ctx = await context();
let page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.stack || e.message));
async function inspect(target = page) {
  return target.evaluate(async () => {
    const lib = window.qa.library;
    await lib.flushEditors();
    await lib.refresh();
    const params = new URLSearchParams(location.hash.split("?")[1]),
      id = params.get("document"),
      pageId = params.get("page");
    const view = await lib.repository.document(id),
      p =
        view.descriptor.pages.find((p) => p.pageId === pageId) ||
        view.descriptor.pages.find((p) => !p.extensions.archived),
      stream = view.descriptor.streams.find((s) => s.streamId === p.streamId),
      loaded = await lib.repository.loadStream(
        id,
        stream.streamId,
        stream.epoch,
        view.heads
      ),
      model = new window.qa.InkModel(loaded.doc);
    try {
      return {
        resume: lib.snapshot().notes.find((n) => n.id === id)?.resume,
        documentId: id,
        pageId: p.pageId,
        strokes: model.strokes(),
        paper: model.paper(),
        records: model.records.toJSON(),
        pages: view.descriptor.pages,
        heads: view.heads,
      };
    } finally {
      model.close();
      loaded.doc.destroy();
    }
  });
}
async function stroke(
  target = page,
  {
    tool = "pen",
    start = [100, 150],
    n = 100,
    cancel = false,
    pressure = true,
  } = {}
) {
  const label = {
    pen: "Pen",
    highlighter: "Highlighter",
    eraser: "Stroke eraser",
    lasso: "Lasso selection",
    hand: "Pan",
  }[tool];
  await target.getByRole("button", { name: label, exact: true }).click();
  await target.getByRole("region", { name: "Handwriting paper" }).evaluate(
    (host, { start, n, cancel, pressure }) => {
      const rect = host.getBoundingClientRect(),
        zoom = Math.min(1.5, Math.max(0.1, (host.clientWidth - 48) / 800)),
        stamp = performance.now();
      const send = (type, i) => {
        const e = new PointerEvent(type, {
          pointerType: "pen",
          pointerId: 45,
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: rect.left + 24 + (start[0] + i * 2) * zoom,
          clientY: rect.top + 24 + (start[1] + Math.sin(i / 5) * 12) * zoom,
          pressure: pressure ? 0.2 + (i % 10) * 0.06 : 0.5,
          tiltX: 15,
          tiltY: -20,
          twist: 45,
        });
        Object.defineProperty(e, "timeStamp", { value: stamp + i * 4 });
        host.dispatchEvent(e);
      };
      send("pointerdown", 0);
      for (let i = 1; i < n; i++) send("pointermove", i);
      send(cancel ? "pointercancel" : "pointerup", n);
    },
    { start, n, cancel, pressure }
  );
}
async function polygon(target, points) {
  await target
    .getByRole("button", { name: "Lasso selection", exact: true })
    .click();
  await target
    .getByRole("region", { name: "Handwriting paper" })
    .evaluate((host, points) => {
      const r = host.getBoundingClientRect(),
        z = Math.min(1.5, Math.max(0.1, (host.clientWidth - 48) / 800));
      for (let i = 0; i < points.length; i++)
        host.dispatchEvent(
          new PointerEvent(
            i === 0
              ? "pointerdown"
              : i === points.length - 1
                ? "pointerup"
                : "pointermove",
            {
              pointerId: 92,
              pointerType: "pen",
              button: 0,
              buttons: i === points.length - 1 ? 0 : 1,
              pressure: 0.5,
              bubbles: true,
              cancelable: true,
              clientX: r.left + 24 + points[i][0] * z,
              clientY: r.top + 24 + points[i][1] * z,
            }
          )
        );
    }, points);
}
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.getByRole("button", { name: "New note", exact: true }).waitFor();
  await page.getByRole("button", { name: "More creation options" }).click();
  await page
    .getByRole("button", { name: "Handwritten notebook", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Handwritten notebook" })
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Analysis — Paper");
  await page
    .getByRole("dialog", { name: "Handwritten notebook" })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pen", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Pen"]').disabled
  );
  await stroke();
  let data = await inspect();
  assert.equal(data.strokes.length, 1);
  assert.equal(data.strokes[0].points.length, 101);
  assert.equal(data.strokes[0].points[3][4], 15);
  assert.equal(data.strokes[0].points[3][6], 45);
  const firstId = data.strokes[0].id;
  await stroke(page, { tool: "highlighter", start: [95, 160], n: 80 });
  data = await inspect();
  assert.equal(data.strokes.length, 2);
  assert.equal(data.strokes[1].style.tool, "highlighter");
  results.push(
    "Handwritten notebook creation, exact pressure/tilt/twist input and durable pen/highlighter vectors"
  );
  await stroke(page, { tool: "eraser", start: [100, 150], n: 2 });
  assert.equal((await inspect()).strokes.length, 0);
  await page.getByRole("button", { name: "Undo handwriting" }).click();
  assert.equal((await inspect()).strokes.length, 2);
  await polygon(page, [
    [70, 110],
    [350, 110],
    [350, 210],
    [70, 210],
    [70, 110],
  ]);
  await page.getByRole("toolbar", { name: "Selected strokes" }).waitFor();
  await page.getByRole("button", { name: "Enlarge selected strokes" }).click();
  data = await inspect();
  assert(data.strokes[0].style.width > 2.8);
  await page.getByRole("button", { name: "Undo handwriting" }).click();
  await page.getByRole("region", { name: "Handwriting paper" }).focus();
  await page.keyboard.press("ArrowRight");
  data = await inspect();
  assert(
    Math.abs(data.strokes.find((s) => s.id === firstId).points[0][0] - 101) <
      1e-6
  );
  results.push(
    "Segment-aware stroke erasing, undo, lasso selection, scaling and keyboard movement"
  );
  await page.getByText("Paper", { exact: true }).click();
  await page.getByLabel("Paper template", { exact: true }).selectOption("grid");
  await page.getByText("Paper", { exact: true }).click();
  data = await inspect();
  assert.equal(data.paper.template, "grid");
  await stroke(page, { start: [100, 270], n: 25, cancel: true });
  data = await inspect();
  assert.equal(data.strokes.length, 3);
  assert(
    Object.values(data.records).some(
      (r) => r.kind === "end" && r.reason === "interrupted"
    )
  );
  results.push(
    "Authored paper settings and pointer cancellation retain the observed stroke"
  );
  await page.getByRole("button", { name: "Add paper page" }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 2 of 2")
  );
  assert.equal((await inspect()).strokes.length, 0);
  await page.getByRole("button", { name: "Previous paper page" }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 1 of 2")
  );
  await page.getByRole("button", { name: "Duplicate paper page" }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 3 of 3")
  );
  assert.equal((await inspect()).strokes.length, 3);
  await page.getByRole("button", { name: "Move paper page earlier" }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 2 of 3")
  );
  await page.getByRole("button", { name: "Remove paper page" }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 1 of 2")
  );
  await page
    .getByRole("button", { name: "Removed pages (1)", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore page", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Page 1 of 3")
  );
  await page.getByRole("button", { name: "Active pages", exact: true }).click();
  results.push(
    "Add, duplicate, reorder, retain and restore independent notebook pages"
  );
  const before = (await inspect()).strokes.length;
  await ctx.setOffline(true);
  await stroke(page, { start: [100, 370], n: 50 });
  assert.equal((await inspect()).strokes.length, before + 1);
  await ctx.setOffline(false);
  await page.evaluate(async () => {
    await window.qa.library.flushEditors();
    await window.qa.library.retrySync();
  });
  const url = page.url(),
    second = await context(),
    p2 = await second.newPage();
  p2.on("pageerror", (e) => errors.push(e.stack || e.message));
  await p2.goto(url);
  await p2.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="Pen"]') &&
      !document.querySelector('[aria-label="Pen"]').disabled
  );
  assert.equal((await inspect(p2)).strokes.length, before + 1);
  await Promise.all([
    stroke(page, { start: [140, 450], n: 20 }),
    stroke(p2, { start: [240, 550], n: 20 }),
  ]);
  await inspect();
  await inspect(p2);
  await page.evaluate(() => window.qa.library.retrySync());
  await p2.evaluate(() => window.qa.library.retrySync());
  await page.evaluate(() => window.qa.library.retrySync());
  await page.waitForTimeout(100);
  assert.equal((await inspect()).strokes.length, before + 3);
  assert.equal((await inspect(p2)).strokes.length, before + 3);
  await second.close();
  results.push(
    "Real browser offline persistence, fresh-profile cloud reconstruction and concurrent device strokes"
  );
  const beforeReload = await inspect();
  await page.reload();
  await page.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="Pen"]') &&
      !document.querySelector('[aria-label="Pen"]').disabled
  );
  assert.equal((await inspect()).strokes.length, beforeReload.strokes.length);
  await page.getByRole("button", { name: "Document version history" }).click();
  await page
    .getByRole("dialog", { name: "Version history" })
    .getByRole("button", { name: "Preview", exact: true })
    .first()
    .click();
  await page.getByLabel("History paper page", { exact: true }).waitFor();
  await page
    .getByRole("dialog", { name: "Version history" })
    .locator("canvas")
    .waitFor();
  await page
    .getByRole("dialog", { name: "Version history" })
    .locator("canvas")
    .scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Read-only revision preview"] canvas')
        ?.width >= 200
  );
  await page.screenshot({ path: evidence + "ink-history-preview.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  results.push(
    "Retained native ink history can be inspected with page previews"
  );
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
      height: 740,
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
    await page.getByRole("button", { name: "Fit paper width" }).click();
    await page.waitForTimeout(150);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
    await page.screenshot({ path: evidence + `ink-${view.name}.png` });
    assert.equal((await inspect()).paper.color, DEFAULT_COLOR);
  }
  results.push(
    "Reload, authored colors across opposite surface polarities and desktop/tablet/phone layouts"
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Fit paper width" }).click();
  await page.evaluate(() => (window.qa.quota = true));
  await stroke(page, { start: [120, 650], n: 90 });
  await page
    .getByText("Writing paused to protect your changes.", { exact: false })
    .first()
    .waitFor();
  await page.evaluate(async () => {
    try {
      await window.qa.auth.logout();
      throw Error("unsafe logout");
    } catch (e) {
      if (e.message === "unsafe logout") throw e;
    }
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export recovery", exact: true })
    .click();
  assert((await download).suggestedFilename().endsWith(".sylfnote"));
  await page.evaluate(() => (window.qa.quota = false));
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Pen"]') &&
      !document.querySelector('[aria-label="Pen"]').disabled
  );
  assert.equal(
    (await inspect()).strokes.length,
    beforeReload.strokes.length + 1
  );
  results.push(
    "Injected quota pauses writing, blocks logout, exports native ink recovery and retries safely"
  );
  await page.evaluate(() => window.qa.library.retrySync());
  const touch = await context({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    tp = await touch.newPage();
  tp.on("pageerror", (e) => errors.push(e.stack || e.message));
  await tp.goto(url);
  await tp.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="Pen"]') &&
      !document.querySelector('[aria-label="Pen"]').disabled
  );
  await tp.getByRole("button", { name: "Fit paper width" }).click();
  const sizes = await tp
    .getByRole("toolbar", { name: "Handwriting tools" })
    .locator("button,summary")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.checkVisibility())
        .map((n) => ({
          label: n.getAttribute("aria-label"),
          width: n.getBoundingClientRect().width,
          height: n.getBoundingClientRect().height,
        }))
    );
  console.log("TOUCH TARGETS", JSON.stringify(sizes));
  assert(sizes.every((s) => s.width >= 44 && s.height >= 44));
  const touchBefore = await inspect(tp);
  await tp
    .getByRole("region", { name: "Handwriting paper" })
    .evaluate((host) => {
      const r = host.getBoundingClientRect();
      const send = (type, id, x, y) =>
        host.dispatchEvent(
          new PointerEvent(type, {
            pointerType: "touch",
            pointerId: id,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            bubbles: true,
            cancelable: true,
            clientX: r.left + x,
            clientY: r.top + y,
            width: 8,
            height: 8,
            pressure: 0.5,
          })
        );
      send("pointerdown", 71, 80, 80);
      send("pointerdown", 72, 180, 80);
      send("pointermove", 72, 210, 100);
      send("pointerup", 72, 210, 100);
      send("pointerup", 71, 80, 80);
    });
  const touchAfter = await inspect(tp);
  assert.equal(touchAfter.strokes.length, touchBefore.strokes.length);
  assert(
    touchAfter.resume.inkViewport.zoom > touchBefore.resume.inkViewport.zoom
  );
  await tp.getByRole("button", { name: "Fit paper width" }).click();
  await tp
    .getByRole("region", { name: "Handwriting paper" })
    .evaluate((host) => {
      const r = host.getBoundingClientRect();
      const send = (type, id, kind, x, y, width = 1) =>
        host.dispatchEvent(
          new PointerEvent(type, {
            pointerType: kind,
            pointerId: id,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            bubbles: true,
            cancelable: true,
            clientX: r.left + x,
            clientY: r.top + y,
            width,
            height: width,
            pressure: 0.5,
          })
        );
      send("pointerdown", 82, "touch", 150, 180, 8);
      send("pointerdown", 81, "pen", 60, 80);
      send("pointermove", 81, "pen", 90, 90);
      send("pointerdown", 82, "touch", 150, 180, 70);
      send("pointermove", 82, "touch", 250, 230, 70);
      send("pointerup", 82, "touch", 250, 230, 70);
      send("pointerup", 81, "pen", 100, 90);
    });
  assert.equal(
    (await inspect(tp)).strokes.length,
    touchBefore.strokes.length + 1
  );
  const box = await tp
    .getByRole("region", { name: "Handwriting paper" })
    .boundingBox();
  await tp.getByRole("button", { name: "Pen", exact: true }).click();
  await tp.mouse.move(box.x + 60, box.y + 160);
  await tp.mouse.down();
  await tp.mouse.move(box.x + 130, box.y + 170, { steps: 12 });
  await tp.mouse.up();
  assert.equal(
    (await inspect(tp)).strokes.length,
    touchBefore.strokes.length + 2
  );
  await tp.getByRole("button", { name: "Focus writing", exact: true }).click();
  await tp
    .getByRole("button", { name: "Exit focus writing", exact: true })
    .click();
  await tp.getByLabel("Ink color and thickness", { exact: true }).click();
  const swatch = await tp
    .getByRole("button", { name: "Ink #242830", exact: true })
    .boundingBox();
  assert(swatch.width >= 44 && swatch.height >= 44);
  await tp.screenshot({ path: evidence + "ink-touch-options.png" });
  await tp.getByLabel("Write with a finger", { exact: true }).check();
  await tp.getByLabel("Ink color and thickness", { exact: true }).click();
  await tp.waitForTimeout(850);
  await tp
    .getByRole("region", { name: "Handwriting paper" })
    .evaluate((host) => {
      const r = host.getBoundingClientRect();
      for (let i = 0; i < 15; i++)
        host.dispatchEvent(
          new PointerEvent(
            i === 0 ? "pointerdown" : i === 14 ? "pointerup" : "pointermove",
            {
              pointerId: 101,
              pointerType: "touch",
              button: 0,
              buttons: i === 14 ? 0 : 1,
              width: 8,
              height: 8,
              pressure: 0.5,
              bubbles: true,
              cancelable: true,
              clientX: r.left + 60 + i * 4,
              clientY: r.top + 240 + Math.sin(i / 3) * 5,
            }
          )
        );
    });
  assert.equal(
    (await inspect(tp)).strokes.length,
    touchBefore.strokes.length + 3
  );
  await touch.close();
  results.push(
    "Touch/coarse targets, pinch navigation without ink, palm suppression, actual browser mouse input and focus exit"
  );
  const acknowledged = await inspect(),
    cdp = await ctx.newCDPSession(page),
    crashed = page.waitForEvent("crash", { timeout: 10000 });
  void cdp.send("Page.crash").catch(() => {});
  await crashed;
  void cdp.detach().catch(() => {});
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.goto(url);
  await page.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="Pen"]') &&
      !document.querySelector('[aria-label="Pen"]').disabled
  );
  assert.equal((await inspect()).strokes.length, acknowledged.strokes.length);
  results.push("Acknowledged encrypted handwriting survives a renderer crash");
  writeFileSync(
    evidence + "ink-accessibility-results.json",
    JSON.stringify(
      { passed: true, touchControls: sizes, fullScreenReaderAudit: false },
      null,
      2
    )
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    evidence + "ink-browser-results.json",
    JSON.stringify(
      {
        results,
        errors,
        cloudFiles: files.size,
        input:
          "Synthetic PointerEvents in actual Chromium; physical stylus not tested",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ results, errors }));
} catch (error) {
  console.log("FAILED", error, await page.locator("body").innerText());
  await page.screenshot({ path: evidence + "ink-browser-failure.png" });
  throw error;
} finally {
  await browser.close();
}
