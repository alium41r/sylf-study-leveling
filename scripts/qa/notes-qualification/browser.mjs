import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const output =
  process.env.NOTES_EVIDENCE_DIR || "/private/tmp/sylf-notes-phase2-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
function fixture(overrides = {}) {
  return {
    database: "sylf-notes-qualification-" + randomUUID(),
    owner: "synthetic-owner",
    library: randomUUID(),
    document: randomUUID(),
    stream: randomUUID(),
    ...overrides,
  };
}
async function open(context, config) {
  const page = await context.newPage();
  await page.goto(process.env.NOTES_HARNESS_URL || "http://127.0.0.1:4389/");
  await page.waitForFunction(() => !!window.notesHarness);
  await page.evaluate((config) => window.notesHarness.init(config), config);
  return page;
}
async function check(name, fn) {
  if (
    process.env.NOTES_CHECK_FILTER &&
    !name.includes(process.env.NOTES_CHECK_FILTER)
  )
    return;
  const start = performance.now();
  try {
    const detail = await fn();
    results.push({
      name,
      pass: true,
      elapsedMs: performance.now() - start,
      detail,
    });
    console.log("PASS " + name);
  } catch (error) {
    results.push({ name, pass: false, error: String(error.stack) });
    console.log("FAIL " + name + " " + error.message);
  }
}
try {
  await check(
    "real IndexedDB saves, offline writes and reload recovery",
    async () => {
      const context = await browser.newContext(),
        config = fixture(),
        page = await open(context, config);
      await context.setOffline(true);
      await page.evaluate(() => window.notesHarness.append(" offline-marker"));
      await page.evaluate(() => window.notesHarness.flush());
      const before = await page.evaluate(() => window.notesHarness.snapshot());
      await context.setOffline(false);
      await page.reload();
      await page.waitForFunction(() => !!window.notesHarness);
      await page.evaluate((config) => window.notesHarness.init(config), config);
      assert.equal(
        await page.evaluate(() => window.notesHarness.snapshot()),
        before
      );
      const capabilities = await page.evaluate(() =>
        window.notesHarness.capabilities()
      );
      await context.close();
      return { restored: true, offlineColdLaunch: false, capabilities };
    }
  );
  await check(
    "real transaction quota injection and recovery without false saved state",
    async () => {
      const context = await browser.newContext(),
        page = await open(context, fixture());
      const before = await page.evaluate(() => window.notesHarness.stats());
      await page.evaluate(() => {
        window.notesHarness.setFault("after-journal");
        window.notesHarness.append("not-acknowledged");
      });
      await assert.rejects(page.evaluate(() => window.notesHarness.flush()));
      assert.equal(
        (await page.evaluate(() => window.notesHarness.status())).state,
        "failed"
      );
      assert.deepEqual(
        await page.evaluate(() => window.notesHarness.stats()),
        before
      );
      assert.doesNotMatch(
        await page.evaluate(() => window.notesHarness.persistedText()),
        /not-acknowledged/
      );
      await context.close();
      return { rollback: true, state: "failed", physicalDiskFull: false };
    }
  );
  await check(
    "two real tabs merge live and both branches survive reload",
    async () => {
      const context = await browser.newContext(),
        config = fixture(),
        a = await open(context, config),
        b = await open(context, config);
      await Promise.all([
        a.evaluate(() => window.notesHarness.append(" tab-A")),
        b.evaluate(() => window.notesHarness.append(" tab-B")),
      ]);
      await Promise.all([
        a.evaluate(() => window.notesHarness.flush()),
        b.evaluate(() => window.notesHarness.flush()),
      ]);
      await a.waitForFunction(
        () => String(window.notesHarness.snapshot()).includes("tab-B"),
        { timeout: 6000 }
      );
      await b.waitForFunction(
        () => String(window.notesHarness.snapshot()).includes("tab-A"),
        { timeout: 6000 }
      );
      const before = await a.evaluate(() => window.notesHarness.snapshot());
      assert.equal(
        before,
        await b.evaluate(() => window.notesHarness.snapshot())
      );
      await a.reload();
      await a.waitForFunction(() => !!window.notesHarness);
      await a.evaluate((config) => window.notesHarness.init(config), config);
      assert.equal(
        await a.evaluate(() => window.notesHarness.snapshot()),
        before
      );
      await context.close();
      return { broadcastAndReplay: true };
    }
  );
  await check(
    "logout fences both tabs and preserves pending journal for the correct owner",
    async () => {
      const context = await browser.newContext(),
        config = fixture(),
        a = await open(context, config),
        b = await open(context, config);
      await a.evaluate(() =>
        window.notesHarness.append(" private-owner-marker")
      );
      await a.evaluate(() => window.notesHarness.flush());
      await a.evaluate(() => window.notesHarness.logout());
      await b.waitForFunction(
        () => window.notesHarness.status().state === "closed"
      );
      await assert.rejects(b.evaluate(() => window.notesHarness.snapshot()));
      const own = await open(context, config);
      assert.match(
        await own.evaluate(() => window.notesHarness.snapshot()),
        /private-owner-marker/
      );
      const other = await open(context, { ...config, owner: "other-owner" });
      assert.doesNotMatch(
        await other.evaluate(() => window.notesHarness.snapshot()),
        /private-owner-marker/
      );
      await context.close();
      return {
        crossTabFence: true,
        durablePendingPreserved: true,
        atRestEncryption: false,
      };
    }
  );
  await check(
    "explicit logout flushes the last buffered edit first",
    async () => {
      const context = await browser.newContext(),
        config = fixture(),
        page = await open(context, config);
      await page.evaluate(() => {
        window.notesHarness.append(" buffered-before-logout");
      });
      await page.evaluate(() => window.notesHarness.explicitLogout());
      const own = await open(context, config);
      assert.match(
        await own.evaluate(() => window.notesHarness.snapshot()),
        /buffered-before-logout/
      );
      await context.close();
      return { flushBeforeInvalidation: true };
    }
  );
  await check(
    "acknowledged edit survives a deliberate renderer crash",
    async () => {
      const context = await browser.newContext(),
        config = fixture(),
        page = await open(context, config);
      await page.evaluate(() =>
        window.notesHarness.append(" crash-ack-marker")
      );
      await page.evaluate(() => window.notesHarness.flush());
      const cdp = await context.newCDPSession(page);
      await Promise.race([
        cdp.send("Page.crash").catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      await page.close().catch(() => {});
      const fresh = await open(context, config);
      assert.match(
        await fresh.evaluate(() => window.notesHarness.snapshot()),
        /crash-ack-marker/
      );
      await context.close();
      return { rendererCrash: true, powerLoss: false };
    }
  );
  await check(
    "acknowledged disk-backed IndexedDB survives a full browser process crash",
    async () => {
      const profile = await mkdtemp(join(tmpdir(), "sylf-notes-profile-"));
      let context;
      try {
        context = await chromium.launchPersistentContext(profile, {
          headless: true,
        });
        const config = fixture(),
          page = await open(context, config);
        await page.evaluate(() =>
          window.notesHarness.append(" browser-process-crash-marker")
        );
        await page.evaluate(() => window.notesHarness.flush());
        const closed = context.waitForEvent("close", { timeout: 15000 });
        const cdp = await context.newCDPSession(page);
        // Some Chromium builds close the browser without rejecting the in-flight CDP call.
        await Promise.race([cdp.send("Browser.crash").catch(() => {}), closed]);
        await closed;
        context = await chromium.launchPersistentContext(profile, {
          headless: true,
        });
        const restored = await open(context, config);
        assert.match(
          await restored.evaluate(() => window.notesHarness.snapshot()),
          /browser-process-crash-marker/
        );
        assert.equal(
          (await restored.evaluate(() => window.notesHarness.stats()))
            .revisions,
          2
        );
        return {
          browserProcessCrash: true,
          persistentProfile: true,
          powerLoss: false,
        };
      } finally {
        await context?.close().catch(() => {});
        await rm(profile, { recursive: true, force: true });
      }
    }
  );
  await check(
    "real chunked asset staging preserves original hash",
    async () => {
      const context = await browser.newContext(),
        page = await open(context, fixture());
      const detail = await page.evaluate(() => window.notesHarness.asset());
      assert.equal(detail.parts, 3);
      assert.equal(detail.hashMatches, true);
      assert.equal(detail.pending, 1);
      await context.close();
      return detail;
    }
  );
  await check(
    "production BlockNote adapter and portable archive restore in a fresh profile",
    async () => {
      const source = await browser.newContext(),
        config = fixture({ richtext: true }),
        page = await open(source, config);
      await page.waitForSelector(".bn-editor");
      await page.evaluate(() =>
        window.notesHarness.append("Portable bold Ω 日本語")
      );
      await page.evaluate(() => window.notesHarness.flush());
      const expected = await page.evaluate(() =>
          window.notesHarness.snapshot()
        ),
        bytes = await page.evaluate(() => window.notesHarness.portable());
      const inspection = await page.evaluate(
        (bytes) => window.notesHarness.inspect(bytes),
        bytes
      );
      assert.ok(inspection.projections > 0);
      const dest = await browser.newContext(),
        target = await open(dest, {
          ...config,
          database: "sylf-notes-qualification-" + randomUUID(),
          create: false,
        });
      assert.equal(
        await target.evaluate(
          (bytes) => window.notesHarness.import(bytes),
          bytes
        ),
        "imported"
      );
      await target.waitForSelector(".bn-editor");
      assert.deepEqual(
        await target.evaluate(() => window.notesHarness.snapshot()),
        expected
      );
      await source.close();
      await dest.close();
      return {
        editorDocumentEqual: true,
        interchangeProjections: inspection.projections,
        archiveBytes: bytes.length,
      };
    }
  );
  await check(
    "BlockNote local undo preserves another tab's edits and survives reload",
    async () => {
      const context = await browser.newContext(),
        config = fixture({ richtext: true }),
        a = await open(context, config),
        b = await open(context, config);
      await b.evaluate(() => window.notesHarness.append("remote-undo-marker"));
      await b.evaluate(() => window.notesHarness.flush());
      await a.waitForFunction(() =>
        JSON.stringify(window.notesHarness.snapshot()).includes(
          "remote-undo-marker"
        )
      );
      await a.evaluate(() => window.notesHarness.append("local-undo-marker"));
      await a.evaluate(() => window.notesHarness.flush());
      await a.evaluate(() => window.notesHarness.undo());
      await a.evaluate(() => window.notesHarness.flush());
      const result = JSON.stringify(
        await a.evaluate(() => window.notesHarness.snapshot())
      );
      assert.match(result, /remote-undo-marker/);
      assert.doesNotMatch(result, /local-undo-marker/);
      await a.reload();
      await a.waitForFunction(() => !!window.notesHarness);
      await a.evaluate((config) => window.notesHarness.init(config), config);
      const restored = JSON.stringify(
        await a.evaluate(() => window.notesHarness.snapshot())
      );
      assert.match(restored, /remote-undo-marker/);
      assert.doesNotMatch(restored, /local-undo-marker/);
      await context.close();
      return { localUndo: true, remoteEditRetained: true, reload: true };
    }
  );
  await check(
    "repeated StrictMode editor mount and teardown does not duplicate journal writes",
    async () => {
      const context = await browser.newContext(),
        page = await open(context, fixture({ richtext: true }));
      const before = await page.evaluate(() => window.notesHarness.stats());
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.notesHarness.reopen());
        await page.waitForSelector(".bn-editor");
      }
      await page.evaluate(() =>
        window.notesHarness.append("single-after-remount")
      );
      await page.evaluate(() => window.notesHarness.flush());
      const after = await page.evaluate(() => window.notesHarness.stats());
      assert.equal(after.revisions - before.revisions, 1);
      await context.close();
      return {
        remounts: 5,
        revisionsAdded: 1,
        harnessUrl: process.env.NOTES_HARNESS_URL || "http://127.0.0.1:4389/",
      };
    }
  );
  await check(
    "200 ordinary saves preserve incremental storage and measure real-browser latency",
    async () => {
      const context = await browser.newContext(),
        page = await open(context, fixture({ seedSize: 256000 }));
      const detail = await page.evaluate(async () => {
        const before = await window.notesHarness.stats(),
          samples = [];
        for (let i = 0; i < 200; i++) {
          const start = performance.now();
          window.notesHarness.append("x");
          await window.notesHarness.flush();
          samples.push(performance.now() - start);
        }
        const after = await window.notesHarness.stats();
        await window.notesHarness.checkpoint();
        const warmOpenMs = await window.notesHarness.reopen();
        return { samples, before, after, warmOpenMs };
      });
      const sorted = [...detail.samples].sort((a, b) => a - b);
      detail.p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
      assert.ok(
        detail.p95Ms <= 250,
        "save p95 exceeds target: " + detail.p95Ms
      );
      assert.ok(
        detail.after.objectBytes - detail.before.objectBytes < 400000,
        "full-document rewrite amplification"
      );
      await context.close();
      return detail;
    }
  );
} finally {
  await writeFile(
    output + "/browser-results.json",
    JSON.stringify({ browser: browser.version(), results }, null, 2) + "\n"
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    checks: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).map((r) => r.name),
  })
);
if (results.some((r) => !r.pass)) process.exitCode = 1;
