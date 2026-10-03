import { describe, expect, it, vi } from "vitest";
import {
  EXAM_PROVIDER_CALL_BUDGET,
  EXAM_SEMANTIC_CALL_BUDGET,
  generateExam,
  withCompletionCriteria,
  type AdapterFactory,
} from "@/lib/ai/planner/exam";
import { completionCriteriaIssue } from "@/lib/planner/done";
import type { LLMAdapter, LLMResponse } from "@/lib/ai/providers/types";
import type { ModelProposalV1 } from "@/lib/planner/contracts";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import { examInput, type ExamInput } from "@/lib/planner/exam-policy";
import { softConstraintViolations } from "@/lib/planner/constraints";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";

/** Deterministic provider double: one response per call, in order. */
function queueAdapter(queue: Array<LLMResponse | Error>) {
  const generateResponse = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected provider call");
    if (next instanceof Error) throw next;
    return next;
  });
  return { generateResponse } as unknown as LLMAdapter & {
    generateResponse: ReturnType<typeof vi.fn>;
  };
}
const json = (value: unknown): LLMResponse => ({ text: JSON.stringify(value) });
/** A confirmed input carrying one HARD session limit. */
function hardLimited(base: ExamInput, value: number): ExamInput {
  const parsed = UserInputV1Schema.parse({
    ...base,
    constraints: [
      {
        kind: "MAX_SESSION_MINUTES",
        strength: "HARD",
        value,
        source: "USER_EXPLICIT",
      },
    ],
  });
  examInput(parsed);
  return parsed;
}
const criticReport = (
  issues: {
    issueCode: string;
    affectedItemRefs: string[];
    severity: string;
    patchInstruction: string;
  }[]
): LLMResponse => json({ schemaVersion: 1, issues });
const repairItem = (
  proposal: ModelProposalV1,
  ref: string,
  patch: Partial<ModelProposalV1["items"][number]>
) => {
  const original = proposal.items.find((item) => item.ref === ref)!;
  return {
    ref: original.ref,
    topicRef: original.topicRef,
    type: original.type,
    stage: original.stage,
    title: original.title,
    description: original.description,
    rationale: original.rationale,
    completionCriteria: "Complete this bounded task, then review the outcome.",
    date: original.date,
    minutes: original.minutes,
    relatedTopicRefs: original.relatedTopicRefs ?? [],
    dependsOn: original.dependsOn,
    ...patch,
  };
};
const repairPatch = (
  proposal: ModelProposalV1,
  refs: string[],
  patches: Record<string, Partial<ModelProposalV1["items"][number]>> = {}
): LLMResponse =>
  json({
    schemaVersion: 1,
    items: refs.map((ref) => repairItem(proposal, ref, patches[ref] ?? {})),
  });

/** Runs the strategy with scripted generator, critic and repair providers. */
async function run(options: {
  generator: Array<LLMResponse | Error>;
  critic?: LLMResponse | Error;
  repair?: LLMResponse | Error;
  input?: ExamInput;
  semantic?: boolean;
  deadlineAt?: number;
  signal?: AbortSignal;
}) {
  const generatorCalls: string[] = [];
  const criticQueue = options.critic ? [options.critic] : [];
  const repairQueue = options.repair ? [options.repair] : [];
  const generator = queueAdapter(options.generator);
  const critic = queueAdapter(criticQueue);
  const repair = queueAdapter(repairQueue);
  const generatorAdapter: AdapterFactory = (provider) => {
    generatorCalls.push(provider);
    return generator;
  };
  const criticAdapter: AdapterFactory = () => critic;
  const repairAdapter: AdapterFactory = () => repair;
  const result = await generateExam(
    options.input ?? examFixture(),
    examAvailability(),
    options.signal ?? new AbortController().signal,
    {
      adapter: generatorAdapter,
      ...(options.semantic === false
        ? {}
        : {
            semantic: {
              criticAdapter,
              repairAdapter,
              ...(options.deadlineAt ? { deadlineAt: options.deadlineAt } : {}),
            },
          }),
    }
  );
  return {
    result,
    generatorCalls,
    generator,
    critic,
    repair,
    payload: (adapter: { generateResponse: ReturnType<typeof vi.fn> }) =>
      JSON.parse(adapter.generateResponse.mock.calls[0][0][0].content as string),
  };
}

