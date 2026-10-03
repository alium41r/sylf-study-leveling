// @vitest-environment node
import { describe, expect, it } from "vitest";
import { projectPlannerContext } from "@/lib/planner/v2/intelligence/context";
import { relevantDependencyQuests, verifyContextCorrespondence, questDependency, type ExecutionContext, type QuestRow, type SessionRow } from "@/lib/planner/v2/server/context";
import { executionFixture, intentFixture, id, digest } from "../contracts/fixtures";

export function questFixture(n = 1): QuestRow {
  const spec = { ...executionFixture(), activityKey: id(1000 + n) };
  return { id: n, userId: 1133, title: spec.content.title, description: null, goalId: 1, subjectId: null, subjectNodeId: null,
    status: "AVAILABLE", completedAt: null, scheduledFor: spec.placement.date, targetMinutes: 30, requiredMinutes: 30,
    elapsedSeconds: 0, plannedMinutes: 30, remainingMinutesEstimate: 30, remainingEstimateBasisActualSeconds: 0,
    remainingDisposition: "OPEN", executionVersion: 0, plannerSpec: spec, plannerSpecDigest: null };
}
export function contextFixture(): ExecutionContext {
  return { now: new Date("2026-10-03T10:00:00Z"), today: "2026-10-03", timezone: "Asia/Karachi", restDays: [], floatingDates: [],
    quests: [], sessions: [], requiresReestimate: false, legacyExceptions: [], availabilityIntentVersionId: null,
    globalAvailability: { timezone: "Asia/Karachi", dailyCeilingMinutes: [120,120,120,120,120,120,120], restWeekdays: [], blockedDates: [], recoveryPercent: 15, basis: "CONFIRMED_AVAILABILITY" },
    dependencies: { intentDigest: digest(), capacityDigest: digest("c"), evidence: [], quests: [], planBases: [], externalActivityDependencies: [] } };
}
const target = () => ({ planId: id(1), planRef: "physics", intent: intentFixture(), activeActivityKeys: [] });
const window = { start: "2026-10-05", end: "2026-10-06" };

