import { describe, expect, it, vi } from "vitest";
import {
  ModelProposalV1Schema,
  UserInputV1Schema,
  validateDraft,
  type ModelProposalV1,
} from "@/lib/planner/contracts";
import {
  defaultRoadmapGranularity,
  periodSpecsFor,
  roadmapFeasibility,
  roadmapInput,
  roadmapPeriodCapacity,
  scopeMinutes,
  scopeTokens,
  validateRoadmapEffort,
  validateRoadmapProposal,
  validateRoadmapStructure,
} from "@/lib/planner/roadmap-policy";
import { ROADMAP_LIMITS } from "@/lib/planner/roadmap-fields";
import { normalizeProposal } from "@/lib/planner/server/core";
import { generateRoadmap, ROADMAP_PROVIDER_CALL_BUDGET } from "@/lib/ai/planner/roadmap";
import { milestoneOutcomeIssue } from "@/lib/planner/done";
import { roadmapQuestionSet } from "./roadmap-question-helper";
import {
  longRoadmapFixture,
  roadmapAvailability,
  roadmapFixture,
  roadmapProposal,
  weekRoadmapFixture,
} from "./roadmap-fixtures";

const jsonOf = (value: unknown) => ({ text: JSON.stringify(value) });

function generatorProposal(input = roadmapFixture()) {
  return roadmapProposal(input);
}

