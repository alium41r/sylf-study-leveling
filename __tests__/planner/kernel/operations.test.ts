import { describe, expect, it } from "vitest";
import {
  StreamingArrayParser, addDays, applyOperations, calibrate, calibratedEstimate, calibrationNote, diffPlans, inferGoalType, parseClock, parseCommand, parseDate, scaffold,
  type ApplyContext, type Op,
} from "@/lib/planner/kernel";
import { TODAY, goal, item, model, snapshot } from "./fixtures";

const ctx = (over: Partial<ApplyContext> = {}): ApplyContext => ({
  refs: { subjects: { S1: 1, S2: 2 }, topics: { N3_1: 31, N3_2: 32 }, goals: { G1: "g1" }, items: { w1: "i1" } },
  today: TODAY, source: "model", newKey: (kind, id) => `${kind}-${id}`, topicSubjects: { 31: 1, 32: 1 }, ...over,
});

describe("operations", () => {
  const base = model({ goals: [goal("g1", { due: addDays(TODAY, 10) })], items: [item("i1", { goal: "g1" })] });

  it("adds items with resolved references and normalized sizes", () => {
    const ops: Op[] = [{ op: "add_item", id: "w2", goal: "G1", title: "Retrieval: Unit 3 mechanisms, past paper Q4–Q7", kind: "practice", topics: ["N3_1"], est: [45, 60], chunk: [30, 45, 60], due: addDays(TODAY, 4), after: ["w1"], load: 3, method: "retrieval" }];
    const result = applyOperations(base, ops, ctx());
    expect(result.errors).toEqual([]);
    const added = result.model.items.find((i) => i.key === "item-w2")!;
    expect(added).toMatchObject({ goal: "g1", subject: 1, topics: [31], est: [45, 60], chunk: [30, 45, 60], after: ["i1"], load: 3, method: "retrieval" });
    expect(result.refs.items.w2).toBe("item-w2");
  });

  it("rejects invented references, past deadlines and cycles with precise errors", () => {
    const ops: Op[] = [
      { op: "add_item", id: "w3", goal: "G9", title: "Ghost goal" },
      { op: "add_item", id: "w4", title: "Ghost topic", topics: ["N9_9"] },
      { op: "add_goal", id: "G2", title: "Past", due: addDays(TODAY, -1) },
      { op: "update_item", id: "w1", after: ["w1"] },
      { op: "launch_rockets", id: "x" } as unknown as Op,
    ];
    const result = applyOperations(base, ops, ctx());
    expect(result.errors.map((e) => e.code)).toEqual(["UNKNOWN_REF", "UNKNOWN_REF", "PAST_DATE", "CYCLE", "UNKNOWN_OP"]);
    expect(result.model).toEqual(base);
  });

  it("keeps studied work as history when an item is removed", () => {
    const studied = model({ items: [item("i1", { done: 30, questId: 7 })] });
    const result = applyOperations(studied, [{ op: "remove_item", id: "w1" }], ctx());
    expect(result.model.items[0].status).toBe("dropped");
  });

  it("sets and drops typed constraints", () => {
    const set = applyOperations(base, [{ op: "set_constraint", id: "c1", kind: "preferred_window", start: 1020, end: 1320, subject: "S1" }], ctx({ source: "student" }));
    expect(set.errors).toEqual([]);
    expect(set.model.constraints[0]).toMatchObject({ kind: "preferred_window", subject: 1, start: 1020, end: 1320, provenance: "student" });
    const bad = applyOperations(base, [{ op: "set_constraint", id: "c2", kind: "preferred_window", start: 1320, end: 1020 }], ctx());
    expect(bad.errors[0].code).toBe("INVALID_VALUE");
  });

  it("scaffolds an exam with diagnostic, spaced retrieval, a timed paper and a light review", () => {
    const due = addDays(TODAY, 10);
    const s = snapshot();
    const ops = scaffold({ title: "Chem midterm", type: "exam", due, priority: 3 }, { today: TODAY, goalRef: "G1", subjectRef: "S1", subjectName: "Organic Chemistry", topics: s.topics.map((t) => ({ ...t, shortRef: t.ref })) });
    const result = applyOperations(model({ goals: [goal("g1", { due, type: "exam" })] }), ops, ctx({ refs: { subjects: { S1: 1 }, topics: { N3_1: 31, N3_2: 32, N3_3: 33 }, goals: { G1: "g1" }, items: {} } }));
    expect(result.errors).toEqual([]);
    const methods = result.model.items.map((i) => i.method);
    expect(methods).toContain("diagnostic");
    expect(methods.filter((m) => m === "retrieval").length).toBeGreaterThanOrEqual(4);
    expect(methods).toContain("timed_paper");
    expect(result.model.items.find((i) => i.method === "spaced_review")?.earliest).toBe(addDays(due, -1));
  });

  it("infers goal types from plain words", () => {
    expect(inferGoalType("Chem midterm")).toBe("exam");
    expect(inferGoalType("History essay on the Reformation")).toBe("essay");
    expect(inferGoalType("Physics problem set 4")).toBe("problem_set");
    expect(inferGoalType("Get better at Spanish")).toBe("skill");
  });
});

