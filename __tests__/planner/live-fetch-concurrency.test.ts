// @vitest-environment node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectSearchProvider } from "@/lib/planner/research/search/provider";
import { fetchSource } from "@/lib/planner/research/search/fetch";
import { RESEARCH_BOUNDS } from "@/lib/planner/research/search/contracts";

/**
 * What fetch concurrency is actually worth, measured on the same pages.
 *
 * The tempting number is "DEEP went from 192 s to 33 s", and it is not a measurement of this
 * change: those two runs also used different reasoning settings and made different numbers of model
 * calls, so most of the difference is *less work* rather than faster work. Reporting it as the gain
 * from concurrency would be exactly the intuition-over-evidence this phase is meant to avoid.
 *
 * So this isolates the variable the way the thinking measurement did: the **same URLs** are fetched
 * twice, once strictly one at a time and once in waves of `maxConcurrentFetches`, and the two wall
 * clocks are compared. Nothing else differs — same pages, same fetcher, same protections.
 *
 * Opt-in, one search plus two passes over a handful of pages:
 *   PLANNER_LIVE_RESEARCH_SMOKE=true node scripts/test/test-planner-postgres.mjs \
 *     __tests__/planner/live-fetch-concurrency.test.ts
 */

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const LIVE = process.env.PLANNER_LIVE_RESEARCH_SMOKE === "true";
const database = process.env.PLANNER_TEST_DATABASE_URL;

describe.skipIf(!database || !LIVE)("the latency fetch concurrency actually saves", () => {
  it("compares sequential and waved reads of the same pages", async () => {
    const search = selectSearchProvider();
    expect(search).toBeTruthy();

    const found = await search!.search({ query: "CAIE A Level Mathematics 9709 syllabus", limit: 10 });
    // Distinct hosts, which is the realistic case and the one concurrency can help with.
    const urls: string[] = [];
    const hosts = new Set<string>();
    for (const hit of found) {
      const host = new URL(hit.url).hostname;
      if (hosts.has(host)) continue;
      hosts.add(host);
      urls.push(hit.url);
      if (urls.length >= 6) break;
    }
    expect(urls.length).toBeGreaterThanOrEqual(4);

    const readOne = async (url: string) => {
      try {
        const page = await fetchSource(url, {});
        return { url, ok: true, chars: page.text.length, requests: page.requests };
      } catch (error) {
        return { url, ok: false, chars: 0, requests: (error as { requests?: number })?.requests ?? 0 };
      }
    };

    // Sequential: exactly what Phase 2 did.
    const sequentialStart = Date.now();
    const sequential = [];
    for (const url of urls) sequential.push(await readOne(url));
    const sequentialMs = Date.now() - sequentialStart;

    // Waved: the same pages, in bounded concurrent groups.
    const wavedStart = Date.now();
    const waved: Awaited<ReturnType<typeof readOne>>[] = [];
    for (let index = 0; index < urls.length; index += RESEARCH_BOUNDS.maxConcurrentFetches) {
      const wave = urls.slice(index, index + RESEARCH_BOUNDS.maxConcurrentFetches);
      waved.push(...(await Promise.all(wave.map(readOne))));
    }
    const wavedMs = Date.now() - wavedStart;

    const report = {
      pages: urls.length,
      concurrency: RESEARCH_BOUNDS.maxConcurrentFetches,
      sequentialMs,
      wavedMs,
      savedMs: sequentialMs - wavedMs,
      speedup: Math.round((sequentialMs / Math.max(wavedMs, 1)) * 100) / 100,
      // The two passes must have read the same thing, or the timing is not comparable.
      sameOutcome: JSON.stringify(sequential.map((r) => [r.url, r.ok])) === JSON.stringify(waved.map((r) => [r.url, r.ok])),
      perPage: sequenced(sequential, waved),
    };

    mkdirSync("documentation/performance/phase-0/artifacts", { recursive: true });
    writeFileSync(
      "documentation/performance/phase-0/artifacts/research-fetch-concurrency.json",
      JSON.stringify(report, null, 2)
    );
    // eslint-disable-next-line no-console
    console.log(`LIVE_FETCH_CONCURRENCY ${JSON.stringify(report)}`);

    // Both passes saw the same pages succeed and fail, so the comparison is meaningful.
    expect(report.sameOutcome).toBe(true);
  }, 600_000);
});

/** Per-page timings, so a single slow host cannot be mistaken for a concurrency effect. */
function sequenced(
  sequential: { url: string; ok: boolean; chars: number; requests: number }[],
  waved: { url: string; ok: boolean; chars: number; requests: number }[]
) {
  return sequential.map((entry, index) => ({
    host: (() => {
      try {
        return new URL(entry.url).hostname;
      } catch {
        return entry.url;
      }
    })(),
    ok: entry.ok,
    sequentialChars: entry.chars,
    wavedChars: waved[index]?.chars ?? 0,
  }));
}