describe("Semantic plan critic and targeted repair", () => {
  it("returns the original validated plan when the critic reports no issues", async () => {
    const { result, generator, critic, repair } = await run({
      generator: [json(examProposal())],
      critic: criticReport([]),
    });
    expect(result.proposal).toEqual(withCompletionCriteria(examProposal()));
    expect(result.review).toEqual({
      schemaVersion: 1,
      critic: "PASSED",
      issues: 0,
      repaired: 0,
      deterministicIssues: 0,
      softViolations: 0,
    });
    expect(result.calls).toBe(2);
    expect(generator.generateResponse).toHaveBeenCalledTimes(1);
    expect(critic.generateResponse).toHaveBeenCalledTimes(1);
    expect(repair.generateResponse).not.toHaveBeenCalled();
  });

  it("patches only the flagged item for TASK_VAGUE and leaves the rest of the plan untouched", async () => {
    const proposal = examProposal();
    const { result, repair, payload } = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "TASK_VAGUE",
          affectedItemRefs: ["i2"],
          severity: "MEDIUM",
          patchInstruction: "Say exactly which exercise set to complete.",
        },
      ]),
      repair: repairPatch(proposal, ["i2"], {
        i2: {
          description: "Complete exercises 1-6 on enzyme kinetics.",
          title: "Enzyme kinetics practice set",
        },
      }),
    });
    const patched = result.proposal.items.find((item) => item.ref === "i2")!;
    expect(patched.description).toBe("Complete exercises 1-6 on enzyme kinetics.");
    expect(patched.title).toBe("Enzyme kinetics practice set");
    for (const original of proposal.items)
      if (original.ref !== "i2")
        expect(result.proposal.items.find((item) => item.ref === original.ref)).toEqual(
          { ...original, completionCriteria: expect.any(String) }
        );
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
    expect(result.review.repaired).toBe(1);
    expect(result.calls).toBe(3);
    // The repair is asked for exactly the flagged item, never the whole plan.
    const request = payload(repair);
    expect(request.requestedRefs).toEqual(["i2"]);
    expect(request.itemsToRepair).toHaveLength(1);
    expect(request.reportedIssues).toHaveLength(1);
    expect(repair.generateResponse).toHaveBeenCalledTimes(1);
  });

  it("repairs a SEQ_WEAK finding by moving the flagged retrieval earlier", async () => {
    const proposal = examProposal();
    const { result } = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "SEQ_WEAK",
          affectedItemRefs: ["i4", "i7"],
          severity: "MEDIUM",
          patchInstruction: "Move the early recall so retrieval is not clustered late.",
        },
      ]),
      repair: repairPatch(proposal, ["i4", "i7"], {
        i4: { date: "2030-01-08" },
      }),
    });
    expect(result.proposal.items.find((item) => item.ref === "i4")!.date).toBe(
      "2030-01-08"
    );
    expect(result.proposal.items.find((item) => item.ref === "i7")).toEqual({
      ...proposal.items.find((item) => item.ref === "i7")!,
      completionCriteria: expect.any(String),
    });
    expect(result.review).toMatchObject({ critic: "ISSUES_REPAIRED", repaired: 2 });
  });

  it("repairs a PRIORITY_MISS finding by increasing the flagged practice allocation", async () => {
    const proposal = examProposal();
    const { result } = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "PRIORITY_MISS",
          affectedItemRefs: ["i7"],
          severity: "HIGH",
          patchInstruction:
            "This topic is higher priority; give its practice more of the day.",
        },
      ]),
      repair: repairPatch(proposal, ["i7"], { i7: { minutes: 45 } }),
    });
    expect(result.proposal.items.find((item) => item.ref === "i7")!.minutes).toBe(45);
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
  });

  it("fails safely on malformed, untrustworthy or unavailable critic output", async () => {
    const cases: { label: string; critic: LLMResponse | Error }[] = [
      { label: "invalid JSON", critic: { text: "{ not json" } },
      { label: "wrong shape", critic: json({ schemaVersion: 1, verdict: "fine" }) },
      {
        label: "unknown item reference",
        critic: criticReport([
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: ["i99"],
            severity: "LOW",
            patchInstruction: "Rewrite this item clearly.",
          },
        ]),
      },
      {
        label: "truncated output",
        critic: { text: JSON.stringify({ schemaVersion: 1, issues: [] }), finishReason: "MAX_TOKENS" as const },
      },
      { label: "provider failure", critic: new Error("provider detail") },
    ];
    for (const entry of cases) {
      const { result, repair } = await run({
        generator: [json(examProposal())],
        critic: entry.critic,
      });
      expect(result.proposal, entry.label).toEqual(
        withCompletionCriteria(examProposal())
      );
      expect(result.review.critic, entry.label).toBe("UNAVAILABLE");
      expect(result.review.repaired, entry.label).toBe(0);
      expect(repair.generateResponse, entry.label).not.toHaveBeenCalled();
    }
  });

  it("rejects a repair whose segment no longer satisfies the structural gates", async () => {
    const proposal = examProposal();
    const { result } = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "DENSITY_SPIKE",
          affectedItemRefs: ["i7"],
          severity: "MEDIUM",
          patchInstruction: "This day carries too much work.",
        },
      ]),
      // 240 minutes on a day with 102 usable minutes: structurally impossible.
      repair: repairPatch(proposal, ["i7"], { i7: { minutes: 240 } }),
    });
    expect(result.proposal).toEqual(withCompletionCriteria(proposal));
    expect(result.review).toMatchObject({
      critic: "UNREPAIRED",
      repaired: 0,
    });
  });

  it("rejects a repair that tries to widen its scope or change a topic binding", async () => {
    const proposal = examProposal();
    const outOfScope = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "ROBOTIC_PATTERN",
          affectedItemRefs: ["i2"],
          severity: "LOW",
          patchInstruction: "Reword this item so it is not a repeated template.",
        },
      ]),
      repair: repairPatch(proposal, ["i2", "i7"]),
    });
    expect(outOfScope.result.proposal).toEqual(withCompletionCriteria(proposal));
    expect(outOfScope.result.review.critic).toBe("UNREPAIRED");

    const rebound = await run({
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "ROBOTIC_PATTERN",
          affectedItemRefs: ["i2"],
          severity: "LOW",
          patchInstruction: "Reword this item so it is not a repeated template.",
        },
      ]),
      repair: repairPatch(proposal, ["i2"], { i2: { topicRef: "t3" } }),
    });
    expect(rebound.result.proposal).toEqual(withCompletionCriteria(proposal));
    expect(rebound.result.review.critic).toBe("UNREPAIRED");
  });

  it("never lets a repair or a critic override a HARD constraint", async () => {
    const proposal = examProposal();
    const input = UserInputV1Schema.parse({
      ...examFixture(),
      constraints: [
        {
          kind: "MAX_SESSION_MINUTES",
          strength: "HARD",
          value: 60,
          source: "USER_EXPLICIT",
        },
      ],
    });
    examInput(input);
    const { result } = await run({
      input,
      generator: [json(proposal)],
      critic: criticReport([
        {
          issueCode: "PRIORITY_MISS",
          affectedItemRefs: ["i7"],
          severity: "HIGH",
          patchInstruction: "Increase the practice allocation for this topic.",
        },
      ]),
      // 90 minutes exceeds the required maximum session length of 60.
      repair: repairPatch(proposal, ["i7"], { i7: { minutes: 90 } }),
    });
    expect(result.proposal).toEqual(withCompletionCriteria(proposal));
    expect(result.review.critic).toBe("UNREPAIRED");
    expect(
      result.proposal.items.every((item) => item.minutes <= 60)
    ).toBe(true);

    // A generated plan that breaks the limit never reaches the critic at all.
    await expect(
      run({
        input: hardLimited(examFixture(), 45),
        generator: [json(proposal), json(proposal), json(proposal)],
        critic: criticReport([]),
      })
    ).rejects.toThrow("EXAM_GENERATION_FAILED");
  });

  it("fails closed when the plan still cannot tell the student what to do", async () => {
    const proposal = examProposal();
    const vague = {
      ...proposal,
      items: proposal.items.map((item) =>
        item.ref === "i7" ? { ...item, description: "   " } : item
      ),
    };
    await expect(
      run({
        generator: [json(vague)],
        critic: criticReport([]),
        // The repair does not fix the item, so the deterministic gate wins.
        repair: repairPatch(proposal, ["i7"], { i7: { description: "  " } }),
      })
    ).rejects.toMatchObject({ code: "EXAM_SEMANTIC_REJECTED" });
  });

  it("keeps the provider call count bounded within one user-visible operation", async () => {
    const proposal = examProposal();
    const worstCase = await run({
      generator: [
        { text: "{" },
        new Error("transport detail"),
        json(proposal),
      ],
      critic: criticReport([
        {
          issueCode: "TASK_VAGUE",
          affectedItemRefs: ["i2"],
          severity: "MEDIUM",
          patchInstruction: "Say exactly which exercise set to complete.",
        },
      ]),
      repair: repairPatch(proposal, ["i2"], { i2: { minutes: 30 } }),
    });
    expect(worstCase.generatorCalls).toEqual(["deepseek", "deepseek", "gemini"]);
    expect(worstCase.result.calls).toBe(EXAM_PROVIDER_CALL_BUDGET);
    expect(EXAM_PROVIDER_CALL_BUDGET).toBeLessThanOrEqual(5);
    expect(EXAM_SEMANTIC_CALL_BUDGET).toBeLessThanOrEqual(2);
    // No second critic pass and no second repair attempt.
    expect(worstCase.critic.generateResponse).toHaveBeenCalledTimes(1);
    expect(worstCase.repair.generateResponse).toHaveBeenCalledTimes(1);
  });

  it("skips the semantic stage when its budget is exhausted, without failing generation", async () => {
    const skipped = await run({
      generator: [json(examProposal())],
      critic: criticReport([]),
      deadlineAt: Date.now() - 1000,
    });
    expect(skipped.result.proposal).toEqual(withCompletionCriteria(examProposal()));
    expect(skipped.result.review.critic).toBe("DISABLED");
    expect(skipped.critic.generateResponse).not.toHaveBeenCalled();
    expect(skipped.result.calls).toBe(1);
  });

  it("treats a cancellation during the semantic stage as recoverable, not as a broken plan", async () => {
    const controller = new AbortController();
    const proposal = examProposal();
    const slowCritic = queueAdapter([]);
    slowCritic.generateResponse.mockImplementation(
      () =>
        new Promise<LLMResponse>((_resolve, reject) => {
          setTimeout(() => {
            controller.abort();
            reject(new Error("aborted"));
          }, 1);
        })
    );
    const result = await generateExam(
      examFixture(),
      examAvailability(),
      controller.signal,
      {
        adapter: () => queueAdapter([json(proposal)]),
        semantic: {
          criticAdapter: () => slowCritic,
          repairAdapter: () => slowCritic,
        },
      }
    );
    // The plan is intact and the operation itself stays cancelled upstream.
    expect(result.proposal).toEqual(withCompletionCriteria(proposal));
    expect(result.review.critic).toBe("UNAVAILABLE");
    expect(controller.signal.aborted).toBe(true);
  });

  it("lets a supplied soft preference change placement through a bounded segment repair", async () => {
    const input = UserInputV1Schema.parse({
      ...examFixture(),
      constraints: [
        {
          kind: "EVEN_SPREAD_PREFERENCE",
          strength: "SOFT",
          value: 30,
          source: "USER_EXPLICIT",
        },
      ],
    });
    examInput(input);
    const proposal = examProposal();
    // The preference really is unhonored by the generated plan.
    expect(softConstraintViolations(input, proposal.items).length).toBeGreaterThan(0);
    // The repair may only touch the items the finding localized, and every one of
    // them must come back; here only one item actually moves.
    const dynamicRepair = {
      generateResponse: vi.fn(async (messages: { content?: string }[]) => {
        const request = JSON.parse(String(messages[0].content));
        return json({
          schemaVersion: 1,
          items: (request.requestedRefs as string[]).map((ref) =>
            repairItem(proposal, ref, ref === "i2" ? { date: "2030-01-09" } : {})
          ),
        }) as unknown as Promise<LLMResponse>;
      }),
    };
    const result = await generateExam(input, examAvailability(), new AbortController().signal, {
      adapter: () => queueAdapter([json(proposal)]),
      semantic: {
        criticAdapter: () => queueAdapter([criticReport([])]),
        repairAdapter: () => dynamicRepair as unknown as LLMAdapter,
      },
    });
    expect(result.proposal.items.find((item) => item.ref === "i2")!.date).toBe(
      "2030-01-09"
    );
    expect(result.review.repaired).toBeGreaterThan(0);
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
    // Placement changed without regenerating the plan, and the preference is now
    // honored on the day that carried the spike.
    const perDate = new Map<string, number>();
    for (const item of result.proposal.items)
      perDate.set(item.date, (perDate.get(item.date) ?? 0) + item.minutes);
    expect(perDate.get("2030-01-08")).toBe(30);
    const untouched = proposal.items.filter((item) => item.ref !== "i2");
    for (const original of untouched)
      expect(
        result.proposal.items.find((item) => item.ref === original.ref)
      ).toEqual({ ...original, completionCriteria: expect.any(String) });
  });

  it("guarantees a bounded, observable Definition of Done on every item", async () => {
    const proposal = examProposal();
    const withoutCriteria = {
      ...proposal,
      items: proposal.items.map((item) => ({
        ...item,
        completionCriteria: "Fully understand this topic",
      })),
    };
    const { result } = await run({
      generator: [json(withoutCriteria)],
      critic: criticReport([]),
    });
    for (const item of result.proposal.items) {
      expect(item.completionCriteria).toBeTruthy();
      expect(
        completionCriteriaIssue(item.completionCriteria!, item)
      ).toBeNull();
      expect(item.completionCriteria).not.toMatch(/fully understand/i);
      expect(item.completionCriteria!.length).toBeLessThanOrEqual(240);
    }
  });

  it("records a content-free semantic review", async () => {
    const { result } = await run({
      generator: [json(examProposal())],
      critic: criticReport([]),
    });
    const serialized = JSON.stringify(result.review);
    for (const label of ["Cells", "Enzymes", "Transport", "Synthetic"])
      expect(serialized).not.toContain(label);
    expect(Object.keys(result.review).sort()).toEqual([
      "critic",
      "deterministicIssues",
      "issues",
      "repaired",
      "schemaVersion",
      "softViolations",
    ]);
  });
});
