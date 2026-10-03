import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExamPlanner from "@/app/components/planner/ExamPlanner";
import RoadmapPlanner from "@/app/components/planner/RoadmapPlanner";
import MasteryPlanner from "@/app/components/planner/MasteryPlanner";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import { resetIntakeTelemetry } from "@/lib/planner/intake-telemetry";
import { examAvailability, examFixture, examProposal } from "./exam-fixtures";
import { normalizeProposal } from "@/lib/planner/server/core";

const cap = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Biology" }],
};

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  requestExam: vi.fn(),
  requestRoadmap: vi.fn(),
  requestExpansion: vi.fn(),
  requestMastery: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/planner/exam-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/exam-client")>()),
  plannerFetch: api.fetch,
  requestExam: api.requestExam,
}));
vi.mock("@/lib/planner/transport", async (original) => ({
  ...(await original<typeof import("@/lib/planner/transport")>()),
  plannerFetch: api.fetch,
}));
vi.mock("@/lib/planner/roadmap-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/roadmap-client")>()),
  requestRoadmap: api.requestRoadmap,
  requestExpansion: api.requestExpansion,
  cancelExpansion: vi.fn(),
}));
vi.mock("@/lib/planner/mastery-client", async (original) => ({
  ...(await original<typeof import("@/lib/planner/mastery-client")>()),
  requestMastery: api.requestMastery,
}));
vi.mock("@/lib/planner/client", () => ({
  commitPlanner: api.commit,
  recoverPlannerCommit: vi.fn().mockResolvedValue(null),
}));

const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

let logged: ReturnType<typeof vi.spyOn>;

function payloads(): Record<string, unknown>[] {
  const calls = logged.mock.calls as unknown as [string, ...unknown[]][];
  return calls
    .filter(([tag]) => tag === "[planner]")
    .map(([, payload]) => payload as Record<string, unknown>);
}
function events(name: string): Record<string, unknown>[] {
  return payloads().filter((p) => p.event === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  resetIntakeTelemetry();
  logged = vi.spyOn(console, "info").mockImplementation(() => {});
  api.fetch.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  logged.mockRestore();
});

const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const draft = normalizeProposal(examFixture(), examProposal());
const detail = {
  plan: { id: planId, title: "Synthetic science exam", version: 1, state: "DRAFT" },
  latestDraft: {
    id: revisionId,
    digest: "a".repeat(64),
    inputSnapshot: examFixture(),
    outputSnapshot: draft,
    availabilitySnapshot: examAvailability(),
    confirmationReceipt: null,
  },
  activeRevision: null,
  links: [],
};
function serveExam() {
  api.fetch.mockImplementation(async (path: string) => {
    if (path === "") return [];
    if (path.startsWith("/recover/")) return { planId, operation: { state: "SEALED" } };
    return detail;
  });
}

async function reachExamGeneration() {
  render(<ExamPlanner capabilities={cap} />);
  click("Prepare for an Exam");
  fireEvent.change(screen.getByLabelText("Subject or course name"), {
    target: { value: "Unique Biology Syllabus" },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
    target: { value: "Cells\nEnzymes\nTransport" },
  });
  click("Continue");
  fireEvent.change(screen.getByLabelText("Exam date"), {
    target: { value: "2030-01-25" },
  });
  click("Continue");
  fireEvent.click(
    screen.getByLabelText("These minutes reflect my actual availability.")
  );
  click("Continue");
  click("Continue");
}

