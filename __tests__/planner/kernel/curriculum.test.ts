import { describe, expect, it } from "vitest";
import {
  addDays, compileStudyPath, diffDays, editSyllabus, normalizeSyllabus, parseTopicCommand, parseTopicList, pathPhases, questDescription, seededRandom, solve, verify,
  type Syllabus, type WorkModel,
} from "@/lib/planner/kernel";
import { catalogSyllabus, linkTopics, matchSyllabi } from "@/lib/planner/catalog/syllabi";
import { goal, snapshot } from "./fixtures";

const TODAY = "2026-11-13"; // a Friday
const EXAM = "2026-12-01";
const p1 = () => catalogSyllabus(matchSyllabi("Maths mid term Complete Paper 1 CAIE A levels"))!;
const world = (days = 19, rest = [0]) => snapshot({ today: TODAY, nowMinute: 9 * 60 }, days, rest);
const modelWith = (syllabus: Syllabus, due: string | null = EXAM): WorkModel => ({
  goals: [goal("g1", { title: "Maths mid term", type: "exam", due, priority: 3, subject: 1, syllabus })], items: [], practices: [], constraints: [], assumptions: [], questions: [],
});

describe("syllabus catalog", () => {
  it("recognises the paper the student names, and only when board, level and paper are clear", () => {
    expect(matchSyllabi("Maths mid term Complete Paper 1 CAIE A levels").map((e) => e.id)).toEqual(["caie-9709-p1"]);
    expect(matchSyllabi("CAIE A level maths P1 and P3 mocks").map((e) => e.id)).toEqual(["caie-9709-p1", "caie-9709-p3"]);
    expect(matchSyllabi("Cambridge AS level Mechanics test").map((e) => e.id)).toEqual(["caie-9709-p4"]);
    expect(matchSyllabi("A-Level Maths papers 5 and 6, Cambridge").map((e) => e.id)).toEqual(["caie-9709-p5", "caie-9709-p6"]);
    expect(matchSyllabi("Paper 3 mock", { name: "A-Level Mathematics", code: "9709", board: "CAIE", level: "A-Level" }).map((e) => e.id)).toEqual(["caie-9709-p3"]);
    expect(matchSyllabi("Maths paper 1")).toEqual([]);
    expect(matchSyllabi("CAIE A level physics paper 1").map((e) => e.id)).toEqual(["caie-9702-p1"]);
    expect(matchSyllabi("CAIE A level chemistry paper 2")).toEqual([]);
    expect(matchSyllabi("CAIE A level maths midterm")).toEqual([]);
  });

  it("knows Cambridge Physics, and keeps physics mechanics away from maths Paper 4", () => {
    expect(matchSyllabi("CAIE A level Physics Paper 2 mock").map((e) => e.id)).toEqual(["caie-9702-p2"]);
    expect(matchSyllabi("Cambridge AS level physics test").map((e) => e.id)).toEqual(["caie-9702-p2"]);
    expect(matchSyllabi("CAIE A level physics paper 4").map((e) => e.id)).toEqual(["caie-9702-p4"]);
    expect(matchSyllabi("CAIE A level physics mechanics quiz")).toEqual([]);
    const both = catalogSyllabus(matchSyllabi("CAIE AS Level Physics papers 1 and 2"))!;
    expect(both.units.map((u) => u.title)).toEqual(["Physical quantities and units", "Kinematics", "Dynamics", "Forces, density and pressure", "Work, energy and power", "Deformation of solids", "Waves", "Superposition", "Electricity", "D.C. circuits", "Particle physics"]);
    expect(both.papers.map((p) => p.label)).toEqual(["Paper 1", "Paper 2"]);
    const p1p3 = catalogSyllabus(matchSyllabi("CAIE A level maths P1 and P3"))!;
    expect(p1p3.units.map((u) => u.title)).toContain("Trigonometry (P1)");
    expect(p1p3.units.map((u) => u.title)).toContain("Trigonometry (P3)");
    expect(p1p3.units.map((u) => u.title)).toContain("Quadratics");
  });

  it("keeps Paper 1 to Paper 1 content, with the real paper length", () => {
    const syllabus = p1();
    expect(syllabus.units.map((u) => u.title)).toEqual(["Quadratics", "Functions", "Coordinate geometry", "Circular measure", "Trigonometry", "Series", "Differentiation", "Integration"]);
    expect(syllabus.papers).toEqual([{ label: "Paper 1", minutes: 110, marks: 75 }]);
    const text = JSON.stringify(syllabus.units);
    for (const later of ["product", "quotient", "partial fractions", "R sin", "modulus", "implicit", "parametric", "(1 + x)ⁿ"]) expect(text.toLowerCase()).not.toContain(later.toLowerCase());
    for (const unit of syllabus.units) expect(unit.points.length).toBeGreaterThanOrEqual(3);
  });

  it("links topics to the student's own syllabus nodes when the names agree", () => {
    const linked = linkTopics(p1(), [{ id: 7, title: "Differentiation and its applications" }, { id: 8, title: "Quadratic functions" }]);
    expect(linked.units.find((u) => u.title === "Differentiation")?.topic).toBe(7);
    expect(linked.units.find((u) => u.title === "Quadratics")?.topic).toBe(8);
    expect(linked.units.find((u) => u.title === "Series")?.topic).toBeNull();
  });
});

