import { describe, expect, it, vi } from "vitest";
import {
  ModelProposalV1Schema,
  UserInputV1Schema,
  validateDraft,
  type ModelProposalV1,
} from "@/lib/planner/contracts";
import {
  MASTERY_LIMITS,
  MASTERY_STAGE_LABEL,
  type MasteryStage,
} from "@/lib/planner/mastery-fields";
import {
  MASTERY_STAGE_INTENTS,
  MASTERY_STAGE_ORDER,
  assertMasteryEnvelope,
  deriveMasteryHorizon,
  excludedMasteryTopics,
  masteryFeasibility,
  masteryInput,
  masteryInputBytes,
  masteryScopeMinutes,
  masteryTokens,
  validateMasteryProposal,
  validateMasteryStructure,
} from "@/lib/planner/mastery-policy";
import { normalizeProposal } from "@/lib/planner/server/core";
import { masteryPayload } from "@/lib/ai/planner/mastery";
import { resolveCompletionCriteria, completionCriteriaIssue } from "@/lib/planner/done";
import { softConstraintViolations } from "@/lib/planner/constraints";
import {
  MASTERY_PROVIDER_CALL_BUDGET,
  generateMastery,
} from "@/lib/ai/planner/mastery";
import { plannerTelemetry } from "@/lib/planner/telemetry";
import {
  activeItems,
} from "@/lib/planner/contracts";
import { failureCodeOf } from "./mastery-helpers";
import {
  masteryAvailability,
  masteryFixture,
  masteryProposal,
  secureMasteryFixture,
  shortMasteryFixture,
} from "./mastery-fixtures";

const jsonOf = (value: unknown) => ({ text: JSON.stringify(value) });

function variant(
  mutate: (
    proposal: Extract<ModelProposalV1, { mode: "MASTERY" }>
  ) => void
): ModelProposalV1 {
  const proposal = masteryProposal() as Extract<
    ModelProposalV1,
    { mode: "MASTERY" }
  >;
  const clone = JSON.parse(JSON.stringify(proposal)) as typeof proposal;
  mutate(clone);
  return clone;
}

const stageOf = (proposal: ModelProposalV1, index: number) =>
  (proposal as Extract<ModelProposalV1, { mode: "MASTERY" }>).items[index]
    .masteryStage;