describe("bounded authoritative model context", () => {
  it("projects 1500 completed activities without pinning or repeating all history, retaining the complete raw snapshot", () => {
    const c = contextFixture(); c.quests = Array.from({ length: 1500 }, (_, i) => ({ ...questFixture(i + 1), status: "COMPLETED", remainingDisposition: "COMPLETED", executionVersion: 1, elapsedSeconds: 900, completedAt: c.now }));
    const projected = projectPlannerContext(c, [target()], window);
    expect(projected.view.history).toMatchObject({ relevantCompletedCount: 1500, acceptedSeconds: 1350000, omittedExamples: 1490, demonstratesReadiness: false });
    expect(projected.view.history.byScope[0]).toMatchObject({ completedCount: 1500, acceptedSeconds: 1350000 });
    expect(projected.view.execution).toHaveLength(0); expect(projected.bytes).toBeLessThan(128 * 1024); expect(c.quests).toHaveLength(1500);
  });
  it("keeps running work and completed hard/continuation prerequisites with full protected instructions", () => {
    const c = contextFixture(); const a = questFixture(1); const b = questFixture(2);
    a.status = "IN_PROGRESS"; a.executionVersion = 1;
    a.plannerSpec = { ...executionFixture(), activityKey: id(1001), content: { ...executionFixture().content, hardDependencies: [id(1002)] }, continuesActivityKey: id(1003) };
    const previous = { ...questFixture(3), status: "COMPLETED", remainingDisposition: "COMPLETED" as const, executionVersion: 1 };
    b.status = "COMPLETED"; b.remainingDisposition = "COMPLETED"; b.executionVersion = 1;
    c.quests = [a,b,previous];
    const p = projectPlannerContext(c, [target()], window);
    expect(p.view.execution).toHaveLength(3); expect(p.view.execution[0]).toMatchObject({ instructions: executionFixture().content.instructions, hardDependencies: ["execution_2"], continuesActivityRef: "execution_3", actualSeconds: 0, state: "ENDED_INCOMPLETE" });
    expect(p.view.envelope.protectedExecution).toHaveLength(3);
  });
  it("counts accepted actuals and remaining commitments once on their respective civil dates", () => {
    const c = contextFixture(); const own = questFixture(); own.elapsedSeconds = 900; own.status = "IN_PROGRESS"; own.executionVersion = 1;
    const other = questFixture(2); other.requiredMinutes = 10; other.plannerSpec = null;
    c.quests = [own, other]; c.sessions = [{ id: 1, questId: 1, startedAt: new Date("2026-10-04T23:00:00Z"), endedAt: c.now,
      durationSeconds: 900, executionState: "ENDED", executionContext: { timezone: c.timezone, actualCivilDate: "2026-10-05" } } as SessionRow];
    const p = projectPlannerContext(c, [target()], window);
    expect(p.view.envelope.days[0]).toMatchObject({ otherCommittedMinutes: 25, protectedTargetMinutes: 15, recoveryMinutes: 18, availableMinutes: 62 });
    expect(p.view.actuals[0].acceptedSeconds).toBe(900);
    expect(p.view.weeks[0].otherCommittedMinutes).toBe(25);
  });
  it("accounts for earlier same-week actual time outside the detailed window and preserves sub-minute precision", () => {
    const c = contextFixture(); c.sessions = [{ questId: null, durationSeconds: 61, startedAt: new Date("2026-10-05"), executionContext: { timezone: c.timezone, actualCivilDate: "2026-10-05" } } as SessionRow];
    const p = projectPlannerContext(c, [target()], { start: "2026-10-06", end: "2026-10-06" });
    expect(p.view.envelope.days[0].otherCommittedMinutes).toBe(0); expect(p.view.weeks[0].otherCommittedMinutes).toBe(61 / 60);
  });
  it("retains dated contradictory readiness evidence and resource provenance; saved checks remain self reports", () => {
    const c = contextFixture(); const t = target();
    t.intent.evidence = [true,false].map((ready, i) => ({ evidenceId: `evidence_${i}`, scopeKeys: [id(10)], source: "STUDENT_NOTE", observedAt: "2026-10-01T10:00:00Z", reliability: "SELF_REPORTED", statement: ready ? "Comfortable with circuits" : "Still guessing at the method", demonstratesReadiness: ready, resourceRef: "question_set" }));
    c.checks = [{ id: id(2), planId: id(1), itemKey: "legacy_check", revisionId: id(3), result: "READY_TO_MOVE_ON", createdAt: c.now, updatedAt: c.now }];
    const p = projectPlannerContext(c, [t], window); expect(p.view.plans[0].contradictions[0].evidenceRefs).toEqual(["evidence_0","evidence_1"]);
    expect(p.view.plans[0].learning[1]).toMatchObject({ scopeRefs: ["scope_electricity"], observedAt: "2026-10-01T10:00:00Z", resourceRef: "question_set" });
    expect(p.view.plans[0].savedChecks[0]).toMatchObject({ reliability: "SELF_REPORTED", demonstratesReadiness: false, scopeResolution: "UNRESOLVED" });
    c.checks[0].updatedAt = new Date("2026-10-04"); expect(projectPlannerContext(c, [t], window).digest).not.toBe(p.digest);
    expect(JSON.stringify(p.view)).not.toContain(id(1)); expect(JSON.stringify(p.view)).not.toContain(id(10));
  });
  it("fails explicitly when required instructions exceed the allowance or required dependency count exceeds 400", () => {
    const c = contextFixture(); c.quests = [questFixture()]; expect(() => projectPlannerContext(c, [target()], window, { maxBytes: 1024 })).toThrow(/allowance/);
    c.quests = Array.from({ length: 401 }, (_, i) => questFixture(i + 1)); expect(() => projectPlannerContext(c, [target()], window)).toThrow(/bounded Planner context/);
  });
  it("cannot lose a prerequisite or confuse duplicate durable identities", () => {
    const q = questFixture(); q.plannerSpec = { ...executionFixture(), content: { ...executionFixture().content, hardDependencies: [id(999)] } };
    expect(() => relevantDependencyQuests([q], [], new Set())).toThrow(/prerequisite/);
    expect(() => relevantDependencyQuests([questFixture(), { ...questFixture(), id: 2 }], [], new Set())).toThrow(/ambiguous/);
  });
  it("validates an older sealed historical dependency even after the selective registry changes", () => {
    const c = contextFixture(); const q = questFixture(); const sealed = { ...c.dependencies, quests: [questDependency(q)] };
    expect(() => verifyContextCorrespondence(sealed, c.dependencies, [q])).not.toThrow(); q.executionVersion++;
    expect(() => verifyContextCorrespondence(sealed, c.dependencies, [q])).toThrow(/dependency changed/);
  });
  it("discloses provisional availability and applies saved rest/floating/deadline exclusions", () => {
    const c = contextFixture(); c.globalAvailability = null;
    expect(() => projectPlannerContext(c, [target()], window)).toThrow(/availability/);
    const provisional = { ...contextFixture().globalAvailability!, basis: "DISCLOSED_PROVISIONAL_CEILING" as const };
    c.floatingDates = [window.start]; const p = projectPlannerContext(c, [target()], window, { provisionalAvailability: provisional });
    expect(p.view.envelope.basis).toBe("DISCLOSED_PROVISIONAL_CEILING"); expect(p.view.envelope.days[0].availableMinutes).toBe(0);
    expect(projectPlannerContext({ ...c, globalAvailability: provisional }, [target()], { start: "2026-10-23", end: "2026-10-23" }).view.envelope.days[0].excluded).toBe(true);
  });
});
