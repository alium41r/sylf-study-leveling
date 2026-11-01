import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ORIGIN, CONTENT_SECURITY_POLICY, SECURE_WEB_PREFERENCES, isAppUrl, parseDevUrl, resolveInside } from "./security.mjs";

describe("desktop security policy", () => {
  it("uses hardened web preferences", () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, webSecurity: true });
  });
  it("forbids eval, inline scripts, framing and remote connections", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });
  it("accepts only app and loopback dev origins", () => {
    const dev = parseDevUrl("http://localhost:8081");
    expect(isAppUrl(`${APP_ORIGIN}/index.html`, undefined)).toBe(true);
    expect(isAppUrl("http://localhost:8081/x", dev)).toBe(true);
    expect(isAppUrl("http://localhost:9999/x", dev)).toBe(false);
    expect(isAppUrl("https://example.com", dev)).toBe(false);
    expect(() => parseDevUrl("http://192.168.1.4:8081")).toThrow();
    expect(() => parseDevUrl("https://localhost:8081")).toThrow();
  });
  it("blocks path traversal out of the web root", () => {
    const root = path.resolve("/tmp/sylf-web");
    expect(resolveInside(root, "/index.html", path)).toBe(path.join(root, "index.html"));
    expect(resolveInside(root, "/../../etc/passwd", path)).toBeUndefined();
    expect(resolveInside(root, "/%2e%2e/secret", path)).toBeUndefined();
  });
});
