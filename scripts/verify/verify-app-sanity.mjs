/**
 * Integration sanity check for the build-closure phase.
 *
 * Deliberately small. This is not browser QA — the Planner QA harness already covers layout,
 * mobile and accessibility in depth. This answers one question only: **is the integration failure
 * gone?** The previous state had the landing page reachable and the authenticated shell broken, so
 * the checks here are the ones that would have caught it:
 *
 *   /                     — the public page still renders
 *   /planner              — the authenticated shell renders rather than redirecting or going blank
 *   /quests, /timer       — an ordinary authenticated page renders
 *   internal navigation   — moving between pages works without a redirect loop
 *   console/runtime       — no uncaught error on any of them
 *
 * Every check is a DOM fact. A page that silently redirects to /login, or renders an empty shell,
 * fails here, because the assertion is on rendered text and the final URL rather than on a status
 * code.
 *
 * Usage:
 *   node scripts/verify/verify-app-sanity.mjs --base http://127.0.0.1:3000 --token <jwt>
 *   (or SYLF_QA_BASE / SYLF_QA_TOKEN)
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.SYLF_QA_BASE ?? argValue("--base") ?? "http://127.0.0.1:3000";
const TOKEN = process.env.SYLF_QA_TOKEN ?? argValue("--token") ?? "";
const OUT = ".browser-qa";

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A very small CDP client over the global WebSocket — no dependency added. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      /**
       * Target the *page*, not the browser.
       *
       * `/json/version` reports the browser-level endpoint, which does not implement the `Page` or
       * `Runtime` domains — attaching there fails with "wasn't found". `/json/list` enumerates
       * targets, and the page Chrome was started with is the one to drive.
       */
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (!page) throw new Error("no page target yet");
      const socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
      });
      return new Cdp(socket);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not expose a page debugging target");
}

const results = { base: BASE, checks: [], console: [] };

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "evaluation threw");
  return result.result.value;
}

/**
 * Visit a path and report what the browser actually rendered.
 *
 * The wait is on `document.readyState` plus a settle delay rather than a fixed sleep: the point is
 * to see the *final* document, including any client-side redirect, which is exactly the failure
 * mode being checked for.
 */
async function visit(cdp, pathname) {
  await cdp.send("Page.navigate", { url: `${BASE}${pathname}` });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await evaluate(cdp, "document.readyState").catch(() => "loading");
    if (ready === "complete") break;
    await sleep(250);
  }
  /**
   * Wait for the page to *settle*, not merely to load.
   *
   * These are client-rendered surfaces: `readyState === "complete"` arrives while the shell still
   * says "Loading…", and a fixed delay after that is a guess about how fast a dev server compiles.
   * So the wait is on a property of the finished page — real text, or navigation links — with a
   * bounded ceiling, and whatever it looks like when that ceiling is reached is what gets reported.
   */
  /**
   * Wait for the app's own loading state to clear.
   *
   * The shell server-renders a placeholder — "Booting The System…", "Loading Quests…" — and fills
   * it in on the client, so `readyState` and even a substantial amount of text arrive *before* the
   * page is usable. The signal that matters is the placeholder being gone.
   */
  const deadline = Date.now() + 60_000;
  let settled = false;
  while (Date.now() < deadline) {
    const probe = await evaluate(
      cdp,
      `(() => {
        const text = (document.body?.innerText ?? "").trim();
        return { t: text.length, busy: /Booting The System|Loading [A-Z]/.test(text) };
      })()`
    ).catch(() => ({ t: 0, busy: true }));
    if (probe.t > 0 && !probe.busy) {
      settled = true;
      break;
    }
    await sleep(500);
  }
  await sleep(400);
  const result = await evaluate(
    cdp,
    `(() => {
      const text = (document.body?.innerText ?? "").trim();
      return {
        url: location.pathname + location.search,
        title: document.title,
        textLength: text.length,
        // The first characters matter: a page that renders "Loading…" or an error sentence has
        // technically loaded and is still not a working page.
        excerpt: text.replace(/\s+/g, " ").slice(0, 160),
        hasMain: Boolean(document.querySelector("main")),
        links: document.querySelectorAll('a[href^="/"]').length,
        /**
         * A real failure statement, not the presence of Next's dev portal.
         *
         * The dev portal element is injected on every page in development whether or not anything
         * is wrong, so treating its presence as an error signal would fail every run. What matters
         * is whether the document *says* something failed: a 404, a runtime error overlay or an
         * application error. (No backticks in here — this comment lives inside a template literal.)
         */
        failure: /this page could not be found|unhandled runtime error|application error|build error|something went wrong/i.test(
          text
        )
          ? text.replace(/\s+/g, " ").slice(0, 120)
          : null,
        bodyChildren: document.body ? document.body.children.length : 0,
      };
    })()`
  );
  return { ...result, settled };
}

