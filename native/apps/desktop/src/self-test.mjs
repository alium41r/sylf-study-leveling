// @ts-check
// Automated runtime verification of the desktop host (run with --sylf-self-test). Prints one
// SYLF_DESKTOP_SELF_TEST line with every check and exits non-zero on any failure.
import fs from "node:fs";
import { app } from "electron";
import { APP_ORIGIN, SECURE_WEB_PREFERENCES } from "./security.mjs";

/** @param {Electron.BrowserWindow} window @param {{ webRoot: string }} options */
export function runSelfTest(window, options) {
  const contents = window.webContents;
  const started = Date.now();
  /** @type {any} */
  let foundation = null;
  const timeout = setTimeout(() => finish({ error: "timeout waiting for SYLF_FOUNDATION" }), 30_000);

  contents.on("console-message", (/** @type {any} */ event, _level, legacyMessage) => {
    const message = typeof event?.message === "string" ? event.message : legacyMessage;
    if (typeof message === "string" && message.startsWith("SYLF_FOUNDATION ")) {
      foundation = JSON.parse(message.slice("SYLF_FOUNDATION ".length));
      void check();
    }
  });

  async function check() {
    const renderer = await contents.executeJavaScript(`(() => {
      let evalBlocked = false; try { (0, eval)("1"); } catch { evalBlocked = true; }
      const bridge = window.sylfDesktop;
      return {
        preloadWorldVisible: typeof window.__sylfPreloadWorld !== "undefined",
        origin: location.origin,
        nodeGlobals: { require: typeof require, module: typeof module, Buffer: typeof Buffer },
        // Bundlers define a plain process.env shim; real Node exposes versions.node and binding().
        processShim: typeof process === "undefined" ? "absent" : { keys: Object.keys(process).sort(), nodeVersion: process.versions?.node ?? null, binding: typeof process.binding },
        bridgeKeys: bridge ? Object.keys(bridge).sort() : null,
        bridgeFrozen: bridge ? Object.isFrozen(bridge) : null,
        windowOpenBlocked: window.open("https://example.com") === null,
        evalBlockedByCsp: evalBlocked,
      };
    })()`);
    // With no backend configured the host answers for itself, honestly, and nothing leaves the machine.
    const backend = await contents.executeJavaScript(`(async () => {
      const session = await (await fetch("/api/auth/native/session")).json();
      const stats = await fetch("/api/user/stats");
      return { session, status: stats.status, body: await stats.json() };
    })()`);
    // Attempt an external navigation; the will-navigate guard must keep the app on its origin.
    await contents.executeJavaScript(`location.href = "https://example.com"; true`).catch(() => true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    const urlAfterNavigation = contents.getURL();
    // Optional visual evidence of what the real window rendered.
    const capturePath = process.env.SYLF_SELF_TEST_CAPTURE;
    if (capturePath) fs.writeFileSync(capturePath, (await contents.capturePage()).toPNG());
    const metrics = app.getAppMetrics();
    const rendererPid = contents.getOSProcessId();
    const rendererMetric = metrics.find((m) => m.pid === rendererPid);
    const checks = {
      // Declared configuration (Electron 45 exposes no getter for the live web preferences)...
      declaredPreferencesHardened: SECURE_WEB_PREFERENCES.contextIsolation === true && SECURE_WEB_PREFERENCES.sandbox === true && SECURE_WEB_PREFERENCES.nodeIntegration === false && SECURE_WEB_PREFERENCES.webviewTag === false,
      // ...and observed behavior.
      rendererProcessSandboxed: rendererMetric?.sandboxed === true,
      contextIsolated: renderer.preloadWorldVisible === false,
      appOrigin: renderer.origin === APP_ORIGIN,
      noNodeGlobalsInRenderer: Object.values(renderer.nodeGlobals).every((t) => t === "undefined") && (renderer.processShim === "absent" || (renderer.processShim.nodeVersion === null && renderer.processShim.binding === "undefined")),
      bridgeMinimalAndFrozen: JSON.stringify(renderer.bridgeKeys) === JSON.stringify(["platform", "versions"]) && renderer.bridgeFrozen === true,
      windowOpenBlocked: renderer.windowOpenBlocked === true,
      cspBlocksEval: renderer.evalBlockedByCsp === true,
      externalNavigationBlocked: urlAfterNavigation.startsWith(APP_ORIGIN),
      backendHostHonestWhenUnconfigured: backend.session.configured === false && backend.session.signedIn === false && backend.status === 503 && backend.body.code === "not_configured",
      foundationStarted: foundation !== null,
      sharedCodeParity: foundation?.parity?.passed === true,
    };
    finish({
      checks,
      renderer,
      foundation: foundation && { readyMs: foundation.readyMs, capabilities: foundation.capabilities, parity: foundation.parity, crypto: foundation.crypto },
      startupToFoundationMs: Date.now() - started,
      rendererProcess: rendererMetric && { type: rendererMetric.type, sandboxed: rendererMetric.sandboxed },
      memory: { processes: metrics.length, workingSetMb: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024) },
      versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
      webRoot: options.webRoot,
    });
  }

  /** @param {Record<string, any>} result */
  function finish(result) {
    clearTimeout(timeout);
    const passed = !result.error && Object.values(result.checks ?? {}).every(Boolean);
    console.log("SYLF_DESKTOP_SELF_TEST " + JSON.stringify({ passed, ...result }));
    app.exit(passed ? 0 : 1);
  }
}
