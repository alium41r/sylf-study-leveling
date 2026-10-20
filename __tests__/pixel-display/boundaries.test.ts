import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * MECHANICAL BOUNDARY ENFORCEMENT
 * ============================================================================
 * The architecture depends on layers that must not reach across each other, so
 * the boundaries are asserted against the *source text* rather than trusted to
 * review:
 *
 *   engine/**   ⟂ DOM, React, content, renderers, app, product modules
 *   content/**  ⟂ app, React, DOM, engine internals
 *   renderers/**⟂ content, app, product modules
 *
 * A sibling compile-time check makes the engine's DOM-freedom a *type* error
 * rather than a naming convention: `npm run typecheck:engine` typechecks
 * `engine/**` with no DOM lib, so `HTMLElement` or `CanvasRenderingContext2D`
 * cannot appear there at all.
 *
 * Fixture-based tests below prove each scan can actually fail. A boundary test
 * that cannot fail is worse than no test, because it reads as coverage.
 */

const ROOT = process.cwd();
const PIXEL_ROOT = join(ROOT, "lib", "pixel-display");

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listSourceFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** Strips comments and string literals so scans see only real code. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '""')
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, '""');
}

/**
 * Extracts import specifiers from raw source.
 *
 * This runs on the **raw** text, not on `codeOnly`: stripping string literals
 * would erase the module paths being inspected. Block comments are removed first
 * so a commented-out import is not reported, and line comments are dropped before
 * matching so prose about `import` cannot be mistaken for code.
 */