describe("study path", () => {
  it("plans the whole syllabus the way a tutor would, and fits it into the calendar", () => {
    const snap = world();
    const { model, summary } = compileStudyPath(modelWith(p1()), "g1", snap);
    expect(summary).toMatchObject({ topics: 8, revise: 8, mixed: 2, papers: 2, compressed: false });
    const titles = model.items.map((i) => i.title);
    expect(titles).toContain("Quadratics revision");
    expect(titles).toContain("Integration past paper practice");
    expect(titles).toContain("Mixed review: Quadratics, Functions and Coordinate geometry");
    expect(titles).toContain("Paper 1 timed past paper");
    expect(titles).toContain("Past paper corrections");
    expect(titles).toContain("Formula sheet and final review");
    for (const title of titles) expect(title.length).toBeLessThanOrEqual(60);

    const input = { snapshot: snap, model, blocks: [] };
    const result = solve(input);
    expect(verify(input, result).pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    const first = (key: string) => result.blocks.filter((b) => b.item === key).map((b) => b.date).sort()[0];
    // Syllabus order: each topic's revision starts no earlier than the one before it.
    for (let u = 1; u < 8; u++) expect(first(`g1.rev.u${u + 1}`) >= first(`g1.rev.u${u}`)).toBe(true);
    // Practice follows its revision; a mixed review comes at least two days after its topics' practice.
    for (let u = 1; u <= 8; u++) expect(first(`g1.prac.u${u}`) >= first(`g1.rev.u${u}`)).toBe(true);
    expect(diffDays(first("g1.mix.1"), first("g1.prac.u3"))).toBeGreaterThanOrEqual(2);
    // The paper is one sitting at the real length plus setting up, and it comes after every topic.
    const paper = result.blocks.filter((b) => b.item === "g1.paper.1");
    expect(paper).toHaveLength(1);
    expect(paper[0].end - paper[0].start).toBe(120);
    expect(first("g1.paper.1") > first("g1.rev.u8")).toBe(true);
    // The day before is light, nothing new is learnt in the final 24 hours, and nothing lands on exam day.
    expect(result.blocks.filter((b) => b.date === addDays(EXAM, -1)).map((b) => model.items.find((i) => i.key === b.item)?.details?.role)).toEqual(["final"]);
    expect(result.blocks.some((b) => b.date >= EXAM)).toBe(false);
  });

  it("writes each session's aim, key points and method into its quest description", () => {
    const { model } = compileStudyPath(modelWith(p1()), "g1", world());
    const revise = model.items.find((i) => i.key === "g1.rev.u1")!;
    const text = questDescription(revise)!;
    expect(text).toContain("Be able to answer any Quadratics question on Paper 1 without notes.");
    expect(text).toContain("• Use the discriminant b² − 4ac for two, one or no real roots");
    expect(text).toContain("How: ");
    const practice = questDescription(model.items.find((i) => i.key === "g1.prac.u1")!)!;
    expect(practice).toContain("1.5 minutes a mark");
    const paper = questDescription(model.items.find((i) => i.key === "g1.paper.1")!)!;
    expect(paper).toContain("1 h 50 m, 75 marks");
  });

  it("re-compiles a rating with the same sessions, keeping what was studied", () => {
    const snap = world();
    const first = compileStudyPath(modelWith(p1()), "g1", snap).model;
    const studied = first.items.find((i) => i.key === "g1.rev.u5")!;
    studied.done = 25; studied.questId = 99; studied.title = "Trigonometry revision";
    const rated = editSyllabus(first, "g1", { units: [{ key: "u5", confidence: "weak" }, { key: "u1", confidence: "strong" }] });
    const again = compileStudyPath(rated, "g1", snap).model;
    const keys = new Set(first.items.map((i) => i.key));
    for (const key of keys) expect(again.items.some((i) => i.key === key)).toBe(true);
    expect(again.items.find((i) => i.key === "g1.rev.u5")).toMatchObject({ done: 25, questId: 99 });
    expect(again.items.find((i) => i.key === "g1.prac.u5.2")?.title).toBe("Trigonometry extra practice");
    expect(again.items.find((i) => i.key === "g1.rev.u1")?.title).toBe("Quadratics quick check");
    expect(again.items.find((i) => i.key === "g1.weak.1")?.details?.aim).toContain("Trigonometry");
  });

  it("releases the sessions of a topic the student unticks, and older template work on first compile", () => {
    const snap = world();
    const base = modelWith(p1());
    base.items.push({ ...compileStudyPath(base, "g1", snap).model.items[0], key: "old-template", title: "Study block 1: Maths", details: null, questId: 12 });
    const compiled = compileStudyPath(base, "g1", snap).model;
    expect(compiled.items.find((i) => i.key === "old-template")?.status).toBe("dropped");
    const quest = compiled.items.find((i) => i.key === "g1.rev.u4")!;
    quest.questId = 41;
    const unticked = compileStudyPath(editSyllabus(compiled, "g1", { units: [{ key: "u4", included: false }] }), "g1", snap).model;
    expect(unticked.items.find((i) => i.key === "g1.rev.u4")?.status).toBe("dropped");
    expect(unticked.items.some((i) => i.key === "g1.prac.u4")).toBe(false);
    expect(unticked.items.filter((i) => i.details?.role === "mixed").every((i) => !i.details!.units.includes("u4"))).toBe(true);
  });

  it("compresses a short window instead of failing, and keeps the light review", () => {
    const snap = snapshot({ today: TODAY, nowMinute: 9 * 60 }, 6, []);
    const { model, summary } = compileStudyPath(modelWith(p1(), addDays(TODAY, 3)), "g1", snap);
    expect(summary.papers).toBe(0);
    expect(summary.compressed).toBe(true);
    expect(model.items.some((i) => i.details?.role === "final")).toBe(true);
    const input = { snapshot: snap, model, blocks: [] };
    expect(verify(input, solve(input)).pass).toBe(true);
  });

  it("reports the plan in phases with real dates", () => {
    const snap = world();
    const { model } = compileStudyPath(modelWith(p1()), "g1", snap);
    const result = solve({ snapshot: snap, model, blocks: [] });
    const phases = pathPhases(model, model.goals[0], result.blocks);
    expect(phases.map((p) => p.key)).toEqual(["learn", "papers", "final"]);
    expect(phases[0].from).toBe(TODAY);
    expect(phases[2].from).toBe(addDays(EXAM, -1));
  });

  it("never proposes a plan that fails a hard check, over random exams", () => {
    const runs = Number(process.env.KERNEL_PROPERTY_RUNS ?? 120);
    for (let seed = 1; seed <= runs; seed++) {
      const random = seededRandom(seed);
      const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
      const units = Array.from({ length: int(1, 14) }, (_, i) => ({ title: `Topic ${i + 1}`, points: ["a", "b", "c"], weight: int(1, 3) as 1, difficulty: int(1, 3) as 1, confidence: (["weak", "okay", "strong", null] as const)[int(0, 3)] }));
      const syllabus = normalizeSyllabus({ source: "model", name: "Exam", units, papers: random() < 0.7 ? [{ label: "Paper 2", minutes: int(4, 36) * 5, marks: 60 }] : [] });
      const days = int(8, 28);
      const snap = snapshot({ today: TODAY, nowMinute: int(7, 20) * 60 }, days, random() < 0.5 ? [0] : []);
      snap.settings.dailyCap = int(60, 300);
      const { model } = compileStudyPath(modelWith(syllabus, addDays(TODAY, int(1, days - 1))), "g1", snap);
      const input = { snapshot: snap, model, blocks: [] };
      const check = verify(input, solve(input));
      expect(check.failures, `seed ${seed}`).toEqual([]);
    }
  });
});

describe("topic lists the student types", () => {
  it("reads one topic a line, with optional key points", () => {
    expect(parseTopicList("Kinematics\nDynamics: F = ma; friction\nSuperposition")).toEqual([
      { title: "Kinematics", points: [] }, { title: "Dynamics", points: ["F = ma", "friction"] }, { title: "Superposition", points: [] },
    ]);
  });
  it("reads labelled lists and chapter ranges", () => {
    expect(parseTopicList("Topics: organic chemistry, kinetics and equilibria").map((t) => t.title)).toEqual(["organic chemistry", "kinetics", "equilibria"]);
    expect(parseTopicList("Midterm covers chapters 1 to 4").map((t) => t.title)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"]);
  });
  it("does not mistake notes for topics", () => {
    expect(parseTopicList("I'm weak at integration and I have football on Saturdays.")).toEqual([]);
    expect(parseTopicList(null)).toEqual([]);
  });
});

describe("topic commands", () => {
  const exam = () => compileStudyPath(modelWith(p1()), "g1", world()).model;
  it("rates, unticks and restores topics without the model", () => {
    expect(parseTopicCommand("I'm weak at integration", exam())).toEqual({ goal: "g1", units: [{ key: "u8", confidence: "weak" }], interpretation: "Weak · Integration · Maths mid term" });
    expect(parseTopicCommand("I'm really bad at trig and series.", exam())?.units).toEqual([{ key: "u5", confidence: "weak" }, { key: "u6", confidence: "weak" }]);
    expect(parseTopicCommand("I'm good at quadratics", exam())?.units).toEqual([{ key: "u1", confidence: "strong" }]);
    expect(parseTopicCommand("Circular measure isn't in the midterm", exam())?.units).toEqual([{ key: "u4", included: false }]);
    expect(parseTopicCommand("skip functions", exam())?.units).toEqual([{ key: "u2", included: false }]);
  });
  it("leaves anything uncertain to the planner", () => {
    expect(parseTopicCommand("I'm weak at organic chemistry", exam())).toBeNull();
    expect(parseTopicCommand("move maths to evenings", exam())).toBeNull();
    expect(parseTopicCommand("I'm weak at integration", modelWith(p1()).goals.length ? { ...modelWith(p1()), goals: [] } : exam())).toBeNull();
  });
});