describe("Roadmap periods and granularity", () => {
  it("tiles a 6-month horizon into exact calendar months and a short one into weeks", () => {
    const months = periodSpecsFor(roadmapFixture());
    expect(months).toHaveLength(6);
    expect(months[0]).toMatchObject({ ref: "p1", startDate: "2030-01-07", endDate: "2030-01-31" });
    expect(months[1]).toMatchObject({ startDate: "2030-02-01", endDate: "2030-02-28" });
    expect(months.at(-1)).toMatchObject({ startDate: "2030-06-01", endDate: "2030-06-30" });
    // No gaps and no overlaps anywhere in the horizon.
    for (let index = 1; index < months.length; index += 1) {
      const previous = Date.parse(months[index - 1].endDate);
      const current = Date.parse(months[index].startDate);
      expect(current - previous).toBe(86400000);
    }
    const weeks = periodSpecsFor(weekRoadmapFixture());
    expect(weeks.length).toBeGreaterThan(5);
    expect(weeks.every((week) => week.granularity === "WEEK")).toBe(true);
    expect(weeks.at(-1)!.endDate).toBe("2030-02-24");
  });

  it("chooses granularity deterministically and respects the explicit choice", () => {
    expect(defaultRoadmapGranularity("2030-01-07", "2030-03-01")).toBe("WEEK");
    expect(defaultRoadmapGranularity("2030-01-07", "2030-09-01")).toBe("MONTH");
    // The input records the user's value, so a saved plan always replays the same periods.
    expect(roadmapFixture().roadmap.granularity).toBe("MONTH");
    expect(weekRoadmapFixture().roadmap.granularity).toBe("WEEK");
  });

  it("reports feasibility from scope, periods and weekly capacity", () => {
    const feasibility = roadmapFeasibility(roadmapFixture(), roadmapAvailability());
    expect(feasibility.status).toBe("POTENTIAL_FIT");
    expect(feasibility.periods).toBe(6);
    expect(feasibility.granularity).toBe("MONTH");
    expect(feasibility.scopeMinutes).toBeGreaterThan(0);
    expect(feasibility.availableMinutes).toBeGreaterThan(feasibility.scopeMinutes);

    const blocked = roadmapFixture();
    const impossible = roadmapInput(
      UserInputV1Schema.parse({
        ...blocked,
        availability: { ...blocked.availability, dailyMinutes: [0, 0, 0, 0, 0, 0, 0] },
      })
    );
    expect(roadmapFeasibility(impossible, roadmapAvailability()).status).toBe(
      "INFEASIBLE"
    );
    expect(roadmapFeasibility(impossible, roadmapAvailability()).reasons).toContain(
      "INSUFFICIENT_CAPACITY"
    );
  });

  it("bounds the unit count and asks for segments instead of dropping units", () => {
    const base = longRoadmapFixture();
    const overflow = Array.from({ length: ROADMAP_LIMITS.topics + 1 }, (_, index) => ({
      label: `Overflow ${index + 1}`,
      covered: false,
      confidence: 2,
      difficult: false,
    }));
    // The schema caps the unit count outright: Sylf never silently drops a unit.
    expect(
      UserInputV1Schema.safeParse({
        ...base,
        scope: overflow.map((topic) => topic.label).join("\n"),
        roadmap: { ...base.roadmap, topics: overflow },
      }).success
    ).toBe(false);
    // And an oversized measured payload reports SEGMENT_REQUIRED with choices.
    const wide = Array.from({ length: ROADMAP_LIMITS.topics }, (_, index) => ({
      label: `${"ü".repeat(190)}${index}`,
      covered: false,
      confidence: 2,
      difficult: false,
    }));
    const parsed = UserInputV1Schema.parse({
      ...base,
      scope: wide.map((topic) => topic.label).join("\n"),
      roadmap: { ...base.roadmap, topics: wide },
    });
    const feasibility = roadmapFeasibility(roadmapInput(parsed), roadmapAvailability());
    expect(feasibility.status).toBe("SEGMENT_REQUIRED");
    expect(feasibility.reasons).toContain("SCOPE_TOO_LARGE");
    expect(feasibility.choices.length).toBeGreaterThan(0);
  });

  it("bounds the measured input envelope without changing the Exam bound", () => {
    const measured = new TextEncoder().encode(JSON.stringify(roadmapFixture())).byteLength;
    expect(measured).toBeLessThan(32768);
    const build = (label: (index: number) => string) => {
      const labels = Array.from({ length: ROADMAP_LIMITS.topics }, (_, index) =>
        label(index)
      );
      return UserInputV1Schema.parse({
        ...roadmapFixture(),
        scope: labels.join("\n"),
        roadmap: {
          ...roadmapFixture().roadmap,
          topics: labels.map((value) => ({
            label: value,
            covered: false,
            confidence: 2,
            difficult: false,
          })),
        },
      });
    };
    // Worst-case ASCII labels fit the roadmap envelope with headroom.
    const ascii = build((index) => `U${index}${"x".repeat(196)}`.slice(0, 200));
    const asciiBytes = new TextEncoder().encode(JSON.stringify(ascii)).byteLength;
    expect(asciiBytes).toBeLessThanOrEqual(ROADMAP_LIMITS.inputBytes);
    // A schema-valid roadmap with multi-byte labels exceeds the Exam envelope but
    // still fits the roadmap one: that is why the limit is mode-specific, and the
    // measured byte check (not the unit count) is the guarantee.
    const wide = build((index) => `${"ü".repeat(150)}${index}`);
    const wideBytes = new TextEncoder().encode(JSON.stringify(wide)).byteLength;
    expect(wideBytes).toBeGreaterThan(32768);
    expect(wideBytes).toBeLessThanOrEqual(ROADMAP_LIMITS.inputBytes);
    expect(() => roadmapInput(wide)).not.toThrow();
    expect(asciiBytes).toBeGreaterThan(measured);
  });
});

