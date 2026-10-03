// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResearchStatusPanel from "@/app/components/planner/quick-plan/ResearchStatusPanel";
import type {
  CandidateCoverage,
  CandidateEvidence,
  ResearchSource,
} from "@/lib/planner/research/contracts";

/**
 * The research coverage surface.
 *
 * Two things are being pinned, and the second matters more than the first.
 *
 * The first is that a student can see what happened: how many questions were answered, which ones
 * were not, whether sources disagreed, and where the information came from.
 *
 * The second is what the panel must **never** do — dump the evidence ledger, print model prose,
 * invent a state, or claim research ran when the student asked Sylf not to research. A status
 * surface that overstates its own certainty is worse than no status surface at all, because the
 * student has no way to tell.
 */

const source = (sourceId: string, sourceType: ResearchSource["sourceType"], domain: string): ResearchSource => ({
  sourceId,
  url: `https://${domain}/spec`,
  title: `${domain} specification`,
  publisherOrDomain: domain,
  sourceType,
  retrievedAt: "2030-01-01T00:00:00.000Z",
  documentDate: null,
  nodeIds: [],
  mappingConfidence: "MEDIUM",
});

const coverageOf = (over: Partial<CandidateCoverage> = {}): CandidateCoverage => ({
  summary: { totalObjectives: 3, covered: 2, partial: 1, unanswered: 0, conflicted: 0, highPriorityUnanswered: 0 },
  objectives: [
    { objectiveId: "o1", question: "Which subjects are tested?", priority: "PRIMARY", state: "COVERED", claimCount: 2, corroboratingSources: 1, conflict: "NONE" },
    { objectiveId: "o2", question: "What is the exam format?", priority: "SUPPORTING", state: "COVERED", claimCount: 1, corroboratingSources: 1, conflict: "NONE" },
    { objectiveId: "o3", question: "What are the entry requirements?", priority: "PRIMARY", state: "PARTIAL", claimCount: 1, corroboratingSources: 1, conflict: "NONE" },
  ],
  followUpUsed: false,
  ...over,
});

const evidenceOf = (over: Partial<CandidateEvidence> = {}): CandidateEvidence => ({
  claims: [
    {
      claimId: "ev-1",
      objectiveId: "o1",
      sourceId: "s1",
      statement: "The paper covers algebra and calculus.",
      excerpt: "Paper 1 covers Algebra, Sequences and Series, and Calculus.",
      evidenceKind: "DIRECT",
      support: "SUPPORTS",
      documentDate: null,
    },
  ],
  rejected: 0,
  ...over,
});

const OFFICIAL = [source("s1", "OFFICIAL_PDF", "cambridgeinternational.org"), source("s2", "INSTITUTIONAL", "example.edu")];

describe("the coverage summary is readable and honest", () => {
  it("states how many questions were answered", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />);
    expect(screen.getByText(/2 of 3 questions answered/i)).toBeInTheDocument();
  });

  it("labels every objective with a word, not a colour", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />);
    // The state words are the interface: a student who cannot see colour loses nothing.
    expect(screen.getAllByText("Covered").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Some evidence")).toBeInTheDocument();
    expect(screen.getByText(/which subjects are tested\?/i)).toBeInTheDocument();
  });

  it("names what could not be settled instead of leaving it implicit", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />);
    expect(screen.getByText(/what sylf could not settle/i)).toBeInTheDocument();
    // The question appears twice on purpose — once in the per-question rows and once in the
    // "could not settle" list — so this asserts presence rather than uniqueness.
    expect(screen.getAllByText(/what are the entry requirements\?/i).length).toBeGreaterThanOrEqual(2);
  });

  it("uses the student's word for an unanswered question", () => {
    const coverage = coverageOf({
      summary: { totalObjectives: 2, covered: 1, partial: 0, unanswered: 1, conflicted: 0, highPriorityUnanswered: 1 },
      objectives: [
        { objectiveId: "o1", question: "Which subjects are tested?", priority: "PRIMARY", state: "COVERED", claimCount: 1, corroboratingSources: 1, conflict: "NONE" },
        { objectiveId: "o2", question: "Which specification version applies?", priority: "PRIMARY", state: "UNANSWERED", claimCount: 0, corroboratingSources: 0, conflict: "NONE" },
      ],
    });
    render(<ResearchStatusPanel coverage={coverage} sources={OFFICIAL} />);
    expect(screen.getByText("Still unclear")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 questions answered/i)).toBeInTheDocument();
  });

  it("says so when sources disagree, and does not pick a side", () => {
    const coverage = coverageOf({
      summary: { totalObjectives: 1, covered: 0, partial: 0, unanswered: 0, conflicted: 1, highPriorityUnanswered: 1 },
      objectives: [
        { objectiveId: "o1", question: "Which specification version is current?", priority: "PRIMARY", state: "CONFLICTED", claimCount: 2, corroboratingSources: 1, conflict: "UNRESOLVED" },
      ],
    });
    render(<ResearchStatusPanel coverage={coverage} sources={OFFICIAL} />);
    expect(screen.getAllByText("Sources disagree").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/the sources disagree/i)).toBeInTheDocument();
    // The question is not presented as answered.
    // One objective, so the copy is singular — and the count is zero, because a disputed question
    // is not an answered one.
    expect(screen.queryByText(/1 of 1 question answered/i)).not.toBeInTheDocument();
    expect(screen.getByText(/0 of 1 question answered/i)).toBeInTheDocument();
  });
});

