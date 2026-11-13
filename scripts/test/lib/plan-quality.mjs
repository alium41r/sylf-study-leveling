/**
 * The planner's automatic quality scorer. Given one generated proposal and the case it answers, it checks what a plan must get right and can be
 * checked without judgment: that everything fits and passes, that nothing is studied on or after exam day, that daily limits hold, that practice
 * never comes before its revision, that topics are the right kind and size, that titles and descriptions are clean, and, where the case states
 * them, the preset, the paper's length and marks, and topics that must or must not be there. Judgment (is the syllabus right, is the sequence
 * good teaching) is the human review beside it. Pure: no I/O.
 */

const lower = (s) => String(s ?? "").toLowerCase();
const re = (pattern) => new RegExp(pattern, "i");
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const UNIT_RANGE = { exam: [3, 30], course: [5, 40], mastery: [2, 10], skill: [3, 14], reading: [3, 40] };
const FIRST_ROLES = ["revise", "learn", "lesson", "read"];

export function scorePlan({ c, today, due, proposal, goal, seconds, error }) {
  const checks = [];
  const add = (id, ok, detail, weight = 1) => checks.push({ id, ok: Boolean(ok), detail: ok ? "" : detail, weight });
  const expect = c.expect ?? {};
  add("generated", proposal && goal, error ?? "No proposal or no goal came back", 5);
  if (!proposal || !goal) return finish(checks);

  const items = (proposal.model?.items ?? []).filter((i) => i.goal === goal.key && i.status !== "dropped");
  const keys = new Set(items.map((i) => i.key));
  const blocks = (proposal.result?.blocks ?? []).filter((b) => keys.has(b.item) && b.state !== "skipped");
  const budgets = (proposal.result?.weekBudgets ?? []).filter((b) => keys.has(b.item));
  const unplaced = (proposal.result?.unplaced ?? []).filter((u) => keys.has(u.item));
  const syllabus = goal.syllabus ?? null;
  const units = syllabus?.units?.filter((u) => u.included !== false) ?? [];
  const preset = goal.preset ?? null;
  const roleOf = (item) => item.details?.role ?? null;
  const firstBlock = (key) => blocks.filter((b) => b.item === key).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0] ?? null;

  add("checks pass", proposal.verification?.pass === true, "The plan failed its own hard checks", 5);
  add("nothing unplaced", unplaced.length === 0, `${unplaced.length} session(s) unplaced: ${unplaced.map((u) => `${items.find((i) => i.key === u.item)?.title} (${u.minutes} min)`).join("; ")}`, 4);
  add("fast enough", seconds < 60, `Took ${seconds} s`, 1);
  if (expect.preset) add("preset", re(`^(${expect.preset})$`).test(preset ?? ""), `Planned as ${preset}, expected ${expect.preset}`, 3);
  if (expect.itemsAtLeast) add("enough sessions", items.length >= expect.itemsAtLeast, `${items.length} sessions, expected at least ${expect.itemsAtLeast}`, 2);
  for (const pattern of expect.titlesInclude ?? []) add(`a session for /${pattern}/`, items.some((i) => re(pattern).test(i.title)), `No session title matches /${pattern}/`, 2);

  // Dates: nothing on or after the exam, the plan reaches the date, and starts when asked.
  if (due) {
    const late = blocks.filter((b) => b.date >= due);
    add("nothing on or after the date", late.length === 0, `${late.length} block(s) on or after ${due}`, 4);
    if (expect.spansToDue || expect.preset === "exam") {
      const last = [...blocks.map((b) => b.date), ...items.filter((i) => budgets.some((w) => w.item === i.key)).map((i) => i.due ?? i.earliest ?? "")].filter(Boolean).sort().at(-1);
      add("reaches the date", last && diffDays(due, last) <= 7, `Last session ${last ?? "none"}, ${last ? diffDays(due, last) : "?"} days before ${due}`, 2);
    }
  }
  if (expect.startsOnOrAfter != null) {
    const start = addDays(today, expect.startsOnOrAfter);
    const early = blocks.filter((b) => b.date < start);
    add("starts when asked", early.length === 0, `${early.length} block(s) before ${start}`, 3);
  }
  if (expect.noStudyOnDue && due) add("exam day free", !blocks.some((b) => b.date === due), "Study placed on the exam day", 3);

  // Daily limit: the student's minutes a day hold on every day; only a full paper may run longer, and then it has the day to itself.
  const cap = (proposal.model?.constraints ?? []).find((x) => x.kind === "goal_cap" && x.goal === goal.key)?.minutes ?? null;
  const asked = c.minutesPerDay && preset !== "skill" && preset !== "assignment" ? c.minutesPerDay : null;
  const limit = asked ?? cap;
  if (limit) {
    const perDay = new Map();
    for (const b of blocks) perDay.set(b.date, [...(perDay.get(b.date) ?? []), b]);
    const over = [...perDay].filter(([, list]) => { const m = list.reduce((s, b) => s + b.end - b.start, 0); return m > limit && !(new Set(list.map((b) => b.item)).size === 1 && roleOf(items.find((i) => i.key === list[0].item) ?? {}) === "paper"); });
    add("daily limit held", over.length === 0, `${over.length} day(s) over ${limit} min: ${over.slice(0, 3).map(([d, list]) => `${d} ${list.reduce((s, b) => s + b.end - b.start, 0)}`).join(", ")}`, 4);
  }
  if (asked) add("hours a day became the cap", cap != null && cap <= asked, cap == null ? "No daily cap from the student's hours a day" : `Cap ${cap} min, student asked ${asked}`, 3);
  // Time used: with the student's minutes a day over two weeks or more, the plan uses at least half of what they offered.
  if (asked && due && diffDays(due, today) >= 14) {
    const studyDays = new Set([...blocks.map((b) => b.date)]).size;
    const planned = blocks.reduce((s, b) => s + b.end - b.start, 0) + budgets.reduce((s, b) => s + b.minutes, 0);
    const weekdays = Math.round((diffDays(due, addDays(today, expect.startsOnOrAfter ?? 0)) * 5) / 7);
    // What the plan may use: the student's minutes a day, or their account's daily cap when that is lower.
    const offered = weekdays * Math.min(asked, cap ?? asked);
    add("uses the time offered", planned >= offered * 0.5, `Planned ${Math.round(planned / 60)} h of about ${Math.round(offered / 60)} h offered (${Math.round((planned / Math.max(1, offered)) * 100)}%)`, 4);
    void studyDays;
  }
  // An assignment is spread over its time, not crammed into the first days.
  if (preset === "assignment" && due && diffDays(due, today) >= 7) {
    const last = blocks.map((b) => b.date).sort().at(-1);
    add("work spread to the date", last && diffDays(last, today) >= diffDays(due, today) * 0.5, `Last session ${last}, ${last ? diffDays(due, last) : "?"} days before ${due}`, 3);
  }
  // A test tomorrow is revised for today.
  if (due && diffDays(due, today) === 1) add("revised today", blocks.some((b) => b.date === today), "Nothing placed today for a test tomorrow", 4);
  if (expect.sessionMinutes) add("session length kept", items.every((i) => i.est?.[0] === expect.sessionMinutes), `Session lengths ${[...new Set(items.map((i) => i.est?.[0]))].join(", ")}`, 2);

  // Order: a unit's practice never before its first study.
  if (syllabus) {
    let broken = 0;
    for (const unit of units) {
      const own = items.filter((i) => i.details?.units?.length === 1 && i.details.units[0] === unit.key);
      const first = own.find((i) => FIRST_ROLES.includes(roleOf(i)));
      const practice = own.filter((i) => roleOf(i) === "practise");
      const a = first ? firstBlock(first.key) : null;
      for (const p of practice) { const b = firstBlock(p.key); if (a && b && (b.date < a.date || (b.date === a.date && b.start < a.end))) broken++; }
    }
    add("practice after study", broken === 0, `${broken} practice session(s) before their topic's study`, 3);
  }

  // Exam shape: a light final review on the last study day before the exam; papers when the case wants them.
  if (preset === "exam" && due && diffDays(due, today) >= 3) {
    const final = items.find((i) => roleOf(i) === "final");
    const at = final ? firstBlock(final.key)?.date ?? final.due : null;
    add("light final review", final && at && diffDays(due, at) <= 3, final ? `Final review on ${at}` : "No final review", 2);
  }
  if (expect.papersAtLeast) add("enough timed papers", items.filter((i) => roleOf(i) === "paper").length >= expect.papersAtLeast, `${items.filter((i) => roleOf(i) === "paper").length} timed papers`, 2);

  // Syllabus: size, coverage, scope, paper facts and weak spots.
  if (syllabus) {
    const [lo, hi] = expect.units ?? UNIT_RANGE[preset] ?? [1, 40];
    add("topic count", units.length >= lo && units.length <= hi, `${units.length} topics, expected ${lo}–${hi}`, 2);
    const text = lower(units.map((u) => `${u.title} ${(u.points ?? []).join(" ")}`).join(" | "));
    for (const pattern of expect.include ?? []) add(`covers /${pattern}/`, re(pattern).test(text), `No topic covers /${pattern}/`, 3);
    for (const pattern of expect.exclude ?? []) add(`leaves out /${pattern}/`, !units.some((u) => re(pattern).test(u.title)), `A topic title matches /${pattern}/: ${units.filter((u) => re(pattern).test(u.title)).map((u) => u.title).join(", ")}`, 3);
    if (expect.paper) {
      const papers = syllabus.papers ?? [];
      const minutes = expect.paper.minutes;
      if (minutes) add("paper length", papers.some((p) => Math.abs(p.minutes - minutes) <= minutes * 0.1), `Papers: ${papers.map((p) => `${p.label} ${p.minutes} min`).join("; ") || "none"}, expected ${minutes} min`, 2);
      if (expect.paper.marks) add("paper marks", papers.some((p) => p.marks === expect.paper.marks), `Papers: ${papers.map((p) => `${p.label} ${p.marks ?? "?"} marks`).join("; ") || "none"}, expected ${expect.paper.marks}`, 2);
    }
    for (const pattern of expect.weak ?? []) add(`weak spot /${pattern}/ marked`, units.some((u) => re(pattern).test(u.title) && u.confidence === "weak"), `No weak topic matches /${pattern}/`, 2);
    const names = units.map((u) => lower(u.title));
    add("no duplicate topics", new Set(names).size === names.length, `Duplicates: ${names.filter((n, i) => names.indexOf(n) !== i).join(", ")}`, 2);
    if (syllabus.source !== "student" && syllabus.source !== "subject") add("key points on every topic", units.every((u) => (u.points ?? []).length >= 2), `Topics with fewer than two key points: ${units.filter((u) => (u.points ?? []).length < 2).map((u) => u.title).join(", ")}`, 2);
    add("topic names clean", units.every((u) => u.title.length <= 48 && !/…|&amp;|&quot;|<|>|\b(u\d+|n\d+|G\d+)\b/.test(u.title)), `Bad topic names: ${units.filter((u) => u.title.length > 48 || /…|&amp;|&quot;|<|>/.test(u.title)).map((u) => u.title).join(", ")}`, 2);
    const cut = units.flatMap((u) => u.points ?? []).filter((p) => /…|&amp;|&quot;/.test(p));
    add("key points whole", cut.length === 0, `${cut.length} key point(s) cut or dirty: ${cut.slice(0, 2).join("; ")}`, 2);
  }

  // Sessions: clean titles and a description for every compiled session.
  const badTitles = items.filter((i) => i.title.length > 60 || /…|&amp;|&quot;/.test(i.title));
  add("session titles clean", badTitles.length === 0, `Cut or dirty titles: ${badTitles.slice(0, 4).map((i) => i.title).join("; ")}`, 2);
  if (syllabus) add("every session explained", items.every((i) => i.details?.aim && (i.details.points?.length || i.details.how)), `${items.filter((i) => !i.details?.aim).length} session(s) without an aim`, 2);
  return finish(checks);
}

function finish(checks) {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  return { score: total ? Math.round((got / total) * 100) : 0, failed: checks.filter((c) => !c.ok), checks };
}
