export default async function open(page, { evidence }) {
  const randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  const assert = Object.assign(
    (value) => {
      if (!value) throw new Error("Assertion failed");
    },
    {
      equal: (a, b) => {
        if (a !== b) throw new Error("Expected equality");
      },
    }
  );
  const libraryId = randomUUID(),
    key = "R0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0c=",
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
  const browser = page.context().browser();
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
            hash = url.searchParams.get("hash");
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
  const target = await ctx.newPage();
  target.setDefaultTimeout(12000);
  target.on("pageerror", (e) => errors.push(e.stack || e.message));
  await target.goto("http://127.0.0.1:4390");
  await target.getByRole("button", { name: "New note", exact: true }).waitFor();
  await target.getByRole("button", { name: "New note", exact: true }).click();
  const editor = target.locator(".bn-editor[contenteditable=true]");
  await editor.waitFor();
  await editor.click();
  await target.keyboard.type("Electromagnetic induction");
  await target.keyboard.press("Enter");
  await target.keyboard.type(
    "A changing magnetic field produces an electromotive force."
  );
  await target
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill("Physics · induction");
  await target
    .getByRole("button", { name: "Handwriting mode", exact: true })
    .click();
  await target.getByRole("button", { name: "Pen", exact: true }).click();
  const host = target.getByRole("region", { name: "Handwriting paper" });
  const box = await host.boundingBox();
  await target.mouse.move(box.x + 350, box.y + 280);
  await target.mouse.down();
  await target.mouse.move(box.x + 390, box.y + 250, { steps: 12 });
  await target.mouse.move(box.x + 450, box.y + 300, { steps: 12 });
  await target.mouse.up();
  await target.evaluate(async () => {
    await window.qa.library.flushEditors();
    await window.qa.library.refresh();
  });
  const state = await target.evaluate(async () => {
    const l = window.qa.library;
    const n = l.snapshot().notes[0];
    const p = n.view.descriptor.pages[0];
    const source = await l.open(n.id, p.pageId, "ink");
    const ink = new window.qa.InkModel(source.stream.doc);
    const strokes = ink.strokes().length;
    ink.close();
    source.release();
    return {
      id: n.id,
      page: p.pageId,
      strokes,
      streams: n.view.descriptor.streams.length,
    };
  });
  assert.equal(state.strokes, 1);
  assert.equal(state.streams, 2);
  assert((await editor.innerText()).includes("electromotive force"));
  await target.screenshot({ path: evidence + "editor-desktop.png" });
  return { url: target.url(), errors, state, text: await editor.innerText() };
}
