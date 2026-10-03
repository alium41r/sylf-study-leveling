"use client";
import { useMemo } from "react";
import type { CandidateCoverage, CandidateEvidence } from "@/lib/planner/research/contracts";
import type { ResearchSource } from "@/lib/planner/research/contracts";
import { sourceTypeLabel, sourceTypeIsOfficial } from "@/lib/planner/research/sources";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * What the research established, and what it did not.
 *
 * Phase 2 produced objective coverage and a verified evidence ledger but showed the student almost
 * none of it: a one-line summary and a list of loose questions. That left the honest part of the
 * work invisible — a student could not tell whether Sylf had answered four questions or one, and the
 * uncertainty the pipeline had carefully measured looked exactly like confidence.
 *
 * Three rules shape this panel, and each is a constraint rather than a preference:
 *
 * 1. **State is carried by words, never by colour.** "Covered", "Some evidence", "Still unclear",
 *    "Sources disagree" are the labels; the colour is decoration. A student who cannot distinguish
 *    the four states by hue must lose nothing.
 * 2. **Compact, not a research inspector.** Counts, one line per question, and source totals. No raw
 *    ledger, no excerpt dump, no provider names, no latency. The evidence is available behind a
 *    disclosure for the student who asks "why does Sylf think this?", and absent otherwise.
 * 3. **Nothing is claimed that the ledger does not support.** The counts come from the server's own
 *    coverage computation, so a question is only ever shown as answered when verified evidence backs
 *    it. This panel cannot promote anything.
 */

export interface ResearchStatusPanelProps {
  coverage: CandidateCoverage;
  /** Verified claims, when the run produced any. */
  evidence?: CandidateEvidence;
  /** The sources the run kept, used only for the by-type totals. */
  sources: ResearchSource[];
  /** True when the run itself answered nothing useful, so the panel leads with that. */
  weak?: boolean;
}

/** The student-facing word for each state. */
const STATE_LABEL: Record<CandidateCoverage["objectives"][number]["state"], string> = {
  COVERED: "Covered",
  PARTIAL: "Some evidence",
  UNANSWERED: "Still unclear",
  CONFLICTED: "Sources disagree",
};

/** States that mean the question is not settled, in the order a student should read them. */
const OPEN_STATES = ["UNANSWERED", "CONFLICTED", "PARTIAL"] as const;

