import { describe, expect, it, vi } from "vitest";
import { examPayload, generateExam } from "@/lib/ai/planner/exam";
import { masteryPayload, generateMastery } from "@/lib/ai/planner/mastery";
import { roadmapPayload, generateRoadmap } from "@/lib/ai/planner/roadmap";
import {
  expansionPayload,
  generateExpansion,
} from "@/lib/ai/planner/expansion";
import {
  SOFT_GUIDANCE_SENTENCE,
  type PlanningContext,
} from "@/lib/ai/planner/context";
import type { RebalanceGenerationArgs } from "@/lib/ai/planner/rebalance";
import { normalizeProposal } from "@/lib/planner/server/core";
import {
  expansionScope,
  validateExpansionItems,
} from "@/lib/planner/expansion-policy";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";
import {
  masteryFixture,
  masteryAvailability,
  masteryProposal,
} from "./mastery-fixtures";
import {
  roadmapFixture,
  roadmapAvailability,
  roadmapProposal,
} from "./roadmap-fixtures";

const jsonOf = (value: unknown) => ({ text: JSON.stringify(value) });

const parsed = (payload: string) => JSON.parse(payload) as Record<string, unknown>;

/** Removes only the planningContext key, so everything else can be compared. */
const stripContext = (payload: string) => {
  const value = parsed(payload);
  delete value.planningContext;
  return value;
};

const preference: PlanningContext = {
  preferences: [{ type: "SESSION_LENGTH", value: "40", source: "OBSERVED" }],
  friction: [],
};

function expansionSetup() {
  const input = roadmapFixture();
  const draft = normalizeProposal(input, roadmapProposal(input));
  if (draft.mode !== "ROADMAP") throw new Error("roadmap draft expected");
  const milestoneKey = draft.milestones[0].key;
  const scope = expansionScope(draft, milestoneKey, input);
  return { input, draft, milestoneKey, scope };
}

describe("planning context is absent when there is nothing to say", () => {
  it("keeps every payload byte-identical with no preferences", () => {
    const { input: expansionInput, scope } = expansionSetup();

    expect(examPayload(examFixture(), examAvailability())).toBe(
      examPayload(examFixture(), examAvailability(), undefined)
    );
    expect(examPayload(examFixture(), examAvailability())).toBe(
      examPayload(examFixture(), examAvailability(), {
        preferences: [],
        friction: [],
      })
    );
    expect(parsed(examPayload(examFixture(), examAvailability()))).not.toHaveProperty(
      "planningContext"
    );

    expect(masteryPayload(masteryFixture(), masteryAvailability())).toBe(
      masteryPayload(masteryFixture(), masteryAvailability(), {
        preferences: [],
        friction: [],
      })
    );
    expect(
      parsed(masteryPayload(masteryFixture(), masteryAvailability()))
    ).not.toHaveProperty("planningContext");

    expect(roadmapPayload(roadmapFixture(), roadmapAvailability())).toBe(
      roadmapPayload(roadmapFixture(), roadmapAvailability(), {
        preferences: [],
        friction: [],
      })
    );
    expect(
      parsed(roadmapPayload(roadmapFixture(), roadmapAvailability()))
    ).not.toHaveProperty("planningContext");

    expect(expansionPayload(expansionInput, scope, roadmapAvailability(), [])).toBe(
      expansionPayload(expansionInput, scope, roadmapAvailability(), [], {
        preferences: [],
        friction: [],
      })
    );
    expect(
      parsed(expansionPayload(expansionInput, scope, roadmapAvailability(), []))
    ).not.toHaveProperty("planningContext");
  });
});

describe("learned preferences reach every generation payload", () => {
  it("includes the preference in exam, mastery, roadmap and expansion payloads", () => {
    const { input: expansionInput, scope } = expansionSetup();
    const expected = [{ type: "SESSION_LENGTH", value: "40", source: "OBSERVED" }];

    expect(
      parsed(examPayload(examFixture(), examAvailability(), preference)).planningContext
    ).toEqual({ preferences: expected, friction: [] });
    expect(
      parsed(masteryPayload(masteryFixture(), masteryAvailability(), preference))
        .planningContext
    ).toEqual({ preferences: expected, friction: [] });
    expect(
      parsed(roadmapPayload(roadmapFixture(), roadmapAvailability(), preference))
        .planningContext
    ).toEqual({ preferences: expected, friction: [] });
    expect(
      parsed(
        expansionPayload(expansionInput, scope, roadmapAvailability(), [], preference)
      ).planningContext
    ).toEqual({ preferences: expected, friction: [] });
  });
});

