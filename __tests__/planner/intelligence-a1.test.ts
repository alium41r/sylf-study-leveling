import { describe, expect, it } from "vitest";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import {
  constraintCapacityInput,
  examFeasibility,
  examInput,
  topicMinutes,
  topicPracticeFloor,
  priorityTradeoffNotes,
  validateExamProposal,
  type ExamInput,
} from "@/lib/planner/exam-policy";
import { validateCapacity } from "@/lib/planner/capacity";
import {
  PlannerConstraintsSchema,
  hardSessionLimit,
  softConstraintStatus,
  softConstraintViolations,
  tradeoffExplanations,
  unavailableWeekdays,
  validateHardConstraints,
} from "@/lib/planner/constraints";
import {
  PRIORITY_WORK_FACTOR,
  priorityLevel,
} from "@/lib/planner/priority";
import {
  DEFAULT_COMPLETION_CRITERIA,
  completionCriteriaIssue,
  resolveCompletionCriteria,
} from "@/lib/planner/done";
import {
  deterministicSemanticIssues,
  fatalSemanticIssues,
} from "@/lib/planner/semantic";
import {
  SMART_ANSWER_OPTIONS,
  SMART_QUESTION_MAX,
  applySmartAnswers,
  smartQuestions,
  smartSetupSummary,
} from "@/lib/planner/smart-setup";
import { PlannerQuestionReasonSchema } from "@/lib/planner/constraints";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";

/** The Phase 2 fixture with an edited topic list and matching confirmed scope. */
function fixtureWith(topics: ExamInput["exam"]["topics"]): ExamInput {
  const input = examFixture();
  input.exam.topics = topics;
  input.scope = topics.map((topic) => topic.label).join("\n");
  return input;
}
const topic = (
  label: string,
  overrides: Partial<ExamInput["exam"]["topics"][number]> = {}
) => ({
  label,
  covered: false,
  confidence: 2,
  difficult: false,
  ...overrides,
});
/** Patch individual topics of the Phase 2 fixture without changing its scope. */
function patchTopics(
  changes: Record<number, Partial<ExamInput["exam"]["topics"][number]>>
): ExamInput {
  const input = examFixture();
  input.exam.topics = input.exam.topics.map((existing, index) => ({
    ...existing,
    ...(changes[index] ?? {}),
  }));
  input.scope = input.exam.topics.map((entry) => entry.label).join("\n");
  return input;
}
/** A tight horizon where the prioritisation determinant is genuinely unclear. */
function tightFixture(): ExamInput {
  const input = examFixture();
  input.endDate = input.examDate = "2030-01-16";
  input.availability.dailyMinutes = [45, 45, 45, 45, 45, 45, 45];
  return input;
}
/** A scope label too broad to size without one clarifying answer. */
function broadFixture(): ExamInput {
  const input = examFixture();
  input.exam.topics = [
    topic("Unit 3: Waves and oscillations, all sections", { covered: true }),
    examFixture().exam.topics[1],
    examFixture().exam.topics[2],
  ];
  input.scope = input.exam.topics.map((entry) => entry.label).join("\n");
  return input;
}

