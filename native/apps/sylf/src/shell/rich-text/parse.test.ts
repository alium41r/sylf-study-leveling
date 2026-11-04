import { describe, expect, it } from "vitest";
import { hasMath, parseInline, parseRichText, safeHref } from "./parse";

describe("parseInline", () => {
  it("reads bold, italic, code and maths", () => {
    expect(parseInline("a **b** *c* `d` $e$")).toEqual([
      { kind: "text", text: "a " }, { kind: "bold", text: "b" }, { kind: "text", text: " " }, { kind: "italic", text: "c" }, { kind: "text", text: " " }, { kind: "code", text: "d" }, { kind: "text", text: " " }, { kind: "math", text: "e" },
    ]);
  });
  it("keeps only http and https link targets, and shows the label for anything else", () => {
    expect(parseInline("[ok](https://example.com/a)")).toEqual([{ kind: "link", text: "ok", href: "https://example.com/a" }]);
    expect(parseInline("[bad](javascript:alert(1))")).toEqual([{ kind: "text", text: "bad" }]);
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("sylf-native://x")).toBeNull();
  });
  it("leaves HTML as text", () => expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)>" }]));
});

describe("parseRichText", () => {
  it("reads headings, lists, quotes and joined paragraphs", () => {
    const blocks = parseRichText("# Title\n\nOne\ntwo\n\n- a\n- b\n\n1. x\n2. y\n\n> note");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list", "list", "quote"]);
    expect(blocks[1]).toEqual({ kind: "paragraph", spans: [{ kind: "text", text: "One two" }] });
    expect(blocks[3]).toMatchObject({ kind: "list", ordered: true });
  });
  it("reads fenced code verbatim, including Markdown inside it", () => {
    expect(parseRichText("```ts\nconst a = **b**;\n```")).toEqual([{ kind: "code", text: "const a = **b**;", language: "ts" }]);
  });
  it("reads a table and display maths", () => {
    const blocks = parseRichText("| a | b |\n| --- | --- |\n| 1 | 2 |\n\n$$\nx^2\n$$");
    expect(blocks[0]).toMatchObject({ kind: "table" });
    expect((blocks[0] as { rows: unknown[] }).rows).toHaveLength(1);
    expect(blocks[1]).toEqual({ kind: "math", text: "x^2" });
    expect(hasMath(blocks)).toBe(true);
    expect(hasMath(parseRichText("plain"))).toBe(false);
  });
});