describe("the system prompt states the SOFT rule", () => {
  it("spells out that a preference never overrides the input, a HARD constraint or a floor", () => {
    expect(SOFT_GUIDANCE_SENTENCE).toContain("never overrides the confirmed input");
    expect(SOFT_GUIDANCE_SENTENCE).toContain("HARD constraint");
    expect(SOFT_GUIDANCE_SENTENCE).toContain("floor");
    expect(SOFT_GUIDANCE_SENTENCE).toContain("infeasible");
  });

  it("is included in every mode's system prompt", async () => {
    const examMock = vi.fn().mockResolvedValue(jsonOf(examProposal()));
    await generateExam(examFixture(), examAvailability(), new AbortController().signal, {
      adapter: () => ({ generateResponse: examMock }),
    });
    expect(examMock.mock.calls[0][1]).toContain(SOFT_GUIDANCE_SENTENCE);

    const masteryMock = vi.fn().mockResolvedValue(jsonOf(masteryProposal()));
    await generateMastery(
      masteryFixture(),
      masteryAvailability(),
      new AbortController().signal,
      { adapter: () => ({ generateResponse: masteryMock }) }
    );
    expect(masteryMock.mock.calls[0][1]).toContain(SOFT_GUIDANCE_SENTENCE);

    const roadmapMock = vi
      .fn()
      .mockResolvedValue(jsonOf(roadmapProposal(roadmapFixture())));
    await generateRoadmap(
      roadmapFixture(),
      roadmapAvailability(),
      new AbortController().signal,
      { adapter: () => ({ generateResponse: roadmapMock }) }
    );
    expect(roadmapMock.mock.calls[0][1]).toContain(SOFT_GUIDANCE_SENTENCE);

    const { input, draft, milestoneKey, scope } = expansionSetup();
    const dates = [
      "2030-01-08",
      "2030-01-09",
      "2030-01-10",
      "2030-01-11",
      "2030-01-12",
      "2030-01-13",
    ];
    const items = scope.topics.map((topic, index) => ({
      ref: `i${index + 1}`,
      topicRef: topic.ref,
      relatedTopicRefs: [],
      type: "LEARN" as const,
      title: `Study ${topic.label}`,
      description: "Work through the planned material for this unit.",
      rationale: "First pass over the unit before practice.",
      completionCriteria: "Complete the planned reading and note open questions.",
      date: dates[index % dates.length],
      minutes: 30,
      dependsOn: index === 0 ? [] : [`i${index}`],
    }));
    const expansionMock = vi.fn().mockResolvedValue(jsonOf({ schemaVersion: 1, items }));
    await generateExpansion(
      input,
      draft,
      milestoneKey,
      roadmapAvailability(),
      [],
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse: expansionMock }),
        validateItems: (value) =>
          validateExpansionItems(input, roadmapAvailability(), scope, value),
        acceptRepair: (value) => value,
      }
    );
    expect(expansionMock.mock.calls[0][1]).toContain(SOFT_GUIDANCE_SENTENCE);
  });
});

describe("a preference can never become a constraint or change the input", () => {
  it("changes nothing but the planningContext block in every payload", () => {
    const exam = examFixture();
    const mastery = masteryFixture();
    const roadmap = roadmapFixture();
    const { input: expansionInput, scope } = expansionSetup();

    expect(stripContext(examPayload(exam, examAvailability(), preference))).toEqual(
      parsed(examPayload(exam, examAvailability()))
    );
    expect(
      stripContext(masteryPayload(mastery, masteryAvailability(), preference))
    ).toEqual(parsed(masteryPayload(mastery, masteryAvailability())));
    expect(
      stripContext(roadmapPayload(roadmap, roadmapAvailability(), preference))
    ).toEqual(parsed(roadmapPayload(roadmap, roadmapAvailability())));
    expect(
      stripContext(
        expansionPayload(expansionInput, scope, roadmapAvailability(), [], preference)
      )
    ).toEqual(parsed(expansionPayload(expansionInput, scope, roadmapAvailability(), [])));

    // The Exam payload carries the confirmed input verbatim, untouched by A3.
    expect(parsed(examPayload(exam, examAvailability(), preference)).input).toEqual(exam);
  });

  it("keeps the confirmed input authoritative when a preference conflicts", () => {
    const constrained = examFixture();
    constrained.constraints = [
      { kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 45, source: "USER_EXPLICIT" },
    ];
    const conflict: PlanningContext = {
      preferences: [{ type: "SESSION_LENGTH", value: "240", source: "OBSERVED" }],
      friction: [],
    };
    const payload = parsed(
      examPayload(constrained, examAvailability(), conflict)
    ) as {
      input: { constraints?: { kind: string; strength: string; value: number }[] };
      planningContext: { preferences: { type: string; value: string }[] };
    };
    // The HARD limit survives unchanged: the input wins over the preference.
    expect(payload.input.constraints).toEqual([
      { kind: "MAX_SESSION_MINUTES", strength: "HARD", value: 45, source: "USER_EXPLICIT" },
    ]);
    // The preference stays in planningContext only, never merged into a constraint.
    expect(payload.planningContext.preferences).toEqual([
      { type: "SESSION_LENGTH", value: "240", source: "OBSERVED" },
    ]);
    expect(payload.input.constraints).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "SESSION_LENGTH_PREFERENCE" }),
      ])
    );
  });
});

describe("one shared context shape", () => {
  it("is the same type the replan path uses", () => {
    type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const sameShape: Equal<
      NonNullable<RebalanceGenerationArgs["planningContext"]>,
      PlanningContext
    > = true;
    expect(sameShape).toBe(true);
  });
});
