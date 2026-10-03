// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ADVISORY_FINDING_CODES,
  finding,
  findingEnvelope,
  verifyAcknowledgements,
  type PlannerFinding,
} from "@/lib/planner/intake/findings";

const scope = (): PlannerFinding["scope"] => ({ kind: "PLAN" });

describe("finding", () => {
  it("marks an allowlisted code as a WARNING with an acknowledgement code", () => {
    const entry = finding("TASK_VAGUE", scope(), "some tasks do not say precisely what to do");
    expect(ADVISORY_FINDING_CODES).toContain("TASK_VAGUE");
    expect(entry.severity).toBe("WARNING");
    expect(entry.acknowledgementCode).toBe("ACK:TASK_VAGUE");
  });

  it("marks any other code as a BLOCKER", () => {
    const entry = finding("GOAL_MISSING", scope(), "the goal is absent");
    expect(ADVISORY_FINDING_CODES).not.toContain("GOAL_MISSING");
    expect(entry.severity).toBe("BLOCKER");
    expect(entry.acknowledgementCode).toBe("BLOCK:GOAL_MISSING");
  });
});

describe("findingEnvelope", () => {
  it("reports ok true when only warnings exist", () => {
    const envelope = findingEnvelope([
      finding("TASK_VAGUE", scope(), "a"),
      finding("DENSITY_SPIKE", scope(), "b"),
    ]);
    expect(envelope.ok).toBe(true);
    expect(envelope.blockers).toHaveLength(0);
    expect(envelope.warnings).toHaveLength(2);
    expect(envelope.accepted).toEqual([]);
  });

  it("reports ok false only when a blocker exists", () => {
    const envelope = findingEnvelope([
      finding("TASK_VAGUE", scope(), "a"),
      finding("HARD_SESSION_LIMIT_EXCEEDED", scope(), "b"),
    ]);
    expect(envelope.ok).toBe(false);
    expect(envelope.blockers).toHaveLength(1);
    expect(envelope.warnings).toHaveLength(1);
  });
});

describe("verifyAcknowledgements", () => {
  const raised: PlannerFinding[] = [
    finding("TASK_VAGUE", scope(), "a"),
    finding("HARD_SESSION_LIMIT_EXCEEDED", scope(), "b"),
  ];

  it("accepts an acknowledgement for a raised warning", () => {
    const result = verifyAcknowledgements(raised, ["ACK:TASK_VAGUE"]);
    expect(result.accepted).toEqual(["ACK:TASK_VAGUE"]);
    expect(result.unknown).toEqual([]);
    expect(result.blocked).toEqual([]);
  });

  it("rejects an acknowledgement for a code that was not raised", () => {
    const result = verifyAcknowledgements(raised, ["ACK:NOT_RAISED"]);
    expect(result.accepted).toEqual([]);
    expect(result.unknown).toEqual(["ACK:NOT_RAISED"]);
    expect(result.blocked).toEqual([]);
  });

  it("refuses to accept a blocker", () => {
    const result = verifyAcknowledgements(raised, ["BLOCK:HARD_SESSION_LIMIT_EXCEEDED"]);
    expect(result.accepted).toEqual([]);
    expect(result.unknown).toEqual([]);
    expect(result.blocked).toEqual(["BLOCK:HARD_SESSION_LIMIT_EXCEEDED"]);
  });
});