describe("Smart Plan Setup asks only questions that change the plan", () => {
  it("asks nothing when the plan is already determined", () => {
    // Phase 2 fixture: spacious capacity, three separable topics, explicit grid.
    expect(smartQuestions(examFixture())).toEqual([]);
    // Explicit priorities also answer the prioritisation uncertainty.
    const decided = fixtureWith([
      topic("Cells", { priority: "HIGH", prioritySource: "USER_EXPLICIT" }),
      topic("Enzymes", { covered: true }),
      topic("Transport", { covered: true, confidence: 5 }),
    ]);
    expect(smartQuestions(decided)).toEqual([]);
  });

  it("asks exactly one meaningful question when capacity pressures prioritisation", () => {
    const questions = smartQuestions(tightFixture());
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      reasonCode: "PRIORITY_UNCLEAR",
      dimension: "PRIORITIZATION",
      kind: "SINGLE_CHOICE",
      allowSkip: true,
    });
    expect(questions[0].whyItMatters.length).toBeGreaterThan(20);
    expect(questions[0].options.length).toBeGreaterThan(1);
  });

  it("never exceeds the bounded maximum, and every question is closed-choice with a reason code", () => {
    const input = broadFixture();
    // A short, uniform, tight horizon makes three determinants genuinely unclear.
    input.exam.topics[1] = { ...input.exam.topics[1], difficult: true };
    input.scope = input.exam.topics.map((entry) => entry.label).join("\n");
    input.endDate = input.examDate = "2030-01-13";
    input.availability.dailyMinutes = [60, 60, 60, 60, 60, 60, 60];
    input.exam.preferredMinutes = 15;
    input.exam.mockMinutes = null;
    const questions = smartQuestions(input);
    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions.length).toBeLessThanOrEqual(SMART_QUESTION_MAX);
    expect(smartQuestions(input, 99)).toHaveLength(SMART_QUESTION_MAX);
    expect(new Set(questions.map((q) => q.reasonCode)).size).toBe(
      questions.length
    );
    for (const question of questions) {
      expect(
        PlannerQuestionReasonSchema.safeParse(question.reasonCode).success
      ).toBe(true);
      expect(question.dimension).toBeTruthy();
      expect(question.options.length).toBeLessThanOrEqual(12);
      expect(question.options.every((option) => option.value && option.label)).toBe(
        true
      );
    }
  });

  it("rejects an unsupported or arbitrary question and a bogus option", () => {
    const input = tightFixture();
    expect(() =>
      applySmartAnswers(input, [{ reasonCode: "WHAT_IS_YOUR_MOOD", value: "x" }])
    ).toThrow("UNSUPPORTED_SMART_QUESTION");
    expect(() =>
      applySmartAnswers(input, [
        { reasonCode: "PRIORITY_UNCLEAR", value: "t99" },
      ])
    ).toThrow("UNSUPPORTED_SMART_ANSWER");
    expect(() =>
      applySmartAnswers(input, [
        { reasonCode: "PRIORITY_UNCLEAR", value: "t1" },
        { reasonCode: "SCOPE_SIZE_UNCLEAR", value: "FULL_SECTION" },
        { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "REQUIRED" },
        { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "EVEN" },
      ])
    ).toThrow("TOO_MANY_SMART_ANSWERS");
    // The catalog is closed in both directions: an unknown reason code and an
    // unknown option are both rejected, so no arbitrary data can be collected.
    expect(() =>
      applySmartAnswers(examFixture(), [
        { reasonCode: "SCOPE_SIZE_UNCLEAR", value: "MAYBE_LARGE" },
      ])
    ).toThrow("UNSUPPORTED_SMART_ANSWER");
    expect(() =>
      applySmartAnswers(examFixture(), [
        { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "EVEN" },
        { reasonCode: "AVAILABILITY_PATTERN_UNCLEAR", value: "FEWER_LONGER" },
      ])
    ).toThrow("DUPLICATE_SMART_ANSWER");
    // Every question the planner can ask comes from that same closed catalog.
    for (const question of smartQuestions(tightFixture()))
      expect(
        SMART_ANSWER_OPTIONS[question.reasonCode] === "TOPICS" ||
          SMART_ANSWER_OPTIONS[question.reasonCode].includes(
            question.options[0].value
          )
      ).toBe(true);
  });

  it("merges answers into the normalized input in a way that changes the affected dimension", () => {
    const input = tightFixture();
    const prioritised = applySmartAnswers(input, [
      { reasonCode: "PRIORITY_UNCLEAR", value: "t1" },
    ]);
    expect(priorityLevel(prioritised.exam.topics[0])).toBe("HIGH");
    expect(prioritised.exam.topics[0].prioritySource).toBe("USER_EXPLICIT");
    expect(topicMinutes(prioritised.exam.topics[0], false)).toBeGreaterThan(
      topicMinutes(input.exam.topics[0], false)
    );
    // Idempotent: re-applying the same answer does not stack constraints.
    const again = applySmartAnswers(prioritised, [
      { reasonCode: "PRIORITY_UNCLEAR", value: "t1" },
    ]);
    expect(again).toEqual(prioritised);
    expect(again.constraints ?? []).toEqual([]);
    // A broad scope label is sized by its own answer.
    const sized = applySmartAnswers(broadFixture(), [
      { reasonCode: "SCOPE_SIZE_UNCLEAR", value: "FULL_SECTION" },
    ]);
    expect(sized.exam.topics[0].sizeSignal).toBe("FULL_SECTION");
    expect(topicMinutes(sized.exam.topics[0], false)).toBeGreaterThan(
      topicMinutes(broadFixture().exam.topics[0], false)
    );
    // Merged answers are schema-valid and usable by every downstream gate.
    expect(UserInputV1Schema.safeParse(prioritised).success).toBe(true);
    expect(UserInputV1Schema.safeParse(sized).success).toBe(true);
    examInput(prioritised);
    examInput(sized);
  });

  it("turns a constraint-strength answer into an explicit HARD or SOFT constraint", () => {
    // A binding preferred length against a short horizon: the question is justified.
    const input = fixtureWith([
      topic("Cells", { difficult: true }),
      topic("Enzymes", { difficult: true }),
    ]);
    input.endDate = input.examDate = "2030-01-11";
    input.availability.dailyMinutes = [30, 30, 30, 30, 30, 30, 30];
    input.exam.mockMinutes = null;
    input.exam.preferredMinutes = 15;
    const asked = smartQuestions(input);
    const about = asked.find(
      (question) => question.reasonCode === "CONSTRAINT_STRENGTH_UNCLEAR"
    );
    expect(about).toBeTruthy();
    const required = applySmartAnswers(input, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "REQUIRED" },
    ]);
    expect(hardSessionLimit(required)).toBe(input.exam.preferredMinutes);
    expect(
      required.constraints?.every(
        (constraint) =>
          constraint.strength === "HARD" &&
          constraint.kind === "MAX_SESSION_MINUTES"
      )
    ).toBe(true);
    const preferred = applySmartAnswers(input, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "PREFERENCE" },
    ]);
    expect(hardSessionLimit(preferred)).toBeNull();
    expect(preferred.constraints?.[0]).toMatchObject({
      kind: "SESSION_LENGTH_PREFERENCE",
      strength: "SOFT",
      value: input.exam.preferredMinutes,
    });
    // Re-answering replaces the constraint instead of stacking a contradiction.
    const flipped = applySmartAnswers(required, [
      { reasonCode: "CONSTRAINT_STRENGTH_UNCLEAR", value: "PREFERENCE" },
    ]);
    expect(flipped.constraints).toHaveLength(1);
    expect(flipped.constraints?.[0].strength).toBe("SOFT");
  });

  it("summarizes A1 inputs without any academic content", () => {
    const input = fixtureWith([
      topic("Cells", { priority: "HIGH", prioritySource: "USER_MUST_COVER" }),
      topic("Enzymes", { covered: true, sizeSignal: "SEVERAL_SUBTOPICS" }),
    ]);
    expect(smartSetupSummary(input)).toEqual({
      answeredReasons: [],
      priorityTopics: 1,
      sizedTopics: 1,
    });
    expect(JSON.stringify(smartSetupSummary(input))).not.toContain("Cells");
  });
});

