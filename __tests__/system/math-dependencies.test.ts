// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("math renderer/stylesheet compatibility", () => {
  it.each(["rehype-katex", "micromark-extension-math"])("%s uses the same KaTeX installation as the app's stylesheet", dependency => {
    const pluginRequire = createRequire(require.resolve(dependency));
    expect(pluginRequire.resolve("katex")).toBe(require.resolve("katex"));
  });
});