describe("Mastery input and bounds", () => {
  it("normalizes the chapter input and mirrors the confirmed unit list", () => {
    const input = masteryFixture();
    expect(input.focus).toBe(input.mastery.unitTitle);
    expect(input.scope).toBe(
      input.mastery.topics.map((topic) => topic.label).join("\n")
    );
    // The unit refs are issued by the application, never by the model.
    expect(masteryTokens(input).map((topic) => topic.ref)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
  });

  it("rejects a focus, scope or reserve that does not match the unit details", () => {
    const input = masteryFixture();
    expect(
      failureCodeOf(() =>
        masteryInput(UserInputV1Schema.parse({ ...input, focus: "Something else" }))
      )
    ).toBe("MASTERY_FOCUS_MISMATCH");
    expect(
      failureCodeOf(() =>
        masteryInput(UserInputV1Schema.parse({ ...input, scope: "Only one\n" }))
      )
    ).toBe("SCOPE_MISMATCH");
    expect(
      failureCodeOf(() =>
        masteryInput(
          UserInputV1Schema.parse({
            ...input,
            availability: { ...input.availability, recoveryPercent: 5 },
          })
        )
      )
    ).toBe("RESERVE_ACCEPTANCE_REQUIRED");
    // The schema itself refuses an empty or oversized unit list: Sylf never
    // silently drops or invents a unit.
    expect(
      UserInputV1Schema.safeParse({
        ...input,
        mastery: { ...input.mastery, topics: [] },
      }).success
    ).toBe(false);
  });

  it("derives a bounded horizon and refuses a horizon that is neither given nor derived", () => {
    const input = masteryFixture();
    const derived = deriveMasteryHorizon(input);
    // The derived horizon is deterministic and inside the mode's own bound.
    expect(derived).toBe(deriveMasteryHorizon(input));
    expect(derived > input.startDate).toBe(true);
    const openEnded = UserInputV1Schema.parse({
      ...input,
      endDate: derived,
      mastery: { ...input.mastery, targetDate: null },
    });
    expect(masteryInput(openEnded).endDate).toBe(derived);
    expect(
      failureCodeOf(() =>
        masteryInput(
          UserInputV1Schema.parse({
            ...input,
            mastery: { ...input.mastery, targetDate: null },
          })
        )
      )
    ).toBe("MASTERY_HORIZON_MISMATCH");
  });

  it("measures the input envelope instead of trusting a unit count", () => {
    const input = masteryFixture();
    expect(masteryInputBytes(input)).toBeLessThanOrEqual(
      MASTERY_LIMITS.inputBytes
    );
    expect(failureCodeOf(() => assertMasteryEnvelope(input))).toBeNull();
    // The measured worst case the schema permits: 12 units at the 200-character
    // label bound, multi-byte, with the duplicated scope line and a full blocked
    // list. It stays inside the envelope, so the unit cap binds first and the byte
    // measure is a wire-format guard rather than the mode's primary limit.
    const widest = {
      ...input,
      title: "ü".repeat(200),
      focus: "ü".repeat(200),
      scope: Array.from({ length: MASTERY_LIMITS.topics }, (_, index) =>
        "ü".repeat(198) + String(index).padStart(2, "0")
      ).join("\n"),
      availability: {
        ...input.availability,
        dailyMinutes: [720, 720, 720, 720, 720, 720, 720],
        recoveryPercent: 50,
      },
      mastery: {
        ...input.mastery,
        subjectName: "ü".repeat(200),
        unitTitle: "ü".repeat(200),
        desiredDepth: "DEEP" as const,
        topics: Array.from({ length: MASTERY_LIMITS.topics }, (_, index) => ({
          label: "ü".repeat(198) + String(index).padStart(2, "0"),
          covered: true,
          confidence: 5,
          difficult: true,
        })),
      },
    };
    const measured = masteryInputBytes(widest);
    expect(measured).toBeGreaterThan(MASTERY_LIMITS.inputBytes / 2);
    expect(measured).toBeLessThanOrEqual(MASTERY_LIMITS.inputBytes);
    expect(failureCodeOf(() => assertMasteryEnvelope(widest))).toBeNull();
    // A payload a client sends anyway — well past the schema's own bounds — is
    // still refused before it reaches a provider.
    const oversized = {
      ...widest,
      mastery: {
        ...widest.mastery,
        topics: Array.from({ length: 26 }, (_, index) => ({
          ...widest.mastery.topics[0],
          label: "ü".repeat(198) + String(index).padStart(2, "0"),
        })),
      },
    };
    expect(masteryInputBytes(oversized)).toBeGreaterThan(
      MASTERY_LIMITS.inputBytes
    );
    expect(failureCodeOf(() => assertMasteryEnvelope(oversized))).toBe(
      "MASTERY_SCOPE_TOO_LARGE"
    );
  });

  it("reports deterministic feasibility and asks for segments instead of dropping units", () => {
    const input = masteryFixture();
    const fit = masteryFeasibility(input, masteryAvailability());
    expect(fit.status).toBe("POTENTIAL_FIT");
    expect(fit.scopeMinutes).toBe(
      masteryScopeMinutes(masteryTokens(input), input.mastery.desiredDepth)
    );
    expect(fit.derived).toBe(false);

    const blocked = masteryInput(
      UserInputV1Schema.parse({
        ...input,
        availability: { ...input.availability, dailyMinutes: [0, 0, 0, 0, 0, 0, 0] },
      })
    );
    const infeasible = masteryFeasibility(blocked, masteryAvailability());
    expect(infeasible.status).toBe("INFEASIBLE");
    expect(infeasible.reasons).toContain("INSUFFICIENT_CAPACITY");
    expect(infeasible.choices.join(" ")).toContain("Course / Syllabus Roadmap");

    // An oversized chapter is a segment problem, and the schema refuses it before
    // any plan could be generated from a truncated unit list.
    expect(
      UserInputV1Schema.safeParse({
        ...input,
        mastery: {
          ...input.mastery,
          topics: Array.from(
            { length: MASTERY_LIMITS.topics + 1 },
            (_, index) => ({
              label: `Unit ${index + 1}`,
              covered: false,
              confidence: 2,
              difficult: false,
            })
          ),
        },
      }).success
    ).toBe(false);
  });

  it("refuses a constraint the mode cannot evaluate", () => {
    const input = masteryFixture();
    expect(
      failureCodeOf(() =>
        masteryInput(
          UserInputV1Schema.parse({
            ...input,
            constraints: [
              {
                kind: "MAX_WEEKLY_MINUTES",
                strength: "HARD",
                value: 600,
                source: "USER_EXPLICIT",
              },
            ],
          })
        )
      )
    ).toBe("CONSTRAINT_NOT_APPLICABLE");
    // Session length and weekday exclusions are mastery vocabulary.
    const usable = masteryInput(
      UserInputV1Schema.parse({
        ...input,
        constraints: [
          {
            kind: "MAX_SESSION_MINUTES",
            strength: "HARD",
            value: 45,
            source: "USER_EXPLICIT",
          },
          {
            kind: "UNAVAILABLE_WEEKDAY",
            strength: "HARD",
            value: 6,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    expect(usable.constraints).toHaveLength(2);
  });
});

describe("Mastery progression rules", () => {
  const input = () => masteryFixture();
  const view = (proposal: ModelProposalV1) => ({
    topicRefs: masteryTokens(input()).map((topic) => topic.ref),
    items:
      proposal.mode === "MASTERY"
        ? proposal.items.map((item) => ({
            ref: item.ref,
            topicRef: item.topicRef,
            related: item.relatedTopicRefs ?? [],
            type: item.type,
            stage: item.masteryStage,
            date: item.date,
            minutes: item.minutes,
          }))
        : [],
  });

  it("accepts the fixture and keeps every stage legal for its intent", () => {
    const proposal = masteryProposal(input());
    validateMasteryStructure(input(), view(proposal));
    for (const item of (proposal as Extract<ModelProposalV1, { mode: "MASTERY" }>)
      .items) {
      const stage = item.masteryStage as MasteryStage;
      expect(MASTERY_STAGE_ORDER).toContain(stage);
      expect(MASTERY_STAGE_INTENTS[stage]).toContain(item.type);
    }
    const stages = (proposal as Extract<ModelProposalV1, { mode: "MASTERY" }>).items
      .map((item) => item.masteryStage)
      .filter((stage): stage is MasteryStage => Boolean(stage));
    expect(stages.at(-1)).toBe("MASTERY_CHECK");
  });

  it("requires orientation unless the unit is already secure, and never re-teaches a secure unit", () => {
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => !(item.topicRef === "t1" && item.masteryStage === "UNDERSTAND")
              );
            })
          )
        )
      )
    ).toBe("MISSING_UNDERSTAND");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const secure = proposal.items.find((item) => item.topicRef === "t3")!;
              proposal.items.push({
                ...secure,
                ref: "i99",
                type: "LEARN",
                masteryStage: "LEARN",
                minutes: 15,
              });
            })
          )
        )
      )
    ).toBe("UNNECESSARY_RELEARNING");
    // The uncovered unit must be taught: removing its learning leaves a real gap.
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => !(item.topicRef === "t1" && item.masteryStage === "LEARN")
              );
            })
          )
        )
      )
    ).toBe("MISSING_LEARN");
  });

  it("requires recall and practice for every unit, after its learning", () => {
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => !(item.topicRef === "t2" && item.masteryStage === "ACTIVE_RECALL")
              );
            })
          )
        )
      )
    ).toBe("MISSING_ACTIVE_RECALL");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => !(item.topicRef === "t2" && item.masteryStage === "PRACTICE")
              );
            })
          )
        )
      )
    ).toBe("MISSING_PRACTICE");
    // Recall cannot be moved in front of the unit's own learning.
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const recall = proposal.items.find(
                (item) => item.topicRef === "t1" && item.masteryStage === "ACTIVE_RECALL"
              )!;
              recall.date = "2030-01-07";
            })
          )
        )
      )
    ).toBe("RECALL_BEFORE_LEARNING");
    // Neither can practice, and mistake review cannot precede the practice it reviews.
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const practice = proposal.items.find(
                (item) => item.topicRef === "t2" && item.masteryStage === "PRACTICE"
              )!;
              practice.date = "2030-01-07";
            })
          )
        )
      )
    ).toBe("PRACTICE_BEFORE_LEARNING");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const review = proposal.items.find(
                (item) => item.topicRef === "t2" && item.masteryStage === "REVIEW_MISTAKES"
              )!;
              review.date = "2030-01-07";
            })
          )
        )
      )
    ).toBe("MISTAKE_REVIEW_BEFORE_PRACTICE");
  });

  it("requires mistake review when any unit is not already secure, and adequate work per unit", () => {
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => item.masteryStage !== "REVIEW_MISTAKES"
              );
            })
          )
        )
      )
    ).toBe("MISSING_MISTAKE_REVIEW");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              // Every item for the unit shrunk to the minimum session length and
              // its mistake review removed: the unit keeps a legal progression but
              // no longer reaches its own effort floor.
              proposal.items = proposal.items
                .filter(
                  (item) =>
                    !(
                      item.topicRef === "t1" &&
                      item.masteryStage === "REVIEW_MISTAKES"
                    )
                )
                .map((item) =>
                  item.topicRef === "t1" ? { ...item, minutes: 15 } : item
                );
            })
          )
        )
      )
    ).toBe("INSUFFICIENT_TOPIC_WORK");
  });

  it("requires deliberate later retrieval on a longer horizon", () => {
    const proposal = variant((clone) => {
      for (const item of clone.items) {
        if (item.masteryStage === "ACTIVE_RECALL" && item.topicRef === "t1")
          item.date = "2030-01-09";
      }
    });
    expect(failureCodeOf(() => validateMasteryStructure(input(), view(proposal)))).toBe(
      "MISSING_LATER_RETRIEVAL"
    );
    // The short fixture is inside the 14-day bound, so the rule does not apply.
    const short = shortMasteryFixture();
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(short, {
          topicRefs: ["t1"],
          items: masteryProposal(short).mode === "MASTERY"
            ? (masteryProposal(short) as Extract<ModelProposalV1, { mode: "MASTERY" }>).items.map(
                (item) => ({
                  ref: item.ref,
                  topicRef: item.topicRef,
                  related: item.relatedTopicRefs ?? [],
                  type: item.type,
                  stage: item.masteryStage,
                  date: item.date,
                  minutes: item.minutes,
                })
              )
            : [],
        })
      )
    ).toBeNull();
  });

  it("ends the plan with one bounded check that covers the chapter", () => {
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              proposal.items = proposal.items.filter(
                (item) => item.masteryStage !== "MASTERY_CHECK"
              );
            })
          )
        )
      )
    ).toBe("MISSING_MASTERY_CHECK");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const check = proposal.items.find(
                (item) => item.masteryStage === "MASTERY_CHECK"
              )!;
              check.relatedTopicRefs = [];
            })
          )
        )
      )
    ).toBe("CHECK_SCOPE_TOO_NARROW");
    // Work that survives the check means the plan does not end with its check.
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const check = proposal.items.find(
                (item) => item.masteryStage === "MASTERY_CHECK"
              )!;
              const trailing = {
                ...proposal.items.find(
                  (item) => item.masteryStage === "PRACTICE"
                )!,
                ref: "i98",
                date: check.date,
              };
              proposal.items = [
                ...proposal.items.filter(
                  (item) => item.masteryStage !== "MASTERY_CHECK"
                ),
                check,
                trailing,
              ];
            })
          )
        )
      )
    ).toBe("MASTERY_CHECK_NOT_TERMINAL");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(
          input(),
          view(
            variant((proposal) => {
              const check = proposal.items.find(
                (item) => item.masteryStage === "MASTERY_CHECK"
              )!;
              check.type = "PRACTICE";
            })
          )
        )
      )
    ).toBe("INVALID_MASTERY_INTENT_STAGE");
  });

  it("keeps a HIGH priority unit early, practised and inside the check", () => {
    const high = masteryInput(
      UserInputV1Schema.parse({
        ...masteryFixture(),
        mastery: {
          ...masteryFixture().mastery,
          topics: masteryFixture().mastery.topics.map((topic, index) =>
            index === 0
              ? { ...topic, priority: "HIGH", prioritySource: "USER_EXPLICIT" }
              : topic
          ),
        },
      })
    );
    const clean = masteryProposal(high);
    validateMasteryStructure(high, {
      topicRefs: masteryTokens(high).map((topic) => topic.ref),
      items: (clean as Extract<ModelProposalV1, { mode: "MASTERY" }>).items.map(
        (item) => ({
          ref: item.ref,
          topicRef: item.topicRef,
          related: item.relatedTopicRefs ?? [],
          type: item.type,
          stage: item.masteryStage,
          date: item.date,
          minutes: item.minutes,
        })
      ),
    });
    const dropped = JSON.parse(JSON.stringify(clean)) as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    dropped.items = dropped.items.filter((item) => item.topicRef !== "t1");
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(high, {
          topicRefs: masteryTokens(high).map((topic) => topic.ref),
          items: dropped.items.map((item) => ({
            ref: item.ref,
            topicRef: item.topicRef,
            related: item.relatedTopicRefs ?? [],
            type: item.type,
            stage: item.masteryStage,
            date: item.date,
            minutes: item.minutes,
          })),
        })
      )
    ).toBe("MISSING_SCOPE_TOPIC");
    const outOfCheck = JSON.parse(JSON.stringify(clean)) as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    for (const item of outOfCheck.items) {
      if (item.masteryStage === "MASTERY_CHECK") {
        item.topicRef = "t2";
        item.relatedTopicRefs = ["t3"];
      }
    }
    expect(
      failureCodeOf(() =>
        validateMasteryStructure(high, {
          topicRefs: masteryTokens(high).map((topic) => topic.ref),
          items: outOfCheck.items.map((item) => ({
            ref: item.ref,
            topicRef: item.topicRef,
            related: item.relatedTopicRefs ?? [],
            type: item.type,
            stage: item.masteryStage,
            date: item.date,
            minutes: item.minutes,
          })),
        })
      )
    ).toBe("PRIORITY_MISSED_IN_CHECK");
  });

  it("plans no milestones and no outside-horizon work", () => {
    const proposal = masteryProposal();
    expect(proposal.milestones).toEqual([]);
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(
          input(),
          variant((clone) => {
            clone.items[0].date = "2030-03-01";
          }),
          masteryAvailability()
        )
      )
    ).toBe("OUTSIDE_HORIZON");
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(
          input(),
          variant((clone) => {
            clone.milestones = [
              { ref: "m1", title: "Milestone", date: "2030-01-20" },
            ];
          }),
          masteryAvailability()
        )
      )
    ).toBe("MASTERY_MILESTONES_NOT_ALLOWED");
  });

  it("enforces the confirmed unit list, capacity and hard limits at proposal level", () => {
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(
          input(),
          variant((clone) => {
            clone.topics = clone.topics.map((topic, index) =>
              index === 0 ? { ...topic, title: "Renamed unit" } : topic
            );
          }),
          masteryAvailability()
        )
      )
    ).toBe("CONFIRMED_SCOPE_MISMATCH");
    const crowded = masteryInput(
      UserInputV1Schema.parse({
        ...masteryFixture(),
        constraints: [
          {
            kind: "MAX_SESSION_MINUTES",
            strength: "HARD",
            value: 20,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(crowded, masteryProposal(crowded), masteryAvailability())
      )
    ).toBe("HARD_SESSION_LIMIT_EXCEEDED");
  });
});

