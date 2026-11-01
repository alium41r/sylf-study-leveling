// Sandboxed preload (must be CommonJS). Exposes a frozen, read-only description of the host; no Node APIs.
const { contextBridge } = require("electron");

// Visible only inside the isolated preload world; the self-test asserts the page cannot see it.
globalThis.__sylfPreloadWorld = true;

let osVersion = "";
try { osVersion = process.getSystemVersion(); } catch { osVersion = ""; }

contextBridge.exposeInMainWorld(
  "sylfDesktop",
  Object.freeze({
    platform: process.platform,
    versions: Object.freeze({ electron: process.versions.electron, chrome: process.versions.chrome, os: osVersion }),
  })
);
