// Live check of syllabus matching against the running local server: a fresh test account, varied requests in order, and what each one decided.
import { writeFileSync } from "node:fs";

const base = "http://127.0.0.1:3111";
const out = process.argv[2];
const only = (process.argv[3] ?? "").split(",").filter(Boolean);
let cookie = "";
const call = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const set = response.headers.getSetCookie().find((line) => line.startsWith("hunter_token="));
  if (set) cookie = set.split(";")[0];
  return { status: response.status, json: await response.json().catch(() => null) };
};
const tag = Date.now().toString(36);
const registered = await call("/api/auth/register", { email: `match_${tag}@local.test`, password: `Match-${tag}-Password1!`, name: "Match check", username: `match_${tag}`, timezone: "UTC" });
if (registered.status !== 201) throw new Error(`register ${registered.status}`);
const today = (await call("/api/planner/studio")).json?.snapshot?.today;
const plus = (days) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

const cases = [
  { id: "further-p1p2", title: "A level CAIE Further Maths paper 1 and paper 2 complete for midterm exams preparation", preset: "auto", due: 17, expect: "research: Further Pure Mathematics 1 and 2, never 9709" },
  { id: "maths-p1", title: "Maths mid term Complete Paper 1 CAIE A levels", preset: "auto", due: 18, expect: "catalog 9709 P1" },
  { id: "physics-p4", title: "Cambridge International A Level Physics 9702 Paper 4 mock", preset: "exam", due: 30, expect: "catalog 9702 P4" },
  { id: "maths-p1p3", title: "CAIE A level maths papers 1 and 3 mocks", preset: "exam", due: 25, expect: "catalog 9709 P1 + P3" },
  { id: "further-again", title: "Cambridge International A Level Further Mathematics 9231 Papers 1 and 2 test", preset: "exam", due: 20, expect: "library: the Further Maths entry saved by the first case" },
  { id: "further-p3", title: "CAIE A Level Further Mathematics Paper 3 Further Mechanics", preset: "exam", due: 20, expect: "research (paper 3 is not stored), never the P1+P2 entry" },
  { id: "edexcel-further", title: "Edexcel A level Further Maths Core Pure 1 exam", preset: "exam", due: 30, expect: "research (another board), never CAIE" },
  { id: "maths-whole", title: "Cambridge A Level Mathematics 9709, the whole course for May", preset: "course", due: 150, expect: "research a whole course: one paper is not the course" },
  { id: "igcse-0580", title: "IGCSE Mathematics 0580 Paper 4 extended", preset: "exam", due: 40, expect: "research; not A Level 9709" },
  { id: "further-mock-dec", title: "CAIE Further Maths P1 and P2 mock exams in December, I need to cover everything properly", preset: "auto", due: 25, expect: "library: the Papers 1 and 2 entry" },
  { id: "further-fp1", title: "Cambridge A Level Further Mathematics 9231 Paper 1 Further Pure Mathematics 1 only, end of term test", preset: "exam", due: 21, expect: "research Paper 1 alone, never the 1 and 2 entry" },
  { id: "bayes", title: "I keep failing probability questions, especially conditional probability and Bayes", preset: "auto", due: 10, expect: "not a named syllabus: mapped as before" },
].filter((c) => !only.length || only.includes(c.id));

const results = [];
for (const [index, c] of cases.entries()) {
  const started = Date.now();
  const response = await fetch(`${base}/api/planner/studio/stream`, { method: "POST", headers: { cookie, "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ workflow: "add_goal", key: `match-${tag}-${index}`, title: c.title, preset: c.preset, due: plus(c.due) }) });
  const events = (await response.text()).split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const state = (await call("/api/planner/studio")).json;
  const goal = state?.proposal?.model?.goals?.find((g) => c.title.startsWith(g.title.slice(0, 30)));
  const s = goal?.syllabus;
  const result = { id: c.id, expect: c.expect, seconds: Math.round((Date.now() - started) / 100) / 10, status: response.status, error: events.find((e) => e.type === "error")?.message ?? null,
    stages: events.filter((e) => e.type === "stage").map((e) => e.text), preset: goal?.preset ?? null, calls: state?.proposal?.trace?.tokens?.calls ?? null,
    syllabus: s ? { source: s.source, ref: s.ref ?? null, name: s.name, library: s.library ?? null, identity: s.identity ?? null, researched: s.researched ?? false, papers: s.papers, units: s.units.map((u) => u.title) } : null,
    notes: state?.proposal?.notes ?? null, pass: state?.proposal?.verification?.pass ?? null };
  results.push(result);
  console.log(`${c.id}: ${result.seconds}s ${result.syllabus?.source ?? "none"}${result.syllabus?.library ? ` library(${result.syllabus.library.reused ? "reused" : "new"})` : ""} · ${result.syllabus?.name ?? result.error} · ${result.syllabus?.units.length ?? 0} units`);
  // Accept each plan, so the next request starts from a clean proposal (a new goal joins the open plan otherwise).
  if (state?.proposal?.id) await call("/api/planner/studio", { action: "discard", proposalId: state.proposal.id });
  writeFileSync(out, JSON.stringify(results, null, 1));
}
