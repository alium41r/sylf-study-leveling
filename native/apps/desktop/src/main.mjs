// @ts-check
// Sylf desktop host (ADR 0001): a minimal Electron shell around the React Native Web build of @sylf/app.
import { app, BrowserWindow, nativeTheme, net, protocol, safeStorage, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_ORIGIN, CONTENT_SECURITY_POLICY, SCHEME, SECURE_WEB_PREFERENCES, isAppUrl, parseDevUrl, resolveInside } from "./security.mjs";
import { createBackendProxy, parseBackendOrigin } from "./backend-proxy.mjs";
import { createSessionVault } from "./session-vault.mjs";
import { runBackendCheck, startBackendStub } from "./backend-check.mjs";
import { runJourneyCheck } from "./journey-check.mjs";
import { runDesignCheck } from "./design-check.mjs";
import { runReviewCapture } from "./review-capture.mjs";
import { runSelfTest } from "./self-test.mjs";
import { runSessionCheck } from "./session-check.mjs";
import { runSpacesCheck } from "./spaces-check.mjs";
import { runHomeCheck } from "./home-check.mjs";
import { runWorkspaceCheck } from "./workspace-check.mjs";
import { runWorldCheck } from "./world-check.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(here, "../../sylf/dist");
const DEV_URL = parseDevUrl(process.env.SYLF_DESKTOP_DEV_URL);
const SELF_TEST = process.argv.includes("--sylf-self-test");
const DESIGN_CHECK = process.argv.includes("--sylf-design-check");
const SPACES_CHECK = process.argv.includes("--sylf-spaces-check");
const HOME_CHECK = process.argv.includes("--sylf-home-check");
const WORKSPACE_CHECK = process.argv.includes("--sylf-workspace-check");
const WORLD_CHECK = process.argv.includes("--sylf-world-check");
const SESSION_CHECK = process.argv.includes("--sylf-session-check");
const REVIEW_CAPTURE = process.argv.includes("--sylf-review-capture");
const FRONTEND_CHECK = process.argv.includes("--sylf-frontend-check");
const FIXTURE_CHECK = FRONTEND_CHECK || SPACES_CHECK || HOME_CHECK || WORKSPACE_CHECK || WORLD_CHECK || SESSION_CHECK;
const BACKEND_CHECK = process.argv.includes("--sylf-backend-check");
const JOURNEY_CHECK = process.argv.includes("--sylf-journey-check");

// Verification runs use a throwaway profile so they neither read nor overwrite the user's preferences.
if (DESIGN_CHECK || FIXTURE_CHECK || REVIEW_CAPTURE || BACKEND_CHECK) app.setPath("userData", fs.mkdtempSync(path.join(app.getPath("temp"), "sylf-design-check-")));
// The journey's two runs share one throwaway profile, because a real restart keeps what is on disk.
if (JOURNEY_CHECK) app.setPath("userData", process.env.SYLF_JOURNEY_PROFILE ?? fs.mkdtempSync(path.join(app.getPath("temp"), "sylf-journey-")));

// `stream` lets a media element read proxied audio by range. Fetch streams work without it.
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true, stream: true } }]);
app.enableSandbox();
if (!app.requestSingleInstanceLock()) app.quit();

// Defense in depth for every web contents the app ever creates.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => { if (!isAppUrl(url, DEV_URL)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!isAppUrl(url, DEV_URL)) event.preventDefault(); });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    // External https links open in the user's browser; nothing opens inside Electron.
    if (url.startsWith("https://") && !SELF_TEST) void shell.openExternal(url);
    return { action: "deny" };
  });
});

/** @param {ReturnType<typeof createBackendProxy>} backend */
function serveWebBuild(backend) {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    // The renderer's only way to the backend. Everything else is the web build, as before.
    if (backend.handles(url.pathname)) return backend.handle(request);
    // Single-page app: extensionless paths fall back to index.html.
    const requested = path.extname(url.pathname) ? url.pathname : "/index.html";
    const file = resolveInside(WEB_ROOT, requested, path);
    if (!file) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    return new Response(response.body, { status: response.status, headers });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Sylf",
    // Matches Signature's grounds, so a cold launch never flashes the wrong polarity before the app paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#100e17" : "#f3f2f8",
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(here, "preload.cjs") },
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(DEV_URL ? DEV_URL.toString() : `${APP_ORIGIN}/`);
  return window;
}

