import { describe, expect, it } from "vitest";
import { attemptFixture, digest, id } from "../contracts/fixtures";
import { foundationFixture, producerFixture } from "./foundation-fixtures";
import { FoundationCheckpointSchema, StrategyDocumentSchema, type IssueEvent } from "@/lib/planner/v2/intelligence/foundation/contracts";
import { archiveDigest, artifactRef, assertIssueTransition, candidateDigest, sealFoundationArtifact, sealIntelligenceBundle, strategyDocument, validateArchive, validateTranslation } from "@/lib/planner/v2/intelligence/foundation/validation";
import { allowedRoleTransition, assertContinuation, credibleProgress, invalidatedArtifacts, readFoundationCheckpoint, recoveryAction } from "@/lib/planner/v2/intelligence/foundation/workflow";
import { admitRoleCall, assertResourceContinuation, ResourcePolicySchema, ResourceSnapshotSchema } from "@/lib/planner/v2/intelligence/foundation/resources";
import { CalendarCapacitySchema, usableStudyWindows, validateIntervalWitness } from "@/lib/planner/v2/intelligence/foundation/calendar";
import { CompilerCheckpointSchema } from "@/lib/planner/v2/intelligence/schemas/checkpoint";
import { hash } from "@/lib/planner/v2/server/database";

