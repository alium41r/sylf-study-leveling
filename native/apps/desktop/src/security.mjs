// @ts-check
// Security policy for the Sylf desktop host. Electron security checklist: sandboxed, context-isolated renderer,
// no Node integration, strict CSP, no navigation or new windows outside the app origin, no permissions.
export const SCHEME = "sylf";
export const APP_ORIGIN = `${SCHEME}://app`;

// React Native Web emits inline styles; scripts are strictly same-origin (no eval, no inline scripts).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join("; ");

/** @type {Electron.WebPreferences} */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  safeDialogs: true,
};

/** Development server URLs are accepted only on the loopback interface. */
export function parseDevUrl(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error(`Refusing non-loopback dev URL: ${value}`);
  return url;
}

/** True when a navigation target stays inside the application (packaged origin or loopback dev origin). */
export function isAppUrl(target, devUrl) {
  try {
    const url = new URL(target);
    if (url.origin === APP_ORIGIN || `${url.protocol}//${url.host}` === APP_ORIGIN) return true;
    return devUrl !== undefined && url.origin === devUrl.origin;
  } catch {
    return false;
  }
}

/** Resolves a request path inside the web root; returns undefined for traversal attempts. */
export function resolveInside(root, requestPath, pathModule) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const file = pathModule.resolve(root, relative);
  return file === root || file.startsWith(root + pathModule.sep) ? file : undefined;
}
