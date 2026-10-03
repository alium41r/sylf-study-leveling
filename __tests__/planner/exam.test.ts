import { describe, expect, it, vi } from "vitest";
import {
  ModelProposalV1Schema,
  UserInputV1Schema,
  validateDraft,
} from "@/lib/planner/contracts";
import {
  examCapacityInput,
  examFeasibility,
  examInput,
  validateExamProposal,
} from "@/lib/planner/exam-policy";
import { normalizeProposal } from "@/lib/planner/server/core";
import { validateCapacity } from "@/lib/planner/capacity";
import { generateExam, abortable } from "@/lib/ai/planner/exam";
import { consumeGeneration } from "@/lib/planner/exam-client";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";

describe("Exam educational and capacity policy", () => {
  it("validates an 18-day multi-topic plan with covered strong, covered weak and unseen topics", () => {
    const input = examFixture(),
      proposal = examProposal();
    expect(examFeasibility(input, examAvailability()).status).toBe(
      "POTENTIAL_FIT"
    );
    validateExamProposal(input, proposal, examAvailability());
    const draft = normalizeProposal(input, proposal);
    expect(new Set(draft.items.map((i) => i.stage)).size).toBe(4);
    expect(draft.items.filter((i) => i.type === "LEARN")).toHaveLength(1);
    expect(draft.topics.map((t) => t.scopeRef)).toEqual(["t1", "t2", "t3"]);
    expect(draft.items.at(-1)?.relatedTopicKeys).toEqual(
      draft.topics.slice(1).map((t) => t.key)
    );
  });
  it("shows tomorrow, overload, all blocked and mock-too-long as explicit infeasibility", () => {
    const input = examFixture();
    input.endDate = input.examDate = "2030-01-08";
    expect(examFeasibility(input, examAvailability()).reasons).toContain(
      "DEADLINE_REQUIRES_EXPLICIT_TRIAGE"
    );
    input.exam.approach = "TRIAGE";
    expect(examFeasibility(input, examAvailability()).status).toBe(
      "INFEASIBLE"
    );
    const state = examAvailability();
    state.restDays = [0, 1, 2, 3, 4, 5, 6];
    expect(examFeasibility(examFixture(), state).reasons).toContain(
      "NO_STUDY_DATES"
    );
    const mock = examFixture();
    mock.exam.mockMinutes = 240;
    expect(examFeasibility(mock, examAvailability()).reasons).toContain(
      "MOCK_DOES_NOT_FIT"
    );
  });
  it("requires explicit reserve reduction and segmented scope when over item bounds", () => {
    const input = examFixture();
    input.availability.recoveryPercent = 5;
    expect(() => examInput(input)).toThrow("RESERVE_ACCEPTANCE_REQUIRED");
    input.exam.acceptReducedReserve = true;
    expect(() => examInput(input)).not.toThrow();
    // Enough uncovered units that the *minimum* item count exceeds what one plan may hold.
    input.exam.topics = Array.from({ length: 80 }, (_, i) => ({
      label: `Topic ${i}`,
      covered: false,
      confidence: 2,
      difficult: false,
    }));
    input.scope = input.exam.topics.map((t) => t.label).join("\n");
    expect(examFeasibility(input, examAvailability()).status).toBe(
      "SEGMENT_REQUIRED"
    );
  });
  it.each(["fixed", "floating", "existing"])(
    "respects %s schedule and deterministic reserve",
    (kind) => {
      const state = examAvailability();
      if (kind === "fixed") state.restDays = [1];
      if (kind === "floating") state.floatingDates = ["2030-01-07"];
      if (kind === "existing")
        state.existingWork = [
          {
            id: 1,
            date: "2030-01-07",
            minutes: 90,
            status: "COMPLETED",
            fingerprint: "x",
          },
        ];
      expect(() =>
        validateExamProposal(examFixture(), examProposal(), state)
      ).toThrow("INFEASIBLE_CAPACITY");
      expect(
        validateCapacity(
          examCapacityInput(examFixture()),
          examAvailability(),
          []
        ).days[0].reserve
      ).toBe(18);
    }
  );
  it.each([
    "unknown topic",
    "unknown intent",
    "fabricated ID",
    "invalid date",
    "too many items",
    "exam day",
    "after exam",
    "dependency",
    "spacing",
    "relearn",
    "missing practice",
  ])("rejects %s", (kind) => {
    const input = examFixture(),
      p = examProposal();
    if (kind === "unknown topic") p.items[0].topicRef = "extra";
    if (kind === "unknown intent")
      (p.items[0] as { type: string }).type = "MASTER";
    if (kind === "fabricated ID") Object.assign(p.items[0], { questId: 123 });
    if (kind === "invalid date") p.items[0].date = "2030-02-30";
    if (kind === "too many items")
      p.items = Array.from({ length: 61 }, () => p.items[0]);
    if (kind === "exam day") p.items[0].date = input.examDate;
    if (kind === "after exam") p.items[0].date = "2030-01-26";
    if (kind === "dependency") p.items[0].dependsOn = ["i4"];
    if (kind === "spacing") p.items[3].date = "2030-01-07";
    if (kind === "relearn") {
      p.items[1].type = "LEARN";
      p.items[1].stage = "COVERAGE";
    }
    if (kind === "missing practice")
      p.items = p.items.filter((i) => i.ref !== "i3");
    expect(() =>
      validateExamProposal(
        input,
        ModelProposalV1Schema.parse(p),
        examAvailability()
      )
    ).toThrow();
  });
  it("permits explicitly selected exam-day study while retaining other semantics", () => {
    const input = examFixture(),
      p = examProposal();
    input.exam.allowExamDayStudy = true;
    p.items.at(-1)!.date = input.examDate;
    expect(() =>
      validateExamProposal(input, p, examAvailability())
    ).not.toThrow();
  });
  it("rejects unsupported provider UUID references and changed scope", () => {
    const p = examProposal();
    p.items[0].ref = crypto.randomUUID();
    expect(() =>
      validateExamProposal(examFixture(), p, examAvailability())
    ).toThrow("INVALID_EXAM_REFERENCE");
    p.items[0].ref = "i1";
    p.topics[0].title = "Added scope";
    expect(() =>
      validateExamProposal(examFixture(), p, examAvailability())
    ).toThrow("CONFIRMED_SCOPE_MISMATCH");
  });
  it("bounds horizon and preserves dates at leap/DST/negative-offset boundaries", () => {
    const input = examFixture();
    input.examDate = input.endDate = "2032-01-01";
    expect(() => UserInputV1Schema.parse(input)).toThrow();
    for (const [start, end] of [
      ["2028-02-28", "2028-03-01"],
      ["2030-03-09", "2030-03-11"],
    ]) {
      const i = examFixture();
      i.startDate = start;
      i.endDate = i.examDate = end;
      const state = examAvailability();
      state.timezone = "America/Los_Angeles";
      expect(
        validateCapacity(examCapacityInput(i), state, []).days.map(
          (d) => d.date
        )
      ).toHaveLength(3);
    }
  });
  it("cannot remove practice or depend on removed work in edited drafts", () => {
    const input = examFixture(),
      draft = normalizeProposal(input, examProposal());
    draft.items[2].removed = true;
    expect(() => validateDraft(input, draft)).toThrow(
      "MISSING_CONSOLIDATION_OR_PRACTICE"
    );
  });
});
describe("bounded Exam strategy", () => {
  it("repairs malformed JSON once and validates the replacement", async () => {
    const generateResponse = vi
      .fn()
      .mockResolvedValueOnce({ text: "{" })
      .mockResolvedValueOnce({ text: JSON.stringify(examProposal()) });
    const adapter = vi.fn((_provider: string, _model: string) => ({
      generateResponse,
    }));
    await generateExam(
      examFixture(),
      examAvailability(),
      new AbortController().signal,
      { adapter }
    );
    expect(generateResponse).toHaveBeenCalledTimes(2);
    expect(generateResponse.mock.calls[0][3]).toMatchObject({
      singleAttempt: true,
      responseFormat: "json_object",
    });
  });
  it("uses at most one repair and one fallback when all outputs fail", async () => {
    const generateResponse = vi.fn().mockResolvedValue({ text: "{}" });
    const adapter = vi.fn((_provider: string, _model: string) => ({
      generateResponse,
    }));
    await expect(
      generateExam(
        examFixture(),
        examAvailability(),
        new AbortController().signal,
        { adapter }
      )
    ).rejects.toThrow("EXAM_GENERATION_FAILED");
    expect(adapter.mock.calls.map((c) => c[0])).toEqual([
      "deepseek",
      "deepseek",
      "gemini",
    ]);
  });
  it("provider failure skips repair and uses the sole fallback", async () => {
    const generateResponse = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider private content"))
      .mockResolvedValueOnce({ text: JSON.stringify(examProposal()) });
    const adapter = vi.fn((_provider: string, _model: string) => ({
      generateResponse,
    }));
    await generateExam(
      examFixture(),
      examAvailability(),
      new AbortController().signal,
      { adapter }
    );
    expect(adapter.mock.calls.map((c) => c[0])).toEqual(["deepseek", "gemini"]);
  });
  it("abort bounds a provider that ignores its signal and prevents retries", async () => {
    const controller = new AbortController();
    const generateResponse = vi.fn(() => new Promise<never>(() => {}));
    const result = generateExam(
      examFixture(),
      examAvailability(),
      controller.signal,
      { adapter: () => ({ generateResponse }) }
    );
    controller.abort();
    await expect(result).rejects.toThrow("GENERATION_ABORTED");
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });
  it("a deadline abort rejects even if a provider returns a late successful result", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 90_000);
    const result = abortable(
      new Promise((resolve) => setTimeout(() => resolve("late"), 100_000)),
      controller.signal
    );
    const assertion = expect(result).rejects.toThrow("GENERATION_ABORTED");
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    vi.useRealTimers();
  });
});
describe("safe streaming and EOF", () => {
  const stream = (parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        parts.forEach((p) => c.enqueue(new TextEncoder().encode(p)));
        c.close();
      },
    });
  it("handles split frames without treating EOF as a ready result", async () => {
    const receive = vi.fn();
    const event = {
      operationId: crypto.randomUUID(),
      planId: crypto.randomUUID(),
      sequence: 1,
      stage: "generating",
      status: "running",
    };
    const text = `data: ${JSON.stringify(event)}\n\n`;
    await consumeGeneration(
      stream([text.slice(0, 15), text.slice(15)]),
      receive
    );
    expect(receive).toHaveBeenCalledWith(event);
    expect(receive).toHaveBeenCalledTimes(1);
  });
  it("rejects content, malformed metadata and unbounded frames", async () => {
    await expect(
      consumeGeneration(
        stream([`data: ${JSON.stringify({ title: "Private" })}\n\n`]),
        vi.fn()
      )
    ).rejects.toThrow();
    await expect(
      consumeGeneration(stream(["x".repeat(2050)]), vi.fn())
    ).rejects.toThrow("INVALID_PROGRESS");
  });
});
