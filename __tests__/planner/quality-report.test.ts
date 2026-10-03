// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateCorpus } from "@/lib/planner/quality/evaluate";

/**
 * The quality corpus, run and reported.
 *
 * The metrics exist to be looked at, so this suite prints the aggregate on every run —
 * validity per mode, the metric averages, and the most frequent quality findings — and
 * asserts the two properties that make the numbers trustworthy: the run is
 * deterministic, and a record carries no academic content.
 */
describe("planner quality corpus report", () => {
  const run = evaluateCorpus();

  it("reports the corpus", () => {
    const { aggregate } = run;
    console.info(
      `[quality] cases ${aggregate.cases}: ${aggregate.valid} valid, ${aggregate.invalid} invalid`
    );
    for (const [mode, counts] of Object.entries(aggregate.byMode))
      console.info(
        `[quality]   ${mode}: ${counts.valid}/${counts.cases} valid`
      );
    const averages = Object.entries(aggregate.metricAverages)
      .map(([name, score]) => `${name}=${score}`)
      .join(" ");
    console.info(`[quality] metric averages: ${averages}`);
    console.info(
      `[quality] top findings: ${
        aggregate.topIssues.map((issue) => `${issue.code}×${issue.count}`).join(", ") ||
        "none"
      }`
    );
    const invalid = run.records
      .filter((record) => !record.valid)
      .map((record) => `${record.id}:${record.validationCode}`);
    console.info(`[quality] invalid cases: ${invalid.join(", ") || "none"}`);

    expect(aggregate.cases).toBeGreaterThan(0);
    expect(aggregate.valid + aggregate.invalid).toBe(aggregate.cases);
  });

  it("is deterministic and content-free", () => {
    const again = evaluateCorpus();
    expect(JSON.stringify(again.aggregate)).toBe(JSON.stringify(run.aggregate));
    // No titles, descriptions or durable keys may leave the harness: a record is scope
    // refs, dates, codes and counts only.
    const serialized = JSON.stringify(run.records);
    for (const record of run.records) {
      expect(record).not.toHaveProperty("title");
      expect(record).not.toHaveProperty("description");
    }
    expect(serialized).not.toMatch(/"title":/);
    expect(serialized).not.toMatch(/"description":/);
    expect(serialized).not.toMatch(/"rationale":/);
  });

  it("never lets a quality finding invalidate a valid plan", () => {
    // Findings are advisory by construction: a case that validates may still carry
    // them, and a case that fails does so with a validation code from the real
    // validators rather than a quality metric.
    for (const record of run.records.filter((entry) => entry.valid))
      expect(record.validationCode).toBeUndefined();
    for (const record of run.records.filter((entry) => !entry.valid))
      expect(record.validationCode).toBeTruthy();
    expect(run.records.some((record) => record.issues.length > 0)).toBe(true);
  });
});
