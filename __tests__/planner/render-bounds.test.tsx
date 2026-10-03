import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ExamPlanner from "@/app/components/planner/ExamPlanner";
import { normalizeProposal } from "@/lib/planner/server/core";
import { LIMITS, type ValidatedDraftV1 } from "@/lib/planner/contracts";
import { deriveCoverageMap } from "@/lib/planner/coverage-client";
import { examFixture, examProposal } from "./exam-fixtures";
import type { ExamInput } from "@/lib/planner/exam-policy";

/**
 * Client render cost at the maximum supported scope.
 *
 * §65 of the phase goal asks for this measurement, and the failure it guards against
 * is specific: a planner surface that fetches per item, or that derives the Coverage
 * Map on every keystroke, would look fine on a twelve-item fixture and be unusable on
 * a real plan. The numbers are printed so they can be compared across changes.
 */
const api = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/lib/planner/transport", async (original) => ({
  ...(await original<typeof import("@/lib/planner/transport")>()),
  plannerFetch: api.fetch,
}));

/** The planner's own capabilities shape, as the workspace supplies it. */
const cap = {
  enabled: true,
  today: "2030-01-07",
  timezone: "UTC",
  restDays: [0],
  subjects: [{ id: 1, name: "Biology" }],
};

const planId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const operationKey = "op-11111111-2222-4333-8444-555555555555";

/** A draft at the item limit: the largest plan the product accepts. */
function maxScopeDraft(): { input: ExamInput; draft: ValidatedDraftV1 } {
  const input = examFixture();
  const base = normalizeProposal(input, examProposal());
  const template = base.items;
  const days = ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"];
  const items = Array.from({ length: LIMITS.items }, (_, index) => {
    const source = template[index % template.length];
    return {
      ...source,
      key: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      topicKey: base.topics[index % base.topics.length].key,
      date: days[index % days.length],
      dependsOn: [] as string[],
    };
  });
  return { input, draft: { ...base, items } as ValidatedDraftV1 };
}

function detailFor(input: unknown, output: unknown) {
  return {
    plan: { id: planId, title: "Synthetic plan", version: 5, state: "ACTIVE" },
    latestDraft: null,
    activeRevision: {
      id: revisionId,
      digest: "b".repeat(64),
      source: "GENERATE",
      operationKey,
      inputSnapshot: input,
      outputSnapshot: output,
      availabilitySnapshot: {
        schemaVersion: 1,
        timezone: "UTC",
        restDays: [],
        floatingDates: [],
        existingWork: [],
        lineageFingerprint: "",
      },
      confirmationReceipt: {
        schemaVersion: 1,
        planId,
        revisionId,
        digest: "b".repeat(64),
        version: 5,
        goalId: null,
        items: [],
        committedAt: "2030-01-07T00:00:00.000Z",
      },
    },
    links: [],
    execution: [],
    rebalanceState: { eligible: 6, frozen: 2, overdue: 0 },
    rebalance: null,
  };
}

describe("planner client render at maximum scope", () => {
  afterEach(() => {
    cleanup();
    api.fetch.mockReset();
  });

  it("renders a 60-item confirmed plan without per-item fetching", async () => {
    const { input, draft } = maxScopeDraft();
    expect(draft.items).toHaveLength(LIMITS.items);
    api.fetch.mockImplementation(async (path: string) => {
      if (path === "")
        return [
          {
            id: planId,
            title: "Synthetic plan",
            mode: "EXAM",
            state: "ACTIVE",
            latestDraftRevisionId: null,
            activeRevisionId: revisionId,
          },
        ];
      return detailFor(input, draft);
    });

    const startedAt = performance.now();
    render(<ExamPlanner capabilities={cap} />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    const renderMs = performance.now() - startedAt;
    console.info(`[render-bounds] exam planner at 60 items: ${renderMs.toFixed(0)}ms`);
    console.info(`[render-bounds] planner fetches during render: ${api.fetch.mock.calls.length}`);

    // The panel renders from the detail it was handed; it must not walk the plan with
    // one request per item, which is the N+1 this measures.
    expect(api.fetch.mock.calls.length).toBeLessThanOrEqual(3);
    expect(renderMs).toBeLessThan(5_000);
  });

  it("derives the Coverage Map at 60 items in bounded time", () => {
    const { draft } = maxScopeDraft();
    const units = draft.topics.map((topic) => ({ key: topic.key, title: topic.title }));
    const items = draft.items.map((item) => ({
      key: item.key,
      topicKey: item.topicKey,
      type: item.type,
      stage: item.stage ?? null,
      masteryStage: item.masteryStage ?? null,
      date: item.date,
      role: item.role,
      execution: null,
    }));
    const derive = () =>
      deriveCoverageMap({
        draft,
        links: [],
        execution: [],
        historyItems: [],
      });
    // Measure warm. The first call pays module warm-up and JIT inside jsdom, which
    // made the same work read as 20 ms one run and 100 ms the next; neither number is
    // about the algorithm, and reporting the cold one as the cost would be misleading.
    const coldMs = performance.now();
    derive();
    const cold = performance.now() - coldMs;
    const startedAt = performance.now();
    const map = derive();
    const warmMs = performance.now() - startedAt;
    console.info(
      `[render-bounds] coverage derivation at 60 items: cold ${cold.toFixed(2)}ms, warm ${warmMs.toFixed(2)}ms (jsdom)`
    );
    console.info(`[render-bounds] coverage units derived: ${map.units.length}`);
    // The same work the panel does on expand, and it must stay one pass over the plan:
    // the threshold guards an algorithmic regression, not JIT noise.
    expect(map.units).toHaveLength(units.length);
    expect(warmMs).toBeLessThan(200);
    expect(items).toHaveLength(LIMITS.items);
  });
});
