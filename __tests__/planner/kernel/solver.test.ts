import { describe, expect, it } from "vitest";
import { MinCostFlow, addDays, blockMinutes, diffPlans, propose, solve, verify, type Block } from "@/lib/planner/kernel";
import { TODAY, goal, item, model, randomInstance, snapshot } from "./fixtures";

describe("min-cost flow", () => {
  it("routes flow along the cheapest paths and respects capacities", () => {
    const g = new MinCostFlow(4);
    const a = g.addEdge(0, 1, 5, 1);
    const b = g.addEdge(0, 2, 5, 3);
    g.addEdge(1, 3, 3, 0);
    g.addEdge(2, 3, 10, 0);
    const result = g.run(0, 3);
    expect(result.flow).toBe(8);
    expect(g.flowOn(a)).toBe(3);
    expect(g.flowOn(b)).toBe(5);
    expect(result.cost).toBe(3 * 1 + 5 * 3);
  });
});

describe("solver", () => {
  it("places an exam's work before the exam, spaces retrieval and keeps the day before light", () => {
    const due = addDays(TODAY, 6);
    const m = model({
      goals: [goal("exam", { type: "exam", due, priority: 3, subject: 1, title: "Chem midterm" })],
      items: [
        item("learn", { goal: "exam", subject: 1, kind: "learn", method: "worked_examples", topics: [31], est: [60, 75], load: 3 }),
        item("r1", { goal: "exam", subject: 1, kind: "practice", method: "retrieval", topics: [31], est: [30, 40], chunk: [20, 30, 45], after: ["learn"] }),
        item("r2", { goal: "exam", subject: 1, kind: "practice", method: "retrieval", topics: [31], est: [30, 40], chunk: [20, 30, 45], after: ["r1"] }),
        item("review", { goal: "exam", subject: 1, kind: "review", method: "spaced_review", est: [30, 30], chunk: [20, 30, 40], earliest: addDays(due, -1), due: addDays(due, -1), load: 1 }),
      ],
    });
    const input = { snapshot: snapshot(), model: m, blocks: [] };
    const result = solve(input);
    const check = verify(input, result);
    expect(check.failures).toEqual([]);
    const dateOf = (key: string) => result.blocks.filter((b) => b.item === key).map((b) => b.date).sort();
    expect(dateOf("learn").at(-1)! < addDays(due, -1)).toBe(true);
    const r1 = dateOf("r1").at(-1)!; const r2 = dateOf("r2")[0];
    expect(Math.round((Date.parse(r2) - Date.parse(r1)) / 86_400_000)).toBeGreaterThanOrEqual(2);
    expect(dateOf("review")).toEqual([addDays(due, -1)]);
    expect(result.shortages).toEqual([]);
    for (const block of result.blocks) expect(result.reasons[block.id]?.length).toBeGreaterThan(0);
  });

  it("reports an exact shortage when the work does not fit", () => {
    const due = addDays(TODAY, 2);
    const s = snapshot();
    s.calibration.capacity = 60;
    const m = model({ goals: [goal("g", { due, priority: 3 })], items: [item("big", { goal: "g", est: [600, 700], chunk: [30, 60, 90] })] });
    const input = { snapshot: s, model: m, blocks: [] };
    const result = solve(input);
    expect(result.shortages.length).toBe(1);
    const placed = result.blocks.filter((b) => b.item === "big").reduce((sum, b) => sum + blockMinutes(b), 0);
    expect(result.shortages[0].short + placed).toBe(600);
    expect(verify(input, result).pass).toBe(true);
    expect(result.risks.some((r) => r.kind === "shortage" && /you need/i.test(r.text))).toBe(true);
  });

  it("never moves pinned blocks and keeps committed blocks stable on a re-solve", () => {
    const m = model({ goals: [goal("g", { due: addDays(TODAY, 10) })], items: [item("a", { goal: "g", est: [120, 150] }), item("b", { goal: "g", est: [90, 120] })] });
    const s = snapshot();
    const first = solve({ snapshot: s, model: m, blocks: [] });
    const committed: Block[] = first.blocks.map((b, i) => ({ ...b, state: "committed", pinned: i === 0 }));
    const second = solve({ snapshot: s, model: m, blocks: committed });
    const diff = diffPlans({ model: m, blocks: committed }, { model: m, blocks: second.blocks }, s.today);
    expect(diff.counts.moved + diff.counts.added + diff.counts.removed).toBe(0);
    expect(second.blocks.find((b) => b.id === committed[0].id)).toMatchObject({ date: committed[0].date, start: committed[0].start, pinned: true });
  });

  it("is deterministic for identical inputs", () => {
    const { snapshot: s, model: m, blocks } = randomInstance(42);
    const a = solve({ snapshot: s, model: m, blocks });
    const b = solve({ snapshot: JSON.parse(JSON.stringify(s)), model: JSON.parse(JSON.stringify(m)), blocks: JSON.parse(JSON.stringify(blocks)) });
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
    expect(JSON.stringify(a.unplaced)).toBe(JSON.stringify(b.unplaced));
  });

  it("repairs a missed session by re-placing its minutes", () => {
    const m = model({ goals: [goal("g", { due: addDays(TODAY, 7) })], items: [item("a", { goal: "g", est: [60, 70], chunk: [30, 60, 60] })] });
    const yesterday = { ...snapshot(), today: addDays(TODAY, -1) };
    const first = solve({ snapshot: snapshot(), model: m, blocks: [] });
    const committed: Block[] = first.blocks.map((b) => ({ ...b, state: "committed", date: addDays(TODAY, -1) }));
    void yesterday;
    const missed = committed.map((b) => ({ ...b, state: "missed" as const }));
    const repaired = propose(snapshot(), { model: m, blocks: missed }, m);
    expect(repaired.verification.pass).toBe(true);
    expect(repaired.result.blocks.filter((b) => b.item === "a" && b.state === "proposed").reduce((s, b) => s + blockMinutes(b), 0)).toBe(60);
  });

  it("honours a day off, a daily cap and a no-study window", () => {
    const m = model({
      items: [item("a", { est: [240, 300], chunk: [30, 60, 90] })],
      constraints: [
        { key: "off", kind: "day_off", dates: [TODAY], hard: true, weight: 5, provenance: "student", label: "off" },
        { key: "cap", kind: "daily_cap", minutes: 60, hard: true, weight: 3, provenance: "student", label: "cap" },
        { key: "late", kind: "no_study_window", start: 18 * 60, end: 24 * 60, hard: true, weight: 3, provenance: "student", label: "late" },
      ],
    });
    const input = { snapshot: snapshot(), model: m, blocks: [] };
    const result = solve(input);
    expect(verify(input, result).failures).toEqual([]);
    expect(result.blocks.some((b) => b.date === TODAY)).toBe(false);
    for (const block of result.blocks) expect(block.end).toBeLessThanOrEqual(18 * 60);
  });

  it("passes every hard verifier across many random instances", () => {
    const failures: string[] = [];
    const runs = Number(process.env.KERNEL_PROPERTY_RUNS ?? 400);
    for (let seed = 1; seed <= runs; seed++) {
      const instance = randomInstance(seed);
      const input = { ...instance };
      const result = solve(input);
      const check = verify(input, result);
      if (!check.pass) failures.push(`seed ${seed}: ${check.failures.map((f) => `${f.code} ${f.detail}`).join("; ")}`);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it("repairs an unchanged committed plan without moving anything, and converges", () => {
    const disturbed: string[] = []; let additions = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const instance = randomInstance(seed);
      const first = solve(instance);
      const committed: Block[] = first.blocks.map((b) => (b.state === "proposed" ? { ...b, state: "committed" } : b));
      const repaired = solve({ ...instance, blocks: committed, mode: "repair" });
      expect(verify({ ...instance, blocks: committed, mode: "repair" }, repaired).failures.map((f) => `${seed} ${f.code} ${f.detail}`)).toEqual([]);
      const diff = diffPlans({ model: instance.model, blocks: committed }, { model: instance.model, blocks: repaired.blocks }, instance.snapshot.today);
      if (diff.counts.moved || diff.counts.resized || diff.counts.removed) disturbed.push(`seed ${seed}: ${diff.summary}`);
      if (diff.counts.added) {
        // Leftover capacity in an overloaded week can take one more session once; a second repair then has nothing to do.
        additions++;
        const accepted: Block[] = repaired.blocks.map((b) => (b.state === "proposed" ? { ...b, state: "committed" } : b));
        const again = solve({ ...instance, blocks: accepted, mode: "repair" });
        const second = diffPlans({ model: instance.model, blocks: accepted }, { model: instance.model, blocks: again.blocks }, instance.snapshot.today);
        if (second.counts.moved || second.counts.removed || second.counts.resized) disturbed.push(`seed ${seed} (second repair): ${second.summary}`);
      }
    }
    expect(disturbed).toEqual([]);
    expect(additions).toBeLessThanOrEqual(15);
  });

  it("repair places a missed session's minutes without moving anything else", () => {
    const m = model({ goals: [goal("g", { due: addDays(TODAY, 9) })], items: [item("a", { goal: "g", est: [120, 150], chunk: [30, 60, 60] }), item("b", { goal: "g", est: [120, 150] })] });
    const s = snapshot();
    const committed: Block[] = solve({ snapshot: s, model: m, blocks: [] }).blocks.map((b) => ({ ...b, state: "committed" }));
    const victim = committed.find((b) => b.item === "a")!;
    const later = { ...s, today: addDays(victim.date, 1), nowMinute: 6 * 60, days: s.days.filter((d) => d.date > victim.date) };
    const withMissed = committed.map((b) => (b.id === victim.id ? { ...b, state: "missed" as const } : b));
    const repaired = solve({ snapshot: later, model: m, blocks: withMissed, mode: "repair" });
    const diff = diffPlans({ model: m, blocks: withMissed }, { model: m, blocks: repaired.blocks }, later.today);
    expect(diff.counts.moved).toBe(0);
    expect(diff.counts.added).toBeGreaterThan(0);
    expect(repaired.blocks.filter((b) => b.item === "a" && b.date > victim.date).reduce((t, b) => t + blockMinutes(b), 0)).toBe(120);
  });

  it("solves 60 items over 14 days quickly", () => {
    const items = Array.from({ length: 60 }, (_, i) => item(`i${i}`, { goal: `g${i % 6}`, subject: (i % 3) + 1, est: [30 + (i % 5) * 15, 60 + (i % 5) * 15], due: addDays(TODAY, 5 + (i % 9)), after: i % 7 === 3 ? [`i${i - 1}`] : [] }));
    const goals = Array.from({ length: 6 }, (_, i) => goal(`g${i}`, { due: addDays(TODAY, 13), subject: (i % 3) + 1 }));
    const s = snapshot();
    s.calibration.capacity = 300; s.settings.dailyCap = 360;
    const input = { snapshot: s, model: model({ goals, items }), blocks: [] };
    solve(input);
    const times: number[] = [];
    for (let k = 0; k < 5; k++) { const t = performance.now(); solve(input); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    expect(verify(input, solve(input)).failures.map((f) => `${f.code} ${f.detail}`)).toEqual([]);
    // The tablet target is 30 ms p95; a development Mac should be well inside it.
    expect(times[2]).toBeLessThan(150);
  });
});
