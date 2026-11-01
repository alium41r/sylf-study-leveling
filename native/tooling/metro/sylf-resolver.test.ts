import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { withSylfResolver } = require("./sylf-resolver.js") as typeof import("./sylf-resolver.js");

const workspace = path.resolve(__dirname, "../..");
const sylf = path.resolve(workspace, "..");
const app = path.join(workspace, "apps/sylf");

function setup(resolved: (moduleName: string, origin: string) => string) {
  const calls: { moduleName: string; origin: string }[] = [];
  const config = withSylfResolver({ resolver: {}, watchFolders: [] } as never, { projectRoot: app }) as { resolver: { resolveRequest: (ctx: unknown, m: string, p: string) => { type: string; filePath: string } } };
  const resolve = (moduleName: string, origin: string, platform = "android") =>
    config.resolver.resolveRequest({ originModulePath: origin, resolveRequest: (ctx: { originModulePath: string }, m: string) => { calls.push({ moduleName: m, origin: ctx.originModulePath }); return { type: "sourceFile", filePath: resolved(m, ctx.originModulePath) }; } }, moduleName, platform);
  return { resolve, calls };
}

describe("Sylf Metro resolver", () => {
  it("rejects server-only packages", () => {
    const { resolve } = setup(() => "/x");
    expect(() => resolve("@prisma/client", path.join(app, "src/App.tsx"))).toThrow(/SYLF_NATIVE_BOUNDARY/);
    expect(() => resolve("server-only", path.join(sylf, "lib/notes/ink.ts"))).toThrow(/SYLF_NATIVE_BOUNDARY/);
  });
  it("resolves bare imports from lib/ as if imported by the app (single copy)", () => {
    const { resolve, calls } = setup(() => path.join(workspace, "node_modules/yjs/dist/yjs.mjs"));
    resolve("yjs", path.join(sylf, "lib/notes/ink.ts"));
    expect(calls[0].origin).toBe(path.join(app, "package.json"));
  });
  it("fails when anything resolves into the web app's node_modules", () => {
    const { resolve } = setup(() => path.join(sylf, "node_modules/yjs/dist/yjs.mjs"));
    expect(() => resolve("yjs", path.join(app, "src/App.tsx"))).toThrow(/web app's node_modules/);
  });
  it("fails for repository files outside the approved lib/ boundary", () => {
    const { resolve } = setup((m) => (m.includes("auth-server") ? path.join(sylf, "lib/auth-server.ts") : path.join(sylf, "app/page.tsx")));
    expect(() => resolve("../../../../lib/auth-server", path.join(workspace, "packages/shared/src/index.ts"))).toThrow(/approved shared lib/);
    expect(() => resolve("../../../../app/page", path.join(workspace, "packages/shared/src/index.ts"))).toThrow(/approved shared lib/);
  });
  it("shims lib0/webcrypto on native platforms only", () => {
    const { resolve } = setup(() => "/browser/webcrypto.js");
    expect(resolve("lib0/webcrypto", path.join(workspace, "node_modules/lib0/random.js"), "android").filePath).toMatch(/lib0-webcrypto\.ts$/);
    expect(resolve("lib0/webcrypto", path.join(workspace, "node_modules/lib0/random.js"), "web").filePath).toBe("/browser/webcrypto.js");
  });
});