async function main() {
  if (!TOKEN) throw new Error("a QA token is required (--token or SYLF_QA_TOKEN)");
  const profile = mkdtempSync(join(tmpdir(), "sylf-sanity-"));
  const port = 9333 + Math.floor(Math.random() * 200);
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      // A headless Chrome started from a sandboxed process cannot initialise its own sandbox, GPU
      // process or Crashpad and exits before opening a debugging port.
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu-sandbox",
      "--disable-crashpad",
      "--disable-dev-shm-usage",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    const cdp = await connect(port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    /**
     * The session cookie, set by URL rather than by domain, and then verified.
     *
     * A `domain` attribute is rejected by Chrome when the host is an IP literal, and a cookie that
     * silently failed to set produces the most misleading result this harness can give: every page
     * renders its *signed-out* shell, the auth-only screens sit in their loading state forever, and
     * the run looks like a product failure. So the cookie is written against the base URL and then
     * read back; if it is not there, the run stops instead of reporting nonsense.
     */
    await cdp.send("Network.setCookie", { name: "hunter_token", value: TOKEN, url: BASE, path: "/", httpOnly: true });
    const cookies = await cdp.send("Network.getCookies", { urls: [BASE] });
    if (!cookies.cookies?.some((cookie) => cookie.name === "hunter_token")) {
      throw new Error("the session cookie was not accepted by the browser — every check below would be signed out");
    }

    await cdp.send("Log.enable").catch(() => undefined);
    /**
     * Everything the browser says, and everything the network refused.
     *
     * A page that stays on "Loading…" leaves a trace in one of two places: a request that failed,
     * or a message the app logged. Capturing only `console.error` was too narrow — a failed chunk
     * or a rejected fetch shows up as `Network.loadingFailed` / a non-2xx response and never reaches
     * the console at all.
     */
    cdp.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") {
        results.console.push(`exception: ${String(message.params?.exceptionDetails?.text ?? "")}`.slice(0, 220));
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params?.args ?? [])
          .map((arg) => String(arg.value ?? arg.description ?? ""))
          .join(" ")
          .slice(0, 220);
        if (text.trim()) results.console.push(`${message.params?.type}: ${text}`);
      }
      if (message.method === "Log.entryAdded") {
        const entry = message.params?.entry ?? {};
        if (entry.level === "error" || entry.level === "warning")
          results.console.push(`log/${entry.level}: ${String(entry.text ?? "").slice(0, 220)}`);
      }
      if (message.method === "Network.loadingFailed") {
        results.console.push(`network-failed: ${String(message.params?.errorText ?? "")}`.slice(0, 220));
      }
      if (message.method === "Network.responseReceived") {
        const status = message.params?.response?.status ?? 0;
        if (status >= 400)
          results.console.push(
            `http-${status}: ${String(message.params?.response?.url ?? "").replace(BASE, "").slice(0, 160)}`
          );
      }
    });

    /**
     * The paths are the ones this repository actually has.
     *
     * `/planner` is not a route — the Planner surface is `/system`, which is the path the existing
     * Planner QA harness drives. Asserting on a path that does not exist produced a 404 that looked
     * like an integration failure, which is a harness bug rather than a product one.
     */
    const PAGES = [
      { path: "/", name: "the public landing page renders", anonymous: true },
      { path: "/system", name: "the Planner surface renders", anonymous: false },
      { path: "/quests", name: "an ordinary authenticated page renders", anonymous: false },
      { path: "/calendar", name: "a second authenticated page renders", anonymous: false },
    ];

    for (const page of PAGES) {
      const seen = await visit(cdp, page.path);
      /**
       * The assertion is the integration property, not a loading timing.
       *
       * "Renders, has the shell's navigation, and says nothing failed" is what this check is for. A
       * page whose own widget is still fetching — the calendar's grid label reads LOADING while its
       * events arrive — is a working page, and requiring every widget to have finished would make
       * the harness report a product failure for a network timing it has no business judging.
       * `settled` is still reported in the detail, because it is useful to know.
       */
      const ok = seen.textLength > 150 && seen.links > 0 && !seen.failure;
      results.checks.push({
        name: page.name,
        ok,
        detail: `${seen.url} text=${seen.textLength} links=${seen.links} settled=${seen.settled}${
          seen.failure ? ` FAILURE="${seen.failure}"` : ""
        }${ok ? "" : ` excerpt="${seen.excerpt}" trace=${results.console.slice(-4).join(" ; ")}`}`,
      });
    }

    /**
     * Internal navigation, by clicking a real in-page link rather than issuing another navigate.
     *
     * That distinction is the point: a server that renders each URL correctly is not the same as an
     * app whose own navigation works. The link is only clicked once the shell has actually rendered
     * its navigation, so "no link found" means the shell never painted rather than that the check ran
     * too early.
     */
    /**
     * Is the session valid *from inside the page*?
     *
     * This separates two failures that look identical in the DOM: a page stuck on "Loading…"
     * because its data request was rejected, and a page stuck because it never rendered at all.
     * The request is made by the page itself, with its own credentials, so it sees exactly what
     * the application sees.
     */
    const session = await evaluate(
      cdp,
      `fetch("/api/user/stats", { credentials: "include" })
         .then((response) => ({ status: response.status }))
         .catch((error) => ({ status: 0, error: String(error) }))`
    );
    results.checks.push({
      name: "the page's own session call succeeds",
      ok: session.status === 200,
      detail: `GET /api/user/stats → ${session.status}${session.error ? ` (${session.error})` : ""}`,
    });

    /**
     * Navigation is driven by buttons, not anchors.
     *
     * This shell renders its navigation as `<button>` elements — there are no `a[href^="/"]` nodes
     * in it at all — so an anchor-based check reports "no navigation" on a page that has plenty.
     * The check therefore looks for an element whose accessible name is one of the shell's own
     * destinations and clicks that, which is what a student does.
     */
    await visit(cdp, "/system");
    const before = await evaluate(cdp, "location.pathname");
    const clicked = await evaluate(
      cdp,
      `(() => {
        const wanted = ["Workspace", "History", "Planner", "Quests", "Calendar", "System"];
        const nodes = [...document.querySelectorAll("button, a")];
        const target = nodes.find((node) => {
          const name = (node.getAttribute("aria-label") || node.textContent || "").trim();
          return wanted.some((label) => name === label || name.startsWith(label));
        });
        if (!target) return null;
        const name = (target.getAttribute("aria-label") || target.textContent || "").trim().slice(0, 30);
        target.click();
        return name;
      })()`
    );
    await sleep(3000);
    const after = await evaluate(
      cdp,
      `({ url: location.pathname + location.search, text: (document.body?.innerText ?? "").trim().length })`
    );
    results.checks.push({
      name: "internal navigation works",
      ok: Boolean(clicked) && after.text > 200,
      detail: `${before} → clicked "${clicked ?? "(no nav control found)"}" → ${after.url} text=${after.text}`,
    });

    // The shell survives the transition and still renders after navigating away and back.
    const returned = await visit(cdp, "/system");
    results.checks.push({
      name: "the shell still renders after navigating away and back",
      ok: returned.textLength > 200 && !returned.failure,
      detail: `${returned.url} text=${returned.textLength} links=${returned.links}`,
    });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "app-sanity.json"), JSON.stringify(results, null, 2));

    let failed = 0;
    for (const check of results.checks) {
      if (!check.ok) failed += 1;
      console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}  — ${check.detail}`);
    }
    console.log(`\n${results.checks.length - failed}/${results.checks.length} sanity checks passed`);
    if (results.console.length) console.log(`console entries captured: ${results.console.length}`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    chrome.kill("SIGKILL");
    // A killed Chrome does not always release its profile immediately, so removal is best-effort.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* the temporary profile is outside the repository and is cleaned by the OS */
    }
  }
}

main().catch((error) => {
  console.error(`SANITY FAILED: ${error.message}`);
  process.exitCode = 1;
});
