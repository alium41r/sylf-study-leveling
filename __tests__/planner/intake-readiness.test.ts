// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CORE_REQUIREMENT_CODES,
  emptyBrief,
  type PlanBriefV1,
  type ScopeNode,
} from "@/lib/planner/intake/brief";
import { assertCanGenerate, briefReadiness, REFINEMENT_CODES } from "@/lib/planner/intake/readiness";

const topic = (nodeId: string, label: string, parentId: string | null = null): ScopeNode => ({
  nodeId,
  label,
  kind: "TOPIC",
  parentId,
  selected: true,
});

/** A brief with everything the engine requires: goal, scope, date, capacity. */
function ready(mode: PlanBriefV1["mode"] = "EXAM"): PlanBriefV1 {
  const brief = emptyBrief(mode);
  brief.goal.title = "Pass the chemistry exam";
  brief.target.endDate = "2030-01-25";
  if (mode === "EXAM") brief.target.examDate = "2030-01-25";
  brief.budget.weeklyMinutes = 180;
  brief.scope.nodes = [topic("t1", "Cells"), topic("t2", "Enzymes")];
  return brief;
}

describe("briefReadiness", () => {
  it("exposes the closed code vocabularies", () => {
    expect(CORE_REQUIREMENT_CODES).toEqual([
      "GOAL_MISSING",
      "SCOPE_MISSING",
      "SCOPE_UNCONFIRMED",
      "TARGET_DATE_MISSING",
      "CAPACITY_MISSING",
    ]);
    expect(REFINEMENT_CODES).toContain("PREPAREDNESS");
    expect(REFINEMENT_CODES).toContain("DAILY_AVAILABILITY");
  });

  it("reports GOAL_MISSING alone when only the goal is absent", () => {
    const brief = ready();
    brief.goal.title = "";
    expect(briefReadiness(brief)).toMatchObject({
      state: "NEEDS_CORE_INFO",
      missing: ["GOAL_MISSING"],
      canGenerate: false,
    });
  });

  it("reports SCOPE_MISSING alone when only the scope is absent", () => {
    const brief = ready();
    brief.scope.nodes = [];
    expect(briefReadiness(brief)).toMatchObject({
      state: "NEEDS_CORE_INFO",
      missing: ["SCOPE_MISSING"],
    });
  });

  it("reports TARGET_DATE_MISSING alone when only the target date is absent", () => {
    const brief = ready();
    brief.target.endDate = null;
    brief.target.examDate = null;
    expect(briefReadiness(brief)).toMatchObject({
      state: "NEEDS_CORE_INFO",
      missing: ["TARGET_DATE_MISSING"],
    });
  });

  it("reports CAPACITY_MISSING alone when only capacity is absent", () => {
    const brief = ready();
    brief.budget.weeklyMinutes = null;
    expect(briefReadiness(brief)).toMatchObject({
      state: "NEEDS_CORE_INFO",
      missing: ["CAPACITY_MISSING"],
    });
  });

  it("asks for confirmation when a researched scope awaits review", () => {
    const brief = ready();
    brief.scope.source = "RESEARCH_CONFIRMED";
    brief.scope.confirmedAt = null;
    expect(briefReadiness(brief)).toMatchObject({
      state: "NEEDS_SCOPE_CONFIRMATION",
      missing: ["SCOPE_UNCONFIRMED"],
    });
  });

  it("offers research when the scope is missing but research is available", () => {
    const brief = ready();
    brief.scope.nodes = [];
    expect(briefReadiness(brief, { researchAvailable: true })).toMatchObject({
      state: "RESEARCH_AVAILABLE",
      missing: ["SCOPE_MISSING"],
    });
  });

  it("satisfies capacity from the schedule weekly figure with no stated weekly budget", () => {
    const brief = ready();
    brief.budget.weeklyMinutes = null;
    const result = briefReadiness(brief, { scheduleWeeklyMinutes: 240 });
    expect(result.missing).not.toContain("CAPACITY_MISSING");
    expect(result.canGenerate).toBe(true);
  });

  it("still reaches ADVANCED_REFINEMENT_AVAILABLE with completely unstated preparedness", () => {
    // No preparedness entries at all: silence is not a deficiency, so a brief that
    // can generate is reported as offering optional refinement, never as incomplete.
    const result = briefReadiness(ready());
    expect(result.state).toBe("ADVANCED_REFINEMENT_AVAILABLE");
    expect(result.canGenerate).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.refinements).toContain("PREPAREDNESS");
  });

  it("reports READY_FOR_DRAFT when every optional detail is filled", () => {
    const brief = ready();
    brief.budget.dailyOverrides = [0, 45, 45, 45, 45, 45, 0];
    brief.budget.recoveryPercent = 15;
    brief.backgroundCurriculum = { label: "Chemistry", level: null, board: null };
    brief.preparedness = [
      { nodeId: "t1", covered: null, confidence: null, difficult: null, priority: "HIGH" },
      { nodeId: "t2", covered: null, confidence: null, difficult: null },
    ];
    brief.constraints = [
      { kind: "SESSION_LENGTH_PREFERENCE", strength: "SOFT", value: 45, source: "USER_EXPLICIT" },
    ];
    expect(briefReadiness(brief)).toMatchObject({
      state: "READY_FOR_DRAFT",
      canGenerate: true,
      missing: [],
      refinements: [],
    });
  });

  it("assertCanGenerate mirrors the readiness result", () => {
    expect(assertCanGenerate(ready()).canGenerate).toBe(true);
    const incomplete = ready();
    incomplete.goal.title = "";
    expect(assertCanGenerate(incomplete).canGenerate).toBe(false);
  });
});
