import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateDraft, type ValidatedDraftV1 } from "@/lib/planner/contracts";
import { normalizeExpansion, normalizeProposal } from "@/lib/planner/server/core";
import { expansionScope } from "@/lib/planner/expansion-policy";
import { roadmapInput } from "@/lib/planner/roadmap-policy";
import { evaluateCase, evaluateCorpus } from "@/lib/planner/quality/evaluate";
import {
  churnMetric,
  evaluateDraft,
  METRIC_NAMES,
  QUALITY_ISSUE_CODES,
  type QualityContext,
} from "@/lib/planner/quality/metrics";
import {
  PLANNER_QUALITY_CORPUS,
  examProposalFor,
  type CorpusCase,
} from "@/lib/planner/quality/corpus";
import { examFixture } from "./exam-fixtures";
import { roadmapFixture, roadmapProposal } from "./roadmap-fixtures";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.resolve(root, relative), "utf8");

/** Topic labels across the corpus — the academic content that must never leave the process. */
function corpusLabels(): string[] {
  const labels: string[] = [];
  for (const caseDef of PLANNER_QUALITY_CORPUS) {
    const input = caseDef.input;
    if (input.mode === "EXAM" && input.exam) labels.push(...input.exam.topics.map((topic) => topic.label));
    if (input.mode === "MASTERY" && input.mastery) labels.push(...input.mastery.topics.map((topic) => topic.label));
    if (input.mode === "ROADMAP" && input.roadmap) labels.push(...input.roadmap.topics.map((topic) => topic.label));
  }
  return labels;
}

