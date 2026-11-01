// On Android a scroll view left at its default spends a press on closing the keyboard, so a button needs two taps. Electron cannot show this.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [join(__dirname, ".."), join(__dirname, "../../../../packages/design-system/src/components")];
const sources = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  const path = join(folder, entry.name);
  if (entry.isDirectory()) return entry.name === "showcase" ? [] : sources(path);
  return entry.name.endsWith(".tsx") ? [path] : [];
});

describe("scroll views and the keyboard", () => {
  it("lets a press through on the first tap, everywhere", () => {
    const forgotten = ROOTS.flatMap(sources).flatMap((path) => [...readFileSync(path, "utf8").matchAll(/<(?:Animated\.)?ScrollView\b[^>]*?>/gs)].filter(([tag]) => !tag.includes("keyboardShouldPersistTaps")).map(() => path));
    expect(forgotten).toEqual([]);
  });
});
