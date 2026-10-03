import { describe, expect, it } from "vitest";
import { canonicalJson, hash } from "@/lib/planner/v2/server/database";
import { contentDigest, specDigest } from "@/lib/planner/v2/server/context";
import { executionFixture } from "./contracts/fixtures";

describe("V2 canonical digest golden vectors", () => {
  it("uses UTF-8, omits absent fields, preserves prose and separates domains", () => {
    const value = { scopeRefs: ["z", "a"], schemaVersion: 2, a: { omitted: undefined, n: null, m: "é\nStudy  x" } };
    expect(canonicalJson(value)).toBe('{"a":{"m":"é\\nStudy  x","n":null},"schemaVersion":2,"scopeRefs":["z","a"]}');
    expect(hash("golden", value)).toBe("bbb30558346b964cde2a1eb158d7045a2bcd8348f33f2743d41f508297316357");
    expect(hash("other", value)).not.toBe(hash("golden", value));
    expect(hash("golden", value)).toBe(hash("golden", { ...value, scopeRefs: ["a", "z"] }));
    expect(hash("golden", { ...value, a: { ...value.a, m: "é\nStudy x" } })).not.toBe(hash("golden", value));
  });
  it("keeps activity/phase order and sorts only reference sets", () => {
    expect(hash("blueprint", { activities: ["b", "a"] })).not.toBe(hash("blueprint", { activities: ["a", "b"] }));
    expect(hash("blueprint", { phases: ["b", "a"] })).not.toBe(hash("blueprint", { phases: ["a", "b"] }));
    const first = executionFixture(); first.content.hardDependencies = ["00000002-0000-4000-8000-000000000000", "00000001-0000-4000-8000-000000000000"];
    const reordered = structuredClone(first); reordered.content.hardDependencies.reverse();
    expect(specDigest(first)).toBe(specDigest(reordered)); expect(contentDigest(first)).toBe(contentDigest(reordered));
    reordered.content.purpose = "Expose a different misunderstanding";
    expect(specDigest(first)).not.toBe(specDigest(reordered));
  });
  it("serializes UTC dates and rejects non-JSON numbers", () => {
    expect(canonicalJson({ date: new Date("2026-10-02T00:00:00Z") })).toBe('{"date":"2026-10-02T00:00:00.000Z"}');
    expect(() => canonicalJson({ count: Infinity })).toThrow(/FINITE_JSON/);
  });
});
