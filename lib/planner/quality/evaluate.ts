/**
 * The Phase 6 evaluation runner.
 *
 * For each corpus case it normalizes the proposal through the production server
 * normalizers, runs the production validators, and — only when the draft validated —
 * computes the deterministic quality metrics. A case therefore reports `valid: false`
 * with its exact validation code, or `valid: true` with a content-free metrics report.
 *
 * Deterministic by construction: the same corpus yields the same record, because the
 * metrics never emit durable keys, titles, descriptions, or anything produced by the
 * normalizers' key minting — only scope refs (`tN`), dates, closed issue codes and
 * counts. No provider, no database and no clock are touched.
 *
 * This module imports `server/core.ts` for the normalizers, so it is server-side by
 * transitivity; the corpus and the metrics remain client-safe.
 */
import { normalizeExpansion, normalizeProposal } from "../server/core";
import { expansionScope } from "../expansion-policy";
import { roadmapInput } from "../roadmap-policy";
import { PlannerError, PlannerValidationError } from "../errors";
import type { ValidatedDraftV1 } from "../contracts";
import {
  evaluateDraft,
  METRIC_NAMES,
  type MetricName,
  type MetricResult,
  type QualityIssue,
} from "./metrics";
import {
  PLANNER_QUALITY_CORPUS,
  resolveCorpusProposal,
  type CorpusCase,
} from "./corpus";

export interface CaseRecord {
  id: string;
  mode: string;
  kind: string;
  situation: string;
  valid: boolean;
  validationCode?: string;
  metrics: Partial<Record<MetricName, MetricResult>>;
  issues: QualityIssue[];
  counts: Record<string, number>;
}

export interface CorpusAggregate {
  cases: number;
  valid: number;
  invalid: number;
  byMode: Record<string, { cases: number; valid: number; invalid: number }>;
  metricAverages: Partial<Record<MetricName, number>>;
  topIssues: { code: string; count: number }[];
}

export interface CorpusResult {
  records: CaseRecord[];
  aggregate: CorpusAggregate;
}

function validationCodeOf(error: unknown): string {
  if (error instanceof PlannerValidationError) return error.message;
  if (error instanceof PlannerError) return error.code;
  if (error instanceof Error) return error.message;
  return "UNKNOWN";
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function buildRecord(
  caseDef: CorpusCase,
  draft: ValidatedDraftV1,
  base?: ValidatedDraftV1
): CaseRecord {
  const report = evaluateDraft({ input: caseDef.input, draft, base });
  return {
    id: caseDef.id,
    mode: caseDef.mode,
    kind: caseDef.kind,
    situation: caseDef.situation,
    valid: true,
    metrics: report.metrics,
    issues: report.issues,
    counts: report.counts,
  };
}

export function evaluateCase(caseDef: CorpusCase): CaseRecord {
  const head = {
    id: caseDef.id,
    mode: caseDef.mode,
    kind: caseDef.kind,
    situation: caseDef.situation,
  };
  try {
    if (caseDef.kind === "EXPANSION" && caseDef.expansion) {
      const expansion = caseDef.expansion;
      const roadmap = roadmapInput(caseDef.input);
      const parent = normalizeProposal(caseDef.input, expansion.parentProposal);
      if (parent.mode !== "ROADMAP") throw new PlannerError(422, "MODE_MISMATCH");
      const milestone = parent.milestones[expansion.milestoneIndex];
      const scope = expansionScope(parent, milestone.key, roadmap);
      const draft = normalizeExpansion(roadmap, parent, scope, expansion.items);
      const base = expansion.baseItems
        ? normalizeExpansion(roadmap, parent, scope, expansion.baseItems)
        : undefined;
      return buildRecord(caseDef, draft, base);
    }
    const proposal = resolveCorpusProposal(caseDef);
    const draft = normalizeProposal(
      caseDef.input,
      proposal,
      undefined,
      caseDef.frozen ? { frozen: caseDef.frozen } : undefined
    );
    const base = caseDef.baseProposal
      ? normalizeProposal(caseDef.input, caseDef.baseProposal)
      : undefined;
    return buildRecord(caseDef, draft, base);
  } catch (error) {
    return {
      ...head,
      valid: false,
      validationCode: validationCodeOf(error),
      metrics: {},
      issues: [],
      counts: {},
    };
  }
}

function aggregateOf(records: CaseRecord[]): CorpusAggregate {
  const byMode: Record<string, { cases: number; valid: number; invalid: number }> = {};
  for (const record of records) {
    const bucket = byMode[record.mode] ?? { cases: 0, valid: 0, invalid: 0 };
    bucket.cases += 1;
    if (record.valid) bucket.valid += 1;
    else bucket.invalid += 1;
    byMode[record.mode] = bucket;
  }

  const sums: Partial<Record<MetricName, { n: number; total: number }>> = {};
  for (const record of records) {
    if (!record.valid) continue;
    for (const name of METRIC_NAMES) {
      const metric = record.metrics[name];
      if (!metric || !metric.applicable) continue;
      const sum = sums[name] ?? { n: 0, total: 0 };
      sum.n += 1;
      sum.total += metric.score;
      sums[name] = sum;
    }
  }
  const metricAverages: Partial<Record<MetricName, number>> = {};
  for (const name of METRIC_NAMES) {
    const sum = sums[name];
    metricAverages[name] = sum && sum.n ? round2(sum.total / sum.n) : undefined;
  }

  const freq = new Map<string, number>();
  for (const record of records)
    for (const issue of record.issues)
      freq.set(issue.code, (freq.get(issue.code) ?? 0) + 1);
  const topIssues = [...freq.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 10);

  return {
    cases: records.length,
    valid: records.filter((record) => record.valid).length,
    invalid: records.filter((record) => !record.valid).length,
    byMode,
    metricAverages,
    topIssues,
  };
}

export function evaluateCorpus(corpus: CorpusCase[] = PLANNER_QUALITY_CORPUS): CorpusResult {
  const records = corpus.map(evaluateCase);
  return { records, aggregate: aggregateOf(records) };
}