describe("AI-first immutable education and exact correspondence", () => {
  it("retains full natural Unicode output verbatim beyond old blueprint prose limits", () => {
    const f = foundationFixture(); if (f.strategy.kind !== "STRATEGY") throw new Error();
    const text = f.strategy.value.text.repeat(200);
    const document = strategyDocument({ ...f.strategy.value, text });
    expect(document.text).toBe(text); expect(document.text.length).toBeGreaterThan(4000);
    expect(document.anchors.every(a => text.slice(a.start, a.end).length > 0)).toBe(true);
    expect(StrategyDocumentSchema.safeParse({ ...document, text: "a".repeat(2 * 1024 * 1024 + 1) }).success).toBe(false);
    expect(StrategyDocumentSchema.safeParse({ ...document, text: "   \n\t" }).success).toBe(false);
  });
  it("detects altered text, anchors, ownership envelopes and artifact digests", () => {
    const f = foundationFixture(); expect(validateArchive(f.archive)).toEqual(f.archive);
    if (f.strategy.kind !== "STRATEGY") throw new Error();
    f.strategy.value.text += " Invent compulsory work.";
    expect(() => validateArchive(f.archive)).toThrow("DIGEST");
    const body = { ...f.strategy }; Reflect.deleteProperty(body, "digest");
    f.archive.entries[f.strategy.id] = sealFoundationArtifact(body);
    expect(() => validateArchive(f.archive)).toThrow("ANCHORS");
    expect(archiveDigest(f.archive)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retains previous strategy versions and rejects broken ancestry", () => {
    const f = foundationFixture(); if (f.strategy.kind !== "STRATEGY") throw new Error();
    f.add("STRATEGY", strategyDocument({ ...f.strategy.value, version: 2, parent: artifactRef(f.strategy), text: "Use less practice after success." }));
    expect(Object.keys(validateArchive(f.archive).entries)).toHaveLength(6);
    f.add("STRATEGY", strategyDocument({ ...f.strategy.value, version: 3, parent: artifactRef(f.strategy) }));
    expect(() => validateArchive(f.archive)).toThrow("ANCESTRY");
  });
  it("requires strategy basis for every committed activity, with conditions retained unbooked", () => {
    const f = foundationFixture(); if (f.translation.kind !== "TRANSLATION") throw new Error();
    validateTranslation(f.translation.value, f.canonical.blueprints);
    f.translation.value.elements = f.translation.value.elements.filter(e => e.ref !== "work");
    expect(() => validateTranslation(f.translation.kind === "TRANSLATION" ? f.translation.value : never(), f.canonical.blueprints)).toThrow("WITHOUT_STRATEGY_BASIS");
  });
  it("rejects foreign translation targets and stale spans", () => {
    const f = foundationFixture(); if (f.translation.kind !== "TRANSLATION") throw new Error();
    f.translation.value.elements[0].targets[0].planId = id(999);
    expect(() => validateTranslation(f.translation.kind === "TRANSLATION" ? f.translation.value : never(), f.canonical.blueprints)).toThrow("NOT_OWNED");
  });
  it("seals only the exact fully reviewed bundle with an independent invocation", () => {
    const f = foundationFixture(); const bundle = sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical);
    expect(bundle.candidateDigest).toBe(candidateDigest(f.binding));
    f.canonical.execution[0].content.instructions += " changed";
    expect(() => sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical)).toThrow("CANONICAL_BUNDLE_CHANGED");
  });
  it("rejects author self-approval, gaps, incomplete review and changed calendar", () => {
    for (const change of ["self", "gap", "incomplete", "calendar"]) {
      const f = foundationFixture();
      if (change === "calendar") f.binding.calendarDigest = digest("b");
      else {
        const artifact = change === "gap" ? f.translation : f.review;
        if (artifact.kind === "REVIEW") { if (change === "self") artifact.value.producer = producerFixture(); else artifact.value.completeResultInspected = false; }
        if (artifact.kind === "TRANSLATION") { artifact.value.elements[1].disposition = "GAP"; }
        const body = { ...artifact }; Reflect.deleteProperty(body, "digest"); const sealed = sealFoundationArtifact(body); f.archive.entries[sealed.id] = sealed;
        if (change === "gap") f.binding.translation = artifactRef(sealed); else f.review = sealed;
      }
      expect(() => sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical)).toThrow();
    }
  });
});
function never(): never { throw new Error("wrong artifact"); }
function issueFixture(): IssueEvent { return { schemaVersion: 1, issueId: id(500), previous: null, disposition: "OPEN", severity: "BLOCKING", route: "STRATEGIST", candidateDigest: digest(), affected: [{ id: id(101), digest: digest() }], requirement: "Stop after success", offendingContent: "Repeat after success", consequence: "Unnecessary work", explanation: "Remove the compulsory repetition", grounds: [{ inputDigest: digest(), excerpt: "Stop after success" }, { inputDigest: digest("b"), excerpt: "Repeat after success" }] }; }
describe("issue history and recoverable role routing", () => {
  it("requires verified resolution and records explicit withdrawal without calling it repair", () => {
    const open = issueFixture(); assertIssueTransition(undefined, open);
    const addressed = { ...open, previous: { id: id(501), digest: digest() }, disposition: "ADDRESSED" as const };
    assertIssueTransition(open, addressed);
    assertIssueTransition(addressed, { ...addressed, disposition: "VERIFIED_RESOLVED" });
    assertIssueTransition(open, { ...addressed, disposition: "WITHDRAWN", explanation: "The objection was unsupported by the supplied alternative check" });
    expect(() => assertIssueTransition(open, { ...addressed, disposition: "VERIFIED_RESOLVED" })).toThrow();
    expect(() => assertIssueTransition({ ...addressed, disposition: "WITHDRAWN" }, addressed)).toThrow();
  });
  it("does not omit existing issue heads or accept ungrounded withdrawal", () => {
    const f = foundationFixture(); const value = issueFixture(); value.affected = [artifactRef(f.strategy)]; f.add("ISSUE", value);
    expect(() => sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical)).toThrow("ISSUE_HISTORY_OMITTED");
  });
  const checkpoint = () => { const a = attemptFixture(); return { schemaVersion: 1 as const, compilerVersion: 2 as const, previous: null, requestHash: a.requestHash, rootRequestId: a.budget.rootRequestId, authorizationDigest: a.acceptedRequest.targetAuthorizationDigest, targetsDigest: hash("ai-first-targets-v1", a.targets), stage: "TRANSLATION" as const, artifacts: [], resourceSnapshotDigest: digest(), pendingCall: null, route: null, reason: "Resume the retained strategy" }; };
  it("version-dispatches explicitly and rejects stale roots/targets", () => {
    const c = checkpoint(); expect(readFoundationCheckpoint(c, attemptFixture())).toEqual(c);
    expect(CompilerCheckpointSchema.safeParse(c).success).toBe(false);
    expect(FoundationCheckpointSchema.safeParse({ ...c, compilerVersion: 1 }).success).toBe(false);
    expect(() => readFoundationCheckpoint({ ...c, targetsDigest: digest("b") }, attemptFixture())).toThrow("STALE");
  });
  it("resumes saved replies and never silently redispatches an uncertain call", () => {
    const c = checkpoint(); const call = { callId: id(600), role: "TRANSLATOR" as const, inputDigest: digest(), state: "DISPATCHED" as const, response: null, responseDigest: null };
    expect(recoveryAction({ ...c, pendingCall: call })).toBe("RECONCILE_UNCERTAIN_DISPATCH");
    expect(recoveryAction({ ...c, pendingCall: { ...call, state: "RESPONSE_SAVED", response: "saved", responseDigest: hash("saved-role-response-v1", "saved") } })).toBe("ASSEMBLE_SAVED_RESPONSE");
    expect(FoundationCheckpointSchema.safeParse({ ...c, stage: "READY", pendingCall: call }).success).toBe(false);
    expect(FoundationCheckpointSchema.safeParse({ ...c, pendingCall: { ...call, state: "RESPONSE_SAVED", response: " ", responseDigest: digest() } }).success).toBe(false);
  });
  it("permits substantive role-routed revisions and detects repeated candidates", () => {
    expect(allowedRoleTransition("REFINEMENT", "STRATEGY")).toBe(true);
    expect(allowedRoleTransition("TRANSLATION", "READY")).toBe(false);
    expect(invalidatedArtifacts("STRATEGY")).toContain("REVIEW");
    expect(invalidatedArtifacts("COSMETIC_PRESENTATION")).toEqual([]);
    const state = { candidateDigest: digest(), issueSetDigest: digest() };
    expect(credibleProgress([state], state)).toBe(false);
    expect(credibleProgress([state], { ...state, candidateDigest: digest("b") })).toBe(true);
  });
});
describe("finite quality-first resource admission", () => {
  const policy = () => ResourcePolicySchema.parse({ schemaVersion: 1, policyId: id(700), authorizationDigest: digest(), root: { calls: 64, inputUnits: 4000000, completionTokens: 1000000 }, processingMs: 3600000, roles: Object.fromEntries(["RESEARCH", "STRATEGIST", "TRANSLATOR", "REVIEWER"].map(role => [role, { format: role === "STRATEGIST" ? "TEXT" : "JSON", provider: "deepseek", model: "deepseek-flash", effort: "HIGH", call: { calls: 1, inputUnits: 200000, completionTokens: 32768 }, holdback: { calls: 1, inputUnits: 200000, completionTokens: 32768 } }])) });
  const snapshot = () => ResourceSnapshotSchema.parse({ schemaVersion: 1, rootRequestId: id(701), policyDigest: digest(), lineage: [id(4)], deadlineAt: "2026-10-25T12:00:00Z", consumed: { calls: 12, inputUnits: 500000, completionTokens: 100000 }, reserved: { calls: 0, inputUnits: 0, completionTokens: 0 }, uncertainDispatch: false, accountingDigest: digest() });
  it("supports more than the old call/repair caps while reserving complete downstream checks", () => {
    const p = policy(), s = snapshot(); s.policyDigest = hash("resource-policy-v1", p); admitRoleCall(p, s, "STRATEGIST", { calls: 1, inputUnits: 100000, completionTokens: 32768 }, Date.parse("2026-10-25T11:00:00Z"));
    s.consumed.calls = 62;
    expect(() => admitRoleCall(p, s, "STRATEGIST", { calls: 1, inputUnits: 100000, completionTokens: 32768 }, 0)).toThrow("DOWNSTREAM");
    expect(() => admitRoleCall(p, { ...s, uncertainDispatch: true }, "REVIEWER", { calls: 1, inputUnits: 1000, completionTokens: 1000 }, 0)).toThrow("RESOURCE");
  });
  it("does not renew deadlines, reset usage, drop unknown spend or manufacture continuation allowance", () => {
    const before = snapshot(), next = { ...snapshot(), lineage: [id(4), id(702)] }; assertResourceContinuation(before, next);
    expect(() => assertResourceContinuation(before, { ...next, consumed: { ...next.consumed, calls: 0 } })).toThrow("RESET");
    const input = { previousIntentDigest: digest(), requestedIntentDigest: digest("b"), originalAuthorizationDigest: digest(), authorizationDigest: digest(), changesHardFacts: false, verifiedResearchDigest: digest(), studentDecisionDigest: null, previousResources: before, resources: next };
    assertContinuation(input);
    expect(() => assertContinuation({ ...input, changesHardFacts: true })).toThrow("STUDENT_DECISION");
  });
});
describe("calendar-aware date-based capacity foundation", () => {
  const calendar = () => CalendarCapacitySchema.parse({ schemaVersion: 1, timezone: "UTC", intentDigest: digest(), acceptedWindowsDigest: digest(), capturedAt: "2026-10-25T08:00:00Z", validUntil: "2026-10-25T09:00:00Z", policy: { tentative: "BLOCK", allDay: "BLOCK_DATE", transparent: "IGNORE", unavailable: "NEEDS_DECISION" }, sources: [{ ref: "owned_calendar", versionDigest: digest(), includedInPlanning: true, complete: true, freshUntil: "2026-10-25T09:00:00Z" }], days: [{ date: "2026-10-25", approved: [{ start: "2026-10-25T08:00:00Z", end: "2026-10-25T09:00:00Z" }], busy: [{ start: "2026-10-25T08:10:00Z", end: "2026-10-25T08:20:00Z" }, { start: "2026-10-25T08:30:00Z", end: "2026-10-25T08:40:00Z" }, { start: "2026-10-25T08:50:00Z", end: "2026-10-25T09:00:00Z" }], allDayBlocked: false, excluded: false }] });
  it("does not treat disconnected gaps as an indivisible block", () => {
    const c = calendar(); expect(usableStudyWindows(c, Date.parse(c.capturedAt)).days[0].windows).toHaveLength(3);
    expect(() => validateIntervalWitness(c, [{ key: "task", date: "2026-10-25", minutes: 30 }], [{ key: "task", start: "2026-10-25T08:00:00Z", end: "2026-10-25T08:30:00Z" }], Date.parse(c.capturedAt))).toThrow("DOES_NOT_FIT");
  });
  it("checks joint packing and blocks stale, incomplete or unaccepted availability", () => {
    const c = calendar(); const tasks = ["a", "b"].map(key => ({ key, date: "2026-10-25", minutes: 10 }));
    const witness = ["a", "b"].map(key => ({ key, start: "2026-10-25T08:00:00Z", end: "2026-10-25T08:10:00Z" }));
    expect(() => validateIntervalWitness(c, tasks, witness, Date.parse(c.capturedAt))).toThrow("DOES_NOT_FIT");
    c.sources[0].complete = false; expect(usableStudyWindows(c, Date.parse(c.capturedAt)).status).toBe("NEEDS_DECISION");
    c.sources[0].complete = true; c.acceptedWindowsDigest = null; expect(usableStudyWindows(c, 0).status).toBe("NEEDS_DECISION");
  });
});
