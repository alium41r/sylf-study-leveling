import { it, expect } from "vitest";
import { compileExecution, assignCompilerIdentities } from "@/lib/planner/v2/server/compilation";
import { allocateLearning } from "@/lib/planner/v2/intelligence/allocator";
import { contentDigest } from "@/lib/planner/v2/server/context";
import { planningFixture } from "./planning-fixtures";
import { revisionFixture, id, digest } from "../contracts/fixtures";

function fixture() {
  const f = planningFixture(), revision = revisionFixture();
  const target = { planRef: "physics", planId: id(1), goalId: 1, context: revision.context, sources: [] as { sourceId: string; contentHash: string }[] };
  const payload = { blueprints: f.snapshot, allocation: { report: allocateLearning(f.snapshot, f.envelope, f.facts), digest: digest() }, envelope: f.envelope };
  return { ...f, target, payload };
}
it("assigns durable owned identities once without materializing optional work", () => {
  const f = fixture(); f.snapshot.plans[0].blueprint.activities.push({ ...f.snapshot.plans[0].blueprint.activities[0], localId: "optional", commitment: { category: "OPTIONAL", reason: "Only if requested" } });
  const identities = assignCompilerIdentities(f.snapshot, [f.target], []);
  expect(identities).toHaveLength(1); expect(assignCompilerIdentities(f.snapshot, [f.target], [], identities)).toEqual(identities);
  const compiled = compileExecution(f.payload, [f.target], [], identities);
  expect(compiled[0].specs[0].content.instructions).toBe(f.snapshot.plans[0].blueprint.activities[0].instructions);
  expect(compiled[0].specs[0].effort).toEqual({ plannedMinutes: 30, remainingMinutesEstimate: 30, remainingEstimateBasisActualSeconds: 0 });
});
it("retains exact live kept specifications and rejects content/placement/identity drift", () => {
  const f = fixture(), identities = assignCompilerIdentities(f.snapshot, [f.target], []);
  const live = compileExecution(f.payload, [f.target], [], identities)[0].specs;
  expect(compileExecution(f.payload, [f.target], live, identities)[0].specs).toEqual(live);
  f.snapshot.plans[0].blueprint.activities[0].instructions = "Changed kept instructions";
  expect(() => compileExecution(f.payload, [f.target], live, identities)).toThrow(/Kept/);
  expect(() => assignCompilerIdentities(f.snapshot, [f.target], live, [{ ...identities[0], activityKey: id(55) }])).toThrow(/identity/);
});
it("binds accepted resource versions before computing shared content digests", () => {
  const f = fixture(); f.snapshot.plans[0].blueprint.activities[0].resourceRefs = ["syllabus"];
  const identities = assignCompilerIdentities(f.snapshot, [f.target], []);
  expect(() => compileExecution(f.payload, [f.target], [], identities)).toThrow(/provenance/);
  f.target.sources.push({ sourceId: "syllabus", contentHash: digest("b") });
  expect(compileExecution(f.payload, [f.target], [], identities)[0].specs[0].content.resources).toEqual([{ ref: "syllabus", versionDigest: digest("b") }]);
});
it("one joint prerequisite has one key and one content seal in the dependent context", () => {
  const f = fixture(), second = structuredClone(f.snapshot.plans[0]); second.planRef = "maths";
  f.snapshot.plans.push(second); f.payload.blueprints.sharedDependencies.push({ prerequisite: { planRef: "physics", activityId: "work_0" }, dependent: { planRef: "maths", activityId: "work_0" }, strength: "HARD", reason: "One shared prerequisite" });
  f.envelope.targets.push({ ...f.envelope.targets[0], planRef: "maths" }); f.facts.preferences.push({ ...f.facts.preferences[0], planRef: "maths" }); f.facts.weeks[0].perGoalCommittedMinutes.push({ planRef: "maths", minutes: 0 });
  f.payload.allocation.report = allocateLearning(f.snapshot, f.envelope, f.facts);
  const targets = [f.target, { ...f.target, planRef: "maths", planId: id(2), goalId: 2 }], identities = assignCompilerIdentities(f.snapshot, targets, []);
  const compiled = compileExecution(f.payload, targets, [], identities), first = compiled[0].specs[0];
  expect(compiled[1].specs[0].content.hardDependencies).toEqual([first.activityKey]);
  expect(compiled[1].context.externalActivityDependencies).toMatchObject([{ activityKey: first.activityKey, planId: id(1), contentDigest: contentDigest(first) }]);
});
it("rejects partial allocations and incomplete or colliding identity registries", () => {
  const f = fixture(), identities = assignCompilerIdentities(f.snapshot, [f.target], []);
  expect(() => compileExecution(f.payload, [f.target], [], [])).toThrow(/exact/);
  f.payload.allocation.report.placements = [];
  expect(() => compileExecution(f.payload, [f.target], [], identities)).toThrow(/allocated/);
});