describe("command fast path", () => {
  const s = snapshot();
  const m = model({ goals: [goal("g1", { title: "History essay", due: addDays(TODAY, 8), subject: 3 })] });
  const refs = { subjectRef: (id: number) => `S${id}`, goalRef: (key: string) => (key === "g1" ? "G1" : key) };

  it("moves a subject to evenings this week", () => {
    const parsed = parseCommand("move chemistry to evenings this week", s, m, refs)!;
    expect(parsed.interpretation).toBe("Move · Organic Chemistry · evenings this week");
    expect(parsed.ops[0]).toMatchObject({ op: "set_constraint", kind: "preferred_window", start: 1020, end: 1320, subject: "S1", until: "2026-11-29" });
  });
  it("turns illness into a rest day", () => {
    const parsed = parseCommand("I'm sick today", s, m, refs)!;
    expect(parsed.ops[0]).toMatchObject({ kind: "day_off", dates: [TODAY] });
  });
  it("caps weekdays", () => {
    const parsed = parseCommand("max 2 hours a day on weekdays", s, m, refs)!;
    expect(parsed.ops[0]).toMatchObject({ kind: "daily_cap", minutes: 120, days: [1, 2, 3, 4, 5] });
  });
  it("keeps evenings free", () => {
    const parsed = parseCommand("no studying after 9pm", s, m, refs)!;
    expect(parsed.ops[0]).toMatchObject({ kind: "no_study_window", start: 21 * 60, end: 1440 });
  });
  it("raises a subject's weight", () => {
    expect(parseCommand("physics matters more now", s, m, refs)!.ops[0]).toMatchObject({ kind: "subject_weight", subject: "S2", weight: 3 });
  });
  it("recognises a new deadline and asks for it to be broken down", () => {
    const parsed = parseCommand("chem midterm on 28 Nov", s, m, refs)!;
    expect(parsed.ops[0]).toMatchObject({ op: "add_goal", type: "exam", due: "2026-11-28", subject: "S1" });
    expect(parsed.decompose).toEqual(["G_new"]);
  });
  it("leaves open-ended requests to the model", () => {
    expect(parseCommand("am I on track for finals?", s, m, refs)).toBeNull();
  });
  it("parses dates and clocks", () => {
    expect(parseDate("next friday", TODAY)).toBe("2026-12-04");
    expect(parseDate("friday", TODAY)).toBe("2026-11-27");
    expect(parseDate("tomorrow", TODAY)).toBe("2026-11-24");
    expect(parseDate("Dec 3", TODAY)).toBe("2026-12-03");
    expect(parseDate("in 2 weeks", TODAY)).toBe("2026-12-07");
    expect(parseClock("7:30 pm")).toBe(19 * 60 + 30);
    expect(parseClock("21:00")).toBe(21 * 60);
  });
});

describe("calibration", () => {
  it("learns a slower subject only from repeated evidence", () => {
    const samples = Array.from({ length: 8 }, () => ({ subject: 1, kind: "practice" as const, planned: 50, actual: 65, weekday: 2, hour: 19, completed: true }));
    const cal = calibrate(samples, [120, 90, 150, 60, 200, 180, 100, 140, 160, 110], { dailyCap: 300, fallbackCapacity: 120 });
    expect(cal.factors["1:practice"].factor).toBeGreaterThan(1.1);
    const est = calibratedEstimate({ est: [50, 65], subject: 1, kind: "practice", chunk: [25, 50, 60] }, cal);
    expect(est[0]).toBeGreaterThan(50);
    expect(calibrationNote({ est: [50, 65], subject: 1, kind: "practice", chunk: [25, 50, 60] }, cal, "Chemistry")).toMatch(/You usually take 1\.\d× your estimate on Chemistry practice/);
    expect(cal.energy[2][19]).toBeGreaterThan(cal.energy[2][7]);
    const few = calibrate(samples.slice(0, 1), [], { dailyCap: 300, fallbackCapacity: 120 });
    expect(calibratedEstimate({ est: [50, 65], subject: 1, kind: "practice", chunk: [25, 50, 60] }, few)[0]).toBe(50);
    expect(few.capacity).toBe(120);
  });
});

describe("diff", () => {
  it("summarises added, moved and freed time", () => {
    const m = model({ items: [item("a"), item("b")] });
    const before = [
      { id: "x", item: "a", date: "2026-11-26", start: 19 * 60, end: 20 * 60, state: "committed" as const, pinned: false, questId: null },
      { id: "y", item: "b", date: "2026-11-25", start: 9 * 60, end: 10 * 60, state: "committed" as const, pinned: false, questId: null },
    ];
    const after = [
      { ...before[0], date: "2026-11-27", state: "proposed" as const },
      before[1],
      { id: "z", item: "b", date: "2026-11-28", start: 9 * 60, end: 10 * 60, state: "proposed" as const, pinned: false, questId: null },
    ];
    const diff = diffPlans({ model: m, blocks: before }, { model: m, blocks: after }, TODAY);
    expect(diff.summary).toBe("1 session added · 1 moved · Thursday evening freed");
  });
});

describe("streaming array parser", () => {
  it("emits each element as soon as it closes, across arbitrary chunk boundaries", () => {
    const seen: unknown[] = [];
    const parser = new StreamingArrayParser("items", (value) => seen.push(value));
    const doc = JSON.stringify({ summary: "items [ tricky } text", items: [{ id: "w1", title: "Brace } and \" quote" }, { id: "w2", topics: ["N1", "N2"], nested: { a: [1, 2] } }] });
    for (let i = 0; i < doc.length; i += 3) {
      parser.push(doc.slice(i, i + 3));
      if (i < doc.indexOf("w2")) expect(seen.length).toBeLessThanOrEqual(1);
    }
    expect(seen).toEqual([{ id: "w1", title: "Brace } and \" quote" }, { id: "w2", topics: ["N1", "N2"], nested: { a: [1, 2] } }]);
    expect(parser.finish()).toMatchObject({ summary: "items [ tricky } text" });
  });
});
