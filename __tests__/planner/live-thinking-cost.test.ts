// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deepseekModel } from "@/lib/planner/research/deepseek";
import { selectSearchProvider } from "@/lib/planner/research/search/provider";
import { fetchSource } from "@/lib/planner/research/search/fetch";
import { resolveAuthorities } from "@/lib/planner/research/authority";
import { buildLedger } from "@/lib/planner/research/evidence";

/**
 * What reasoning actually costs, measured on identical input.
 *
 * The Phase 2 DEEP run billed 38 982 output tokens for answers that are a few thousand characters of
 * JSON, and the obvious suspect was the provider's hidden reasoning — the research passes were the
 * only bounded JSON calls in this repository not passing `thinking: "disabled"`.
 *
 * Comparing that run against a later, cheaper one would not prove it. The two runs drew different
 * plans (fewer objectives, no follow-up round) and read different pages, so most of the difference
 * would be *less work*, not cheaper work. This instead fetches one fixed set of pages and runs the
 * **same extraction twice over the identical input** — once with reasoning enabled, once disabled —
 * so the only variable is the thing being measured.
 *
 * It also measures quality, which matters more than the tokens: §14 of the phase specification says
 * evidence must not be traded for speed, so the comparison is only allowed to justify the change if
 * the disabled pass finds materially the same evidence.
 *
 * Opt-in, two model calls:
 *   PLANNER_LIVE_RESEARCH_SMOKE=true node scripts/test/test-planner-postgres.mjs \
 *     __tests__/planner/live-thinking-cost.test.ts
 */

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const LIVE = process.env.PLANNER_LIVE_RESEARCH_SMOKE === "true";
const database = process.env.PLANNER_TEST_DATABASE_URL;

const TARGET = { goal: "CAIE A Level Mathematics 9709", subject: "Mathematics", board: null, level: null };

describe.skipIf(!database || !LIVE)("the cost of reasoning, measured on identical input", () => {
  it("compares enabled and disabled reasoning over the same pages", async () => {
    const search = selectSearchProvider();
    expect(search).toBeTruthy();

    // One fixed input for both passes, gathered the same way the pipeline gathers it.
    const found = await search!.search({ query: "CAIE A Level Mathematics 9709 syllabus specification", limit: 8 });
    const sources: { sourceId: string; title: string; url: string; text: string }[] = [];
    for (const hit of found) {
      if (sources.length >= 4) break;
      try {
        const page = await fetchSource(hit.url, {});
        if (!page.text.trim() || page.text.length < 400) continue;
        sources.push({
          sourceId: `src-${sources.length}`,
          title: hit.title,
          url: page.finalUrl,
          text: page.text.slice(0, 12_000),
        });
      } catch {
        /* an unreadable candidate is simply not part of the fixed input */
      }
    }
    expect(sources.length).toBeGreaterThanOrEqual(3);

    const objectives = [
      { id: "o1", question: "Which subjects and topics does the syllabus cover?", priority: "PRIMARY" as const },
      { id: "o2", question: "Which specification version is current?", priority: "SUPPORTING" as const },
    ];

    const measure = async (thinking: "enabled" | "disabled") => {
      const started = Date.now();
      const result = await deepseekModel({ thinking }).extract({
        target: TARGET,
        sources,
        removedLabels: [],
        objectives,
        timeoutMs: 120_000,
      });
      const elapsedMs = Date.now() - started;
      const ledger = buildLedger({
        proposed: result.claims,
        fetched: sources.map((source) => ({ sourceId: source.sourceId, text: source.text })),
        knownObjectiveIds: new Set(objectives.map((objective) => objective.id)),
      });
      return {
        thinking,
        outputTokens: result.usage.outputTokens,
        inputTokens: result.usage.inputTokens,
        elapsedMs,
        scopeNodes: result.extraction.scope.length,
        proposedClaims: result.claims.length,
        acceptedClaims: ledger.accepted,
        rejectedClaims: Object.values(ledger.rejected).reduce((sum, value) => sum + value, 0),
        objectivesClaimed: new Set(ledger.claims.map((claim) => claim.objectiveId)).size,
      };
    };

    const disabled = await measure("disabled");
    const enabled = await measure("enabled");

    const report = { target: TARGET.goal, pages: sources.map((source) => source.url), disabled, enabled };
    mkdirSync("documentation/performance/phase-0/artifacts", { recursive: true });
    writeFileSync(
      "documentation/performance/phase-0/artifacts/research-thinking-cost.json",
      JSON.stringify(report, null, 2)
    );
    // eslint-disable-next-line no-console
    console.log(`LIVE_THINKING_COST ${JSON.stringify(report)}`);

    // The measurement is the deliverable; the assertions are only that both passes produced a
    // usable extraction, so a failed run cannot be mistaken for a cheap one.
    expect(disabled.scopeNodes).toBeGreaterThan(0);
    expect(enabled.scopeNodes).toBeGreaterThan(0);
    expect(disabled.acceptedClaims).toBeGreaterThan(0);
  }, 600_000);
});