describe("Hard and soft constraints", () => {
  const items = [
    { key: "a", date: "2030-01-07", minutes: 45 },
    { key: "b", date: "2030-01-08", minutes: 90 },
  ];

  it("never lets a hard constraint be violated", () => {
    const input = fixtureWith([topic("Cells")]);
    input.constraints = [
      {
        kind: "MAX_SESSION_MINUTES",
        strength: "HARD",
        value: 45,
        source: "USER_EXPLICIT",
      },
    ];
    expect(() => validateHardConstraints(input, items)).toThrow(
      "HARD_SESSION_LIMIT_EXCEEDED"
    );
    expect(() => validateHardConstraints(input, [items[0]])).not.toThrow();
    const weekdayInput = fixtureWith([topic("Cells")]);
    weekdayInput.constraints = [
      {
        kind: "UNAVAILABLE_WEEKDAY",
        strength: "HARD",
        value: new Date(Date.parse("2030-01-07T12:00:00Z")).getUTCDay(),
        source: "USER_EXPLICIT",
      },
    ];
    expect(() => validateHardConstraints(weekdayInput, items)).toThrow(
      "HARD_UNAVAILABLE_DAY_USED"
    );
  });

  it("exposes derived availability limits as typed hard constraints", () => {
    const input = fixtureWith([topic("Cells")]);
    input.availability.dailyMinutes = [0, 60, 60, 60, 60, 60, 60];
    expect(unavailableWeekdays(input)).toEqual([0]);
    expect(
      constraintCapacityInput(input).availability.dailyMinutes
    ).toEqual([0, 60, 60, 60, 60, 60, 60]);
    expect(() =>
      validateHardConstraints(input, [
        { key: "a", date: "2030-01-13", minutes: 30 },
      ])
    ).toThrow("HARD_UNAVAILABLE_DAY_USED");
  });

  it("binds strength to kind so a preference can never become a limit", () => {
    expect(
      PlannerConstraintsSchema.safeParse([
        {
          kind: "SESSION_LENGTH_PREFERENCE",
          strength: "HARD",
          value: 45,
          source: "USER_EXPLICIT",
        },
      ]).success
    ).toBe(false);
    expect(
      PlannerConstraintsSchema.safeParse([
        {
          kind: "MAX_SESSION_MINUTES",
          strength: "SOFT",
          value: 45,
          source: "USER_EXPLICIT",
        },
      ]).success
    ).toBe(false);
    // Preference learning is not implemented in this phase.
    expect(
      PlannerConstraintsSchema.safeParse([
        {
          kind: "SESSION_LENGTH_PREFERENCE",
          strength: "SOFT",
          value: 45,
          source: "LEARNED_PREFERENCE",
        },
      ]).success
    ).toBe(false);
    expect(
      PlannerConstraintsSchema.safeParse([
        {
          kind: "MAX_SESSION_MINUTES",
          strength: "HARD",
          value: 45,
          source: "USER_EXPLICIT",
          preferenceWeight: 2,
        },
      ]).success
    ).toBe(false);
  });

  it("influences placement without ever creating a false infeasibility", () => {
    const base = examFixture();
    const proposal = examProposal();
    const baseline = examFeasibility(base, examAvailability());
    const baselineCapacity = validateCapacity(
      constraintCapacityInput(base),
      examAvailability(),
      proposal.items
    ).feasible;
    const soft: ExamInput["constraints"] = [
      {
        kind: "SESSION_LENGTH_PREFERENCE",
        strength: "SOFT",
        value: 15,
        source: "USER_EXPLICIT",
      },
      {
        kind: "EVEN_SPREAD_PREFERENCE",
        strength: "SOFT",
        value: 30,
        source: "USER_EXPLICIT",
      },
      {
        kind: "PREFER_FEWER_DATES",
        strength: "SOFT",
        value: 1,
        source: "USER_EXPLICIT",
      },
    ];
    const withSoft = UserInputV1Schema.parse({ ...base, constraints: soft });
    examInput(withSoft);
    const after = examFeasibility(withSoft, examAvailability());
    expect(after.status).toBe(baseline.status);
    expect(after.availableMinutes).toBe(baseline.availableMinutes);
    expect(
      validateCapacity(
        constraintCapacityInput(withSoft),
        examAvailability(),
        proposal.items
      ).feasible
    ).toBe(baselineCapacity);
    // A soft preference does influence placement: every one of them is reported.
    expect(softConstraintViolations(withSoft, proposal.items)).toHaveLength(3);
    expect(softConstraintStatus(withSoft, proposal.items)).toEqual({
      total: 3,
      satisfied: 0,
      violated: 3,
    });
    expect(() =>
      validateExamProposal(withSoft, proposal, examAvailability())
    ).not.toThrow();
  });

  it("explains a violated soft preference in one concise sentence", () => {
    const input = UserInputV1Schema.parse({
      ...examFixture(),
      constraints: [
        {
          kind: "SESSION_LENGTH_PREFERENCE",
          strength: "SOFT",
          value: 15,
          source: "USER_EXPLICIT",
        },
      ],
    });
    const explanations = tradeoffExplanations(input, examProposal().items);
    expect(explanations).toHaveLength(1);
    expect(explanations[0]).toMatch(/preferred 15 minutes/);
    expect(explanations[0].split(".").filter(Boolean)).toHaveLength(1);
    expect(softConstraintStatus(input, [{ date: "2030-01-07", minutes: 15 }])).toEqual(
      { total: 1, satisfied: 1, violated: 0 }
    );
  });
});

