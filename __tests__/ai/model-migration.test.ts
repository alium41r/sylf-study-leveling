// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { DEEPSEEK_MODELS, HISTORICAL_MODEL_COST_USD_PER_1M } from "@/lib/ai/config";

/**
 * The model migration is a product decision, so it is checked the same way any other
 * invariant is: deterministically, against the working tree, with the historical
 * record explicitly allowed to disagree.
 *
 * The scan itself lives in `scripts/check-model-migration.mjs` because the goal asks
 * for a repository check that can also be run by hand; this suite drives that exact
 * program rather than a second copy of its rules, so the check and the test cannot
 * drift apart.
 */
const RETIRED = "deepseek-v4-pro";

interface MigrationFinding {
  path: string;
  line: number;
  label: string;
  text: string;
}

interface MigrationReport {
  active: MigrationFinding[];
  documentation: MigrationFinding[];
  historical: MigrationFinding[];
  models: Record<string, string>;
}

function runCheck(): { status: number; report: MigrationReport } {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/check-model-migration.mjs", "--json"],
      { encoding: "utf8", cwd: process.cwd() }
    );
    return { status: 0, report: JSON.parse(stdout) as MigrationReport };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return {
      status: failure.status ?? 1,
      report: JSON.parse(failure.stdout ?? "{}") as MigrationReport,
    };
  }
}

describe("DeepSeek model migration", () => {
  it("has no active reference to the retired model anywhere in the tree", () => {
    const { status, report } = runCheck();
    // The report is printed by the check itself; asserting on it here keeps the
    // failure readable when a new literal appears.
    expect(report.active).toEqual([]);
    expect(status).toBe(0);
  });

  it("keeps the retired model only as documentation and history", () => {
    const { report } = runCheck();
    expect(report.documentation.length).toBeGreaterThan(0);
    // Documentation is comment prose, and it lives with the registry it explains: the
    // migration note states plainly that the model is no longer active.
    for (const finding of report.documentation) {
      expect(finding.path).toBe("lib/ai/config.ts");
      expect(finding.text.startsWith("*") || finding.text.startsWith("//")).toBe(true);
    }
    expect(
      report.documentation.some((finding) =>
        finding.text.toLowerCase().includes("no longer an active sylf model")
      )
    ).toBe(true);
    // Legacy pricing is a record of what usage used to cost, not a selection.
    expect(Object.keys(HISTORICAL_MODEL_COST_USD_PER_1M)).toEqual([RETIRED]);
  });

  it("points every DeepSeek workload at the one Flash identifier", () => {
    const flash = DEEPSEEK_MODELS.flash;
    expect(flash).not.toBe(RETIRED);
    expect([
      DEEPSEEK_MODELS.planner,
      DEEPSEEK_MODELS.compiler,
      DEEPSEEK_MODELS.chat,
      DEEPSEEK_MODELS.focus,
      DEEPSEEK_MODELS.default,
    ]).toEqual([flash, flash, flash, flash, flash]);
    // The vision experiment and the reasoner tier are different models, not V4 Pro.
    expect(DEEPSEEK_MODELS.vision).not.toBe(RETIRED);
    expect(DEEPSEEK_MODELS.stem).toBe(flash);
    expect(Object.values(DEEPSEEK_MODELS)).not.toContain(RETIRED);
  });

  it("reads the same registry the check reports", () => {
    const { report } = runCheck();
    expect(report.models).toMatchObject({
      planner: "DEEPSEEK_FLASH",
      compiler: "DEEPSEEK_FLASH",
      chat: "DEEPSEEK_FLASH",
      focus: "DEEPSEEK_FLASH",
      default: "DEEPSEEK_FLASH",
      stem: "DEEPSEEK_FLASH",
      vision: "DEEPSEEK_FLASH",
    });
  });
});

// Historical byte freezes are superseded by the authorized efficiency work.
// Functional preservation and owner/version cache tests live in classic-efficiency.test.ts.
