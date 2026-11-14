// A session the student drags is placed exactly where it is dropped, whatever the plan's own rules say: daily and subject caps, rest days, days
// off, the planner's study hours, commitments, other sessions and the order of topics never refuse it. The rest of the plan reflows around it,
// and the result always passes verification, so the server can commit it. Only the clock bounds a drop: not before now, inside one day.
import { describe, expect, it } from "vitest";
import { addDays, compileStudyPath, isFixed, studentLanding, normalizeSyllabus, seededRandom, solve, verify, type Block, type PlanningSnapshot, type WorkModel } from "@/lib/planner/kernel";
import { goal, randomInstance, snapshot } from "./fixtures";

const RUNS = Number(process.env.KERNEL_PROPERTY_RUNS ?? 150);

function committed(seed: number) {
  const inst = randomInstance(seed);
  const first = solve(inst);
  const blocks: Block[] = first.blocks.map((b, i) => ({ ...b, id: b.id || `b${i}`, state: b.state === "proposed" ? "committed" : b.state }));
  return { ...inst, blocks };
}

describe("a session the student drags", () => {
  it(`lands where it is dropped and the plan still verifies (${RUNS} random plans, several drops each)`, () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= RUNS; seed++) {
      const inst = committed(seed);
      const random = seededRandom(seed * 7919);
      let blocks = inst.blocks;
      for (let drop = 0; drop < 3; drop++) {
        const movable = blocks.filter((b) => (b.state === "committed" || b.state === "missed") && !(b.state === "committed" && isFixed({ ...b, pinned: false }, inst.snapshot) && b.date === inst.snapshot.today));
        if (!movable.length) break;
        const block = movable[Math.floor(random() * movable.length)];
        const day = inst.snapshot.days[Math.floor(random() * inst.snapshot.days.length)];
        const length = block.end - block.start;
        const earliest = day.date === inst.snapshot.today ? Math.ceil(inst.snapshot.nowMinute / 5) * 5 : 0;
        if (earliest + length > 1440) continue;
        const start = earliest + Math.floor(random() * ((1440 - length - earliest) / 5 + 1)) * 5;
        const edited = blocks.map((b) => (b.id === block.id ? { ...b, date: day.date, start, end: start + length, pinned: true, state: "committed" as const } : b));
        const input = { snapshot: inst.snapshot, model: inst.model, blocks: edited, mode: "repair" as const };
        const result = solve(input);
        const check = verify(input, result);
        const landed = result.blocks.find((b) => b.id === block.id);
        if (!check.pass || !landed || landed.date !== day.date || landed.start !== start) {
          failures.push(`seed ${seed} drop ${drop}: ${block.item} → ${day.date} ${start}${day.rest ? " (rest)" : ""}: ${landed ? `${landed.date} ${landed.start}` : "gone"}; ${check.failures.slice(0, 3).map((f) => `${f.code} ${f.detail}`).join(" | ")}`);
          break;
        }
        blocks = result.blocks.map((b, i) => ({ ...b, id: b.id || `n${drop}_${i}`, state: b.state === "proposed" ? "committed" : b.state }));
      }
    }
    expect(failures.slice(0, 8)).toEqual([]);
  });

  it("lands in exam plans with an hour-a-day limit, full papers on their own days and topics in order", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= Math.max(20, Math.round(RUNS / 5)); seed++) {
      const random = seededRandom(seed * 104729);
      const snap: PlanningSnapshot = snapshot({ today: "2026-11-23", nowMinute: 9 * 60 }, 28, [0]);
      snap.settings.dailyCap = 240;
      for (const day of snap.days) if (random() < 0.4) day.busy.push({ start: 16 * 60, end: 18 * 60, title: "Class", kind: "class", ref: null });
      const units = Array.from({ length: 6 + Math.floor(random() * 6) }, (_, i) => ({ title: `Topic ${i + 1}`, points: ["One", "Two", "Three", "Four"].map((p) => `${p} of ${i + 1}`), weight: 2 as const, difficulty: 2 as const }));
      const syllabus = normalizeSyllabus({ source: "model", name: "Paper", units, papers: [{ label: "Paper 1", minutes: 105, marks: 100 }] });
      const base: WorkModel = { goals: [goal("g1", { title: "Exam", type: "exam", due: addDays(snap.today, 27), syllabus, preset: "exam", pace: { minutesPerDay: [45, 60, 90][seed % 3] } })], items: [], practices: [], constraints: [], assumptions: [], questions: [] };
      const { model } = compileStudyPath(base, "g1", snap);
      const first = solve({ snapshot: snap, model, blocks: [] });
      let blocks: Block[] = first.blocks.map((b, i) => ({ ...b, id: `b${i}`, state: "committed" as const }));
      for (let drop = 0; drop < 4; drop++) {
        const movable = blocks.filter((b) => b.state === "committed" && b.date > snap.today);
        const block = movable[Math.floor(random() * movable.length)];
        const day = snap.days[1 + Math.floor(random() * (snap.days.length - 1))];
        const length = block.end - block.start;
        const start = Math.floor(random() * ((1440 - length) / 5 + 1)) * 5;
        const edited = blocks.map((b) => (b.id === block.id ? { ...b, date: day.date, start, end: start + length, pinned: true } : b));
        const input = { snapshot: snap, model, blocks: edited, mode: "repair" as const };
        const result = solve(input);
        const check = verify(input, result);
        const landed = result.blocks.find((b) => b.id === block.id);
        if (!check.pass || landed?.date !== day.date || landed.start !== start) {
          failures.push(`seed ${seed} drop ${drop}: ${model.items.find((i) => i.key === block.item)?.title} → ${day.date} ${start}: ${check.failures.slice(0, 3).map((f) => `${f.code} ${f.detail}`).join(" | ")}`);
          break;
        }
        blocks = result.blocks.map((b, i) => ({ ...b, id: b.id || `n${drop}_${i}`, state: b.state === "proposed" ? "committed" : b.state }));
      }
    }
    expect(failures.slice(0, 8)).toEqual([]);
  });

  it("can be dropped onto a rest day, over a commitment and past the day's study hours", () => {
    const inst = committed(11);
    const block = inst.blocks.find((b) => b.state === "committed")!;
    const rest = inst.snapshot.days.find((d) => d.rest) ?? inst.snapshot.days[inst.snapshot.days.length - 1];
    const busy = inst.snapshot.days.find((d) => d.busy.length && d.date > inst.snapshot.today);
    const length = block.end - block.start;
    for (const [date, start] of [[rest.date, 23 * 60 - length], ...(busy ? [[busy.date, busy.busy[0].start]] : []), [addDays(inst.snapshot.today, 1), 5 * 60]] as [string, number][]) {
      const edited = inst.blocks.map((b) => (b.id === block.id ? { ...b, date, start, end: start + length, pinned: true } : b));
      const input = { snapshot: inst.snapshot, model: inst.model, blocks: edited, mode: "repair" as const };
      const result = solve(input);
      expect(verify(input, result).failures).toEqual([]);
      expect(result.blocks.find((b) => b.id === block.id)).toMatchObject({ date, start });
    }
  });

  it("is bounded only by the clock: never before now, never past midnight", () => {
    expect(studentLanding("2026-11-25", 9 * 60 + 7, 60, "2026-11-23", 600)).toEqual({ date: "2026-11-25", start: 545 });
    expect(studentLanding("2026-11-23", 8 * 60, 60, "2026-11-23", 10 * 60 + 2)).toEqual({ date: "2026-11-23", start: 605 });
    expect(studentLanding("2026-11-20", 14 * 60, 60, "2026-11-23", 600)).toEqual({ date: "2026-11-23", start: 840 });
    expect(studentLanding("2026-11-25", 23 * 60 + 30, 60, "2026-11-23", 600)).toEqual({ date: "2026-11-25", start: 1380 });
    expect(studentLanding("2026-11-23", 22 * 60, 120, "2026-11-23", 23 * 60)).toEqual({ date: "2026-11-24", start: 1320 });
    expect(studentLanding("2026-11-25", -30, 45, "2026-11-23", 600)).toEqual({ date: "2026-11-25", start: 0 });
  });
});