/** One client for this install. Its name is what a person sees in Settings beside their browsers. @param {string | null} origin */
function createBackend(origin, vault = createSessionVault(safeStorage, path.join(app.getPath("userData"), "session.bin"))) {
  const name = process.platform === "darwin" ? "Sylf for Mac" : process.platform === "win32" ? "Sylf for Windows" : "Sylf for Linux";
  return createBackendProxy({
    origin,
    // Node's fetch, not net.fetch. Chromium's stack adds Sec-Fetch-Site to every request, even from this process, and the server rightly
    // refuses any bearer token that arrives with one (ADR 0009 decision 6). The backend check proves it. The cost: no system proxy.
    fetch: (input, init) => globalThis.fetch(input, init),
    vault,
    clientName: name,
    openExternal: (url) => shell.openExternal(url),
    log: (event) => console.log(`SYLF_BACKEND ${event}`),
  });
}

app.whenReady().then(async () => {
  // No web permission (camera, microphone, notifications, geolocation…) is granted until a phase needs it.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  if (!DEV_URL) {
    if (!fs.existsSync(path.join(WEB_ROOT, "index.html"))) {
      console.error(`Missing web build at ${WEB_ROOT}. Run "npm run build:web" in native/ first.`);
      app.exit(1);
      return;
    }
    // The check puts a recording stub in front of the real server, so the origin is only known once that is listening.
    const stub = !FIXTURE_CHECK && (BACKEND_CHECK || JOURNEY_CHECK) ? await startBackendStub() : null;
    const fixtureModule = FIXTURE_CHECK ? await import("./frontend-fixture.mjs") : null;
    const fixture = fixtureModule ? await fixtureModule.startFrontendFixture() : null;
    let testSession = null;
    const vault = fixture ? {
      durable: async () => false,
      read: async () => testSession,
      write: async (value) => { testSession = value; },
      clear: async () => { testSession = null; },
    } : undefined;
    const backend = createBackend(stub?.origin ?? fixture?.origin ?? parseBackendOrigin(process.env.SYLF_BACKEND_ORIGIN), vault);
    if (fixture) {
      app.once("before-quit", fixture.close);
      if (!FRONTEND_CHECK && fixtureModule) {
        const response = await backend.handle(new Request(`${APP_ORIGIN}/api/auth/native/login`, { method: "POST", body: JSON.stringify(fixtureModule.FIXTURE_LOGIN) }));
        if (!response.ok) throw new Error("Unable to open the local fixture session.");
      }
    }
    serveWebBuild(backend);
    if (FRONTEND_CHECK && fixture) {
      const window = createWindow();
      if (process.env.SYLF_FRONTEND_INSPECT !== "1") {
        const { runFrontendCheck } = await import("./frontend-check.mjs");
        void runFrontendCheck(window, fixture);
      }
      return;
    }
    if (BACKEND_CHECK && stub) { void runBackendCheck(createWindow(), { stub, backend, createBackend }); return; }
    if (JOURNEY_CHECK && stub) { void runJourneyCheck(createWindow(), { stub, backend }); return; }
  }
  const window = createWindow();
  if (SELF_TEST) runSelfTest(window, { webRoot: WEB_ROOT });
  if (DESIGN_CHECK) void runDesignCheck(window);
  if (SPACES_CHECK) void runSpacesCheck(window);
  if (HOME_CHECK) void runHomeCheck(window);
  if (WORKSPACE_CHECK) void runWorkspaceCheck(window);
  if (WORLD_CHECK) void runWorldCheck(window);
  if (SESSION_CHECK) void runSessionCheck(window);
  if (REVIEW_CAPTURE) void runReviewCapture(window);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin" || SELF_TEST) app.quit(); });
