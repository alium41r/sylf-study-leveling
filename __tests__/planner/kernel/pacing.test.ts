import { describe, expect, it } from "vitest";
import {
  addDays, compileStudyPath, diffDays, normalizeSyllabus, paceWork, shortPoint, shortTitle, solve, verify,
  type KGoal, type PlanPreset, type Syllabus, type WorkModel,
} from "@/lib/planner/kernel";
import { goal, item, snapshot } from "./fixtures";

// The planner's quality review (documentation/planner/reports/2026-11-13-planner-quality) found plans that used a sixth of the time a student
// offered, raised "an hour a day" to a paper's length on every day, and left a test tomorrow with nothing planned. These pin the fixes.
const TODAY = "2026-11-13"; // a Friday
const units = (n: number, points = 4) => Array.from({ length: n }, (_, i) => ({ title: `Topic ${i + 1}`, points: Array.from({ length: points }, (_, k) => `Point ${k + 1} of topic ${i + 1}`), weight: 2 as const, difficulty: 2 as const }));

function plan(preset: PlanPreset, syllabus: Syllabus, due: string | null, extra: Partial<KGoal> = {}, days = 60) {
  const snap = snapshot({ today: TODAY, nowMinute: 9 * 60 }, days, [0]);
  snap.settings.dailyCap = 360;
  const m: WorkModel = { goals: [goal("g1", { title: "Plan", type: preset === "exam" ? "exam" : "general", due, syllabus, preset, ...extra })], items: [], practices: [], constraints: [], assumptions: [], questions: [] };
  const { model, summary } = compileStudyPath(m, "g1", snap);
  const input = { snapshot: snap, model, blocks: [] };
  const result = solve(input);
  return { snap, model, summary, result, check: verify(input, result) };
}
const minutesOn = (blocks: { date: string; start: number; end: number }[]) => {
  const out = new Map<string, number>();
  for (const b of blocks) out.set(b.date, (out.get(b.date) ?? 0) + b.end - b.start);
  return out;
};

describe("the student's minutes a day", () => {
  it("holds on every day; a paper longer than that has its day to itself", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Biology Paper 1", units: units(10), papers: [{ label: "Paper 1", minutes: 105, marks: 100 }] });
    const { model, result, check } = plan("exam", syllabus, addDays(TODAY, 42), { pace: { minutesPerDay: 60 } }, 42);
    expect(check.pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    expect(model.constraints.find((c) => c.kind === "goal_cap")).toMatchObject({ minutes: 60, provenance: "student" });
    const papers = new Set(model.items.filter((i) => i.details?.role === "paper").map((i) => i.key));
    expect(model.items.find((i) => papers.has(i.key))?.est[0]).toBe(115);
    for (const [date, minutes] of minutesOn(result.blocks)) {
      const onDay = result.blocks.filter((b) => b.date === date);
      if (onDay.some((b) => papers.has(b.item))) expect(new Set(onDay.map((b) => b.item)).size).toBe(1);
      else expect(minutes).toBeLessThanOrEqual(60);
    }
  });

  it("is used: more time buys more sessions per topic, in parts, with practice spaced out", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Physics", units: units(8, 6), papers: [{ label: "Paper 1", minutes: 120, marks: 80 }] });
    const { model, result, check } = plan("exam", syllabus, addDays(TODAY, 60), { pace: { minutesPerDay: 180 } }, 60);
    expect(check.pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    const planned = result.blocks.reduce((s, b) => s + b.end - b.start, 0) + result.weekBudgets.reduce((s, b) => s + b.minutes, 0);
    const offered = result.days.filter((d) => !d.rest).length * 180;
    expect(planned).toBeGreaterThan(offered * 0.5);
    const titles = model.items.map((i) => i.title);
    expect(titles.some((t) => /^Topic 1 revision \(1 of [2-4]\)$/.test(t))).toBe(true);
    expect(titles).toContain("Topic 1 past paper practice 3");
    // Each part covers its own key points; later practice comes back after a gap.
    const parts = model.items.filter((i) => i.title.startsWith("Topic 1 revision"));
    expect(new Set(parts.flatMap((i) => i.details!.points)).size).toBe(6);
    const first = model.items.find((i) => i.key === "g1.prac.u1")!; const third = model.items.find((i) => i.key === "g1.prac.u1.3")!;
    expect(diffDays(third.earliest!, first.due ?? first.earliest ?? TODAY)).toBeGreaterThanOrEqual(5);
    for (const t of titles) { expect(t.length).toBeLessThanOrEqual(60); expect(t).not.toMatch(/…/); }
  });

  it("defaults to a sensible limit when the student gives none, so one topic never takes a whole day", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Probability", units: units(8) });
    const { model, result, check } = plan("mastery", syllabus, addDays(TODAY, 10), {}, 10);
    expect(check.pass).toBe(true);
    expect(model.constraints.find((c) => c.kind === "goal_cap")).toMatchObject({ minutes: 60, provenance: "default" });
    for (const minutes of minutesOn(result.blocks).values()) expect(minutes).toBeLessThanOrEqual(60);
  });
});

