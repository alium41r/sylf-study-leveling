// Verifies that stateful libraries are installed exactly once in the native workspace (Phase 2 reproduced
// Yjs's duplicate-import hazard), and that the workspace never depends on the web app's install.
import { execFileSync } from "node:child_process";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../..");
const SINGLE_COPY = ["react", "react-dom", "react-native", "yjs", "zod", "expo", "expo-modules-core", "react-native-reanimated", "react-native-worklets", "react-native-gesture-handler", "react-native-svg", "react-native-safe-area-context"];
// Build tools that run in Node and never enter an app bundle may carry private nested copies.
const BUILD_TOOL_SCOPES = ["node_modules/@expo/cli/"];
const failures = [];
const report = {};
for (const name of SINGLE_COPY) {
  let out = "";
  try { out = execFileSync("npm", ["ls", name, "--all", "--parseable"], { cwd: workspace, encoding: "utf8" }); } catch (error) { out = error.stdout ?? ""; }
  const paths = [...new Set(out.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(`node_modules/${name}`)))];
  const relative = paths.map((p) => path.relative(workspace, p));
  const toolingOnly = relative.filter((p) => BUILD_TOOL_SCOPES.some((scope) => p.startsWith(scope)));
  const runtime = relative.filter((p) => !toolingOnly.includes(p));
  report[name] = { runtime, toolingOnly };
  if (runtime.length !== 1) failures.push(`${name}: expected exactly one runtime copy, found ${runtime.length}`);
  if (paths.some((p) => !p.startsWith(workspace + path.sep))) failures.push(`${name}: resolved outside native/`);
}
console.log(JSON.stringify({ copies: report, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