describe("Mastery drafts and materialization shape", () => {
  it("normalizes a proposal into a stored draft that revalidates", () => {
    const input = masteryFixture();
    const draft = normalizeProposal(input, masteryProposal(input));
    expect(draft.mode).toBe("MASTERY");
    // Unit keys are issued by the application and keep the confirmed order.
    expect(draft.topics.map((topic) => topic.scopeRef)).toEqual(["t1", "t2", "t3"]);
    expect(draft.items.every((item) => Boolean(item.masteryStage))).toBe(true);
    expect(draft.items.every((item) => Boolean(item.completionCriteria))).toBe(true);
    expect(draft.milestones).toEqual([]);
    expect(() => validateDraft(input, draft)).not.toThrow();
  });

  it("treats a fully removed unit as an explicit exclusion, and rejects losing a stage", () => {
    const input = masteryFixture();
    const draft = normalizeProposal(input, masteryProposal(input));
    if (draft.mode !== "MASTERY") throw new Error("expected a mastery draft");
    // The check's own topic stays in scope, so the exclusion is a real unit choice
    // rather than a plan that lost its check.
    const unitKey = draft.topics[1].key;
    const excluded = {
      ...draft,
      items: draft.items.map((item) =>
        item.topicKey === unitKey ? { ...item, removed: true } : item
      ),
    };
    expect(() => validateDraft(input, excluded)).not.toThrow();
    expect(excludedMasteryTopics(excluded).map((topic) => topic.scopeRef)).toEqual([
      "t2",
    ]);
    expect(activeItems(excluded.items)).toHaveLength(
      excluded.items.length - draft.items.filter((item) => item.topicKey === unitKey).length
    );
    // Removing one required stage for a unit that stays in scope is not a plan.
    const partial = {
      ...draft,
      items: draft.items.map((item) =>
        item.topicKey === unitKey && item.masteryStage === "ACTIVE_RECALL"
          ? { ...item, removed: true }
          : item
      ),
    };
    expect(failureCodeOf(() => validateDraft(input, partial))).toBe(
      "MISSING_ACTIVE_RECALL"
    );
  });
});

