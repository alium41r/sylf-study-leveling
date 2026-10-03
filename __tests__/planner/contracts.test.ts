import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { boundedParse, LIMITS, ModelProposalV1Schema, UserInputV1Schema, validateDraft, ValidatedDraftV1Schema, type ValidatedDraftV1 } from "@/lib/planner/contracts";
import { normalizeProposal } from "@/lib/planner/server/core";
import { fixtureInput, fixtureProposal } from "./fixtures";
import { datesBetween, isDateKey, localToday } from "@/lib/planner/dates";
import { OPEN_QUEST_STATUSES, validateCapacity, type AvailabilitySnapshot } from "@/lib/planner/capacity";
const state = (): AvailabilitySnapshot => ({ schemaVersion: 1, timezone: "UTC", restDays: [], floatingDates: [], existingWork: [], lineageFingerprint: "" });
describe("planner pure contracts", () => {
  it.each(["2026-02-29", "2030-02-30", "2030-13-01", "2030-00-01", "2030-04-31", "2030-01-00", "1-01-01", "2030-1-01", "2030-01-01T00:00:00Z"])("rejects invalid date %s", date => expect(isDateKey(date)).toBe(false));
  it("keeps genuine dates through leap years, DST and timezone boundaries", () => {
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(datesBetween("2028-02-28", "2028-03-01")).toEqual(["2028-02-28","2028-02-29","2028-03-01"]);
    expect(localToday("Pacific/Kiritimati", new Date("2030-01-06T12:00:00Z"))).toBe("2030-01-07");
    expect(localToday("America/Los_Angeles", new Date("2030-01-07T02:00:00Z"))).toBe("2030-01-06");
    expect(datesBetween("2030-03-09", "2030-03-11")).toHaveLength(3);
  });
  it("rejects malformed modes, unknown fields, IDs and rewards", () => {
    expect(() => UserInputV1Schema.parse({ ...fixtureInput(), mode: "exam" })).toThrow();
    expect(() => UserInputV1Schema.parse({ ...fixtureInput(), userId: 1 })).toThrow();
    const p = fixtureProposal();
    expect(() => ModelProposalV1Schema.parse({ ...p, xpReward: 999 })).toThrow();
    expect(() => ModelProposalV1Schema.parse({ ...p, items: [{ ...p.items[0], type: "MAGIC" }] })).toThrow();
    expect(() => ModelProposalV1Schema.parse({ ...p, items: [{ ...p.items[0], questId: 99 }] })).toThrow();
  });
  it("supports strict contracts for all three modes without generation", () => {
    const { examDate: _exam, ...input } = fixtureInput() as Extract<ReturnType<typeof fixtureInput>, { mode: "EXAM" }>;
    const { examDate: _exam2, ...proposal } = fixtureProposal() as Extract<ReturnType<typeof fixtureProposal>, { mode: "EXAM" }>;
    for (const mode of ["ROADMAP", "MASTERY"] as const) {
      const detail = mode === "ROADMAP" ? { outcome: "Solve equations" } : { focus: "Algebra" };
      const parsed = UserInputV1Schema.parse({ ...input, mode, ...detail });
      expect(normalizeProposal(parsed, { ...proposal, mode, ...detail }).mode).toBe(mode);
    }
  });
  it("enforces byte, scope, item count and duration limits", () => {
    expect(() => boundedParse(UserInputV1Schema, { ...fixtureInput(), scope: "é".repeat(20000) }, 32768)).toThrow("PAYLOAD_TOO_LARGE");
    expect(() => boundedParse(ModelProposalV1Schema, { blob: "x".repeat(300000) })).toThrow("PAYLOAD_TOO_LARGE");
    const p = fixtureProposal();
    // The *model's* budget, not the storage bound: one answer has to carry the whole payload,
    // so it is bounded by what a single response can hold rather than by what a plan may store.
    expect(() => ModelProposalV1Schema.parse({ ...p, items: Array.from({ length: LIMITS.proposedItems + 1 }, () => p.items[0]) })).toThrow();
    // …and a stored draft may hold far more than a model may propose, on measurement.
    expect(LIMITS.items).toBeGreaterThan(LIMITS.proposedItems);
    for (const minutes of [0,14,241,45.5]) expect(() => ModelProposalV1Schema.parse({ ...p, items: [{ ...p.items[0], minutes }] })).toThrow();
  });
  it("rejects duplicate/unknown refs, cycles, depth and dates outside horizon", () => {
    const input = fixtureInput(); const p = fixtureProposal();
    expect(() => normalizeProposal(input, { ...p, topics: [...p.topics, p.topics[0]] })).toThrow("DUPLICATE_REFERENCE");
    expect(() => normalizeProposal(input, { ...p, items: [{ ...p.items[0], topicRef: "nope" }] })).toThrow();
    expect(() => normalizeProposal(input, { ...p, items: [{ ...p.items[0], dependsOn: ["learn"] }] })).toThrow("DEPENDENCY_CYCLE");
    expect(() => normalizeProposal(input, { ...p, topics: Array.from({ length: 5 }, (_, i) => ({ ref: `t${i}`, title: "T", parentRef: i ? `t${i-1}` : null })), items: [{ ...p.items[0], topicRef: "t4" }] })).toThrow("DEPTH_LIMIT");
    const d = normalizeProposal(input, p);
    expect(() => validateDraft(input, { ...d, items: [d.items[0], d.items[0]] })).toThrow("DUPLICATE_KEY");
    expect(() => validateDraft(input, { ...d, items: [{ ...d.items[0], topicKey: randomUUID() }] })).toThrow("UNKNOWN_REFERENCE");
    expect(() => validateDraft(input, { ...d, items: [{ ...d.items[0], date: "2030-01-12" }] })).toThrow("OUTSIDE_HORIZON");
    expect(() => validateDraft(input, { ...d, mode: "MASTERY", focus: "A" })).toThrow();
    expect(() => UserInputV1Schema.parse({ ...input, endDate: "2032-01-11", examDate: "2032-01-11" })).toThrow();
    expect(ValidatedDraftV1Schema.parse(d)).toEqual(d);
  });
  it("issues fresh IDs and never preserves model database identities", () => {
    const one = normalizeProposal(fixtureInput(), fixtureProposal());
    const two = normalizeProposal(fixtureInput(), fixtureProposal());
    expect(one.items[0].key).not.toBe(two.items[0].key);
    expect(one.items[1].dependsOn).toEqual([one.items[0].key]);
  });
});
describe("deterministic capacity", () => {
  it("shows reserve and refuses overflow instead of rolling work", () => {
    const input = fixtureInput(); const s = state();
    s.existingWork.push({ id: 1, date: "2030-01-07", minutes: 75, status: "ACTIVE", fingerprint: "x" });
    const result = validateCapacity(input, s, fixtureProposal().items);
    expect(result.feasible).toBe(false);
    expect(result.days[0]).toMatchObject({ budget: 120, reserve: 12, existing: 75, proposed: 45, remaining: -12 });
  });
  it.each(["fixed", "floating", "blocked"])("respects %s rest", kind => {
    const input = fixtureInput(); const s = state();
    if (kind === "fixed") s.restDays = [1];
    if (kind === "floating") s.floatingDates = ["2030-01-07"];
    if (kind === "blocked") input.availability.blockedDates = ["2030-01-07"];
    expect(validateCapacity(input, s, fixtureProposal().items).feasible).toBe(false);
  });
  it("counts open legacy states and completed daily work, fails closed", () => {
    expect(OPEN_QUEST_STATUSES).toEqual(["ACTIVE","PENDING","IN_PROGRESS"]);
    for (const status of [...OPEN_QUEST_STATUSES, "COMPLETED"]) {
      const s = state(); s.existingWork = [{ id: 1, date: "2030-01-07", minutes: 100, status, fingerprint: "" }];
      expect(validateCapacity(fixtureInput(), s, fixtureProposal().items).feasible).toBe(false);
    }
    expect(() => validateCapacity(fixtureInput(), { ...state(), timezone: "invalid" }, [])).toThrow();
    expect(() => validateCapacity(fixtureInput(), undefined as unknown as AvailabilitySnapshot, [])).toThrow();
  });
});
