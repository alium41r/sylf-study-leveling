import { describe, expect, it } from "vitest";
import { readMath } from "./math";

describe("readMath", () => {
  it("reads fractions, roots and powers", () => {
    expect(readMath("\\frac{a}{b}")).toBe("a⁄b");
    expect(readMath("\\frac{x+1}{2}")).toBe("(x+1)⁄2");
    expect(readMath("x^2 + y^{10}")).toBe("x² + y¹⁰");
    expect(readMath("\\sqrt{x+1}")).toBe("√(x+1)");
    expect(readMath("\\sqrt[3]{8}")).toBe("³√8");
  });
  it("reads Greek letters, operators and big operators", () => {
    expect(readMath("\\alpha + \\beta \\leq \\pi")).toBe("α + β ≤ π");
    expect(readMath("\\sum_{i=1}^{n} i")).toBe("∑ᵢ₌₁ⁿ i");
  });
  it("keeps anything it does not know exactly as written, so it never changes a formula's meaning", () => {
    expect(readMath("\\unknowncommand{x}")).toBe("\\unknowncommand{x}");
    expect(readMath("a^{\\mathfrak z}")).toContain("^");
  });
  it("shows a script it cannot turn into a small character in brackets", () => {
    expect(readMath("x^{q}")).toBe("x^q");
    expect(readMath("x^{a+q}")).toBe("x^(a+q)");
  });
  it("does not run on a hostile or broken input", () => {
    expect(() => readMath("\\frac{" + "{".repeat(5000))).not.toThrow();
    expect(readMath("")).toBe("");
  });
});
