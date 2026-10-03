import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Permanent coexistence requirement: Planner Modes never replace or rewire the
 * Classic Planner. These are structural checks over the source tree, so a future
 * refactor that silently makes the legacy planner depend on PlannerPlan fails
 * here rather than in production.
 */
const root = process.cwd();
const read = (relative: string) => readFileSync(path.resolve(root, relative), "utf8");

describe("Classic Planner coexistence", () => {
  it("keeps the legacy endpoint free of Planner Modes dependencies and gating", () => {
    const legacy = read("app/api/ai-planner/route.ts");
    expect(legacy).not.toMatch(/lib\/planner/);
    expect(legacy).not.toMatch(/PlannerPlan|PlannerRevision|PlannerQuestLink/);
    expect(legacy).not.toMatch(/PLANNER_MODES_ENABLED/);
    // The legacy endpoint keeps its own orchestration and quota path.
    expect(legacy).toMatch(/AiStudyOrchestrator/);
    expect(legacy).toMatch(/reserveQuota\(userId, "planner"\)/);
  });

  it("keeps the legacy orchestrator and planning engine independent of Planner Modes", () => {
    for (const file of ["lib/ai/orchestrator.ts", "lib/ai/planning-engine.ts"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/lib\/planner|@\/lib\/planner/);
      expect(source, file).not.toMatch(/PlannerPlan|PlannerRevision|PlannerQuestLink/);
    }
  });

  it("never reaches back into the legacy orchestrator from Planner Modes", () => {
    const files = [
      "lib/planner/contracts.ts",
      "lib/planner/capacity.ts",
      "lib/planner/dates.ts",
      "lib/planner/client.ts",
      "lib/planner/constraints.ts",
      "lib/planner/done.ts",
      "lib/planner/priority.ts",
      "lib/planner/semantic.ts",
      "lib/planner/smart-setup.ts",
      "lib/planner/exam-fields.ts",
      "lib/planner/exam-policy.ts",
      "lib/planner/exam-client.ts",
      "lib/planner/telemetry.ts",
      "lib/planner/server/core.ts",
      "lib/planner/server/generation.ts",
      "lib/planner/server/revisions.ts",
      "lib/planner/server/operations.ts",
      "lib/planner/server/materialize.ts",
      "lib/planner/server/http.ts",
      "lib/planner/scope-topic.ts",
      "lib/planner/roadmap-fields.ts",
      "lib/planner/roadmap-policy.ts",
      "lib/planner/roadmap-progress.ts",
      "lib/planner/roadmap-client.ts",
      "lib/planner/expansion-fields.ts",
      "lib/planner/expansion-policy.ts",
      "lib/planner/transport.ts",
      "lib/ai/planner/exam.ts",
      "lib/ai/planner/critic.ts",
      "lib/ai/planner/repair.ts",
      "lib/ai/planner/pipeline.ts",
      "lib/ai/planner/roadmap.ts",
      "lib/ai/planner/expansion.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/ai\/orchestrator|ai\/planning-engine/);
    }
  });

  it("leaves the Classic Planner as the default surface of the Planner tab", () => {
    const panel = read("app/components/AiPlannerPanel.tsx");
    // The legacy panel still posts to the legacy endpoint and reports completion.
    expect(panel).toMatch(/\/api\/ai-planner/);
    const tab = read("app/system/components/PlannerTab.tsx");
    // Classic is what opens, and it is not behind a capability check or another click.
    expect(tab).toMatch(/<AiPlannerPanel/);
    expect(tab).toMatch(/useState<View>\(\{ surface: "CLASSIC" \}\)/);
    expect(tab).not.toMatch(/capabilities\?\.enabled|capabilities\.enabled/);
    // Planner Modes are reached deliberately, from a named button.
    expect(tab).toMatch(/Planner modes/);
    expect(tab).toMatch(/PlannerModesChooser/);
  });

  it("has no feature flag left anywhere in the shipped surface", () => {
    // The flag is gone as a product concept, so a reintroduction shows up here rather
    // than as a quietly disabled planner. Historical phase reports are excluded on
    // purpose: they are immutable documentation of how the gate once worked.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const hits = execSync(
      "grep -rl PLANNER_MODES_ENABLED app lib scripts prisma .env .env.example 2>/dev/null || true",
      { cwd: root, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);
    expect(hits).toEqual([]);
    // In tests the token may appear only in an assertion that it is *absent* — a
    // guard against reintroduction, not a use of the flag.
    const offenders = execSync(
      "grep -rn PLANNER_MODES_ENABLED __tests__ 2>/dev/null || true",
      { cwd: root, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean)
      // This file is the guard itself: its own search strings name the token.
      .filter((line) => !line.startsWith("__tests__/planner/classic-coexistence.test.ts"))
      .filter((line) => !/toBeUndefined|not\.toMatch|not\.toContain/.test(line));
    expect(offenders).toEqual([]);
  });
});