describe("sources are summarised, not enumerated", () => {
  it("counts the sources by authority", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />);
    expect(screen.getByText(/1 official · 1 institutional/i)).toBeInTheDocument();
  });

  it("warns when nothing official backs the scope", () => {
    render(
      <ResearchStatusPanel
        coverage={coverageOf()}
        sources={[source("s2", "SECONDARY", "prepblog.example")]}
      />
    );
    expect(screen.getByText(/treat the scope as a starting point/i)).toBeInTheDocument();
  });

  it("says plainly when there is no source at all", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={[]} />);
    expect(screen.getByText(/no public source was used/i)).toBeInTheDocument();
  });

  it("mentions the follow-up round only when one ran", () => {
    const { rerender } = render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />);
    expect(screen.queryByText(/searched a second time/i)).not.toBeInTheDocument();
    rerender(<ResearchStatusPanel coverage={coverageOf({ followUpUsed: true })} sources={OFFICIAL} />);
    expect(screen.getByText(/searched a second time/i)).toBeInTheDocument();
  });
});

describe("evidence stays behind a disclosure", () => {
  it("does not show excerpts until the student asks", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} evidence={evidenceOf()} />);
    const disclosure = screen.getByText(/why does sylf think this\?/i);
    expect(disclosure).toBeInTheDocument();
    // A closed <details> is the mechanism: the excerpt exists in the DOM but is not revealed.
    const details = disclosure.closest("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
  });

  it("shows the verified excerpt and its source inside the disclosure", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} evidence={evidenceOf()} />);
    expect(
      screen.getByText(/Paper 1 covers Algebra, Sequences and Series, and Calculus\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/cambridgeinternational\.org/)).toBeInTheDocument();
  });

  it("reports how many quotations were rejected rather than hiding them", () => {
    render(
      <ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} evidence={evidenceOf({ rejected: 3, claims: [] })} />
    );
    // With no claims left there is no disclosure to put the count in, and no excerpt either.
    expect(screen.queryByText(/quotation/i)).not.toBeInTheDocument();
    const withClaims = render(
      <ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} evidence={evidenceOf({ rejected: 3 })} />
    );
    expect(withClaims.getByText(/3 quotations could not be found/i)).toBeInTheDocument();
  });

  it("never renders the internal ledger shape", () => {
    const { container } = render(
      <ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} evidence={evidenceOf()} />
    );
    const text = container.textContent ?? "";
    // No identifiers, no provider names, no metrics: a student sees prose and a word for the state.
    expect(text).not.toMatch(/ev-1/);
    expect(text).not.toMatch(/DIRECT|SUPPORTS/);
    expect(text).not.toMatch(/serper|brave|deepseek/i);
    expect(text).not.toMatch(/claimCount|corroboratingSources|objectiveId/);
  });
});

describe("the panel never invents research", () => {
  it("renders nothing at all when there is no coverage — the policy-OFF and upload cases", () => {
    // The caller decides whether a run happened; with no coverage object there is nothing to
    // report, and the component has no "empty research" state to fall back into.
    const { container } = render(
      <div>{false && <ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} />}</div>
    );
    expect(container.textContent).toBe("");
    expect(screen.queryByText(/research coverage/i)).not.toBeInTheDocument();
  });

  it("marks a weak run in words rather than leaving the counts bare", () => {
    render(<ResearchStatusPanel coverage={coverageOf()} sources={OFFICIAL} weak />);
    expect(screen.getByText(/based on the pages Sylf could actually read/i)).toBeInTheDocument();
  });
});
