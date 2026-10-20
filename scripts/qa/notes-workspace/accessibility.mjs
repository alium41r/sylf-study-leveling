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
const ctx = await context({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.stack || e.message));
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.getByRole("button", { name: "New note", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Open library navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New folder", exact: true });
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .evaluate((el) => document.activeElement === el),
    true
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.locator("[contenteditable=true]").first().waitFor();
  await page.screenshot({ path: evidence + "touch-editor-phone.png" });
  const controls = await page
    .getByRole("toolbar", { name: "Text formatting" })
    .locator("button,select")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: node.getAttribute("aria-label"),
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      }))
    );
  assert(controls.every((c) => c.label));
  assert(
    controls.every((c) => c.width >= 43.9 && c.height >= 43.9),
    JSON.stringify(controls)
  );
  await page
    .getByRole("button", { name: "Recovery and storage", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Recovery & storage", exact: true })
    .waitFor();
  await page.screenshot({ path: evidence + "recovery-phone.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("http://127.0.0.1:4390/#/settings/account-danger");
  await page
    .getByRole("button", { name: "Delete Account", exact: true })
    .click();
  await page
    .getByText(/Account deletion also removes your Notes unlock key/)
    .waitFor();
  await page.screenshot({
    path: evidence + "account-deletion-notes-warning.png",
  });
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    errors,
    touchToolbar: controls,
    nativeDialogInitialFocus: true,
    escapeDismissal: true,
    accountDeletionWarningVisible: true,
    fullAccessibilityAudit: false,
  };
  writeFileSync(
    evidence + "accessibility-results.json",
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await ctx.close();
  await browser.close();
}
