// @ts-check
// Automated verification of the Electron backend path, in the real window against the real server (run with --sylf-backend-check, through
// scripts/test/run-backend-local.mjs, which supplies a disposable database). ADR 0009's test 8 lives here: the token is absent from the
// renderer, as a window global, in a response body, and in storage. It also proves what only a real `protocol.handle` and a real `net.fetch`
// can: that bearer requests pass the server's browser check, that streams arrive as they are sent (G-12), and that assets load (G-8).
//
// A small recording stub sits between the app and the server, so the check can read exactly what left this process. It writes tokens to
// nothing: it keeps them in memory to prove they are absent, and evidence carries only counts and yes or no answers.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, safeStorage } from "electron";

const STREAM_PATH = "/api/__check/stream";
const STREAM_CHUNKS = 5;
const STREAM_GAP_MS = 150;

/** @typedef {{ method: string, path: string, authorization: string | null, cookie: boolean, secFetch: string[], status: number, setCookie: boolean }} Seen */

export async function startBackendStub() {
  const target = new URL(process.env.SYLF_BACKEND_TARGET ?? "http://127.0.0.1:3111");
  /** @type {Seen[]} */ const seen = [];
  /** @type {Set<string>} */ const secrets = new Set();
  let down = false;
  /** @type {RegExp | null} */ let failing = null;
  const server = http.createServer((request, response) => {
    // What no network looks like from here: the connection just goes.
    if (down) { request.socket.destroy(); return; }
    if (failing?.test(request.url ?? "")) { response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: "Internal Server Error" })); return; }
    /** @type {Seen} */
    const entry = { method: request.method ?? "", path: request.url ?? "", authorization: request.headers.authorization ?? null, cookie: "cookie" in request.headers, secFetch: Object.keys(request.headers).filter((name) => name.startsWith("sec-fetch")), status: 0, setCookie: false };
    seen.push(entry);
    if (entry.authorization) secrets.add(entry.authorization.replace(/^Bearer /, ""));
    if (request.url === STREAM_PATH) {
      entry.status = 200;
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
      let sent = 0;
      const timer = setInterval(() => { response.write(`data: ${++sent}\n\n`); if (sent === STREAM_CHUNKS) { clearInterval(timer); response.end(); } }, STREAM_GAP_MS);
      return;
    }
    const chunks = /** @type {Buffer[]} */ ([]);
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const upstream = http.request({ host: target.hostname, port: target.port, path: request.url, method: request.method, headers: { ...request.headers, host: target.host } }, (answer) => {
        entry.status = answer.statusCode ?? 0;
        entry.setCookie = "set-cookie" in answer.headers;
        // Bodies of native auth routes carry tokens, which is what the check must prove never reach the renderer.
        if (request.url?.startsWith("/api/auth/native/")) {
          const parts = /** @type {Buffer[]} */ ([]);
          answer.on("data", (part) => parts.push(part));
          answer.on("end", () => {
            const text = Buffer.concat(parts).toString();
            try { const session = JSON.parse(text).session; if (session) { secrets.add(session.accessToken); secrets.add(session.refreshToken); } } catch { /* Not JSON. */ }
            response.writeHead(answer.statusCode ?? 502, answer.headers);
            response.end(text);
          });
          return;
        }
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      });
      upstream.on("error", () => { response.writeHead(502); response.end(); });
      upstream.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { origin: `http://127.0.0.1:${address.port}`, seen, secrets, target: target.origin, setDown(/** @type {boolean} */ value) { down = value; if (value) server.closeAllConnections(); }, setFailing(/** @type {RegExp | null} */ value) { failing = value; }, close: () => { server.closeAllConnections(); server.close(); } };
}

/** @param {Electron.BrowserWindow} window @param {{ stub: Awaited<ReturnType<typeof startBackendStub>>, backend: any, createBackend: (origin: string | null) => any }} context */
export async function runBackendCheck(window, context) {
  const finish = (/** @type {Record<string, any>} */ result) => {
    context.stub.close();
    console.log("SYLF_BACKEND_CHECK " + JSON.stringify(result));
    const out = process.env.SYLF_BACKEND_CHECK_OUT;
    if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 1) + "\n"); }
    app.exit(result.passed ? 0 : 1);
  };
  const guard = setTimeout(() => finish({ passed: false, error: "timed out after 120 s" }), 120_000);
  try { const result = await runChecks(window, context); clearTimeout(guard); finish(result); }
  catch (error) { clearTimeout(guard); finish({ passed: false, error: String(/** @type {Error} */ (error)?.stack ?? error).slice(0, 800) }); }
}