export default function ResearchStatusPanel({
  coverage,
  evidence,
  sources,
  weak,
}: ResearchStatusPanelProps) {
  const { summary, objectives } = coverage;

  /** Sources counted by authority, using the same classification the rest of the Planner uses. */
  const sourceCounts = useMemo(() => {
    const official = sources.filter((source) => sourceTypeIsOfficial(source.sourceType)).length;
    const institutional = sources.filter((source) => source.sourceType === "INSTITUTIONAL").length;
    const other = sources.length - official - institutional;
    return { official, institutional, other };
  }, [sources]);

  /**
   * The questions still open, most important first.
   *
   * Ordering by priority rather than by state matters: a student reading the top of this list should
   * see the gap that most affects whether they can trust the scope, not whichever question happened
   * to be emptied first.
   */
  const open = useMemo(() => {
    const rank = (state: string) => OPEN_STATES.indexOf(state as (typeof OPEN_STATES)[number]);
    return objectives
      .filter((entry) => entry.state !== "COVERED")
      .sort((a, b) => (a.priority === b.priority ? rank(a.state) - rank(b.state) : a.priority === "PRIMARY" ? -1 : 1));
  }, [objectives]);

  const answered = summary.covered;
  const total = summary.totalObjectives;

  /** Claims grouped by objective, so the disclosure can answer "why?" per question. */
  const claimsByObjective = useMemo(() => {
    const map = new Map<string, CandidateEvidence["claims"]>();
    for (const claim of evidence?.claims ?? []) {
      const list = map.get(claim.objectiveId) ?? [];
      list.push(claim);
      map.set(claim.objectiveId, list);
    }
    return map;
  }, [evidence]);

  const domainOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const source of sources) map.set(source.sourceId, source.publisherOrDomain ?? source.title ?? "");
    return map;
  }, [sources]);

  const sourceLine = [
    sourceCounts.official > 0 ? `${sourceCounts.official} official` : null,
    sourceCounts.institutional > 0 ? `${sourceCounts.institutional} institutional` : null,
    sourceCounts.other > 0 ? `${sourceCounts.other} other` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={s.researchStatus} aria-labelledby="research-status-heading">
      <h4 id="research-status-heading" className={s.researchStatusHeading}>
        Research coverage
      </h4>

      {/*
        The headline count is the whole point of the panel: "4 of 5 questions answered" is the one
        sentence that tells a student how much of this scope to trust before they read a single row.
      */}
      <p className={s.researchStatusSummary} role="status" aria-live="polite">
        <strong>
          {answered} of {total} {total === 1 ? "question" : "questions"} answered
        </strong>
        {weak ? " — based on the pages Sylf could actually read." : "."}
      </p>

      {sourceLine && (
        <p className={s.researchStatusSources}>
          Sources: {sourceLine}
          {coverage.followUpUsed ? " · searched a second time for what was still missing" : ""}
        </p>
      )}

      {/*
        Every question gets a row with a word for its state. A student who wants to know which parts
        to check does not have to interpret anything.
      */}
      <ul className={s.researchStatusList}>
        {objectives.map((entry) => (
          <li key={entry.objectiveId} className={s.researchStatusRow}>
            <span className={s.researchStatusState}>{STATE_LABEL[entry.state]}</span>
            <span className={s.researchStatusQuestion}>{entry.question}</span>
          </li>
        ))}
      </ul>

      {open.length > 0 && (
        <div className={s.researchStatusOpen}>
          <p className={s.researchStatusOpenHeading}>What Sylf could not settle</p>
          <ul>
            {open.map((entry) => (
              <li key={entry.objectiveId}>
                {entry.question} — <em>{STATE_LABEL[entry.state].toLowerCase()}</em>
                {entry.state === "CONFLICTED" ? "; the sources disagree" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Evidence inspection, behind a disclosure and off by default.

        A student can ask why a question is marked answered and see the sentence the answer rests on.
        What they cannot see is anything the server did not verify: the excerpt shown here is the
        page's own wording, and a claim whose quotation could not be found was dropped before it ever
        reached this component. There is no model prose and no chain of thought.
      */}
      {evidence && evidence.claims.length > 0 && (
        <details className={s.researchEvidence}>
          <summary>Why does Sylf think this?</summary>
          <ul className={s.researchEvidenceList}>
            {objectives.map((entry) => {
              const claims = claimsByObjective.get(entry.objectiveId) ?? [];
              if (!claims.length) return null;
              return (
                <li key={entry.objectiveId}>
                  <p className={s.researchEvidenceQuestion}>{entry.question}</p>
                  <ul>
                    {claims.slice(0, 3).map((claim) => (
                      <li key={claim.claimId}>
                        <blockquote className={s.researchEvidenceExcerpt}>“{claim.excerpt}”</blockquote>
                        <span className={s.researchEvidenceSource}>
                          {domainOf.get(claim.sourceId) ?? "source"}
                          {claim.documentDate ? ` · ${claim.documentDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {evidence.rejected > 0 && (
            <p className={s.hint}>
              {evidence.rejected} {evidence.rejected === 1 ? "quotation" : "quotations"} could not be
              found in the {evidence.rejected === 1 ? "page" : "pages"} they were attributed to and were
              left out.
            </p>
          )}
        </details>
      )}

      {sourceCounts.official === 0 && sources.length > 0 && (
        <p className={s.hint}>
          None of these is the {sourceTypeLabel("OFFICIAL").toLowerCase()} source for this target, so
          treat the scope as a starting point.
        </p>
      )}
      {sourceCounts.official === 0 && sources.length === 0 && (
        <p className={base.muted}>No public source was used for this scope.</p>
      )}
    </section>
  );
}
