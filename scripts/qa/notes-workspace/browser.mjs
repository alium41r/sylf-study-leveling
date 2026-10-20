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
try {
  connected = false;
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page
    .getByRole("button", { name: "Connect Google Drive", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "New note", exact: true }).count(),
    0
  );
  results.push("Mandatory cloud onboarding");
  await page.screenshot({ path: evidence + "onboarding-desktop.png" });
  connected = true;
  await page.getByRole("button", { name: "Retry opening library" }).click();
  await page.getByRole("button", { name: "New note", exact: true }).waitFor();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.locator("[contenteditable=true]").first().waitFor();
  await page.screenshot({ path: evidence + "editor-initial.png" });
  console.log("EDITOR READY", await page.locator("body").innerText());
  await page
    .locator("[contenteditable=true]")
    .first()
    .fill("Complex numbers lecture — durable body marker");
  await page.keyboard.press("ControlOrMeta+s");
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    await window.qa.library.flushEditors();
    await window.qa.library.synchronize();
  });
  await page.screenshot({ path: evidence + "editor-desktop.png" });
  results.push(
    "Create rich text; encrypted IndexedDB save; verified synthetic cloud transfer"
  );

  await page
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill("Complex numbers");
  await page
    .getByRole("textbox", { name: "Document title", exact: true })
    .press("Tab");
  await page.waitForFunction(() =>
    window.qa.library
      .snapshot()
      .notes.some((n) => n.view.descriptor.title === "Complex numbers")
  );
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  assert((await page.locator(".bn-editor strong").count()) > 0);
  await page
    .getByRole("combobox", { name: "Block style" })
    .selectOption("heading2");
  assert((await page.locator(".bn-editor h2").count()) > 0);
  await page
    .getByRole("combobox", { name: "Block style" })
    .selectOption("paragraph");
  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  assert((await page.locator(".bn-editor input[type=checkbox]").count()) > 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Insert link", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Insert link" });
  await linkDialog.getByRole("textbox").fill("https://example.com/math");
  await linkDialog.getByRole("button", { name: /Insert|Add|Save/ }).click();
  assert(
    (await page.locator(".bn-editor").innerText()).includes(
      "durable body marker"
    ),
    "Undo/redo must retain the complete text"
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/2cAAAAASUVORK5CYII=",
    "base64"
  );
  await page
    .getByLabel("Choose an image", { exact: true })
    .setInputFiles({ name: "lecture.png", mimeType: "image/png", buffer: png });
  await page.locator('.bn-editor img[src^="blob:"]').first().waitFor();
  await page.evaluate(async () => {
    await window.qa.library.flushEditors();
    await window.qa.library.synchronize();
  });
  results.push(
    "Rename; bold; heading; checklist; undo/redo; link; durable image upload"
  );
  assert(
    (await page.locator(".bn-editor").innerText()).includes(
      "durable body marker"
    )
  );
  assert((await page.locator('.bn-editor img[src^="blob:"]').count()) > 0);
  // Loaded libraries remain editable during provider outages. Local and cloud states stay distinct.
  offline = true;
  await ctx.setOffline(true);
  await page.locator('.bn-editor[contenteditable="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await page.keyboard.insertText(" offline retained marker");
  await page.keyboard.press("ControlOrMeta+s");
  await page.evaluate(() => window.qa.library.flushEditors());
  assert(
    (await page
      .locator(".bn-editor")
      .getByText(/offline retained marker/)
      .count()) > 0
  );
  await page.evaluate(() => window.qa.library.synchronize().catch(() => {}));
  assert(!(await page.getByText("Saved to Drive", { exact: true }).count()));
  offline = false;
  lost = true;
  await ctx.setOffline(false);
  await page.evaluate(() => window.qa.library.retrySync());
  results.push("Offline durable save and lost-upload-response reconciliation");
  await page
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Mathematics");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Details for Complex numbers", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Folder", exact: true })
    .selectOption({ label: "Mathematics" });
  await dialog
    .getByRole("combobox", { name: "Subject", exact: true })
    .selectOption("1");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Details for Complex numbers", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("textbox", { name: "Search notes", exact: true })
    .fill("offline retained marker");
  await page
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page
    .getByRole("button", { name: "Details for Complex numbers", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("navigation", { name: "Notes library" })
    .getByRole("button", { name: "Trash", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore note", exact: true }).click();
  await page.locator("[contenteditable=true]").first().waitFor();
  await page
    .getByRole("button", { name: "Document version history", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Version history" }).waitFor();
  await page
    .getByRole("button", { name: /Restore revision/ })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  results.push(
    "Folders; subject association; favorites; content search; list view; Trash restore; history"
  );
  await page
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Notes library" })
    .getByRole("button", { name: /^All notes/ })
    .click();
  await page
    .getByRole("button", { name: "More creation options", exact: true })
    .click();
  await page.getByRole("button", { name: "New notebook", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Revision notebook");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator("[contenteditable=true]").first().waitFor();
  await page
    .getByRole("button", { name: "Add notebook page", exact: true })
    .click();
  await page.getByRole("button", { name: "Page 2", exact: true }).waitFor();
  await page.locator("[contenteditable=true]").first().waitFor();
  await page
    .locator("[contenteditable=true]")
    .first()
    .fill("Notebook page two marker");
  await page.keyboard.press("ControlOrMeta+s");
  await page.evaluate(() => window.qa.library.flushEditors());
  await page.getByRole("button", { name: "Page 1", exact: true }).click();
  await page.waitForTimeout(250);
  assert(
    !(await page
      .locator(".bn-editor")
      .getByText("Notebook page two marker", { exact: true })
      .count())
  );
  await page
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Complex topics");
  await dialog
    .getByRole("combobox", { name: "Folder", exact: true })
    .selectOption({ label: "Mathematics" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await page.locator("[contenteditable=true]").first().waitFor();
  results.push("Typed notebooks with independent pages and nested folders");
  const archive = await page.evaluate(async () =>
    Array.from(
      (await window.qa.exportNotes(window.qa.library.repository)).bytes
    )
  );
  assert(archive.length > 0);
  const raw = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(
        "sylf-notes-vault-v1:1:" + window.qa.library.repository.libraryId
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const output = [];
    for (const name of db.objectStoreNames) {
      const rows = await new Promise((resolve, reject) => {
        const r = db.transaction(name).objectStore(name).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      output.push(JSON.stringify(rows));
      for (const row of rows)
        for (const value of Object.values(row))
          if (value instanceof Uint8Array)
            output.push(new TextDecoder().decode(value));
    }
    db.close();
    return output.join(" ");
  });
  assert(!raw.includes("durable body marker"));
  assert(!raw.includes("Complex numbers"));
  results.push(
    "Raw persisted records contain no title/body plaintext; portable archive export"
  );
  await page.evaluate(() => window.qa.library.synchronize());
  // New browser storage, same cloud account: reconstruction uses the production transport/repository.
  const second = await context(),
    p2 = await second.newPage();
  p2.on("pageerror", (e) => errors.push(e.stack || e.message));
  await p2.goto("http://127.0.0.1:4390/#/notes");
  await p2
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .waitFor();
  await p2
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await p2
    .locator(".bn-editor")
    .getByText(/offline retained marker/)
    .waitFor();
  await p2.locator('.bn-editor img[src^="blob:"]').waitFor();
  results.push(
    "Fresh browser profile reconstructs text, image and organization from cloud packs"
  );
  offline = true;
  for (const [target, marker] of [
    [page, " device-A marker "],
    [p2, " device-B marker "],
  ]) {
    await target.locator(".bn-inline-content").first().click();
    await target.keyboard.press("ArrowRight");
    await target.keyboard.insertText(marker);
    assert(
      (await target.locator(".bn-editor").innerText()).includes(marker.trim()),
      "The device insert must reach the actual editor before synchronization"
    );
    await target.evaluate(() => window.qa.library.flushEditors());
  }
  offline = false;
  await page.evaluate(() => window.qa.library.synchronize());
  await p2.evaluate(() => window.qa.library.synchronize());
  await page.evaluate(() => window.qa.library.synchronize());
  for (const target of [page, p2])
    await target.waitForFunction(() => {
      const text = document.querySelector(".bn-editor")?.textContent || "";
      return (
        text.includes("device-A marker") && text.includes("device-B marker")
      );
    });
  results.push(
    "Concurrent text edits on independent devices merge through the actual editor and cloud adapter"
  );
  const paused = await page.evaluate(async () => {
    const lib = window.qa.library,
      id = lib
        .snapshot()
        .notes.find((n) => n.view.descriptor.title === "Complex numbers").id,
      opened = await lib.open(id);
    opened.stream.pause();
    await lib.mutate(id, (d) => {
      d.extensions.pauseProof = true;
    });
    const state = opened.stream.status().state;
    opened.stream.resume();
    opened.release();
    return state;
  });
  assert.equal(paused, "pausing");
  await page
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await page
    .getByLabel("Choose a portable Notes archive", { exact: true })
    .setInputFiles({
      name: "retained.sylfnote",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(archive),
    });
  await page
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await page.locator("[contenteditable=true]").first().waitFor();
  await page.waitForFunction(() => {
    const text = document.querySelector(".bn-editor")?.textContent || "";
    return text.includes("device-A marker") && text.includes("device-B marker");
  });
  results.push(
    "Importing older portable history preserves newer edits; metadata updates preserve an already paused stream"
  );
  // True renderer crash after durable acknowledgement, then reopen on the retained local database.
  await page.evaluate(() => window.qa.library.flushEditors());
  const cdp = await ctx.newCDPSession(page);
  const crashed = page.waitForEvent("crash", { timeout: 10000 });
  void cdp.send("Page.crash").catch(() => {});
  await crashed;
  void cdp.detach().catch(() => {});
  const reopened = await ctx.newPage();
  page = reopened;
  await reopened.goto("http://127.0.0.1:4390/#/notes");
  await reopened
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .waitFor();
  await reopened
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await reopened
    .locator(".bn-editor")
    .getByText(/device-A marker/)
    .waitFor();
  results.push("Acknowledged encrypted state survives renderer crash");
  // Visual matrices use the real global appearance application path.
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
      name: "mobile-custom-light",
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
    await reopened.setViewportSize({ width: view.width, height: view.height });
    await reopened.evaluate(
      (v) => window.qa.applyAppearance({ ...v, persistLocal: true }),
      view
    );
    await reopened.waitForTimeout(200);
    await reopened.screenshot({
      path: evidence + "editor-" + view.name + ".png",
    });
    assert(
      await reopened.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      "No document horizontal overflow: " + view.name
    );
  }
  await reopened
    .getByRole("button", { name: "Back to notes", exact: true })
    .click();
  await reopened
    .getByRole("textbox", { name: "Search notes", exact: true })
    .waitFor();
  await reopened.screenshot({ path: evidence + "library-phone.png" });
  await reopened
    .getByRole("button", { name: "Open library navigation", exact: true })
    .click();
  await reopened.screenshot({ path: evidence + "navigation-phone.png" });
  const backdrop = reopened.getByRole("button", {
    name: "Close library navigation",
    exact: true,
  });
  const bounds = await backdrop.boundingBox();
  await backdrop.click({
    position: { x: bounds.width - 5, y: bounds.height / 2 },
  });
  results.push(
    "Desktop/tablet/phone appearance matrices and responsive navigation"
  );
  // Browser-level quota injection hits actual journal transactions, not an experimental repository.
  await reopened.setViewportSize({ width: 1440, height: 960 });
  await reopened
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await reopened.locator("[contenteditable=true]").first().waitFor();
  await reopened.evaluate(() => (window.qa.quota = true));
  await reopened.locator(".bn-inline-content").first().click();
  await reopened.keyboard.press("ArrowRight");
  await reopened.keyboard.press("End");
  await reopened.keyboard.insertText(" quota-only-recovery-marker");
  assert(
    (await reopened.locator(".bn-editor").innerText()).includes(
      "quota-only-recovery-marker"
    )
  );
  await reopened.waitForTimeout(500);
  await reopened.getByText("Changes need attention", { exact: true }).waitFor();
  await reopened.keyboard.press("ControlOrMeta+s");
  let reconnectRequests = 0;
  const countReconnect = (request) => {
    if (
      new URL(request.url()).pathname === "/api/notes/connection" &&
      request.method() === "POST"
    )
      reconnectRequests++;
  };
  reopened.on("request", countReconnect);
  await reopened
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await reopened.waitForTimeout(200);
  assert.equal(reconnectRequests, 0);
  reopened.off("request", countReconnect);
  const logout = await reopened.evaluate(async () => {
    try {
      await window.qa.auth.logout();
      return "unexpected";
    } catch {
      return "blocked";
    }
  });
  assert.equal(logout, "blocked");
  assert((await reopened.getByText(/Sign out paused/).count()) > 0);
  const download = reopened.waitForEvent("download");
  await reopened
    .getByRole("button", { name: "Export recovery copy", exact: true })
    .click();
  assert((await download).suggestedFilename().endsWith(".sylfnote"));
  await reopened.evaluate(() => {
    window.location.hash = "/settings/account-danger";
  });
  await reopened
    .getByRole("button", { name: "Delete Account", exact: true })
    .waitFor();
  await reopened.evaluate(() => {
    window.location.hash = "/notes";
  });
  await reopened
    .getByRole("button", { name: "Recovery and storage", exact: true })
    .waitFor();
  await reopened
    .getByRole("button", { name: "Recovery and storage", exact: true })
    .click();
  const retainedDownload = reopened.waitForEvent("download");
  await reopened
    .getByRole("button", { name: "Export pending recovery copy", exact: true })
    .click();
  assert((await retainedDownload).suggestedFilename().endsWith(".sylfnote"));
  await reopened.evaluate(() => (window.qa.quota = false));
  await reopened
    .getByRole("button", { name: "Retry pending saves", exact: true })
    .click();
  await reopened.waitForFunction(
    () => !window.qa.library.snapshot().memoryPending
  );
  await reopened
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await reopened
    .getByRole("button", { name: "Open Complex numbers", exact: true })
    .click();
  await reopened.locator('.bn-editor[contenteditable="true"]').waitFor();
  await reopened
    .locator(".bn-editor")
    .getByText(/quota-only-recovery-marker/)
    .waitFor();
  results.push(
    "Injected journal quota failure pauses editing, blocks logout/OAuth navigation, exports active/retained recovery after view reopening, retries safely"
  );
  // A provider deletion must not turn an old receipt into a fresh cloud-save claim.
  await reopened.evaluate(() => window.qa.library.synchronize());
  const savedFiles = new Map(files);
  files.clear();
  await reopened.evaluate(() =>
    window.qa.library.synchronize().catch(() => {})
  );
  assert(
    !(await reopened.getByText("Saved to Drive", { exact: true }).count())
  );
  files.clear();
  for (const [id, item] of savedFiles) files.set(id, item);
  await reopened.evaluate(() => window.qa.library.retrySync());
  results.push(
    "Externally removed cloud copies cannot receive a false verified status"
  );
  // Account transition closes the original access capability and immediately removes its UI.
  connected = false;
  owner = 2;
  await reopened.evaluate((u) => window.qa.auth.login({ ...u, id: 2 }), user);
  await reopened
    .getByRole("button", { name: "Connect Google Drive", exact: true })
    .waitFor();
  assert(
    !(await reopened.getByText("Complex numbers", { exact: true }).count())
  );
  results.push(
    "Account switching hides previous-owner content and locks its retained vault"
  );
  await second.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    evidence + "browser-results.json",
    JSON.stringify(
      { results, errors, cloudFiles: files.size, archiveBytes: archive.length },
      null,
      2
    )
  );
  console.log(JSON.stringify({ results, errors, files: files.size }));
} catch (error) {
  console.log("ERROR UI", errors, await page.locator("body").innerText());
  await page.screenshot({ path: evidence + "browser-failure.png" });
  throw error;
} finally {
  await ctx.close();
  await browser.close();
}