/** @param {Electron.BrowserWindow} window @param {{ stub: Awaited<ReturnType<typeof startBackendStub>>, backend: any, createBackend: (origin: string | null) => any }} context */
async function runChecks(window, { stub, backend, createBackend }) {
  const contents = window.webContents;
  if (contents.isLoading()) await new Promise((resolve) => contents.once("did-finish-load", () => resolve(undefined)));
  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  /** A request as the app makes it, from the renderer, and what the renderer can read of the answer. */
  const call = (/** @type {string} */ pathname, /** @type {Record<string, any>} */ init = {}) => js(`(async () => {
    const init = ${JSON.stringify(init)};
    if (init.json) { init.method = init.method ?? "POST"; init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(init.json); delete init.json; }
    const response = await fetch(${JSON.stringify(pathname)}, { cache: "no-store", ...init });
    const text = await response.text();
    return { status: response.status, text, cookie: response.headers.get("set-cookie") };
  })()`);
  /** @type {Record<string, boolean>} */ const results = {};
  const facts = /** @type {Record<string, unknown>} */ ({});
  const check = (/** @type {string} */ name, /** @type {boolean} */ ok) => { results[name] = !!ok; };

  const tag = Date.now().toString(36);
  const password = "a-long-enough-password";
  const email = `electron_${tag}@local.test`;

  const before = JSON.parse((await call("/api/auth/native/session")).text);
  check("starts signed out, and configured", before.configured === true && before.signedIn === false);
  check("a protected route refuses a renderer with no session", (await call("/api/user/stats")).status === 401);

  const registered = await call("/api/auth/native/register", { json: { email, password, name: "Electron", username: `el_${tag}`, timezone: "UTC", clientName: "Forged by the renderer" } });
  check("registration works through the host", registered.status === 200);
  const user = JSON.parse(registered.text);
  check("the sign-in answer carries no token", !/accessToken|refreshToken|eyJ/.test(registered.text));
  check("the host holds a session", (await call("/api/auth/native/session")).text.includes('"signedIn":true'));
  const wrong = await call("/api/auth/native/login", { json: { identifier: email, password: "wrong password" } });
  check("a wrong password is refused, with the server's words", wrong.status === 401 && wrong.text.includes("Invalid credentials"));

  const stats = await call("/api/user/stats");
  facts.statsStatus = stats.status;
  check("a bearer request from this process passes the server's browser check", stats.status === 200 && JSON.parse(stats.text).id === user.userId);

  // What left this process.
  const sent = stub.seen.filter((entry) => entry.path.startsWith("/api/") && entry.authorization);
  check("requests carry the bearer token", sent.length > 0);
  check("no cookie left this process", stub.seen.every((entry) => !entry.cookie));
  check("no Sec-Fetch-Site left this process, which the server would refuse", stub.seen.every((entry) => !entry.secFetch.includes("sec-fetch-site")));
  facts.secFetchHeadersSeen = [...new Set(stub.seen.flatMap((entry) => entry.secFetch))];
  check("the server set no cookie on a native request", stub.seen.every((entry) => !entry.setCookie));
  check("the host keeps its own install name, not the renderer's", await (async () => {
    const list = await call("/api/user/sessions");
    const sessions = JSON.parse(list.text).sessions ?? [];
    facts.deviceName = sessions[0]?.device ?? null;
    facts.sessionsStatus = list.status;
    return list.status === 200 && sessions.length === 1 && sessions[0].isCurrent === true && !sessions[0].device.includes("Forged");
  })());

  // Streaming (G-12).
  const stream = await js(`(async () => {
    const response = await fetch(${JSON.stringify(STREAM_PATH)}, { cache: "no-store" });
    const reader = response.body.getReader(); const decoder = new TextDecoder(); const arrivals = []; let text = "";
    for (;;) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); arrivals.push(performance.now()); }
    return { status: response.status, type: response.headers.get("content-type"), events: text.split("\\n\\n").filter(Boolean).length, reads: arrivals.length, spreadMs: Math.round(arrivals.at(-1) - arrivals[0]) };
  })()`);
  facts.stream = stream;
  check("a stream arrives as it is sent, through protocol.handle", stream.status === 200 && stream.events === STREAM_CHUNKS && stream.reads >= STREAM_CHUNKS - 1 && stream.spreadMs >= STREAM_GAP_MS * 2);

  // Assets (G-8).
  const catalog = await call("/api/acoustics");
  const audioPath = catalog.text.match(/"(\/audio\/[^"]+)"/)?.[1];
  facts.audioPath = audioPath ?? null;
  if (audioPath) {
    const range = await js(`(async () => { const response = await fetch(${JSON.stringify(encodeURI(audioPath))}, { headers: { Range: "bytes=0-99" } }); const bytes = (await response.arrayBuffer()).byteLength; return { status: response.status, bytes, type: response.headers.get("content-type"), range: response.headers.get("content-range") }; })()`);
    facts.audioRange = range;
    check("a relative audio URL loads through the host, by range", range.status === 206 && range.bytes === 100);
    const element = await js(`new Promise((resolve) => { const audio = new Audio(); const done = (value) => { audio.src = ""; resolve(value); }; audio.oncanplay = () => done("canplay"); audio.onloadedmetadata = () => done("metadata"); audio.onerror = () => done("error:" + (audio.error && audio.error.message)); setTimeout(() => done("timeout"), 8000); audio.src = ${JSON.stringify(encodeURI(audioPath))}; audio.load(); })`);
    facts.audioElement = element;
    check("an audio element plays a proxied file under the app's CSP", element === "canplay" || element === "metadata");
  }

  // TimerSync's requests, from the renderer as it will send them. `keepalive` on a custom scheme is what this is here to prove.
  const timerShaped = await js(`(async () => {
    const send = (method, body) => fetch("/api/sessions", { method, headers: { "Content-Type": "application/json" }, keepalive: true, cache: "no-store", body: JSON.stringify(body) }).then(async (response) => ({ status: response.status, body: await response.json() }));
    const started = await send("POST", { executionProtocol: 2, clientSessionKey: crypto.randomUUID(), startedAt: new Date(Date.now() - 2000).toISOString(), expectedOwnerId: ${user.userId} });
    const ended = await send("PATCH", { executionTransition: { schemaVersion: 2, sessionId: started.body.id, action: "END", expectedExecutionVersion: started.body.execution?.executionVersion ?? 1, idempotencyKey: crypto.randomUUID(), cumulativeFocusSeconds: 1, cumulativeBreakSeconds: 0 }, expectedOwnerId: ${user.userId} });
    return { started: started.status, ended: ended.status, state: ended.body.execution?.state };
  })()`);
  facts.timerShaped = timerShaped;
  check("a keepalive start and end reach the real timer through the host", timerShaped.started === 201 && timerShaped.ended === 200 && timerShaped.state === "ENDED");

  // A public route with nobody signed in comes later, once signed out.

  // Concurrency.
  const many = await js(`Promise.all(Array.from({ length: 8 }, () => fetch("/api/user/stats", { cache: "no-store" }).then((response) => response.status)))`);
  check("eight requests at once all succeed", many.every((/** @type {number} */ status) => status === 200));

  // A refresh that really rotates.
  const secretsBefore = stub.secrets.size;
  check("a real refresh rotates the token", (await backend.refreshNow()) === "ok" && stub.secrets.size > secretsBefore);

  // ADR 0009's test 8: nothing in the renderer, however it is looked for.
  const inside = await js(`(async () => {
    const values = [document.cookie, JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.documentElement.outerHTML.slice(0, 2000000)];
    const seen = new Set();
    const walk = (value, depth) => { if (typeof value === "string") { if (value.length < 4000) values.push(value); return; } if (!value || typeof value !== "object" || depth > 2 || seen.has(value)) return; seen.add(value); for (const key of Object.keys(value).slice(0, 200)) { try { walk(value[key], depth + 1); } catch { /* A getter refused. */ } } };
    for (const key of Object.getOwnPropertyNames(window)) { if (/^(webkit|on|chrome)/.test(key)) continue; let value; try { value = window[key]; } catch { continue; } if (typeof value === "function") continue; walk(value, 0); }
    const databases = indexedDB.databases ? (await indexedDB.databases()).map((entry) => entry.name) : [];
    const caches_ = typeof caches === "undefined" ? [] : await caches.keys();
    return { values, databases, caches: caches_, bridge: Object.keys(window.sylfDesktop ?? {}).sort(), cookie: document.cookie };
  })()`);
  const everything = inside.values.join("\n");
  const secrets = [...stub.secrets];
  facts.rendererStringsScanned = inside.values.length;
  facts.secretsCompared = secrets.length;
  check("the check really captured the tokens it compares against", secrets.length >= 3);
  check("no token in any window global, the page, or web storage", secrets.every((secret) => !everything.includes(secret)));
  check("no token-shaped value in the renderer", !/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(everything));
  check("the renderer has no cookie", inside.cookie === "");
  check("the renderer has no database or cache holding a session", inside.databases.length === 0 && inside.caches.length === 0);
  check("the bridge did not grow", JSON.stringify(inside.bridge) === JSON.stringify(["platform", "versions"]));

  // The vault.
  const file = path.join(app.getPath("userData"), "session.bin");
  const durable = await safeStorage.isAsyncEncryptionAvailable();
  facts.safeStorage = { available: durable, backend: process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : "os" };
  try { facts.safeStorageProbe = (await safeStorage.encryptStringAsync("probe")).length; } catch (error) { facts.safeStorageProbe = String(error); }
  facts.vaultFile = fs.existsSync(file);
  if (durable && !fs.existsSync(file)) check("the refresh token is on disk, encrypted", false);
  else if (durable) {
    const raw = fs.readFileSync(file);
    check("the refresh token is on disk, encrypted", raw.length > 0 && secrets.every((secret) => !raw.includes(secret)) && !raw.includes("refreshToken"));
    check("only this user can read it", (fs.statSync(file).mode & 0o777) === 0o600);
  } else check("with no encryption, nothing is written", !fs.existsSync(file));

  // A restart: a new client over the same vault, knowing nothing but what is on disk.
  if (durable) {
    const reborn = createBackend(stub.origin);
    const session = await (await reborn.handle(new Request("sylf://app/api/auth/native/session"))).json();
    check("a restart restores the session, with no network", session.signedIn === true && session.userId === user.userId);
    const after = await reborn.handle(new Request("sylf://app/api/user/stats"));
    check("a restarted client refreshes and reads", after.status === 200);
    check("the rotation it made is on disk", (await reborn.refreshNow()) === "ok");
    await reborn.handle(new Request("sylf://app/api/auth/native/logout", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
    check("sign-out through the restarted client ends the session", (await reborn.handle(new Request("sylf://app/api/auth/native/session")).then((/** @type {Response} */ response) => response.json())).signedIn === false);
    check("sign-out removed the file", !fs.existsSync(file));
    check("the first client is out too: the server's row ended", (await call("/api/user/sessions")).status === 401);
  }

  // Sign in, sign out, and a copied token is dead.
  const signedIn = await call("/api/auth/native/login", { json: { identifier: email, password } });
  check("signing in again works", signedIn.status === 200);
  await call("/api/user/stats");
  const copied = [...stub.seen].reverse().find((entry) => entry.authorization)?.authorization ?? "";
  await call("/api/auth/native/logout", { json: {} });
  check("the host forgets on sign-out", (await call("/api/auth/native/session")).text.includes('"signedIn":false'));
  const replay = await fetch(`${stub.target}/api/user/stats`, { headers: { authorization: copied } });
  check("a token copied before sign-out is refused by the server", replay.status === 401);

  // Sign out everywhere, from the renderer.
  await call("/api/auth/native/login", { json: { identifier: email, password } });
  const everywhere = await call("/api/auth/logout-all", { json: { password } });
  check("sign out everywhere works through the host", everywhere.status === 200);
  check("sign out everywhere leaves the host empty", (await call("/api/auth/native/session")).text.includes('"signedIn":false'));

  check("a public route answers with nobody signed in", (await call("/api/acoustics")).status === 200 && (await call("/api/auth/native/ping")).status === 200);
  check("the web's cookie routes are not reachable", (await call("/api/auth/login", { json: {} })).status === 404 && (await call("/api/auth/native/token", { json: { grant: "refresh" } })).status === 404);

  const passed = Object.values(results).every(Boolean);
  return { passed, passedCount: Object.values(results).filter(Boolean).length, total: Object.keys(results).length, failed: Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name), results, facts, requests: stub.seen.length };
}
