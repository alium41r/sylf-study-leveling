import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// There is one session clock, and it is in packages/spaces/src/session/model.ts. A surface that shows the session may read it and may not keep time of its
// own, so none of them calls Date.now(), performance.now() or setInterval(). This is the invariant that has held by convention since Phase 10, as a test.
const root = join(import.meta.dirname, "..");
const SURFACES = ["shell/focus", "shell/session", "shell/TimerDock.tsx", "shell/audio", "spaces/home/destinations/FocusDestination.tsx", "spaces/home/destinations/TodayDestination.tsx", "spaces/workspace/tools/TimerTool.tsx"];

function files(path: string): string[] {
  const full = join(root, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

describe("one session clock", () => {
  const found = SURFACES.flatMap(files).filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file));
  it("covers the surfaces", () => { expect(found.length).toBeGreaterThan(10); });
  it.each(found.map((file) => [file.slice(root.length + 1), file]))("%s keeps no time of its own", (_name, file) => {
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/\bDate\.now\s*\(|\bperformance\.now\s*\(|\bsetInterval\s*\(/);
  });
});
