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
  page = await ctx.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4390/#/notes");
  await page.waitForFunction(() => window.qa?.library?.snapshot().ready);
  const result = await page.evaluate(
    async ({ libraryId, config, count }) => {
      const q = window.qa;
      await q.library.dispose();
      const names = [],
        repos = [],
        sessions = [],
        id = () => crypto.randomUUID();
      const create = async () => {
        const session = new q.NotesSession("1", () => "1"),
          name = "notes-phase6-real-idb-" + id();
        sessions.push(session);
        names.push(name);
        const cipher = await q.createNotesVault(
          new Uint8Array(32).fill(71),
          JSON.stringify(["1", libraryId]),
          session
        );
        const repo = new q.IndexedDbNotesRepository({
          session,
          libraryId,
          bindingGeneration: 1,
          databaseName: name,
          cipher,
        });
        repos.push(repo);
        await repo.registerLibrary(config.descriptor, config.binding);
        return repo;
      };
      const doc = new q.Y.Doc(),
        documentId = id(),
        streamId = id(),
        times = [];
      const progress = (stage, detail) => {
        window.qaBacklogProgress = {
          stage,
          detail,
          at: new Date().toISOString(),
        };
        console.log("BACKLOG", stage, JSON.stringify(detail));
      };
      try {
        const repo = await create(),
          scope = {
            ownerId: "1",
            libraryId,
            bindingGeneration: 1,
            ...config.binding,
          },
          sync = new q.NotesSynchronizer(
            repo,
            new q.GoogleDriveTransport(scope, repo.session)
          );
        const d = {
          format: "sylf-notes",
          formatVersion: 1,
          minimumReaderVersion: 1,
          libraryId,
          documentId,
          kind: "flow",
          title: "1000 retained revisions",
          schemaVersion: 1,
          streams: [
            {
              streamId,
              epoch: 1,
              codec: "yjs13-update-v1",
              adapter: "plain-text-test",
              schemaVersion: 1,
              projection: { root: "text", type: "text" },
            },
          ],
          pages: [],
          assets: [],
          folderId: null,
          subjectId: null,
          requiredFeatures: [],
          extensions: {},
        };
        doc.getText("text").insert(0, "seed");
        let receipt = await repo.save({
          operationId: id(),
          documentId,
          parents: [],
          descriptor: d,
          kind: "create",
          updates: [
            { streamId, epoch: 1, bytes: q.Y.encodeStateAsUpdate(doc) },
          ],
        });
        const view = await repo.document(documentId);
        let update;
        doc.on("update", (b) => (update = b));
        for (let i = 1; i < count; i++) {
          doc.getText("text").insert(doc.getText("text").length, "x");
          const at = performance.now();
          receipt = await repo.save({
            operationId: id(),
            documentId,
            parents: [receipt.revisionId],
            descriptor: view.descriptorRef,
            updates: [{ streamId, epoch: 1, bytes: update }],
          });
          times.push(performance.now() - at);
          if (i % 100 === 0) progress("saving", i);
        }
        const original = repo.readObject.bind(repo),
          hashes = new Set();
        let reads = 0;
        repo.readObject = async (h) => {
          reads++;
          hashes.add(h);
          return original(h);
        };
        let at = performance.now();
        const closure = await repo.closure([receipt.revisionId]);
        const closureResult = {
          ms: performance.now() - at,
          reads,
          unique: hashes.size,
          objects: closure.length,
        };
        progress("closure", closureResult);
        hashes.clear();
        reads = 0;
        at = performance.now();
        const audit = await repo.inspectIntegrity();
        const integrity = {
          ms: performance.now() - at,
          reads,
          unique: hashes.size,
          issues: audit.issues,
        };
        if (audit.issues.length) throw Error("Audit failed");
        progress("audit", integrity);
        repo.readObject = original;
        const batches = [];
        let published = 0;
        at = performance.now();
        while (true) {
          const start = performance.now(),
            n = await sync.publish(100);
          batches.push({ count: n, ms: performance.now() - start });
          published += n;
          progress("published", published);
          if (!n) break;
        }
        const publishMs = performance.now() - at;
        if (published !== count) throw Error("Incomplete outbox");
        const target = await create(),
          restore = new q.NotesSynchronizer(
            target,
            new q.GoogleDriveTransport(scope, target.session)
          );
        at = performance.now();
        await restore.pull();
        const state = await target.loadStream(documentId, streamId, 1),
          restoredCount = (await target.listRevisions(documentId)).length;
        if (
          state.doc.getText("text").toString() !==
            doc.getText("text").toString() ||
          restoredCount !== count
        )
          throw Error("Native history differs");
        state.doc.destroy();
        times.sort((a, b) => a - b);
        return {
          scope:
            "Chromium real IndexedDB/AES-GCM/production repository and Google pack transport. Synthetic HTTP, no live Drive.",
          revisions: count,
          saves: {
            p50Ms: times[Math.floor(times.length * 0.5)],
            p95Ms: times[Math.floor(times.length * 0.95)],
          },
          closure: closureResult,
          integrity,
          publish: { ms: publishMs, batches, published },
          restore: { ms: performance.now() - at, revisions: restoredCount },
          storage: await repo.storageStats(),
        };
      } finally {
        doc.destroy();
        repos.forEach((r) => r.close());
        sessions.forEach((s) => s.close());
        names.forEach((n) => indexedDB.deleteDatabase(n));
      }
    },
    {
      libraryId,
      config: connection(),
      count: Number(process.env.NOTES_PROFILE_REVISIONS || 1000),
    }
  );
  assert.equal(errors.length, 0);
  writeFileSync(
    evidence + "real-idb-backlog.json",
    JSON.stringify({ ...result, errors }, null, 2)
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