describe("intake telemetry (UX Phase 1a)", () => {
  it("emits intake_started once, with mode and the LEGACY_WIZARD entry path", () => {
    render(<ExamPlanner capabilities={cap} />);
    expect(events("intake_started")).toHaveLength(0);
    click("Prepare for an Exam");
    // Advancing and editing keeps rendering; none of it re-emits.
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    expect(events("intake_started")).toEqual([
      expect.objectContaining({
        event: "intake_started",
        mode: "EXAM",
        entryPath: "LEGACY_WIZARD",
      }),
    ]);
  });

  it("emits intake_started for the roadmap wizard", () => {
    render(<RoadmapPlanner capabilities={cap} />);
    click("Plan a course");
    expect(events("intake_started")).toEqual([
      expect.objectContaining({
        event: "intake_started",
        mode: "ROADMAP",
        entryPath: "LEGACY_WIZARD",
      }),
    ]);
  });

  it("emits intake_started for the mastery wizard", () => {
    render(<MasteryPlanner capabilities={cap} />);
    click("Start a mastery plan");
    expect(events("intake_started")).toEqual([
      expect.objectContaining({
        event: "intake_started",
        mode: "MASTERY",
        entryPath: "LEGACY_WIZARD",
      }),
    ]);
  });

  it("emits intake_first_input exactly once, on the first edit only", () => {
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    // Rendering the first step never counts as input.
    expect(events("intake_first_input")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    expect(events("intake_first_input")).toHaveLength(1);
    expect(events("intake_first_input")[0]).toMatchObject({
      event: "intake_first_input",
      mode: "EXAM",
    });
    // Later edits (including a second field) must not emit again.
    fireEvent.change(screen.getByLabelText("Exam title (optional)"), {
      target: { value: "Biology final" },
    });
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology 2" },
    });
    expect(events("intake_first_input")).toHaveLength(1);
  });

  it("emits intake_readiness_changed when the wizard's own gate changes", () => {
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    // Step 1 starts not-ready: one required field (subject) is missing.
    expect(events("intake_readiness_changed").at(-1)).toMatchObject({
      mode: "EXAM",
      missingRequired: 1,
    });
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    expect(events("intake_readiness_changed").at(-1)).toMatchObject({
      mode: "EXAM",
      missingRequired: 0,
    });
  });

  it("emits intake_first_draft_requested once with a non-negative latencyMs", async () => {
    api.requestExam.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serveExam();
    await reachExamGeneration();
    click("Generate draft");
    await waitFor(() => expect(api.requestExam).toHaveBeenCalledTimes(1));
    const requested = events("intake_first_draft_requested");
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({ event: "intake_first_draft_requested", mode: "EXAM" });
    expect(Number.isFinite(requested[0].latencyMs)).toBe(true);
    expect(requested[0].latencyMs as number).toBeGreaterThanOrEqual(0);
  });

  it("emits intake_abandoned with LEFT on unmount before generating", () => {
    const { unmount } = render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    expect(events("intake_abandoned")).toHaveLength(0);
    unmount();
    expect(events("intake_abandoned")).toEqual([
      expect.objectContaining({ event: "intake_abandoned", mode: "EXAM", abandonReason: "LEFT" }),
    ]);
  });

  it("does not emit intake_abandoned after a successful generation request", async () => {
    api.requestExam.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serveExam();
    const { unmount } = render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
      target: { value: "Cells\nEnzymes" },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2030-01-25" },
    });
    click("Continue");
    fireEvent.click(
      screen.getByLabelText("These minutes reflect my actual availability.")
    );
    click("Continue");
    click("Continue");
    click("Generate draft");
    await waitFor(() => expect(api.requestExam).toHaveBeenCalledTimes(1));
    await screen.findByText("Staged timeline");
    expect(events("intake_first_draft_requested")).toHaveLength(1);
    unmount();
    expect(events("intake_abandoned")).toHaveLength(0);
  });

  it("emits intake_abandoned with CANCELLED on explicit generation cancel", async () => {
    let reject!: (reason: Error) => void;
    api.requestExam.mockImplementation(
      (_input, _key, signal, event) => {
        event({ stage: "generating" });
        return new Promise((_resolve, r) => {
          reject = r;
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
    );
    serveExam();
    await reachExamGeneration();
    click("Generate draft");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Generating/)
    );
    click("Cancel generation");
    await waitFor(() =>
      expect(events("intake_abandoned").some((p) => p.abandonReason === "CANCELLED")).toBe(true)
    );
    expect(events("intake_abandoned").at(-1)).toMatchObject({ mode: "EXAM", abandonReason: "CANCELLED" });
  });

  it("keeps every emitted payload free of plan content", async () => {
    const subject = "ZZ-QUANTUM-CRYPTOGRAPHY-UNIQUE";
    const title = "TT-EXAM-TITLE-UNIQUE-4A1B";
    const topicA = "AA-WOMBAT-TOPIC-UNIQUE";
    const topicB = "BB-PLASMA-TOPIC-UNIQUE";
    api.requestExam.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serveExam();
    render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: subject },
    });
    fireEvent.change(screen.getByLabelText("Exam title (optional)"), {
      target: { value: title },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Included topics — one per line"), {
      target: { value: `${topicA}\n${topicB}` },
    });
    click("Continue");
    fireEvent.change(screen.getByLabelText("Exam date"), {
      target: { value: "2030-01-25" },
    });
    click("Continue");
    fireEvent.click(
      screen.getByLabelText("These minutes reflect my actual availability.")
    );
    click("Continue");
    click("Continue");
    click("Generate draft");
    await waitFor(() => expect(api.requestExam).toHaveBeenCalledTimes(1));
    for (const payload of payloads()) {
      const json = JSON.stringify(payload);
      for (const secret of [subject, title, topicA, topicB])
        expect(json).not.toContain(secret);
    }
  });

  it("emits counts as non-negative integers", async () => {
    api.requestExam.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serveExam();
    await reachExamGeneration();
    click("Generate draft");
    await waitFor(() => expect(api.requestExam).toHaveBeenCalledTimes(1));
    const requested = events("intake_first_draft_requested")[0];
    for (const key of [
      "fieldsTouched",
      "topicsManual",
      "topicsResearched",
      "topicsImported",
      "preparednessEdited",
      "copilotTurns",
      "warningsAccepted",
      "latencyMs",
    ]) {
      const value = requested[key];
      expect(Number.isInteger(value)).toBe(true);
      expect(value as number).toBeGreaterThanOrEqual(0);
    }
    expect(requested.topicsManual).toBe(3);
    expect(requested.topicsResearched).toBe(0);
    expect(requested.topicsImported).toBe(0);
    expect(requested.copilotTurns).toBe(0);
    expect(requested.warningsAccepted).toBe(0);
  });

  it("rejects out-of-vocabulary entryPath and abandonReason at the guard", () => {
    plannerTelemetry("intake_started", {
      mode: "EXAM",
      entryPath: "BOGUS" as never,
    });
    plannerTelemetry("intake_abandoned", {
      mode: "EXAM",
      abandonReason: "NOPE" as never,
    });
    expect(events("intake_started").at(-1)).not.toHaveProperty("entryPath");
    expect(events("intake_abandoned").at(-1)).not.toHaveProperty("abandonReason");
  });

  it("does not duplicate events under React strict mode", () => {
    render(
      <StrictMode>
        <ExamPlanner capabilities={cap} />
      </StrictMode>
    );
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology 2" },
    });
    expect(events("intake_started")).toHaveLength(1);
    expect(events("intake_first_input")).toHaveLength(1);
  });

  it("does not re-emit intake events across a remount without a new intake", () => {
    const first = render(<ExamPlanner capabilities={cap} />);
    click("Prepare for an Exam");
    fireEvent.change(screen.getByLabelText("Subject or course name"), {
      target: { value: "Biology" },
    });
    first.unmount(); // abandons LEFT once
    render(<ExamPlanner capabilities={cap} />);
    expect(events("intake_started")).toHaveLength(1);
    expect(events("intake_first_input")).toHaveLength(1);
    expect(events("intake_abandoned")).toHaveLength(1);
  });

  it("builds the same generation request body after instrumentation", async () => {
    api.requestExam.mockResolvedValue({ planId, operation: { state: "SEALED" } });
    serveExam();
    await reachExamGeneration();
    click("Generate draft");
    await waitFor(() => expect(api.requestExam).toHaveBeenCalledTimes(1));
    const [sent] = api.requestExam.mock.calls[0] as [Record<string, unknown>];
    expect(sent).toMatchObject({
      mode: "EXAM",
      title: "Unique Biology Syllabus",
      examDate: "2030-01-25",
      exam: {
        subjectName: "Unique Biology Syllabus",
        approach: "STANDARD",
        topics: [
          expect.objectContaining({ label: "Cells" }),
          expect.objectContaining({ label: "Enzymes" }),
          expect.objectContaining({ label: "Transport" }),
        ],
      },
    });
    expect((sent.exam as { topics: unknown[] }).topics).toHaveLength(3);
  });
});
