// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import { runResearchAgent, type ResearchModel } from "@/lib/planner/research/agent";
import { SearchProviderError } from "@/lib/planner/research/search/provider";
import type { FetchedSource } from "@/lib/planner/research/search/fetch";

/**
 * A dead search key must not be reported as "I found nothing".
 *
 * This is a real production bug, reported by a student who could not work out what they had
 * done wrong: with a key the provider rejects, every query fails, the pool comes back empty,
 * and the run said *"I searched but found nothing I could use. You can upload a syllabus, paste
 * an outline, or enter the scope yourself."* Every word of that is misleading. Nothing was
 * searched, the student's wording was fine, and the advice sends them off to do research by
 * hand to work around an outage they cannot see.
 *
 * The provider already classified the failure correctly — `SEARCH_UNAUTHORIZED` for a rejected
 * key, `SEARCH_RATE_LIMITED` for a quota — and the agent was throwing that classification away
 * in a bare `catch`. These tests hold the distinction that fixes it: *nothing was searched* and
 * *the search was answered and came back empty* are different facts about the world, and the
 * student's next action differs for each.
 */

const brief = () => ({
  ...emptyBrief("EXAM"),
  goal: { title: "CAIE A-Level Physics 9702" },
  target: { endDate: "2030-06-01", examDate: "2030-06-01" },
});

const target = { goal: "CAIE A-Level Physics 9702", subject: "Physics", board: "CAIE", level: "A-Level" };
const usage = { inputTokens: 10, outputTokens: 10, calls: 1 };

/** A model that is never reached in these tests, but has to exist for the runner's shape. */
const model = (): ResearchModel =>
  ({
    planResearch: vi.fn(async () => ({
      plan: {
        depth: "STANDARD" as const,
        objectives: [{ id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" as const }],
        queries: [{ query: "CAIE A-Level Physics 9702 syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" }],
      },
      usage,
    })),
    planQueries: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
    planFollowUp: vi.fn(async () => ({ plan: { queries: [] }, usage })) as never,
    extract: vi.fn(async () => ({
      extraction: {
        targetIdentity: { name: "CAIE A-Level Physics 9702", institution: "CAIE", board: "CAIE", level: "A-Level" },
        scope: [{ label: "Kinematics", kind: "CHAPTER" as const, parentIndex: null }],
        sourceMappings: [],
        unresolved: [],
        extractionConfidence: "HIGH" as const,
        conflicts: [],
      },
      claims: [],
      usage,
    })) as never,
  }) as ResearchModel;

const fetched = (url: string): FetchedSource => ({
  finalUrl: url,
  contentType: "text/html",
  text: "Chapter 1 Kinematics. Chapter 2 Dynamics.",
  partial: false,
  partialReason: null,
  bytes: 44,
  requests: 1,
});

describe("a search that could not run is not a search that found nothing", () => {
  it.each([
    ["SEARCH_UNAUTHORIZED", /credentials|not accepting/i],
    ["SEARCH_RATE_LIMITED", /rate-limit/i],
    ["SEARCH_TIMEOUT", /took too long/i],
    ["SEARCH_UNAVAILABLE", /could not reach/i],
  ] as const)("reports %s honestly, and says the student's wording is not the problem", async (code, copy) => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: {
        id: "serper",
        search: vi.fn(async () => {
          throw new SearchProviderError(code);
        }),
      },
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });

    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    // The honest code: the provider could not be reached, rather than the query being empty.
    expect(outcome.candidate.failureCode).toBe("RESEARCH_UNAVAILABLE");
    expect(outcome.candidate.summary).toMatch(copy);
    // And the misleading sentence is gone.
    expect(outcome.candidate.summary).not.toMatch(/found nothing I could use/i);
  });

  it("still says 'found nothing' when the provider answered and had nothing", async () => {
    // The distinction is the whole point of the fix: an answered-but-empty search is the case
    // the original copy was written for, and it must keep it.
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: { id: "serper", search: vi.fn(async () => []) },
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.failureCode).toBe("SEARCH_ZERO_RESULTS");
    expect(outcome.candidate.summary).toMatch(/found nothing I could use/i);
  });

  it("prefers the empty-search answer when only some queries failed", async () => {
    // One query answered and returned nothing, another was rejected. Something *was* searched,
    // and the pool is empty because the answered query had nothing — which is a thin search,
    // not an outage, and the advice to add the scope by hand is fair.
    let call = 0;
    const twoQueryModel = model();
    (twoQueryModel.planResearch as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: {
        depth: "STANDARD" as const,
        objectives: [{ id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" as const }],
        queries: [
          { query: "CAIE A-Level Physics 9702 syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" },
          { query: "CAIE A-Level Physics 9702 chapter list", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" },
        ],
      },
      usage,
    });
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: {
        id: "serper",
        search: vi.fn(async () => {
          call += 1;
          if (call === 1) throw new SearchProviderError("SEARCH_TIMEOUT");
          return [];
        }),
      },
      model: twoQueryModel,
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.candidate.failureCode).toBe("SEARCH_ZERO_RESULTS");
  });

  it("leaves a run that actually retrieved something completely alone", async () => {
    const outcome = await runResearchAgent({
      brief: brief(),
      target,
      search: {
        id: "serper",
        search: vi.fn(async () => [
          {
            url: "https://www.cambridgeinternational.org/programmes/physics-9702",
            title: "Cambridge 9702",
            snippet: null,
            rank: 1,
            provider: "serper" as const,
          },
        ]),
      },
      model: model(),
      fetchImpl: async (url) => fetched(url),
    });
    expect(outcome.metrics.resultsReturned).toBeGreaterThan(0);
    expect(outcome.candidate.failureCode).not.toBe("RESEARCH_UNAVAILABLE");
  });
});