describe("Topic priority signals", () => {
  it("keeps priority independent from confidence", () => {
    const weakHigh = topic("Cells", {
      confidence: 1,
      priority: "HIGH",
      prioritySource: "USER_EXPLICIT",
    });
    const weakNeutral = topic("Cells", { confidence: 1 });
    const strongHigh = topic("Cells", {
      covered: true,
      confidence: 5,
      priority: "HIGH",
      prioritySource: "USER_EXPLICIT",
    });
    expect(topicMinutes(weakHigh, false)).toBeGreaterThan(
      topicMinutes(weakNeutral, false)
    );
    // The multiplier depends on priority alone, never on confidence.
    expect(
      topicMinutes(weakHigh, false) / topicMinutes(weakNeutral, false)
    ).toBeGreaterThan(PRIORITY_WORK_FACTOR.HIGH - 0.05);
    expect(topicMinutes(weakHigh, false)).toBe(
      Math.ceil((105 * PRIORITY_WORK_FACTOR.HIGH) / 15) * 15
    );
    expect(topicMinutes(strongHigh, false)).toBe(
      Math.ceil((45 * PRIORITY_WORK_FACTOR.HIGH) / 15) * 15
    );
  });

  it("gives a high-priority weak topic meaningful allocation and an early start", () => {
    const input = patchTopics({
      0: {
        confidence: 1,
        priority: "HIGH",
        prioritySource: "USER_TEACHER_EMPHASIS",
      },
    });
    const neutral = patchTopics({ 0: { confidence: 1 } });
    // Deeper treatment: a larger coarse work floor than the same topic at NEUTRAL.
    expect(topicMinutes(input.exam.topics[0], false)).toBeGreaterThan(
      topicMinutes(neutral.exam.topics[0], false)
    );
    expect(topicPracticeFloor(input.exam.topics[0], false)).toBeGreaterThan(
      topicPracticeFloor(neutral.exam.topics[0], false)
    );
    // Earlier treatment: the fixture already starts this topic inside the window.
    expect(() =>
      validateExamProposal(input, examProposal(), examAvailability())
    ).not.toThrow();
  });

  it("requires a high-priority weak topic to start inside the priority window", () => {
    const input = patchTopics({
      1: {
        priority: "HIGH",
        prioritySource: "USER_TEACHER_EMPHASIS",
      },
    });
    const proposal = examProposal();
    // A plan that satisfies the larger practice floor for the flagged topic.
    const strengthened = {
      ...proposal,
      items: proposal.items.map((item) =>
        item.ref === "i2"
          ? { ...item, minutes: 45 }
          : item.ref === "i9"
            ? { ...item, minutes: 30 }
            : item
      ),
    };
    expect(() =>
      validateExamProposal(input, strengthened, examAvailability())
    ).not.toThrow();
    // The same plan, with that topic pushed past the first third of the horizon.
    const driftedDates: Record<string, string> = {
      i2: "2030-01-15",
      i5: "2030-01-16",
      i9: "2030-01-17",
    };
    const late = {
      ...strengthened,
      items: strengthened.items.map((item) =>
        driftedDates[item.ref]
          ? { ...item, date: driftedDates[item.ref] }
          : item
      ),
    };
    expect(() => validateExamProposal(input, late, examAvailability())).toThrow(
      "PRIORITY_ORDER"
    );
  });

  it("requires the larger practice floor for a high-priority topic", () => {
    const input = patchTopics({
      0: {
        difficult: true,
        priority: "HIGH",
        prioritySource: "USER_EXPLICIT",
      },
    });
    const proposal = examProposal();
    const floor = topicPracticeFloor(input.exam.topics[0], false);
    const practice = proposal.items
      .filter(
        (item) =>
          item.topicRef === "t1" &&
          ["PRACTICE", "TIMED_PRACTICE", "MISTAKE_REVIEW"].includes(item.type)
      )
      .reduce((sum, item) => sum + item.minutes, 0);
    expect(practice).toBeLessThan(floor);
    expect(() => validateExamProposal(input, proposal, examAvailability())).toThrow(
      "INSUFFICIENT_PRACTICE_ALLOCATION"
    );
  });

  it("does not force relearning for a high-priority topic the student already knows", () => {
    const input = patchTopics({
      0: {
        covered: true,
        confidence: 5,
        priority: "HIGH",
        prioritySource: "USER_ASSESSMENT_WEIGHTING",
      },
    });
    const proposal = examProposal();
    // The only coverage item belongs to the topic the student already knows, so
    // the plan must reinforce it instead of relearning it.
    const relearned = {
      ...proposal,
      items: proposal.items.map((item) =>
        item.type === "LEARN"
          ? { ...item, type: "REVIEW" as const, stage: "CONSOLIDATION" as const }
          : item
      ),
    };
    expect(relearned.items.filter((item) => item.type === "LEARN")).toHaveLength(0);
    expect(() =>
      validateExamProposal(input, relearned, examAvailability())
    ).not.toThrow();
    // A HIGH priority never introduces a relearning requirement.
    const withLearn = {
      ...relearned,
      items: [
        ...relearned.items,
        {
          ref: "i99",
          topicRef: "t1",
          type: "LEARN" as const,
          stage: "COVERAGE" as const,
          title: "Reteach cells",
          description: "Rework the fundamentals",
          rationale: "Deeper treatment",
          date: "2030-01-07",
          minutes: 15,
          relatedTopicRefs: [],
          milestoneRef: null,
          dependsOn: [],
        },
      ],
    };
    expect(() =>
      validateExamProposal(input, withLearn, examAvailability())
    ).toThrow("UNJUSTIFIED_RELEARNING");
  });

  it("cannot invent an official weighting", () => {
    const withoutSource = topic("Cells", { priority: "HIGH" });
    expect(
      UserInputV1Schema.safeParse({
        ...examFixture(),
        scope: "Cells",
        exam: { ...examFixture().exam, topics: [withoutSource] },
      }).success
    ).toBe(false);
    const withSource = topic("Cells", {
      priority: "HIGH",
      prioritySource: "USER_MUST_COVER",
    });
    expect(
      UserInputV1Schema.safeParse({
        ...examFixture(),
        scope: "Cells",
        exam: { ...examFixture().exam, topics: [withSource] },
      }).success
    ).toBe(true);
    // Sylf itself never assigns a level: the default stays neutral.
    expect(priorityLevel(topic("Cells"))).toBe("NEUTRAL");
    expect(priorityTradeoffNotes(examFixture())).toEqual([]);
  });

  it("states the bounded-coverage tradeoff for a low-priority weak topic", () => {
    const input = fixtureWith([
      topic("Cells", { confidence: 1, priority: "LOW", prioritySource: "USER_EXPLICIT" }),
    ]);
    const notes = priorityTradeoffNotes(input);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Cells");
    expect(notes[0]).toContain("bounded coverage");
  });
});