function importSpecifiers(source: string): string[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  const code = withoutBlockComments
    .split("\n")
    .map((line) => line.split("//")[0])
    .join("\n");

  const specifiers: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\b(?:import|export)\s+type\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const ENGINE_FORBIDDEN_TARGETS: Array<[RegExp, string]> = [
  [/^\.\.\/\.\.\//, "engine file escaping the engine directory"],
  [/^\.\.\/[^./]/, "engine importing a sibling layer (renderers/react/content)"],
  [/pixel-display\/content/, "engine importing content"],
  [/pixel-display\/renderers/, "engine importing a renderer"],
  [/pixel-display\/react/, "engine importing the React host"],
  [/^@\/app\//, "engine importing an application module"],
  [/^@\/lib\/(?!pixel-display\/engine)/, "engine importing a product module"],
  [/^react$/, "engine importing React"],
  [/^react-dom/, "engine importing React DOM"],
  [/^next\//, "engine importing Next.js"],
];

/** Platform globals the engine may not touch. `performance` is not among them:
 * it is available in both browser and Node, and the runtime only reads a clock
 * it is handed. */
const ENGINE_FORBIDDEN_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
  "HTMLCanvasElement",
  "CanvasRenderingContext2D",
  "OffscreenCanvas",
  "ImageData",
  "ResizeObserver",
  "IntersectionObserver",
  "MediaQueryList",
  "matchMedia",
  "devicePixelRatio",
  "getContext",
];

/**
 * `requestAnimationFrame` / `cancelAnimationFrame` are permitted **only** behind
 * a `typeof` feature check, which is how the runtime stays usable in a host that
 * has no browser frame loop at all.
 */
const ENGINE_CONDITIONAL_GLOBALS = ["requestAnimationFrame", "cancelAnimationFrame"];

const CONTENT_FORBIDDEN_TARGETS: Array<[RegExp, string]> = [
  [/^@\/app\//, "content importing an application module"],
  [/^@\/lib\/(?!pixel-display)/, "content importing a product module"],
  [/^react$/, "content importing React"],
  [/^react-dom/, "content importing React DOM"],
  [/^next\//, "content importing Next.js"],
  [/pixel-display\/app\//, "content importing an application module"],
];

const CONTENT_FORBIDDEN_GLOBALS = ["window", "document", "HTMLElement", "getContext"];

const RENDERER_FORBIDDEN_TARGETS: Array<[RegExp, string]> = [
  [/^@\/app\//, "renderer importing an application module"],
  [/pixel-display\/content/, "renderer importing content"],
];

// ─── Scanners (pure, so they can be proven capable of failing) ────────────────

function findForbiddenImports(
  source: string,
  rules: Array<[RegExp, string]>,
): string[] {
  return importSpecifiers(source)
    .flatMap((specifier) =>
      rules
        .filter(([pattern]) => pattern.test(specifier))
        .map(([, label]) => `${specifier} — ${label}`),
    );
}

/**
 * Whether `code` actually *references* `name` as a global.
 *
 * A bare word match is not enough. Content is entitled to a local variable
 * called `window` or a parameter called `document`; what it may not do is reach
 * for the ambient global. The difference is context, so the check looks for a
 * use that is not preceded by a property access and not immediately followed by
 * a declaration — `window` on its own matches, `host.window` and `const window`
 * do not.
 *
 * This is deliberately a narrowing of a false positive rather than a weakening:
 * `window.foo`, `document.title` and a bare `window` all still match.
 */
/**
 * Whether `code` references `name` at all.
 *
 * Deliberately a plain name match rather than a scope analysis. These layers are
 * small, and the rule they enforce is absolute: an engine or content module may
 * not reach for a browser API. A stricter scanner would need real parsing, and a
 * laxer one would let a surface keep a reference and still pass.
 *
 * The consequence is that a local named `window` fails the check too. That is
 * the intended trade: `window` is a bad local name precisely because the global
 * exists, so the rule simply forbids the collision rather than teaching the
 * scanner to tell the two apart.
 */
function referencesGlobal(code: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(code);
}

function findForbiddenGlobals(source: string, globals: string[]): string[] {
  const code = codeOnly(source);
  return globals.filter((name) => referencesGlobal(code, name));
}

function findUnconditionalGlobals(source: string, globals: string[]): string[] {
  const code = codeOnly(source);
  return globals.filter((name) => {
    const guarded = new RegExp(`typeof\\s+${name}`).test(code);
    if (guarded) return false;
    return referencesGlobal(code, name);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("engine boundary", () => {
  const engineFiles = listSourceFiles(join(PIXEL_ROOT, "engine"));

  it("has files to check", () => {
    expect(engineFiles.length).toBeGreaterThan(4);
  });

  it("imports nothing from content, renderers, react, app or product modules", () => {
    const violations = engineFiles.flatMap((file) =>
      findForbiddenImports(readFileSync(file, "utf8"), ENGINE_FORBIDDEN_TARGETS).map(
        (violation) => `${relative(ROOT, file)}: ${violation}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("references no DOM global", () => {
    const violations = engineFiles.flatMap((file) =>
      findForbiddenGlobals(
        readFileSync(file, "utf8"),
        ENGINE_FORBIDDEN_GLOBALS,
      ).map((name) => `${relative(ROOT, file)}: ${name}`),
    );
    expect(violations).toEqual([]);
  });

  it("touches the frame-loop globals only behind a typeof check", () => {
    // The ambient declaration file is the one place these names are *declared*
    // rather than called, so it is exempt by definition.
    const callers = engineFiles.filter(
      (file) => !file.endsWith("pix-engine-globals.d.ts"),
    );
    const violations = callers.flatMap((file) =>
      findUnconditionalGlobals(
        readFileSync(file, "utf8"),
        ENGINE_CONDITIONAL_GLOBALS,
      ).map((name) => `${relative(ROOT, file)}: ${name}`),
    );
    expect(violations).toEqual([]);
    // The exemption must not silently cover every file.
    expect(engineFiles.length - callers.length).toBe(1);
  });

  it("keeps React out entirely", () => {
    for (const file of engineFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(ROOT, file)).not.toMatch(/from\s+["']react/);
      expect(source, relative(ROOT, file)).not.toMatch(/\buseState\b|\buseEffect\b/);
    }
  });

  it("does not reach into the renderers for its public types", () => {
    // The engine's public surface must be engine-only. Re-exporting renderer
    // types would make the engine depend on a renderer, and so on the DOM.
    for (const name of ["index.ts", "types.ts"]) {
      // Comments are stripped: these files legitimately *document* why they do
      // not re-export renderer types. What matters is that no code does.
      const source = codeOnly(
        readFileSync(join(PIXEL_ROOT, "engine", name), "utf8"),
      );
      expect(source, name).not.toMatch(/renderers/);
      expect(source, name).not.toMatch(/canvas-2d/);
    }
  });

  it("is typechecked against a lib set that excludes the DOM", () => {
    // `npm run typecheck:engine` is the mechanical counterpart to the scans
    // above: it makes a DOM type a compile error rather than a naming slip.
    const config = JSON.parse(
      readFileSync(join(ROOT, "config/tsconfig.pixel-engine.json"), "utf8"),
    );
    expect(config.compilerOptions.lib).toEqual(["esnext"]);
    expect(config.compilerOptions.lib).not.toContain("dom");
    expect(config.include).toEqual(["../lib/pixel-display/engine/**/*.ts"]);
  });
});

describe("content boundary", () => {
  const contentFiles = listSourceFiles(join(PIXEL_ROOT, "content"));

  it("imports nothing from app or product modules", () => {
    const violations = contentFiles.flatMap((file) =>
      findForbiddenImports(
        readFileSync(file, "utf8"),
        CONTENT_FORBIDDEN_TARGETS,
      ).map((violation) => `${relative(ROOT, file)}: ${violation}`),
    );
    expect(violations).toEqual([]);
  });

  it("references no DOM global", () => {
    const violations = contentFiles.flatMap((file) =>
      findForbiddenGlobals(
        readFileSync(file, "utf8"),
        CONTENT_FORBIDDEN_GLOBALS,
      ).map((name) => `${relative(ROOT, file)}: ${name}`),
    );
    expect(violations).toEqual([]);
  });
});

describe("the global scanner is a plain name match, and says so", () => {
  it("flags every form of a reference", () => {
    expect(findForbiddenGlobals("window.foo;", ["window"])).toEqual(["window"]);
    expect(findForbiddenGlobals("const w = window;", ["window"])).toEqual([
      "window",
    ]);
    expect(findForbiddenGlobals("document.title", ["document"])).toEqual([
      "document",
    ]);
    // A property path counts too: the rule is about a layer being able to reach
    // the API at all, not about the syntax it uses to get there.
    expect(findForbiddenGlobals("host.window", ["window"])).toEqual(["window"]);
    expect(findForbiddenGlobals("canvas.getContext('2d')", ["getContext"])).toEqual(
      ["getContext"],
    );
  });

  it("forbids colliding with a browser name even for a local", () => {
    // Documented as intended: a local called `window` fails, because the name is
    // reserved by the platform and the scanner deliberately does not try to
    // out-parse it.
    expect(findForbiddenGlobals("const window = 5;", ["window"])).toEqual([
      "window",
    ]);
  });
});

describe("renderer boundary", () => {
  const rendererFiles = listSourceFiles(join(PIXEL_ROOT, "renderers"));

  it("imports no content or application module", () => {
    const violations = rendererFiles.flatMap((file) =>
      findForbiddenImports(
        readFileSync(file, "utf8"),
        RENDERER_FORBIDDEN_TARGETS,
      ).map((violation) => `${relative(ROOT, file)}: ${violation}`),
    );
    expect(violations).toEqual([]);
  });
});

describe("the boundary geometry itself", () => {
  it("records the intended dependency direction", () => {
    // engine ← renderers ← react ← app   (imports flow right-to-left)
    // content → engine                   (content may use the engine)
    //
    // Asserted as *imports*, not as the presence of a word: an engine comment
    // that discusses content is documentation, and a keyword scan cannot tell
    // the two apart.
    const engineFiles = listSourceFiles(join(PIXEL_ROOT, "engine"));
    for (const file of engineFiles) {
      const specifiers = importSpecifiers(readFileSync(file, "utf8"));
      for (const specifier of specifiers) {
        expect(specifier, relative(ROOT, file)).not.toMatch(
          /pixel-display\/(content|renderers|react)/,
        );
      }
    }

    // The other direction is allowed and actually happens: the Sylf character
    // imports the engine, which is why removing `content/` leaves the engine
    // independently valid rather than broken.
    const contentFiles = listSourceFiles(join(PIXEL_ROOT, "content"));
    expect(contentFiles.length).toBeGreaterThan(0);
    const contentImportsEngine = contentFiles.some((file) =>
      importSpecifiers(readFileSync(file, "utf8")).some((specifier) =>
        specifier.includes("engine"),
      ),
    );
    expect(contentImportsEngine).toBe(true);
  });

  it("would remain valid if the Sylf content were deleted", () => {
    // The engine must not merely avoid importing content today — it must not
    // need it at all. Every engine module is checked to import nothing from
    // outside the engine, so deleting `content/sylf/**` cannot break it.
    for (const file of listSourceFiles(join(PIXEL_ROOT, "engine"))) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        const isEngineLocal = specifier.startsWith(".");
        expect(isEngineLocal, `${relative(ROOT, file)} imports ${specifier}`).toBe(
          true,
        );
      }
    }
  });
});

describe("the dashboard consumes the display through an adapter only", () => {
  const dashboardFiles = listSourceFiles(join(ROOT, "app", "dashboard"));
  const ADAPTER = join(ROOT, "app", "dashboard", "pixel-companion-adapter.ts");

  /** Modules an application surface may not reach into directly. */
  const APPLICATION_FORBIDDEN: Array<[RegExp, string]> = [
    [/pixel-display\/engine/, "dashboard importing engine internals"],
    [/pixel-display\/renderers/, "dashboard importing a renderer"],
    [/pixel-display\/content\/sylf\/(parts|sprite|frames)/, "dashboard importing character planes"],
  ];

  it("has dashboard files to check", () => {
    expect(dashboardFiles.length).toBeGreaterThan(0);
  });

  it("never imports framebuffer, renderer or character-plane internals", () => {
    const violations = dashboardFiles.flatMap((file) =>
      findForbiddenImports(
        readFileSync(file, "utf8"),
        APPLICATION_FORBIDDEN,
      ).map((violation) => `${relative(ROOT, file)}: ${violation}`),
    );
    expect(violations).toEqual([]);
  });

  it("reaches the display only through the adapter, the React host and content types", () => {
    // The React host is the supported way to mount the display; it is not an
    // internal. Anything narrower than that would mean the application is
    // touching pixels, which the architecture forbids.
    const allowed = [
      /pixel-display\/react\/PixelDisplay/,
      /pixel-display\/react\/usePixRuntime/,
      // The content layer and its asset contract. Reaching the *content* is the
      // point of an integration surface; what it may not reach is the engine,
      // the renderers, or a plane.
      /pixel-display\/content(\/|$)/,
    ];
    for (const file of dashboardFiles) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        if (!specifier.includes("pixel-display")) continue;
        const ok = allowed.some((pattern) => pattern.test(specifier));
        expect(ok, `${relative(ROOT, file)} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("keeps the set of dual-vocabulary modules to the six that must be", () => {
    // A module that imports both an application module and the Pixel Display
    // content layer knows both vocabularies. The architecture confines that to
    // the boundary, and every module allowed to do it is listed here with its
    // reason. Widening the list is an architectural decision, which is why this
    // is an exact list rather than a "contains": adding a module means editing
    // this test, and therefore having a conversation.
    //
    //   the adapter            resolves the production card's configuration
    //   the dev review panel   must show the same resolution a scholar gets, so
    //                          it cannot be handed a hand-made composition
    //   the card               receives a resolved composition and passes it to
    //                          the display; it interprets nothing
    //   pixel-customizer-options  turns catalogues into scholar-facing choices
    //   the Locker hub         previews the draft the Identity tab holds
    //   Pixel Studio           previews the drawing being made, through the same
    //                          resolver, so the preview cannot lie
    //
    // Every one of them *resolves or presents*; none of them rasterises.
    const both: string[] = [];
    for (const tree of [
      join(ROOT, "app"),
      join(PIXEL_ROOT, "content"),
      join(PIXEL_ROOT, "engine"),
    ]) {
      for (const file of listSourceFiles(tree)) {
        const specifiers = importSpecifiers(readFileSync(file, "utf8"));
        const touchesApplication = specifiers.some((entry) =>
          /^@\/app\//.test(entry),
        );
        const touchesContent = specifiers.some((entry) =>
          /pixel-display\/content/.test(entry),
        );
        if (touchesApplication && touchesContent) both.push(relative(ROOT, file));
      }
    }
    expect(both.sort()).toEqual(
      [
        relative(ROOT, ADAPTER),
        "app/dashboard/components/PixelCompanionCard.tsx",
        "app/locker/components/identity/PixelCustomizer.tsx",
        "app/components/companion/OwnCompanionPreview.tsx",
        "app/components/companion/PixelCompanion.tsx",
        "app/locker/components/identity/pixel-customizer-options.ts",
        // Pixel Studio resolves an in-progress drawing for its previews, so it
        // must show exactly what saving would produce.
        "app/locker/components/studio/PixelStudio.tsx",
      ].sort(),
    );
  });

  it("keeps retired character geometry out of production source", () => {
    for (const tree of [join(ROOT, 'app'), join(PIXEL_ROOT, 'content')]) {
      for (const file of listSourceFiles(tree)) {
        for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
          expect(specifier).not.toMatch(/retired-sylf|sylf\/(parts|sprite)|reference\/sylf-character/);
        }
      }
    }
  });

  it("keeps the dev surface out of production imports", () => {
    // Nothing under app/dev may be imported by a route that ships. The route
    // itself is 404 in production, and this asserts nothing else pulls it in.
    const shipping = listSourceFiles(join(ROOT, "app")).filter(
      (file) => !relative(ROOT, file).startsWith("app/dev/"),
    );
    for (const file of shipping) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        expect(
          specifier,
          `${relative(ROOT, file)} imports ${specifier}`,
        ).not.toMatch(/dev\/pixel-display/);
      }
    }
  });

  it("keeps the Shop and Locker out of the display path", () => {
    // The reverse direction, and the one that matters for Phase 6: the cosmetic
    // registry may import the asset contract, but the asset contract — and
    // everything it covers — must never learn what a price, a rarity or an
    // unlock requirement is.
    const displayFiles = [
      ...listSourceFiles(join(PIXEL_ROOT, "content")),
      ...listSourceFiles(join(PIXEL_ROOT, "engine")),
    ];
    for (const file of displayFiles) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        expect(
          specifier,
          `${relative(ROOT, file)} imports ${specifier}`,
        ).not.toMatch(/character-traits|shop|locker|asset-manifest/);
      }
    }
  });

  it("keeps the cosmetic registry out of the content layer", () => {
    // The registry knows both vocabularies, so it lives at the boundary. If a
    // content module ever imported it, the content layer would have learned what
    // a cosmetic key is.
    for (const file of listSourceFiles(join(PIXEL_ROOT, "content"))) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        expect(
          specifier,
          `${relative(ROOT, file)} imports ${specifier}`,
        ).not.toMatch(/cosmetic-registry|modular-character/);
      }
    }
  });

  it("keeps application modules out of engine and content", () => {
    for (const tree of [join(PIXEL_ROOT, "engine"), join(PIXEL_ROOT, "content")]) {
      for (const file of listSourceFiles(tree)) {
        for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
          expect(
            specifier,
            `${relative(ROOT, file)} imports ${specifier}`,
          ).not.toMatch(/^@\/app\//);
        }
      }
    }
  });
});

describe("the test double cannot leak into production", () => {
  const productionTrees = [
    join(PIXEL_ROOT, "engine"),
    join(PIXEL_ROOT, "renderers"),
    join(PIXEL_ROOT, "react"),
    join(PIXEL_ROOT, "content"),
    join(ROOT, "app", "dev", "pixel-display"),
  ];

  it("is never imported by production source", () => {
    const violations = productionTrees.flatMap((tree) =>
      listSourceFiles(tree)
        .filter((file) => {
          const source = readFileSync(file, "utf8");
          return (
            importSpecifiers(source).some((specifier) =>
              specifier.includes("recording-renderer"),
            ) ||
            // A path reaching into `__tests__` from production is the same
            // mistake by another route.
            importSpecifiers(source).some((specifier) =>
              specifier.includes("__tests__"),
            )
          );
        })
        .map((file) => relative(ROOT, file)),
    );
    expect(violations).toEqual([]);
  });

  it("lives only under the test tree", () => {
    const double = join(
      ROOT,
      "__tests__",
      "pixel-display",
      "support",
      "recording-renderer.ts",
    );
    expect(statSync(double).isFile()).toBe(true);
    // The double is support, not a suite: no `.test.` in its name, so the
    // runner does not collect it as a spec.
    expect(double).not.toMatch(/\.test\./);
  });

  it("is the only renderer implementation outside the production tree", () => {
    // Guards against a second *production* renderer being added quietly, which
    // the roadmap forbids. Test doubles are the only permitted extra.
    const productionRenderers = readdirSync(join(PIXEL_ROOT, "renderers")).filter(
      (name) => name.endsWith(".ts"),
    );
    expect(productionRenderers.sort()).toEqual([
      "canvas-2d.ts",
      "grid-presentation.ts",
    ]);
  });
});

// ─── Proof that the scans can fail ───────────────────────────────────────────

describe("boundary scanners are capable of failing", () => {
  const engineRules = ENGINE_FORBIDDEN_TARGETS;

  it.each([
    ['import { x } from "../renderers/canvas-2d";', "renderer"],
    ['import { y } from "../content/palette";', "content"],
    ['import { z } from "@/app/components/auth/AuthProvider";', "application"],
    ['import { useState } from "react";', "React"],
    ['import type { PixDisplay } from "@/lib/character-traits";', "product"],
    ['import { a } from "../../../lib/game-engine";', "escape"],
  ])("flags %s", (source) => {
    expect(findForbiddenImports(source, engineRules).length).toBeGreaterThan(0);
  });

  it("flags a DOM global", () => {
    expect(
      findForbiddenGlobals("const el = document.createElement('div');", ENGINE_FORBIDDEN_GLOBALS),
    ).toContain("document");
    expect(
      findForbiddenGlobals("const c = canvas.getContext('2d');", ENGINE_FORBIDDEN_GLOBALS),
    ).toContain("getContext");
  });

  it("flags an unguarded frame-loop global but accepts a guarded one", () => {
    expect(
      findUnconditionalGlobals("requestAnimationFrame(cb);", ENGINE_CONDITIONAL_GLOBALS),
    ).toContain("requestAnimationFrame");
    expect(
      findUnconditionalGlobals(
        "if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cb);",
        ENGINE_CONDITIONAL_GLOBALS,
      ),
    ).toEqual([]);
  });

  it("does not flag the same names inside comments or strings", () => {
    const source = `
      // window and document are forbidden here
      /* HTMLElement is likewise forbidden */
      const note = "document window HTMLElement";
    `;
    expect(findForbiddenGlobals(source, ENGINE_FORBIDDEN_GLOBALS)).toEqual([]);
  });

  it("accepts a clean engine-shaped source", () => {
    const source = `
      import type { PixColor } from "./color";
      export function paint(canvasless: number): number {
        return canvasless + 1;
      }
    `;
    expect(findForbiddenImports(source, engineRules)).toEqual([]);
    expect(findForbiddenGlobals(source, ENGINE_FORBIDDEN_GLOBALS)).toEqual([]);
  });
});