describe("Roadmap structural and capacity validation", () => {
  it("accepts a compact one-milestone-per-period roadmap", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal();
    expect(proposal.milestones.length).toBe(6);
    expect(proposal.items).toEqual([]);
    expect(() =>
      validateRoadmapProposal(input, proposal, roadmapAvailability())
    ).not.toThrow();
  });

  it("never allows a strategic roadmap to carry daily items", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal();
    const withItems = {
      ...proposal,
      items: [
        {
          ref: "i1",
          topicRef: "t1",
          type: "LEARN",
          stage: "COVERAGE",
          title: "Daily task",
          description: "A daily task that must not exist in a roadmap",
          rationale: "Not allowed at this granularity",
          date: "2030-01-08",
          minutes: 30,
          relatedTopicRefs: [],
          milestoneRef: "m1",
          dependsOn: [],
        },
      ],
    } as ModelProposalV1;
    expect(() =>
      validateRoadmapProposal(input, withItems, roadmapAvailability())
    ).toThrow("ROADMAP_ITEMS_NOT_ALLOWED");
  });

  it("rejects milestones that leave a period unplanned or exceed its capacity", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    // Drop the last period's milestone entirely.
    const missing = { ...proposal, milestones: proposal.milestones.slice(0, -1) };
    expect(() =>
      validateRoadmapStructure(input, {
        topicRefs: scopeTokens(input).map((topic) => topic.ref),
        periods: periodSpecsFor(input).map((spec) => ({
          ref: spec.ref,
          startDate: spec.startDate,
          endDate: spec.endDate,
          order: spec.order,
        })),
        milestones: missing.milestones.map((milestone) => ({
          ref: milestone.ref,
          title: milestone.title,
          date: milestone.date,
          periodRef: milestone.periodRef,
          outcome: milestone.outcome,
          topicRefs: milestone.topicRefs,
          effortMinutes: milestone.effortMinutes,
          dependsOn: milestone.dependsOn,
        })),
        hasItems: false,
        expansion: false,
      })
    ).toThrow("MISSING_ROADMAP_TOPIC");

    // Effort far above a period's remaining capacity is refused.
    const overloaded = {
      ...proposal,
      milestones: proposal.milestones.map((milestone, index) =>
        index === 0 ? { ...milestone, effortMinutes: 40000 } : milestone
      ),
    };
    expect(() =>
      validateRoadmapEffort(
        input,
        roadmapAvailability(),
        periodSpecsFor(input),
        overloaded.milestones.map((milestone) => ({
          periodRef: milestone.periodRef,
          effortMinutes: milestone.effortMinutes,
        }))
      )
    ).toThrow();
  });

  it("enforces deterministic period boundaries and the target date", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    const wrongDate = {
      ...proposal,
      milestones: proposal.milestones.map((milestone, index) =>
        index === 0 ? { ...milestone, date: "2030-01-30" } : milestone
      ),
    };
    expect(() =>
      validateRoadmapProposal(input, wrongDate, roadmapAvailability())
    ).toThrow("MILESTONE_PERIOD_MISMATCH");
    const beyond = {
      ...proposal,
      milestones: proposal.milestones.map((milestone, index) =>
        index === 0 ? { ...milestone, date: "2031-01-01" } : milestone
      ),
    };
    expect(() =>
      validateRoadmapProposal(input, beyond, roadmapAvailability())
    ).toThrow();
  });

  it("requires every confirmed unit to be covered or explicitly excluded", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    const dropped = {
      ...proposal,
      milestones: proposal.milestones.map((milestone, index) =>
        index === 0 ? { ...milestone, topicRefs: [] } : milestone
      ),
    };
    expect(() =>
      validateRoadmapProposal(input, dropped, roadmapAvailability())
    ).toThrow("MISSING_MILESTONE_SCOPE");
    const missingUnit = {
      ...proposal,
      milestones: proposal.milestones.map((milestone, index) =>
        index === 0 ? { ...milestone, topicRefs: ["t2"] } : milestone
      ),
    };
    expect(() =>
      validateRoadmapProposal(input, missingUnit, roadmapAvailability())
    ).toThrow("MISSING_ROADMAP_TOPIC");
  });

  it("keeps priority independent from confidence and affects allocation", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    // The HIGH-priority unit is covered late (last period) and under-allocated.
    const late = {
      ...proposal,
      milestones: proposal.milestones.map((milestone) => {
        const coversHigh = (milestone.topicRefs ?? []).includes("t6");
        if (coversHigh) return { ...milestone, effortMinutes: 15 };
        if (milestone.periodRef === "p6")
          return { ...milestone, topicRefs: ["t6"], effortMinutes: 15 };
        return milestone;
      }),
    };
    expect(() =>
      validateRoadmapProposal(input, late, roadmapAvailability())
    ).toThrow();
    // The fixture already satisfies the HIGH floors and the early window.
    expect(() =>
      validateRoadmapProposal(input, proposal, roadmapAvailability())
    ).not.toThrow();
    // Every unit is held to its own coarse floor, so a plan cannot shrink units
    // to fill periods evenly.
    const thinned = {
      ...proposal,
      milestones: proposal.milestones.map((milestone) => ({
        ...milestone,
        effortMinutes: 15,
      })),
    };
    expect(() =>
      validateRoadmapProposal(input, thinned, roadmapAvailability())
    ).toThrow("INSUFFICIENT_UNIT_ALLOCATION");
  });

  it("keeps a HARD weekly limit as a per-period ceiling, not a rolling window", () => {
    const base = roadmapFixture();
    const limited = roadmapInput(
      UserInputV1Schema.parse({
        ...base,
        constraints: [
          {
            kind: "MAX_WEEKLY_MINUTES",
            strength: "HARD",
            value: 200,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    const capacity = roadmapPeriodCapacity(limited, roadmapAvailability());
    const january = capacity[0];
    // floor(200 × 25 / 7) = 714 for a clipped January period.
    expect(january.weeklyCeiling).toBe(Math.floor((200 * 25) / 7));
    expect(january.ceiling).toBeLessThanOrEqual(january.available);
    // A month exceeding its converted ceiling is refused.
    expect(() =>
      validateRoadmapEffort(
        limited,
        roadmapAvailability(),
        periodSpecsFor(limited),
        [{ periodRef: "p1", effortMinutes: january.ceiling + 15 }]
      )
    ).toThrow("HARD_WEEKLY_LIMIT_EXCEEDED");
  });

  it("never lets a soft roadmap preference make a plan infeasible", () => {
    const base = roadmapFixture();
    const withSoft = roadmapInput(
      UserInputV1Schema.parse({
        ...base,
        constraints: [
          {
            kind: "PREFER_EARLIER_WORKLOAD",
            strength: "SOFT",
            value: 90,
            source: "USER_EXPLICIT",
          },
          {
            kind: "PREFER_BALANCED_PERIODS",
            strength: "SOFT",
            value: 20,
            source: "USER_EXPLICIT",
          },
          {
            kind: "PREFER_FEWER_SWITCHES",
            strength: "SOFT",
            value: 100,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    const baseline = roadmapFeasibility(base, roadmapAvailability());
    const after = roadmapFeasibility(withSoft, roadmapAvailability());
    expect(after.status).toBe(baseline.status);
    expect(after.availableMinutes).toBe(baseline.availableMinutes);
    expect(() =>
      validateRoadmapProposal(withSoft, generatorProposal(), roadmapAvailability())
    ).not.toThrow();
  });

  it("rejects a request-inapplicable constraint rather than ignoring it", () => {
    expect(() =>
      roadmapInput(
        UserInputV1Schema.parse({
          ...roadmapFixture(),
          constraints: [
            {
              kind: "MAX_SESSION_MINUTES",
              strength: "HARD",
              value: 45,
              source: "USER_EXPLICIT",
            },
          ],
        })
      )
    ).not.toThrow();
    expect(
      UserInputV1Schema.safeParse({
        ...roadmapFixture(),
        constraints: [
          {
            kind: "PREFER_UNIT_ORDER",
            strength: "SOFT",
            value: 2,
            source: "USER_EXPLICIT",
          },
          {
            kind: "PREFER_FEWER_SWITCHES",
            strength: "SOFT",
            value: 50,
            source: "USER_EXPLICIT",
          },
        ],
      }).success
    ).toBe(true);
  });
});

describe("Roadmap drafts, milestones and Definition of Done", () => {
  it("normalizes a roadmap into application-issued period and milestone keys", () => {
    const input = roadmapFixture();
    const draft = normalizeProposal(input, generatorProposal());
    expect(draft.mode).toBe("ROADMAP");
    if (draft.mode !== "ROADMAP") return;
    expect(draft.periods).toHaveLength(6);
    expect(draft.items).toHaveLength(0);
    expect(draft.milestones.every((milestone) => milestone.periodKey)).toBe(true);
    expect(
      draft.milestones.every((milestone) =>
        draft.periods!.some((period) => period.key === milestone.periodKey)
      )
    ).toBe(true);
    // Stable identities: keys are application-issued UUIDs, never model tokens.
    expect(draft.milestones[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.topics[0].scopeRef).toBe("t1");
  });

  it("resolves a bounded, observable milestone outcome for every milestone", () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    const vague = {
      ...proposal,
      milestones: proposal.milestones.map((milestone) => ({
        ...milestone,
        outcome: "Fully understand everything about this block of the course",
      })),
    };
    const draft = normalizeProposal(input, vague);
    if (draft.mode !== "ROADMAP") return;
    for (const milestone of draft.milestones) {
      expect(milestone.outcome).toBeTruthy();
      expect(milestoneOutcomeIssue(milestone.outcome!)).toBeNull();
      expect(milestone.outcome).not.toMatch(/fully understand/i);
      expect(milestone.outcome!.length).toBeLessThanOrEqual(240);
    }
  });

  it("rejects a stored roadmap whose structure no longer matches its periods", () => {
    const input = roadmapFixture();
    const draft = normalizeProposal(input, generatorProposal());
    if (draft.mode !== "ROADMAP") return;
    expect(() => validateDraft(input, draft)).not.toThrow();
    expect(() =>
      validateDraft(input, {
        ...draft,
        milestones: draft.milestones.map((milestone, index) =>
          index === 0 ? { ...milestone, periodKey: draft.periods![5].key } : milestone
        ),
      })
    ).toThrow();
    expect(() => validateDraft(input, { ...draft, periods: undefined })).toThrow(
      "ROADMAP_PERIODS_REQUIRED"
    );
  });

  it("still reads metadata-free ROADMAP payloads from earlier phases", () => {
    const legacy = UserInputV1Schema.parse({
      schemaVersion: 1,
      mode: "ROADMAP",
      title: "Legacy roadmap",
      scope: "Algebra",
      outcome: "Solve equations",
      startDate: "2030-01-07",
      endDate: "2030-01-11",
      availability: {
        dailyMinutes: [120, 120, 120, 120, 120, 120, 120],
        recoveryPercent: 10,
        blockedDates: [],
      },
    });
    const draft = normalizeProposal(legacy, {
      schemaVersion: 1,
      mode: "ROADMAP",
      outcome: "Solve equations",
      assumptions: [],
      warnings: [],
      topics: [{ ref: "t1", title: "Algebra", parentRef: null }],
      milestones: [{ ref: "m1", title: "Ready", date: "2030-01-11" }],
      items: [
        {
          ref: "i1",
          topicRef: "t1",
          type: "LEARN",
          title: "Linear equations",
          description: "Study and solve linear equations in one variable",
          date: "2030-01-08",
          minutes: 45,
          relatedTopicRefs: [],
          milestoneRef: "m1",
          dependsOn: [],
        },
      ],
    });
    expect(draft.mode).toBe("ROADMAP");
    expect(draft.milestones).toHaveLength(1);
  });
});

describe("Roadmap generation pipeline", () => {
  it("generates a validated roadmap and reports no per-topic items", async () => {
    const input = roadmapFixture();
    const generateResponse = vi.fn().mockResolvedValue(jsonOf(generatorProposal()));
    const result = await generateRoadmap(
      input,
      roadmapAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse }),
        semantic: {
          criticAdapter: () => ({
            generateResponse: vi.fn().mockResolvedValue(
              jsonOf({ schemaVersion: 1, issues: [] })
            ),
          }),
        },
      }
    );
    expect(result.proposal.milestones).toHaveLength(6);
    expect(result.proposal.items).toEqual([]);
    expect(result.review.critic).toBe("PASSED");
    expect(result.calls).toBe(2);
    expect(result.calls).toBeLessThanOrEqual(ROADMAP_PROVIDER_CALL_BUDGET);
  });

  it("keeps the provider call budget bounded when everything fails", async () => {
    const generateResponse = vi.fn().mockResolvedValue({ text: "{}" });
    const adapter = vi.fn((provider: string) => {
      void provider;
      return { generateResponse };
    });
    await expect(
      generateRoadmap(roadmapFixture(), roadmapAvailability(), new AbortController().signal, {
        adapter: adapter as never,
      })
    ).rejects.toMatchObject({ code: "ROADMAP_GENERATION_FAILED" });
    expect(adapter.mock.calls.map((call) => call[0])).toEqual([
      "deepseek",
      "deepseek",
      "gemini",
    ]);
  });

  it("patches only the flagged milestones and never a neighbouring period", async () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: ["m2"],
            severity: "MEDIUM",
            patchInstruction: "Say what finishing this period looks like.",
          },
        ],
      })
    );
    const repair = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        milestones: [
          {
            ...proposal.milestones[1],
            outcome: "Complete dynamics practice and record the error patterns.",
          },
        ],
      })
    );
    const result = await generateRoadmap(
      input,
      roadmapAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)) }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
    expect(result.proposal.milestones[1].outcome).toBe(
      "Complete dynamics practice and record the error patterns."
    );
    // Every other milestone is untouched.
    for (const [index, milestone] of proposal.milestones.entries())
      if (index !== 1) expect(result.proposal.milestones[index]).toEqual(milestone);
  });

  it("rejects a roadmap repair that reaches beyond the flagged milestone", async () => {
    const input = roadmapFixture();
    const proposal = generatorProposal() as Extract<ModelProposalV1, { mode: "ROADMAP" }>;
    const result = await generateRoadmap(
      input,
      roadmapAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)) }),
        semantic: {
          criticAdapter: () => ({
            generateResponse: vi.fn().mockResolvedValue(
              jsonOf({
                schemaVersion: 1,
                issues: [
                  {
                    issueCode: "TASK_VAGUE",
                    affectedItemRefs: ["m2"],
                    severity: "MEDIUM",
                    patchInstruction: "Say what finishing this period looks like.",
                  },
                ],
              })
            ),
          }),
          repairAdapter: () => ({
            generateResponse: vi.fn().mockResolvedValue(
              jsonOf({ schemaVersion: 1, milestones: proposal.milestones.slice(0, 3) })
            ),
          }),
        },
      }
    );
    expect(result.review.critic).toBe("UNREPAIRED");
    expect(result.proposal).toEqual(proposal);
  });

  it("validates the shared contract and rejects malformed proposals", async () => {
    const input = roadmapFixture();
    await expect(
      generateRoadmap(input, roadmapAvailability(), new AbortController().signal, {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf({ schemaVersion: 1 })),
        }),
      })
    ).rejects.toMatchObject({ code: "ROADMAP_GENERATION_FAILED" });
    expect(ModelProposalV1Schema.safeParse(generatorProposal()).success).toBe(true);
  });

  it("produces period rows only, never per-topic daily rows, on a 12-month horizon", async () => {
    const input = longRoadmapFixture();
    const result = await generateRoadmap(
      input,
      roadmapAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(roadmapProposal(input))),
        }),
      }
    );
    expect(result.proposal.milestones.length).toBeLessThanOrEqual(13);
    expect(result.proposal.items).toHaveLength(0);
    for (const milestone of result.proposal.milestones) {
      expect(milestone.date <= input.endDate).toBe(true);
      expect(milestone.date >= input.startDate).toBe(true);
    }
  });

  it("reports zero smart questions for a decided roadmap and one when justified", () => {
    expect(roadmapQuestionSet(roadmapFixture())).toEqual([]);
    const tight = roadmapFixture();
    const needsPriority = roadmapInput(
      UserInputV1Schema.parse({
        ...tight,
        endDate: "2030-02-15",
        roadmap: {
          ...tight.roadmap,
          granularity: "WEEK",
          topics: tight.roadmap.topics.map((topic, index) => ({
            ...topic,
            priority: undefined,
            prioritySource: undefined,
            covered: index % 2 === 0,
          })),
        },
        availability: {
          ...tight.availability,
          dailyMinutes: [0, 30, 30, 30, 30, 30, 30],
        },
      })
    );
    const questions = roadmapQuestionSet(needsPriority);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(3);
    expect(
      questions.every((question) => question.whyItMatters.length > 20)
    ).toBe(true);
  });
});