describe("Quest Definition of Done", () => {
  it("accepts every built-in default for its own intent", () => {
    for (const [type, criteria] of Object.entries(DEFAULT_COMPLETION_CRITERIA))
      expect(completionCriteriaIssue(criteria, { type, minutes: 30 })).toBeNull();
  });

  it("bounds length and requires an observable action", () => {
    expect(
      completionCriteriaIssue("Do it", { type: "PRACTICE", minutes: 30 })
    ).toBe("COMPLETION_CRITERIA_LENGTH");
    expect(
      completionCriteriaIssue("x".repeat(260), { type: "PRACTICE", minutes: 30 })
    ).toBe("COMPLETION_CRITERIA_LENGTH");
    expect(
      completionCriteriaIssue(
        "Sit quietly and think about the topic for a while",
        { type: "PRACTICE", minutes: 30 }
      )
    ).toBe("COMPLETION_CRITERIA_NOT_OBSERVABLE");
    expect(
      completionCriteriaIssue("Complete " + "step ".repeat(44), {
        type: "PRACTICE",
        minutes: 30,
      })
    ).toBe("COMPLETION_CRITERIA_TOO_LONG");
  });

  it("rejects a subjective mastery claim and an invented official requirement", () => {
    for (const text of [
      "Fully understand electric fields before moving on",
      "Master this chapter completely, then continue",
      "Be confident about every question type",
    ])
      expect(
        completionCriteriaIssue(text, { type: "LEARN", minutes: 45 })
      ).toBe("COMPLETION_CRITERIA_SUBJECTIVE");
    expect(
      completionCriteriaIssue(
        "Complete 20 questions from the past paper mark scheme",
        { type: "PRACTICE", minutes: 45 }
      )
    ).toBe("COMPLETION_CRITERIA_OFFICIAL_CLAIM");
    expect(
      completionCriteriaIssue("Complete 12 questions and check the answers", {
        type: "PRACTICE",
        minutes: 45,
      })
    ).toBe("COMPLETION_CRITERIA_INVENTED_COUNT");
    expect(
      completionCriteriaIssue("Complete one set within 90 minutes", {
        type: "PRACTICE",
        minutes: 45,
      })
    ).toBe("COMPLETION_CRITERIA_EXCEEDS_DURATION");
    expect(
      completionCriteriaIssue("Complete one set within 45 minutes", {
        type: "PRACTICE",
        minutes: 45,
      })
    ).toBeNull();
  });

  it("falls back to the bounded default so bad text is never surfaced or stored", () => {
    expect(
      resolveCompletionCriteria({
        type: "RECALL",
        minutes: 15,
        completionCriteria: "Fully understand everything",
      })
    ).toEqual({
      text: DEFAULT_COMPLETION_CRITERIA.RECALL,
      source: "DEFAULT",
    });
    expect(
      resolveCompletionCriteria({
        type: "RECALL",
        minutes: 15,
        completionCriteria: "Recall the core points from memory, then check the gaps.",
      }).source
    ).toBe("MODEL");
    expect(
      resolveCompletionCriteria({ type: "UNKNOWN_INTENT", minutes: 30 }).text
    ).toContain("Complete the planned work");
  });
});

