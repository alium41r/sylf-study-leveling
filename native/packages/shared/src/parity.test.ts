import { describe, expect, it } from "vitest";
import { PARITY_EXPECTED, runParitySuite } from "./parity";

describe("shared Sylf code parity", () => {
  it("matches the hashes measured on V8, Chromium and Hermes in Phase 2", () => {
    const results = runParitySuite();
    expect(results.map((r) => r.name).sort()).toEqual(Object.keys(PARITY_EXPECTED).sort());
    for (const r of results) expect({ name: r.name, value: r.value }).toEqual({ name: r.name, value: PARITY_EXPECTED[r.name] });
  });
});
