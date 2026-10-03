// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const corpus = JSON.parse(readFileSync(resolve("documentation/planner/reports/2026-10-02-phase-0/fixtures/audit-regressions.v2.json"), "utf8")) as {
  schemaVersion: number;
  source: { path: string; sha256: string };
  findings: { id: string; source: { path: string; line: number }; observed: string; expectedInvariant: string; evidenceLevel: string; verificationStage: string }[];
  scenarios: { id: string; auditIds: string[]; normalization: string; data: Record<string, unknown>; expected: Record<string, unknown> }[];
};

describe("Phase 0 audit evidence and regression fixture correspondence", () => {
  it("retains every original finding with a specific future invariant and honest evidence level", () => {
    expect(corpus.schemaVersion).toBe(2);
    expect(corpus.findings.map(finding => finding.id)).toEqual(Array.from({ length: 34 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`));
    for (const finding of corpus.findings) {
      expect(finding.observed.length).toBeGreaterThan(30);
      expect(finding.expectedInvariant.length).toBeGreaterThan(30);
      expect(finding.evidenceLevel).toMatch(/LIVE|SOURCE|REPRO|TEST|RISK/);
      expect(finding.verificationStage).toMatch(/PHASE_0_CONTRACT_AND_FUTURE_INTEGRATION|FUTURE_PRODUCT_ACCEPTANCE/);
    }
  });

  it("pins the original audit and links each observation to its actual register row", () => {
    const audit = readFileSync(resolve(corpus.source.path), "utf8");
    expect(createHash("sha256").update(audit).digest("hex")).toBe(corpus.source.sha256);
    const lines = audit.split("\n");
    for (const finding of corpus.findings) {
      expect(finding.source.path).toBe(corpus.source.path);
      expect(lines[finding.source.line - 1]).toContain(`| ${finding.id} |`);
      expect(lines[finding.source.line - 1]).toContain(finding.observed);
    }
  });

  it("distinguishes normalized examples from new observations and future integration proof", () => {
    const ids = new Set(corpus.findings.map(finding => finding.id));
    expect(new Set(corpus.scenarios.map(scenario => scenario.id)).size).toBe(corpus.scenarios.length);
    expect(corpus.scenarios.length).toBeGreaterThanOrEqual(12);
    for (const scenario of corpus.scenarios) {
      expect(scenario.normalization.length).toBeGreaterThan(30);
      expect(scenario.auditIds.every(id => ids.has(id))).toBe(true);
      expect(Object.keys(scenario.data).length).toBeGreaterThan(0);
      expect(Object.keys(scenario.expected).length).toBeGreaterThan(0);
    }
  });

  it("preserves the availability-shape failure even though weekly totals match", () => {
    const scenario = corpus.scenarios.find(item => item.id === "availability-projection-drift")!;
    const displayed = scenario.data.displayed as number[];
    const generated = scenario.data.generated as number[];
    expect(displayed.reduce((a, b) => a + b, 0)).toBe(generated.reduce((a, b) => a + b, 0));
    expect(displayed).not.toEqual(generated);
    expect(scenario.expected.sameEffectiveAvailability).toBe(false);
  });

  it("preserves observed duration and quality failures without turning capacity into an academic quota", () => {
    const duration = corpus.scenarios.find(item => item.id === "classic-duration-conflict")!;
    const quests = duration.data.quests as { requiredMinutes: number; targetMinutes: number }[];
    expect(quests.reduce((sum, quest) => sum + quest.requiredMinutes, 0)).toBe(120);
    expect(quests.reduce((sum, quest) => sum + Math.max(quest.requiredMinutes, quest.targetMinutes), 0)).toBe(180);
    const quality = corpus.scenarios.find(item => item.id === "known-scope-overwork")!;
    expect(Number(quality.data.activities) * Number(quality.data.minutesEach)).toBe(900);
    expect(quality.normalization).toContain("not a deterministic topic-time quota");
  });
});
