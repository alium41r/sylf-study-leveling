// @vitest-environment node
import { describe, expect, it } from "vitest";
import { redactAddresses } from "@/lib/planner/research/redact";

/**
 * The address scrub, and — more importantly — what it must not touch.
 *
 * A filter like this is judged by its false positives. Syllabus copy is full of dotted tokens that
 * are not addresses (`e.g.`, `Ph.D.`, `Unit 3.2`, `Ch.1`), and mangling a student's unit list to
 * close an injection hole would be the worse bug. Half of this file is therefore about the strings
 * that must come back unchanged.
 */

describe("an address is removed", () => {
  it.each([
    ["see https://evil.example/leak.pdf for details", "see for details"],
    ["http://169.254.169.254/latest/meta-data/", ""],
    ["search http://localhost:8080/admin now", "search now"],
    ["visit www.prepblog.example", "visit"],
    ["the file at nust.edu.pk/spec.pdf", "the file at"],
    ["reference evil.example", "reference"],
    ["mirrors: a.example and b.example", "mirrors: and"],
  ])("turns %j into %j", (input, expected) => {
    expect(redactAddresses(input)).toBe(expected);
  });

  it("leaves a sentence readable instead of leaving a hole in it", () => {
    // The student reads these strings. "see  for details" reads as a bug in Sylf; re-attaching
    // the comma is what makes redaction a fix rather than a different defect.
    expect(redactAddresses("The syllabus is at https://nust.edu.pk/spec, which lists Algebra.")).toBe(
      "The syllabus is at, which lists Algebra."
    );
  });

  it("removes an address whatever scheme it uses", () => {
    // `javascript:` and `data:` carry no `//` and are the ones that matter most in a string a
    // student might click, so they are matched by name rather than by shape.
    for (const scheme of ["http", "https", "ftp", "mailto", "javascript", "data", "vbscript"]) {
      const input = scheme === "javascript" || scheme === "data" || scheme === "vbscript" || scheme === "mailto"
        ? `x ${scheme}:payload z`
        : `x ${scheme}://host.example/p z`;
      expect(redactAddresses(input)).toBe("x z");
    }
  });
});

describe("text that merely looks dotted is left alone", () => {
  it.each([
    "e.g. quadratics and sequences",
    "i.e. the second paper",
    "Ph.D. level mathematics",
    "U.S. Grade 12",
    "Unit 3.2 Kinematics",
    "Ch.1 Algebra",
    "Section 2.a",
    "A-Level Mathematics (9709)",
    "Chapter 1. Introduction",
    "measure 1.5 metres",
  ])("keeps %j intact", (input) => {
    expect(redactAddresses(input)).toBe(input);
  });

  it("does not treat a sentence-ending period as a domain label", () => {
    // The commonest false positive available: every sentence ends in a dot, and a naive pattern
    // that allowed one-letter final labels would eat the last word of half the copy.
    const sentence = "I read the pages I found. None of them is the authority's own document.";
    expect(redactAddresses(sentence)).toBe(sentence);
  });

  it("keeps an ordinary word list with no dots at all", () => {
    const text = "Algebra, Sequences and Series, Calculus, Statistics, Mechanics";
    expect(redactAddresses(text)).toBe(text);
  });
});

describe("the tidy step does not damage ordinary prose", () => {
  it("keeps sentence punctuation attached to its word", () => {
    expect(redactAddresses("Still unclear: entry requirements.")).toBe("Still unclear: entry requirements.");
  });

  it("keeps an em dash and a colon", () => {
    expect(redactAddresses("Sources disagree — I have not chosen.")).toBe("Sources disagree — I have not chosen.");
  });

  it("returns an empty string for a string that was only an address", () => {
    // Callers drop these rather than showing an empty bullet, which is why this is a contract.
    expect(redactAddresses("https://evil.example/leak.pdf")).toBe("");
    expect(redactAddresses("evil.example")).toBe("");
  });

  it("is idempotent", () => {
    const once = redactAddresses("see https://evil.example/x, and nust.edu.pk/spec too");
    expect(redactAddresses(once)).toBe(once);
  });
});