describe("Mastery generation pipeline", () => {
  it("generates a validated mastery plan inside the shared call budget", async () => {
    const input = masteryFixture();
    const generateResponse = vi.fn().mockResolvedValue(jsonOf(masteryProposal()));
    const result = await generateMastery(
      input,
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse }),
        semantic: {
          criticAdapter: () => ({
            generateResponse: vi
              .fn()
              .mockResolvedValue(jsonOf({ schemaVersion: 1, issues: [] })),
          }),
        },
      }
    );
    expect(result.proposal.mode).toBe("MASTERY");
    expect(result.proposal.milestones).toEqual([]);
    expect(result.proposal.items.every((item) => item.masteryStage)).toBe(true);
    expect(result.proposal.items.every((item) => item.completionCriteria)).toBe(true);
    expect(result.review.critic).toBe("PASSED");
    expect(result.calls).toBeLessThanOrEqual(MASTERY_PROVIDER_CALL_BUDGET);
  });

  it("keeps the provider call budget bounded when every attempt is unusable", async () => {
    const generateResponse = vi.fn().mockResolvedValue({ text: "{}" });
    const adapter = vi.fn((provider: string) => {
      void provider;
      return { generateResponse };
    });
    await expect(
      generateMastery(
        masteryFixture(),
        masteryAvailability(),
        new AbortController().signal,
        { adapter: adapter as never }
      )
    ).rejects.toMatchObject({ code: "MASTERY_GENERATION_FAILED" });
    expect(adapter.mock.calls.map((call) => call[0])).toEqual([
      "deepseek",
      "deepseek",
      "gemini",
    ]);
  });

  it("rejects a stage-ordered-but-invalid plan rather than repairing the progression itself", async () => {
    const invalid = variant((proposal) => {
      proposal.items = proposal.items.filter(
        (item) => item.masteryStage !== "MASTERY_CHECK"
      );
    });
    const generateResponse = vi.fn().mockResolvedValue(jsonOf(invalid));
    await expect(
      generateMastery(
        masteryFixture(),
        masteryAvailability(),
        new AbortController().signal,
        { adapter: () => ({ generateResponse }) }
      )
    ).rejects.toMatchObject({ code: "MASTERY_GENERATION_FAILED" });
  });

  it("patches only the flagged items and never a neighbouring unit's stage", async () => {
    const proposal = masteryProposal() as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    const target = proposal.items.find((item) => item.masteryStage === "PRACTICE")!;
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: [target.ref],
            severity: "MEDIUM",
            patchInstruction: "Say what finishing this practice looks like.",
          },
        ],
      })
    );
    const repair = vi.fn().mockResolvedValue(
      // Exactly the strict patch shape the repair prompt asks for: no extra keys.
      jsonOf({
        schemaVersion: 1,
        items: [
          {
            ref: target.ref,
            topicRef: target.topicRef,
            relatedTopicRefs: target.relatedTopicRefs ?? [],
            type: target.type,
            masteryStage: target.masteryStage,
            title: target.title,
            description: target.description,
            rationale: target.rationale,
            completionCriteria:
              "Complete one bounded practice set, then review every incorrect step.",
            date: target.date,
            minutes: target.minutes,
            dependsOn: target.dependsOn,
          },
        ],
      })
    );
    const result = await generateMastery(
      masteryFixture(),
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)),
        }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
    expect(
      result.proposal.items.find((item) => item.ref === target.ref)
        ?.completionCriteria
    ).toBe(
      "Complete one bounded practice set, then review every incorrect step."
    );
    // Nothing else moved.
    for (const item of proposal.items)
      if (item.ref !== target.ref)
        expect(result.proposal.items.find((entry) => entry.ref === item.ref)).toEqual(
          item
        );
  });

  it("fails safe when the critic returns something malformed", async () => {
    const proposal = masteryProposal() as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    const generateResponse = vi.fn().mockResolvedValue(jsonOf(proposal));
    const critic = vi.fn().mockResolvedValue(jsonOf({ nonsense: true }));
    const repair = vi.fn();
    const result = await generateMastery(
      masteryFixture(),
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    // A critic that cannot be trusted is discarded, not retried into a rewrite.
    expect(repair).not.toHaveBeenCalled();
    expect(result.review.repaired).toBe(0);
    expect(result.proposal.items).toEqual(proposal.items);
    expect(result.calls).toBeLessThanOrEqual(MASTERY_PROVIDER_CALL_BUDGET);
  });

  it("never repairs an item that does not exist in the plan", async () => {
    const proposal = masteryProposal() as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: ["i99"],
            severity: "MEDIUM",
            patchInstruction: "Make the referenced item concrete.",
          },
        ],
      })
    );
    const repair = vi.fn();
    const result = await generateMastery(
      masteryFixture(),
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)),
        }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    expect(repair).not.toHaveBeenCalled();
    expect(result.proposal.items).toEqual(proposal.items);
  });

  it("rejects a repair that moves an item to another unit, keeping the plan", async () => {
    const proposal = masteryProposal() as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    const target = proposal.items.find((item) => item.masteryStage === "PRACTICE")!;
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: [target.ref],
            severity: "MEDIUM",
            patchInstruction: "Say what finishing this practice looks like.",
          },
        ],
      })
    );
    const repair = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        items: [{ ...target, topicRef: "t2", description: "Rewritten work." }],
      })
    );
    const result = await generateMastery(
      masteryFixture(),
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)),
        }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    expect(repair).toHaveBeenCalledTimes(1);
    // The repair is discarded whole: the plan is exactly the validated one.
    expect(result.proposal.items).toEqual(proposal.items);
    expect(result.review.repaired).toBe(0);
  });

  it("rejects a repair that would break a HARD session limit", async () => {
    const input = masteryInput(
      UserInputV1Schema.parse({
        ...masteryFixture(),
        constraints: [
          {
            kind: "MAX_SESSION_MINUTES",
            strength: "HARD",
            value: 60,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    const proposal = masteryProposal(input) as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    expect(proposal.items.every((item) => item.minutes <= 60)).toBe(true);
    expect(() =>
      validateMasteryProposal(input, proposal, masteryAvailability())
    ).not.toThrow();
    const target = proposal.items.find((item) => item.masteryStage === "PRACTICE")!;
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: [target.ref],
            severity: "MEDIUM",
            patchInstruction: "Give this practice a concrete output.",
          },
        ],
      })
    );
    const repair = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        items: [
          {
            ...target,
            minutes: 90,
            completionCriteria:
              "Complete one bounded practice set, then review every incorrect step.",
          },
        ],
      })
    );
    const result = await generateMastery(
      input,
      masteryAvailability(),
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)),
        }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repair }),
        },
      }
    );
    expect(result.proposal.items.every((item) => item.minutes <= 60)).toBe(true);
    expect(result.review.repaired).toBe(0);
  });

  it("keeps a mastery telemetry check bound to the closed vocabulary", () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      plannerTelemetry("mastery_check_completed", {
        mode: "MASTERY",
        planId: "11111111-1111-4111-8111-111111111111",
        items: 16,
      });
      const [tag, payload] = logged.mock.calls.at(-1) as [string, Record<string, unknown>];
      expect(tag).toBe("[planner]");
      expect(payload).toMatchObject({
        event: "mastery_check_completed",
        mode: "MASTERY",
        planId: "11111111-1111-4111-8111-111111111111",
        items: 16,
      });
      expect(JSON.stringify(payload)).not.toMatch(/[A-Za-z]{4,} [A-Za-z]{4,}/);
    } finally {
      logged.mockRestore();
    }
  });

  it("keeps mastery telemetry content-free", () => {
    const logged = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      plannerTelemetry("mastery_generation_completed", {
        mode: "MASTERY",
        masteryDepth: "SOLID",
        checkPreference: "MIXED_PRACTICE",
        items: 12,
        topics: 3,
      });
      const [tag, payload] = logged.mock.calls.at(-1) as [string, Record<string, unknown>];
      expect(tag).toBe("[planner]");
      expect(payload.mode).toBe("MASTERY");
      expect(payload.masteryDepth).toBe("SOLID");
      expect(Object.keys(payload).sort()).toEqual(
        ["checkPreference", "event", "items", "masteryDepth", "mode", "schemaVersion", "topics"].sort()
      );
      // No unit labels, titles, criteria or check contents can cross this boundary.
      expect(JSON.stringify(payload)).not.toMatch(/circular|chapter|unit/i);
    } finally {
      logged.mockRestore();
    }
  });
});

