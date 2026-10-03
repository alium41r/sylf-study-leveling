// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
    expect(DEEPSEEK_MODELS.stem).toBe("deepseek-reasoner");
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
      stem: "deepseek-reasoner",
      vision: "deepseek-v4-flash-vision-exp",
    });
  });
});

/**
 * The Classic Planner's architectural isolation is a hash invariant, not a promise.
 *
 * `lib/ai/planning-engine.ts` carries its Phase 0–5 hash and must never change: the
 * app-wide model migration is delivered entirely by `DEEPSEEK_MODELS` in
 * `lib/ai/config.ts`, which that file reads. The orchestrator is the one exception, and
 * only for the strings that name the model to the user — the model-selection change plus
 * two progress labels and two comments. Any other edit to it, and any edit at all to the
 * planning engine, fails here.
 *
 * `app/api/ai-planner/route.ts` has exactly ONE further sanctioned exception: the
 * unlimited-AI entitlement, which changes quota entitlement only. Like the orchestrator
 * case below, the check is the REVERT: undoing those lines must reproduce the Phase 5
 * bytes exactly. That is what proves the entitlement change carried no model, prompt,
 * validation, or generated-planner behaviour with it — a bare hash could only have said
 * "something changed".
 */
const PHASE_5_HASHES: Record<string, string> = {
  "lib/ai/planning-engine.ts":
    "cbd73cc7180a1b031e08e1ee1eae29e873b010029126b7d9b69d9c674fc72977",
};

/**
 * The entitlement edit, quoted exactly as it appears in the working tree and as it
 * appeared before. Reverting the first of each pair to the second must restore Phase 5.
 */
const CLASSIC_PLANNER_ENTITLEMENT_DELTA: Array<[current: string, phase5: string]> = [
  [
    `    // A configured owner account is entitled to unlimited generations: the
    // reservation is bypassed (charged === false) and \`unlimited\` carries the
    // permission, so the gate must accept either signal.
    const quota = await reserveQuota(userId, "planner");
    if (!quota.charged && !quota.unlimited) {`,
    `    const quota = await reserveQuota(userId, "planner");
    if (!quota.charged) {`,
  ],
  [
    `              allowed: quota.unlimited || quota.allowed,
              used: quota.used,
              limit: quota.limit,
              remaining: quota.remaining,
              resetsAt: quota.resetsAt,
              unlimited: quota.unlimited,`,
    `              allowed: false,
              used: quota.used,
              limit: quota.limit,
              remaining: quota.remaining,
              resetsAt: quota.resetsAt,`,
  ],
];

const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

describe("Classic Planner isolation", () => {
  it("keeps the Classic Planner files byte-identical", () => {
    for (const [path, expected] of Object.entries(PHASE_5_HASHES))
      expect({ path, hash: sha256(path) }).toEqual({ path, hash: expected });
  });

  it("changes nothing in the Classic Planner route except the quota entitlement", () => {
    let reverted = readFileSync("app/api/ai-planner/route.ts", "utf8");
    for (const [current, phase5] of CLASSIC_PLANNER_ENTITLEMENT_DELTA) {
      // Each sanctioned edit must be present exactly once, so this cannot pass by
      // accidentally matching an unrelated region of the file.
      expect(reverted.split(current)).toHaveLength(2);
      reverted = reverted.replace(current, phase5);
    }
    expect(createHash("sha256").update(reverted).digest("hex")).toBe(
      "b7f49aca8c43e90bf2d8d31419080e620714e7ea85b10117bb4abb7d4d66c07f"
    );
  });

  it("changes nothing in the orchestrator except the strings that name the model", () => {
    // Reverting the model-naming lines must reproduce the Phase 5 bytes exactly:
    // that is what proves no other edit slipped into the file.
    const original = readFileSync("lib/ai/orchestrator.ts", "utf8")
      .replaceAll("[Researcher • DeepSeek V4.1 Flash]", "[Researcher • DeepSeek v4 Pro]")
      .replaceAll("[Master Planner • DeepSeek V4.1 Flash]", "[Master Planner • DeepSeek v4 Pro]")
      .replace(
        "   * Primary: the shared DeepSeek Flash model (DEEPSEEK_MODELS.planner).\n   * Fallback: gemini-3.1-pro / 3.7-flash.",
        "   * Primary: deepseek-v4-pro. Fallback: gemini-3.1-pro / 3.7-flash."
      )
      .replace(
        "    // Attempt 1: DeepSeek Primary Engine (the shared Flash model)",
        "    // Attempt 1: DeepSeek Primary Engine (deepseek-v4-pro)"
      );
    expect(createHash("sha256").update(original).digest("hex")).toBe(
      "2b91d55ebcf18d458fdd4fd01d946c25a444ee16b9586f34be17ef3d6e12dee9"
    );
  });
});