describe("Deterministic semantic gate", () => {
  it("reports nothing for the Phase 2 fixture", () => {
    const draft = examProposal();
    const issues = deterministicSemanticIssues({
      topics: draft.topics.map((t) => ({ key: t.ref, title: t.title })),
      items: draft.items.map((i) => ({
        key: i.ref,
        topicKey: i.topicRef,
        type: i.type,
        title: i.title,
        description: i.description,
        date: i.date,
        minutes: i.minutes,
      })),
    });
    expect(issues).toEqual([]);
    expect(fatalSemanticIssues(issues)).toEqual([]);
  });

  it("fails closed on an item that does not say what to do", () => {
    const draft = examProposal();
    const items = draft.items.map((i) => ({
      key: i.ref,
      topicKey: i.topicRef,
      type: i.type,
      title: i.title,
      description: i.ref === "i2" ? "   " : i.description,
      date: i.date,
      minutes: i.minutes,
    }));
    const issues = deterministicSemanticIssues({
      topics: draft.topics.map((t) => ({ key: t.ref, title: t.title })),
      items,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueCode: "TASK_VAGUE",
      severity: "HIGH",
      affectedItemRefs: ["i2"],
    });
    expect(fatalSemanticIssues(issues)).toHaveLength(1);
  });

  it("detects redundant touches, load spikes and robotic wording deterministically", () => {
    const draft = examProposal();
    const topics = draft.topics.map((t) => ({ key: t.ref, title: t.title }));
    const base = draft.items.map((i) => ({
      key: i.ref,
      topicKey: i.topicRef,
      type: i.type,
      title: i.title,
      description: i.description,
      date: i.date,
      minutes: i.minutes,
    }));
    const redundant = deterministicSemanticIssues({
      topics,
      items: [
        ...base,
        {
          key: "i50",
          topicKey: "t2",
          type: "PRACTICE",
          title: "PRACTICE t2 again",
          description: "Another synthetic exercise",
          date: "2030-01-08",
          minutes: 15,
        },
      ],
    });
    expect(redundant.map((issue) => issue.issueCode)).toContain(
      "REDUNDANT_TOUCH"
    );
    const spike = deterministicSemanticIssues({
      topics,
      items: base.map((item) =>
        item.key === "i7" ? { ...item, minutes: 240 } : item
      ),
    });
    expect(spike.map((issue) => issue.issueCode)).toContain("DENSITY_SPIKE");
    const robotic = deterministicSemanticIssues({
      topics,
      items: base.map((item) => ({ ...item, title: "Practice questions today" })),
    });
    expect(robotic.map((issue) => issue.issueCode)).toContain("ROBOTIC_PATTERN");
    // None of these findings is fatal: the AI critic repairs them.
    expect(fatalSemanticIssues(spike)).toEqual([]);
    expect(fatalSemanticIssues(robotic)).toEqual([]);
  });
});