describe("Mastery capacity, policy boundaries and measurements", () => {
  it("treats a soft preference as an explanation, never as infeasibility", () => {
    const input = masteryInput(
      UserInputV1Schema.parse({
        ...masteryFixture(),
        constraints: [
          {
            kind: "SESSION_LENGTH_PREFERENCE",
            strength: "SOFT",
            value: 15,
            preferenceWeight: 3,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    const proposal = masteryProposal(input);
    // Sessions exceed the stated preference, and the plan is still valid.
    expect(proposal.items.some((item) => item.minutes > 15)).toBe(true);
    expect(() =>
      validateMasteryProposal(input, proposal, masteryAvailability())
    ).not.toThrow();
    expect(masteryFeasibility(input, masteryAvailability()).status).toBe(
      "POTENTIAL_FIT"
    );
    expect(softConstraintViolations(input, proposal.items).length).toBeGreaterThan(0);
  });

  it("refuses work on a blocked date or a rest day", () => {
    const blocked = masteryInput(
      UserInputV1Schema.parse({
        ...masteryFixture(),
        availability: {
          ...masteryFixture().availability,
          blockedDates: [masteryProposal().items[0].date],
        },
      })
    );
    // The proposal still plans that date, so the confirmed schedule refuses it.
    const proposal = masteryProposal(masteryFixture());
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(blocked, proposal, masteryAvailability())
      )
    ).toBe("INFEASIBLE_CAPACITY");
    const restDay = new Date(`${proposal.items[0].date}T00:00:00Z`).getUTCDay();
    const state = { ...masteryAvailability(), restDays: [restDay] };
    expect(
      failureCodeOf(() =>
        validateMasteryProposal(masteryFixture(), proposal, state)
      )
    ).toBe("INFEASIBLE_CAPACITY");
  });

  it("replaces a fabricated pass mark with the bounded default criterion", () => {
    const item = masteryProposal().items.at(-1)!;
    const fabricated = {
      ...item,
      completionCriteria: "Score 8/10 to pass the mastery check and be mastered.",
    };
    const resolved = resolveCompletionCriteria(fabricated);
    expect(resolved.source).toBe("DEFAULT");
    expect(resolved.text).not.toMatch(/pass|mastered|\d\s*\/\s*10/i);
    // The stored criterion is the default for the intent, and still tellable.
    expect(completionCriteriaIssue(resolved.text, fabricated)).toBeNull();
    // A threshold the user never supplied can never reach a Quest either.
    expect(completionCriteriaIssue(fabricated.completionCriteria, fabricated)).not.toBeNull();
    const draft = normalizeProposal(masteryFixture(), masteryProposal());
    expect(
      draft.items.every(
        (entry) =>
          !/pass mark|% to pass|score \d/i.test(entry.completionCriteria ?? "")
      )
    ).toBe(true);
  });

  it("keeps the three modes' input contracts separate", () => {
    const mastery = masteryFixture();
    // A mastery input cannot smuggle exam or roadmap metadata, or vice versa.
    expect(
      UserInputV1Schema.safeParse({ ...mastery, exam: { subjectName: "x" } }).success
    ).toBe(false);
    expect(
      UserInputV1Schema.safeParse({ ...mastery, roadmap: { subjectName: "x" } }).success
    ).toBe(false);
    expect(
      UserInputV1Schema.safeParse({
        schemaVersion: 1,
        mode: "EXAM",
        title: "T",
        scope: "S",
        startDate: "2030-01-07",
        endDate: "2030-01-28",
        examDate: "2030-01-28",
        availability: mastery.availability,
        mastery: mastery.mastery,
      }).success
    ).toBe(false);
  });

  it("measures the provider payload, the item ceiling and the snapshot it must fit", () => {
    const input = masteryFixture();
    const payloadBytes = new TextEncoder().encode(
      masteryPayload(input, masteryAvailability())
    ).byteLength;
    // A bounded payload: the model is never sent the whole syllabus envelope.
    expect(payloadBytes).toBeGreaterThan(500);
    expect(payloadBytes).toBeLessThan(24_576);

    // Worst-case stored snapshot: the item ceiling with every text field at its bound.
    const worst = {
      schemaVersion: 1 as const,
      mode: "MASTERY" as const,
      focus: "ü".repeat(200),
      assumptions: [],
      warnings: [],
      topics: Array.from({ length: MASTERY_LIMITS.topics }, (_, index) => ({
        key: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        title: "ü".repeat(200),
        parentKey: null,
        scopeRef: `t${index + 1}`,
      })),
      milestones: [],
      items: Array.from({ length: MASTERY_LIMITS.items }, (_, index) => ({
        key: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        topicKey: `00000000-0000-4000-8000-${String(index % MASTERY_LIMITS.topics).padStart(12, "0")}`,
        relatedTopicKeys: [],
        milestoneKey: null,
        dependsOn: [],
        type: "PRACTICE" as const,
        masteryStage: "PRACTICE" as const,
        title: "ü".repeat(200),
        description: "ü".repeat(2000),
        rationale: "ü".repeat(500),
        completionCriteria: "ü".repeat(240),
        date: "2030-01-07",
        minutes: 240,
      })),
    };
    const snapshotBytes = new TextEncoder().encode(JSON.stringify(worst)).byteLength;
    // The Phase 1 database bound for a stored snapshot is 512 KiB.
    expect(snapshotBytes).toBeLessThan(524_288);
    expect(worst.items).toHaveLength(MASTERY_LIMITS.items);
    // And a maximum-scope input still fits the mode's own envelope.
    expect(
      masteryInputBytes({
        ...input,
        scope: Array.from({ length: MASTERY_LIMITS.topics }, (_, index) =>
          "ü".repeat(198) + String(index).padStart(2, "0")
        ).join("\n"),
      })
    ).toBeLessThan(MASTERY_LIMITS.inputBytes);
  });
});

describe("Mastery stages are a real progression", () => {
  it("labels every stage and orders them for review", () => {
    expect(MASTERY_STAGE_ORDER).toEqual([
      "UNDERSTAND",
      "LEARN",
      "ACTIVE_RECALL",
      "PRACTICE",
      "REVIEW_MISTAKES",
      "MASTERY_CHECK",
    ]);
    for (const stage of MASTERY_STAGE_ORDER)
      expect(MASTERY_STAGE_LABEL[stage].length).toBeGreaterThan(2);
  });

  it("uses the existing ASSESS intent for the check and invents no new one", () => {
    expect(MASTERY_STAGE_INTENTS.MASTERY_CHECK).toEqual(["ASSESS"]);
    for (const stage of MASTERY_STAGE_ORDER)
      for (const intent of MASTERY_STAGE_INTENTS[stage])
        expect([
          "LEARN",
          "REVIEW",
          "RECALL",
          "PRACTICE",
          "TIMED_PRACTICE",
          "MISTAKE_REVIEW",
          "ASSESS",
        ]).toContain(intent);
    const parsed = ModelProposalV1Schema.safeParse({
      ...(masteryProposal() as object),
    });
    expect(parsed.success).toBe(true);
  });

  it("never schedules re-learning for a chapter that is already secure", () => {
    const input = secureMasteryFixture();
    const proposal = masteryProposal(input) as Extract<
      ModelProposalV1,
      { mode: "MASTERY" }
    >;
    expect(
      proposal.items.some((item) => item.masteryStage === "LEARN")
    ).toBe(false);
    expect(
      proposal.items.some((item) => (item as { stage?: string }).stage)
    ).toBe(false);
    expect(stageOf(proposal, proposal.items.length - 1)).toBe("MASTERY_CHECK");
  });
});
