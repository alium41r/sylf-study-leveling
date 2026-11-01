// Static audit of Sylf Native's client/server and shared-code boundaries. Exit code 1 on any violation.
// 1. The lib/ allow-list (packages/shared/src/index.ts) and its full transitive import graph contain no
//    server-only, web-UI or framework code, and every bare dependency is declared by @sylf/shared.
// 2. No native source file reaches into the Sylf repository except through @sylf/shared.
// 3. Only app entries may import the phone companion package.
// 4. Nothing outside World statically imports it, and nothing statically imports its host, so neither loads before it is needed.
// 5. No screen imports @sylf/backend as code: it stays behind import() in shell/backend.ts, so a build with no backend loads none of it.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SERVER_ONLY_SPECIFIERS, FORBIDDEN_REPO_PATHS } = require("../metro/boundaries.js");
const workspace = path.resolve(import.meta.dirname, "../..");
const sylf = path.resolve(workspace, "..");
const sharedIndex = path.join(workspace, "packages/shared/src/index.ts");
const sharedBackend = path.join(workspace, "packages/shared/src/backend.ts");
const sharedDeps = Object.keys(JSON.parse(fs.readFileSync(path.join(workspace, "packages/shared/package.json"), "utf8")).dependencies ?? {});
// Portable shared code must not depend on UI frameworks or browser-only storage.
const NON_PORTABLE_PACKAGES = [/^react(-dom)?$/, /^react-native/, /^next/, /^dexie$/, /^@blocknote\//, /^framer-motion$/, /^lucide-react$/, /^pdfjs-dist/];
const BROWSER_GLOBALS = /\b(document\.|window\.|localStorage|sessionStorage|indexedDB|navigator\.locks|BroadcastChannel|requestAnimationFrame)\b/;

const violations = [];
const WORLD = "apps/sylf/src/spaces/world/";
const WORLD_HOST = `${WORLD}host/`;
const staticImportsOf = (source) => [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^"'`;(]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map((m) => m[1] || m[2]);
const importsOf = (source) => [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^"'`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map((m) => m[1] || m[2] || m[3]);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function resolveFile(fromFile, spec) {
  const base = spec.startsWith("@/") ? path.join(sylf, spec.slice(2)) : path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return undefined;
}

// 1. Allow-list closure.
const allowList = [sharedIndex, sharedBackend].flatMap((file) => importsOf(fs.readFileSync(file, "utf8")).filter((s) => s.includes("/lib/")));
const visited = new Set();
const queue = allowList.map((s) => resolveFile(sharedIndex, s));
const bareDependencies = new Set();
while (queue.length) {
  const file = queue.pop();
  if (!file || visited.has(file)) continue;
  visited.add(file);
  const rel = path.relative(sylf, file).split(path.sep).join("/");
  if (!rel.startsWith("lib/") || FORBIDDEN_REPO_PATHS.some((re) => re.test(rel))) violations.push(`allow-list reaches forbidden file ${rel}`);
  const source = fs.readFileSync(file, "utf8");
  const code = stripComments(source);
  if (BROWSER_GLOBALS.test(code) && !/\btypeof (window|document|localStorage|indexedDB)\b/.test(code)) violations.push(`${rel} uses browser-only globals without a guard`);
  for (const spec of importsOf(source)) {
    if (spec.startsWith(".") || spec.startsWith("@/")) {
      const target = resolveFile(file, spec);
      if (!target) violations.push(`${rel}: cannot resolve ${spec}`);
      else queue.push(target);
    } else {
      bareDependencies.add(spec);
      if (SERVER_ONLY_SPECIFIERS.some((re) => re.test(spec))) violations.push(`${rel} imports server-only package ${spec}`);
      if (NON_PORTABLE_PACKAGES.some((re) => re.test(spec))) violations.push(`${rel} imports non-portable package ${spec}`);
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!sharedDeps.includes(pkg)) violations.push(`${rel} imports ${pkg}, which @sylf/shared does not declare`);
    }
  }
}

// 2 and 3. Native sources.
const SKIP = /(^|\/)(node_modules|dist|\.expo|android|ios|build)(\/|$)/;
const sources = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(workspace, full).split(path.sep).join("/");
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry.name)) sources.push(full);
  }
})(workspace);
for (const file of sources) {
  const rel = path.relative(workspace, file).split(path.sep).join("/");
  for (const spec of importsOf(fs.readFileSync(file, "utf8"))) {
    if (SERVER_ONLY_SPECIFIERS.some((re) => re.test(spec)) && !rel.startsWith("tooling/")) violations.push(`${rel} imports server-only package ${spec}`);
    if (spec.startsWith(".")) {
      const target = path.resolve(path.dirname(file), spec);
      if (!target.startsWith(workspace + path.sep) && file !== sharedIndex && file !== sharedBackend) violations.push(`${rel} reaches outside native/ (${spec}); use @sylf/shared`);
    }
    if (spec === "@sylf/phone" && !/^apps\/[^/]+\/index\.ts$/.test(rel)) violations.push(`${rel} imports @sylf/phone; only app entries may select the phone frontend`);
  }
  for (const spec of staticImportsOf(fs.readFileSync(file, "utf8").replace(/^\s*(import|export) type\b.*$/gm, ""))) {
    if ((spec === "@sylf/backend" || spec === "@sylf/shared/backend") && !rel.startsWith("packages/backend/")) violations.push(`${rel} statically imports ${spec}; it must stay behind import()`);
    if (!spec.startsWith(".")) continue;
    const target = path.relative(workspace, path.resolve(path.dirname(file), spec)).split(path.sep).join("/");
    if (target.startsWith(WORLD) && !rel.startsWith(WORLD)) violations.push(`${rel} statically imports World (${spec}); it must stay behind import()`);
    if (target.startsWith(WORLD_HOST) && !rel.startsWith(WORLD_HOST) && !/\/contracts$/.test(target)) violations.push(`${rel} statically imports World's host (${spec}); it must stay behind import()`);
  }
}

const report = { allowListModules: allowList.length, closureFiles: visited.size, bareDependencies: [...bareDependencies].sort(), nativeSourceFiles: sources.length, violations };
console.log(JSON.stringify(report, null, 2));
process.exit(violations.length ? 1 : 0);