describe("very little time", () => {
  it("revises a test tomorrow this evening, in a few combined sessions, and keeps the test day free", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Acids and bases quiz", units: units(6) });
    const snap = snapshot({ today: TODAY, nowMinute: 17 * 60 + 30 }, 3, [0]);
    const m: WorkModel = { goals: [goal("g1", { title: "Quiz", type: "exam", due: addDays(TODAY, 1), syllabus, preset: "exam" })], items: [], practices: [], constraints: [], assumptions: [], questions: [] };
    const { model } = compileStudyPath(m, "g1", snap);
    const input = { snapshot: snap, model, blocks: [] };
    const result = solve(input);
    expect(verify(input, result).pass).toBe(true);
    expect(model.items.length).toBeLessThanOrEqual(4);
    expect(model.items.map((i) => i.title)).toContain("Mixed practice: all topics");
    expect(result.unplaced).toEqual([]);
    expect(result.blocks.length).toBeGreaterThan(0);
    for (const b of result.blocks) expect(b.date).toBe(TODAY);
  });
});

describe("titles and points", () => {
  it("numbers timed papers per paper", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Maths", units: units(12), papers: [{ label: "Paper 1", minutes: 120, marks: 110 }, { label: "Paper 2", minutes: 120, marks: 110 }] });
    const { model } = plan("course", syllabus, addDays(TODAY, 170), { type: "exam", pace: { minutesPerDay: 60 } }, 30);
    const titles = model.items.filter((i) => i.details?.role === "paper").map((i) => i.title);
    expect(titles).toContain("Paper 1 timed past paper");
    expect(titles).toContain("Paper 2 timed past paper");
    expect(titles).toContain("Paper 2 timed past paper 2");
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("keeps key points whole and cuts long names at a natural break", () => {
    expect(shortPoint("Describe the effect of antiseptics and antibiotics on bacterial growth (required practical 2), including zones of inhibition")).toBe("Describe the effect of antiseptics and antibiotics on bacterial growth");
    expect(shortPoint("Classify pathogens and describe methods of spreading disease")).toBe("Classify pathogens and describe methods of spreading disease");
    expect(shortPoint("x".repeat(30) + " " + "word ".repeat(30))).not.toMatch(/…|\s$/);
    expect(shortTitle("General principles of foundational science")).toBe("General principles");
  });
});

describe("assignments", () => {
  it("spread over the time to their date instead of the first free days", () => {
    const snap = snapshot({ today: TODAY, nowMinute: 9 * 60 }, 21, [0]);
    const due = addDays(TODAY, 20);
    const list = ["Find sources", "Read and note sources", "Outline", "Draft part 1", "Draft part 2", "Revise", "Final check"].map((title, i, all) => item(`n${i + 1}`, { goal: "g1", title, est: [90, 120], chunk: [30, 60, 90], after: i ? [`n${i}`] : [] , ...(i === all.length - 1 ? { est: [30, 40], chunk: [30, 30, 40] } : {}) }));
    const m: WorkModel = { goals: [goal("g1", { title: "Essay", type: "essay", due, preset: "assignment" })], items: list, practices: [], constraints: [], assumptions: [], questions: [] };
    const paced = paceWork(m, "g1", snap);
    const input = { snapshot: snap, model: paced, blocks: [] };
    const result = solve(input);
    expect(verify(input, result).pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    const last = result.blocks.filter((b) => b.item === "n7").map((b) => b.date).sort().at(-1)!;
    expect(diffDays(last, TODAY)).toBeGreaterThanOrEqual(12);
    expect(last < due).toBe(true);
    const drafts = result.blocks.filter((b) => b.item === "n4").map((b) => b.date).sort()[0];
    expect(diffDays(drafts, TODAY)).toBeGreaterThanOrEqual(4);
  });
});

describe("far too little time", () => {
  it("gives each topic one combined session rather than leaving work unplaced", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Cloud certification", units: units(17), papers: [{ label: "Exam", minutes: 130, marks: 65 }] });
    const { model, result, check } = plan("exam", syllabus, addDays(TODAY, 35), { pace: { minutesPerDay: 45 } }, 35);
    expect(check.pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    expect(model.items.map((i) => i.title)).toContain("Topic 1 revision and practice");
    expect(model.items.filter((i) => i.details?.role === "practise")).toEqual([]);
  });

  it("reads a long book at the pace offered, short chapters sharing a sitting", () => {
    const chapters = Array.from({ length: 40 }, (_, i) => ({ title: `Chapter ${i + 1}`, points: ["Idea"], weight: 1 as const, difficulty: 1 as const }));
    const syllabus = normalizeSyllabus({ source: "model", name: "A long book", units: chapters });
    const { model, result, check } = plan("reading", syllabus, addDays(TODAY, 28), { type: "reading", pace: { minutesPerDay: 30 } }, 28);
    expect(check.pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    const reads = model.items.filter((i) => i.details?.role === "read");
    expect(reads.length).toBeLessThan(40);
    expect(new Set(reads.flatMap((i) => i.details!.units)).size).toBe(40);
    expect(reads.some((i) => /^Read: Chapter \d+(?:, Chapter \d+)* (?:and|to) Chapter \d+$/.test(i.title))).toBe(true);
  });
});

describe("the weeks beyond the calendar", () => {
  it("keep a topic's sessions in order, week by week", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Physics", units: units(12, 6), papers: [{ label: "Paper 1", minutes: 60, marks: 100 }] });
    const { model, result, check } = plan("exam", syllabus, addDays(TODAY, 90), { pace: { minutesPerDay: 180 } }, 14);
    expect(check.pass).toBe(true);
    const firstWeek = new Map<string, string>(); const lastWeek = new Map<string, string>();
    for (const b of result.weekBudgets) { if (!firstWeek.has(b.item) || b.week < firstWeek.get(b.item)!) firstWeek.set(b.item, b.week); if (!lastWeek.has(b.item) || b.week > lastWeek.get(b.item)!) lastWeek.set(b.item, b.week); }
    let checked = 0;
    for (const item of model.items) for (const pred of item.after) {
      if (!firstWeek.has(item.key) || !lastWeek.has(pred)) continue;
      checked++;
      expect(firstWeek.get(item.key)! >= lastWeek.get(pred)!, `${item.title} after ${pred}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("what the learner singles out", () => {
  it("is always covered, and counts as a weak spot", async () => {
    const { coverFocus, namedFocus } = await import("@/lib/planner/kernel");
    expect(namedFocus("I keep failing probability questions, especially conditional probability and Bayes")).toEqual(["conditional probability", "Bayes"]);
    expect(namedFocus("Get really good at integration by parts and substitution")).toEqual([]);
    const outline = normalizeSyllabus({ source: "model", name: "Probability", units: [{ title: "Conditional probability formula", points: ["Use P(A|B) = P(A and B)/P(B)", "Read a two-way table", "Restrict the sample space"] }, { title: "Tree diagrams", points: ["Multiply along branches", "Add across branches", "Draw a tree for two events"] }] });
    const covered = coverFocus(outline, "I keep failing probability questions, especially conditional probability and Bayes");
    expect(covered.units.map((u) => u.title)).toEqual(["Conditional probability formula", "Tree diagrams", "Bayes"]);
    expect(covered.units.at(-1)).toMatchObject({ confidence: "weak" });
    expect(coverFocus(covered, "especially Bayes").units).toHaveLength(3);
  });
});

describe("a topic to master in very little time", () => {
  it("gives each part one combined session, and keeps the recall checks and the test", () => {
    const syllabus = normalizeSyllabus({ source: "model", name: "Probability", units: units(8).map((u) => ({ ...u, weight: 3 as const, difficulty: 3 as const })) });
    const { model, result, check } = plan("mastery", syllabus, addDays(TODAY, 10), {}, 10);
    expect(check.pass).toBe(true);
    expect(result.unplaced).toEqual([]);
    const titles = model.items.map((i) => i.title);
    expect(titles).toContain("Topic 1 study and practice");
    expect(titles).toContain("Mastery test");
  });
});

describe("the double-check's official list", () => {
  it("finds official units the outline does not cover, and only those", async () => {
    const { uncoveredUnits } = await import("@/lib/planner/kernel");
    const outline = normalizeSyllabus({ source: "model", name: "Biology Paper 1", units: [
      { title: "Cell structure", points: ["Compare eukaryotic and prokaryotic cells", "Calculate magnification"] },
      { title: "Communicable diseases", points: ["Describe how pathogens spread", "Explain vaccination"] },
      { title: "Photosynthesis", points: ["Explain limiting factors", "Write the photosynthesis equation"] },
    ] });
    expect(uncoveredUnits(outline, ["Cell structure", "Infection and response: communicable diseases", "Photosynthesis", "Respiration", "Animal tissues, organs and organ systems"])).toEqual(["Respiration", "Animal tissues, organs and organ systems"]);
    expect(uncoveredUnits(outline, [])).toEqual([]);
    const liver = normalizeSyllabus({ source: "model", name: "B", units: [{ title: "Metabolism and the liver", points: ["Describe metabolism as the sum of reactions", "Explain glycogen storage"] }] });
    expect(uncoveredUnits(liver, ["Respiration and metabolism"])).toEqual(["Respiration and metabolism"]);
  });
});

describe("outline hygiene", () => {
  it("never makes two topics of one by a rename, and leaves coursework to assignments", async () => {
    const { applyCorrections, dropCoursework } = await import("@/lib/planner/kernel");
    const outline = normalizeSyllabus({ source: "model", name: "USMLE", units: [{ title: "Immune system", points: ["a", "b", "c"] }, { title: "Blood and immune systems", points: ["a", "b", "c"] }] });
    const renamed = applyCorrections(outline, { add: [], remove: [], rename: [{ from: "Immune system", to: "Blood and immune systems" }], papers: null, edition: null });
    expect(renamed.units.map((u) => u.title)).toEqual(["Immune system", "Blood and immune systems"]);
    const ib = normalizeSyllabus({ source: "model", name: "IB", units: [{ title: "Calculus", points: [] }, { title: "Internal assessment: Mathematical exploration", points: [] }] });
    expect(dropCoursework(ib).units.map((u) => u.title)).toEqual(["Calculus"]);
  });
});