describe("quality corpus is bounded and synthetic", () => {
  it("stays inside the shared envelope limits", () => {
    expect(PLANNER_QUALITY_CORPUS.length).toBeGreaterThanOrEqual(20);
    for (const caseDef of PLANNER_QUALITY_CORPUS) {
      expect(caseDef.id).toMatch(/^[a-z0-9-]+$/);
      expect(["PLAN", "EXPANSION", "REPLAN"]).toContain(caseDef.kind);
      const proposal = caseDef.proposal ?? caseDef.expansion?.parentProposal;
      if (proposal) {
        expect(proposal.items.length).toBeLessThanOrEqual(60);
        expect(proposal.topics.length).toBeLessThanOrEqual(50);
      }
      if (caseDef.expansion) {
        expect(caseDef.expansion.items.length).toBeLessThanOrEqual(60);
        expect(caseDef.expansion.parentProposal.topics.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("corpus and metrics are client-safe and contain no provider/db/clock imports", () => {
    for (const file of ["lib/planner/quality/corpus.ts", "lib/planner/quality/metrics.ts"]) {
      const text = read(file);
      expect(text).not.toMatch(/@prisma|server-only|next\/|node:crypto|ai\/providers|ai\/orchestrator|@\/lib\/prisma/);
      expect(text).not.toMatch(/Math\.random|Date\.now|localToday|new Date\(/);
    }
  });
});

describe("every corpus case has a specific, explainable outcome", () => {
  const result = evaluateCorpus();

  it("has exactly one intentionally-invalid case and a specific code for it", () => {
    expect(result.aggregate.cases).toBe(PLANNER_QUALITY_CORPUS.length);
    expect(result.aggregate.valid).toBe(PLANNER_QUALITY_CORPUS.length - 1);
    expect(result.aggregate.invalid).toBe(1);
    const invalid = result.records.filter((record) => !record.valid);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ id: "exam-missing-final-review", valid: false, validationCode: "MISSING_FINAL_REVIEW" });
    expect(invalid[0].metrics).toEqual({});
    expect(invalid[0].issues).toEqual([]);
  });

  it("validates every other case and reports a content-free record", () => {
    const expectedInvalid = new Set(["exam-missing-final-review"]);
    for (const record of result.records) {
      if (expectedInvalid.has(record.id)) continue;
      expect(record.valid, record.id).toBe(true);
      expect(record.validationCode, record.id).toBeUndefined();
      for (const name of METRIC_NAMES) {
        const metric = record.metrics[name];
        expect(metric, `${record.id}:${name}`).toBeTruthy();
        expect(metric!.score).toBeGreaterThanOrEqual(0);
        expect(metric!.score).toBeLessThanOrEqual(1);
      }
      for (const issue of record.issues)
        expect(QUALITY_ISSUE_CODES).toContain(issue.code);
    }
  });

  it("groups the aggregate by mode", () => {
    expect(result.aggregate.byMode).toEqual({
      EXAM: { cases: 9, valid: 8, invalid: 1 },
      ROADMAP: { cases: 7, valid: 7, invalid: 0 },
      MASTERY: { cases: 7, valid: 7, invalid: 0 },
    });
  });

  it("flags only the overloaded-availability case as a workload spike", () => {
    const overloaded = result.records.find((record) => record.id === "exam-overloaded")!;
    expect(overloaded.valid).toBe(true);
    expect(overloaded.issues.map((issue) => issue.code)).toContain("QUALITY_WORKLOAD_SPIKE");
    expect(overloaded.metrics.workload!.score).toBeLessThan(1);
    const clean = result.records.filter((record) => record.id !== "exam-overloaded" && record.valid);
    for (const record of clean)
      expect(record.issues.map((issue) => issue.code)).not.toContain("QUALITY_WORKLOAD_SPIKE");
  });
});

describe("metrics are deterministic and bounded", () => {
  it("produces byte-identical results across two runs", () => {
    expect(evaluateCorpus()).toEqual(evaluateCorpus());
  });

  it("reports churn counts for replans only", () => {
    const result = evaluateCorpus();
    for (const record of result.records) {
      if (!record.valid) continue; // invalid cases carry no metrics
      if (record.kind === "REPLAN" || record.id === "replan-expanded-period-revision") {
        expect(record.metrics.churn!.applicable).toBe(true);
        const counts = record.metrics.churn!.counts;
        expect(counts.retained + counts.moved + counts.replaced + counts.removed + counts.added).toBeGreaterThan(0);
      } else {
        expect(record.metrics.churn!.applicable, record.id).toBe(false);
      }
    }
  });
});

describe("A2/A3 dimensions on known-good and known-bad fixtures", () => {
  it("scores a known-good mastery plan as clean", () => {
    const input = masteryFixture();
    const draft = normalizeProposal(input, masteryProposal(input));
    const report = evaluateDraft({ input, draft });
    expect(report.issues).toEqual([]);
    expect(report.metrics.concrete.score).toBe(1);
    expect(report.metrics.retrieval.score).toBe(1);
    expect(report.metrics.coreStretch.score).toBe(1);
  });

  it("flags a vague task without failing validation", () => {
    const input = examFixture();
    const proposal = examProposalFor(input);
    const vague = { ...proposal, items: proposal.items.map((item) => ({ ...item, description: "Study" })) };
    const draft = normalizeProposal(input, vague); // MEDIUM semantic finding, not fatal
    const report = evaluateDraft({ input, draft });
    expect(report.metrics.concrete.issues.map((issue) => issue.code)).toContain("QUALITY_VAGUE_TASK");
    expect(report.metrics.concrete.score).toBeLessThan(1);
  });

  it("flags a workload spike from over-capacity days", () => {
    const base = examFixture();
    const tiny = { ...base, availability: { ...base.availability, dailyMinutes: [15, 15, 15, 15, 15, 15, 15] } };
    const draft = normalizeProposal(tiny, examProposalFor(base));
    const report = evaluateDraft({ input: tiny, draft });
    expect(report.metrics.workload.issues.map((issue) => issue.code)).toContain("QUALITY_WORKLOAD_SPIKE");
  });

  it("flags missing retrieval and practice in a LEARN-only expansion", () => {
    const input = roadmapFixture();
    const parent = normalizeProposal(input, roadmapProposal(input));
    if (parent.mode !== "ROADMAP") throw new Error("roadmap expected");
    const scope = expansionScope(parent, parent.milestones[0].key, roadmapInput(input));
    const items = scope.topics.map((topic, index) => ({
      ref: `i${index + 1}`,
      topicRef: topic.ref,
      relatedTopicRefs: [],
      type: "LEARN" as const,
      title: `Learn ${topic.ref}`,
      description: "Work through the planned material and record what you completed.",
      rationale: "First pass over the unit.",
      completionCriteria: "Complete the planned reading and note open questions.",
      date: scope.period.startDate,
      minutes: 30,
      dependsOn: [],
    }));
    const draft = normalizeExpansion(roadmapInput(input), parent, scope, items);
    const report = evaluateDraft({ input, draft });
    expect(report.metrics.retrieval.issues.map((issue) => issue.code)).toContain("QUALITY_MISSING_RETRIEVAL");
    expect(report.metrics.retrieval.issues.map((issue) => issue.code)).toContain("QUALITY_MISSING_PRACTICE");
  });

  it("detects a Stretch item that hides required work", () => {
    const input = masteryFixture();
    const draft = normalizeProposal(input, masteryProposal(input));
    const secureRef = "t3";
    const bad = {
      ...draft,
      items: draft.items.map((item) => {
        const ref = draft.topics.find((topic) => topic.key === item.topicKey)?.scopeRef;
        return ref === secureRef && item.type === "PRACTICE" ? { ...item, role: "STRETCH" as const } : item;
      }),
    } as ValidatedDraftV1;
    // Validation refuses it (the CORE subset can no longer stand alone)…
    expect(() => validateDraft(input, bad)).toThrow("STRETCH_NOT_OPTIONAL");
    // …and the evaluative metric names the same fact, without ever running validation.
    const report = evaluateDraft({ input, draft: bad } satisfies QualityContext);
    expect(report.metrics.coreStretch.score).toBe(0);
    expect(report.metrics.coreStretch.issues.map((issue) => issue.code)).toContain("QUALITY_STRETCH_HIDES_CORE");
  });

  it("flags a high-churn replan and rewards a low-churn one", () => {
    const low = churnMetric(
      [
        { topic: "t1", intent: "LEARN", date: "2030-01-07", minutes: 45 },
        { topic: "t1", intent: "RECALL", date: "2030-01-08", minutes: 15 },
      ],
      [
        { topic: "t1", intent: "LEARN", date: "2030-01-07", minutes: 45 },
        { topic: "t1", intent: "RECALL", date: "2030-01-09", minutes: 15 },
      ]
    );
    expect(low.issues.map((issue) => issue.code)).not.toContain("QUALITY_CHURN_HIGH");
    expect(low.counts.retained).toBe(1);

    const high = churnMetric(
      [
        { topic: "t1", intent: "LEARN", date: "2030-01-07", minutes: 45 },
        { topic: "t1", intent: "RECALL", date: "2030-01-08", minutes: 15 },
      ],
      [
        { topic: "t2", intent: "PRACTICE", date: "2030-01-20", minutes: 45 },
        { topic: "t2", intent: "MISTAKE_REVIEW", date: "2030-01-21", minutes: 15 },
      ]
    );
    expect(high.issues.map((issue) => issue.code)).toContain("QUALITY_CHURN_HIGH");
    expect(high.score).toBeLessThan(0.5);
  });
});

describe("quality findings can never make a valid plan invalid", () => {
  it("leaves a validated plan valid even when findings are present", () => {
    const caseDef = PLANNER_QUALITY_CORPUS.find((entry) => entry.id === "exam-overloaded") as CorpusCase;
    const proposal = caseDef.proposal ?? examProposalFor(caseDef.input);
    // Validating twice, with the metrics computed in between, proves findings are additive.
    const first = normalizeProposal(caseDef.input, proposal);
    const report = evaluateDraft({ input: caseDef.input, draft: first });
    expect(report.issues).not.toEqual([]);
    expect(() => normalizeProposal(caseDef.input, proposal)).not.toThrow();
  });

  it("evaluateCase reports valid:true alongside findings, never a downgrade", () => {
    const record = evaluateCase(PLANNER_QUALITY_CORPUS.find((entry) => entry.id === "exam-overloaded")!);
    expect(record.valid).toBe(true);
    expect(record.issues.length).toBeGreaterThan(0);
  });
});

describe("no academic content leaves the process", () => {
  it("the serialized records contain no topic labels, titles or descriptions", () => {
    const { records, aggregate } = evaluateCorpus();
    const serialized = JSON.stringify({ records, aggregate });
    for (const label of corpusLabels()) expect(serialized).not.toContain(label);
    expect(serialized).not.toMatch(/"(title|description|completionCriteria|rationale|outcome|scope)"/);
  });

  it("issue refs are only scope tokens or dates, never free text", () => {
    const result = evaluateCorpus();
    for (const record of result.records)
      for (const issue of record.issues)
        for (const ref of issue.refs) expect(ref).toMatch(/^(t[0-9]+|\d{4}-\d{2}-\d{2})$/);
  });
});
