// The Studio's one state owner on the device. It opens the plan (the server senses what changed and repairs what the student's autonomy allows),
// streams planning workflows into an activity record, and previews drags and what-ifs with the same kernel the server commits with, so they answer in
// milliseconds and never wait on the network. Every write carries a key that is reused if the same action is retried, and nothing retries on its own.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useNotice } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import type { BackendError, BlockEdit, PlanRequest, StudioEvent, StudioProposal, StudioState, StudioWorkflow, SyllabusEdit } from "@sylf/backend";
import { useLiveBackend } from "../studioShell";
import { describeFailureText } from "../studioShell";
import { refreshPlan } from "../usePlan";

type Block = planning.Block;

export interface Activity {
  workflow: string;
  stages: { stage: string; text: string }[];
  interpretation: string | null;
  strategy: string[];
  items: planning.WorkItem[];
  /** Topics as the syllabus is mapped, and where the list came from. */
  units: planning.SyllabusUnit[];
  syllabus: { name: string; source: planning.Syllabus["source"] } | null;
  preview: { blocks: Block[]; summary: string; unplaced: number } | null;
  notices: string[];
  text: string;
  running: boolean;
  error: string | null;
  startedAt: number;
}

export interface LocalPreview {
  kind: "move" | "whatif";
  label: string;
  blocks: Block[];
  diff: planning.PlanDiff;
  result: planning.SolveResult;
  pass: boolean;
  ms: number;
  whatIf?: planning.WhatIf;
  move?: { block: string; date: string; start: number };
}

const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

export function useStudio() {
  const backend = useLiveBackend();
  const notice = useNotice();
  const reads = backend?.reads.plan.studio ?? null;
  const [state, setState] = useState<StudioState | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  // Sessions the student has dropped, shown where they landed at once while the server commits them in order.
  const [moving, setMoving] = useState<Record<string, { date: string; start: number }>>({});
  const moveQueue = useRef<Promise<void>>(Promise.resolve());
  const keys = useRef(new Map<string, string>());
  const alive = useRef(true);
  const stream = useRef<AbortController | null>(null);

  const keyFor = useCallback((name: string) => {
    let key = keys.current.get(name);
    if (!key && reads) { key = reads.newKey(); keys.current.set(name, key); }
    return key ?? "";
  }, [reads]);

  const fail = useCallback((error: unknown) => {
    const kind = (error as BackendError)?.kind;
    if (kind === "cancelled") return;
    setOffline(kind === "offline");
    setFailure(describeFailureText(error));
  }, []);

  const open = useCallback(async () => {
    if (!reads) return;
    try {
      const next = await reads.open();
      if (!alive.current) return;
      setState(next); setFailure(null); setOffline(false);
      if (next.repaired) notice(`Plan updated: ${next.repaired.summary}`);
    } catch (error) { if (alive.current) fail(error); }
  }, [reads, notice, fail]);

  useEffect(() => {
    alive.current = true;
    void open();
    const subscription = AppState.addEventListener("change", (status) => { if (status === "active") void open(); });
    return () => { alive.current = false; subscription.remove(); stream.current?.abort(); };
  }, [open]);

  /** Runs one write. On success the key is retired; a refusal retires it too, while a lost answer keeps it so a retry finds the first outcome. */
  const write = useCallback(async <T,>(name: string, send: (key: string) => Promise<T>, done?: (value: T) => void): Promise<T | null> => {
    if (!reads || busy) return null;
    setBusy(name);
    try {
      const value = await send(keyFor(name));
      keys.current.delete(name);
      done?.(value);
      if (backend) refreshPlan(backend);
      return value;
    } catch (error) {
      const kind = (error as BackendError)?.kind;
      if (["invalid", "conflict", "forbidden", "not-found"].includes(kind)) keys.current.delete(name);
      notice(describeFailureText(error), { tone: "caution" });
      return null;
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [reads, busy, keyFor, backend, notice]);

  const undo = useCallback(() => write("undo", (key) => reads!.undo(key), (value) => { setState(value.state); setPreview(null); notice(value.summary ? `Undone: ${value.summary}` : "Undone."); }), [write, reads, notice]);

  const committedNotice = useCallback((summary: string) => notice(summary, { tone: "positive", action: { label: "Undo", onPress: () => void undo() } }), [notice, undo]);

  /** Streams a workflow. Items, previews and the final proposal arrive as events; the state is read again at the end. */
  const run = useCallback(async (workflow: StudioWorkflow, label: string) => {
    if (!reads) return null;
    stream.current?.abort();
    const controller = new AbortController();
    stream.current = controller;
    const record: Activity = { workflow: workflow.workflow, stages: [], interpretation: null, strategy: [], items: [], units: [], syllabus: null, preview: null, notices: [], text: "", running: true, error: null, startedAt: Date.now() };
    setActivity({ ...record });
    setPreview(null);
    let proposal: StudioProposal | null = null;
    const update = () => { if (alive.current) setActivity({ ...record, stages: [...record.stages], items: [...record.items], units: [...record.units], strategy: [...record.strategy], notices: [...record.notices] }); };
    const onEvent = (event: StudioEvent) => {
      switch (event.type) {
        case "stage": { const last = record.stages[record.stages.length - 1]; if (last?.stage === event.stage) last.text = event.text; else record.stages.push({ stage: event.stage, text: event.text }); break; }
        case "interpretation": record.interpretation = event.text; break;
        case "strategy": record.strategy.push(event.text); break;
        case "item": record.items.push(event.item); break;
        case "unit": if (!record.units.some((u) => u.title === event.unit.title)) record.units.push(event.unit); break;
        case "units_reset": record.units = []; break;
        case "syllabus": record.syllabus = { name: event.name, source: event.source }; break;
        case "preview": record.preview = { blocks: event.blocks, summary: event.summary, unplaced: event.unplaced }; break;
        case "text": record.text += event.delta; break;
        case "notice": record.notices.push(event.text); break;
        case "proposal":
          proposal = event.proposal;
          // Show it at once: anything after this (the critic's review) refines it while the student is already reading.
          void reads.state(controller.signal).then((next) => { if (alive.current && !controller.signal.aborted) setState(next); }, () => undefined);
          break;
        case "error": record.error = event.message; break;
      }
      update();
    };
    try {
      await reads.run(workflow, onEvent, controller.signal);
      record.running = false; update();
      keys.current.delete(label);
      if (proposal) { const next = await reads.state(controller.signal).catch(() => null); if (next && alive.current) setState(next); }
      return proposal;
    } catch (error) {
      record.running = false;
      record.error = record.error ?? describeFailureText(error);
      update();
      const kind = (error as BackendError)?.kind;
      if (["invalid", "conflict", "not-found"].includes(kind)) keys.current.delete(label);
      return null;
    }
  }, [reads]);

  const command = useCallback((text: string) => run({ workflow: "command", key: keyFor(`command:${text}`), text }, `command:${text}`), [run, keyFor]);
  const addGoal = useCallback((input: { title?: string; type?: string; due?: string | null; subjectId?: number | null; notes?: string; goalKey?: string } & PlanRequest) => run({ workflow: "add_goal", key: keyFor(`goal:${input.goalKey ?? input.title}`), ...input }, `goal:${input.goalKey ?? input.title}`), [run, keyFor]);
  /** "No, it's off": the syllabus is researched and double-checked again with the note, and an improved plan comes back for review. */
  const recheck = useCallback((goal: string, note: string | null) => run({ workflow: "recheck", key: keyFor(`recheck:${goal}:${note ?? ""}`), goal, note }, `recheck:${goal}:${note ?? ""}`), [run, keyFor]);
  /** "Looks good", or closing the card: recorded, and the plan stays as it is. */
  const feedback = useCallback(async (goal: string, verdict: "accurate" | "dismissed") => {
    if (!reads) return;
    try { setState(await reads.feedback(goal, verdict)); if (verdict === "accurate") notice("Thanks. The plan stays as it is."); } catch (error) { notice(describeFailureText(error), { tone: "caution" }); }
  }, [reads, notice]);
  const answer = useCallback((question: string, reply: string) => run({ workflow: "answer", key: keyFor(`answer:${question}:${reply}`), question, answer: reply }, `answer:${question}:${reply}`), [run, keyFor]);
  const ask = useCallback((text: string) => run({ workflow: "question", text }, "question"), [run]);
  const brief = useCallback(() => run({ workflow: "brief" }, "brief"), [run]);
  const cancelRun = useCallback(() => { stream.current?.abort(); setActivity((current) => (current ? { ...current, running: false } : current)); }, []);
  const dismissActivity = useCallback(() => setActivity(null), []);

  const accept = useCallback(async (proposal: StudioProposal) => {
    const value = await write(`accept:${proposal.id}`, (key) => reads!.accept(proposal.id, key));
    if (!value) return;
    setState(value.state); setActivity(null); setPreview(null);
    if (value.rebased) notice("Your week changed while you were reviewing, so the proposal was re-planned. Have a look before accepting.", { tone: "caution" });
    else if (value.committed) committedNotice(value.committed.summary || "Plan updated.");
  }, [write, reads, notice, committedNotice]);

  const discard = useCallback(async (proposal: StudioProposal) => {
    if (!reads) return;
    try { setState(await reads.discard(proposal.id)); setActivity(null); } catch (error) { notice(describeFailureText(error), { tone: "caution" }); }
  }, [reads, notice]);

  const direct = useCallback(async (edits: BlockEdit[], name: string) => {
    const value = await write(name, (key) => reads!.direct(key, edits));
    if (value) { setState(value.state); setPreview(null); committedNotice(value.summary || "Plan updated."); }
    return Boolean(value);
  }, [write, reads, committedNotice]);

  /** Device-side reflow: the dragged block is pinned where it was dropped and everything else re-solves around it. */
  const previewMove = useCallback((block: string, date: string, start: number): LocalPreview | null => {
    if (!state) return null;
    const t0 = now();
    const target = state.blocks.find((b) => b.id === block);
    if (!target) return null;
    const length = target.end - target.start;
    const edited = state.blocks.map((b) => (b.id === block ? { ...b, date, start, end: start + length, pinned: true } : b));
    // Repair mode, as the server commits it: the dropped block is pinned and only what it displaces reflows.
    const input = { snapshot: state.snapshot, model: state.model, blocks: edited, mode: "repair" as const };
    const result = planning.solve(input);
    const verification = planning.verify(input, result);
    const diff = planning.diffPlans({ model: state.model, blocks: state.blocks }, { model: state.model, blocks: result.blocks }, state.snapshot.today);
    const day = state.snapshot.days.find((d) => d.date === date);
    const clash = day?.busy.find((b) => start < b.end && start + length > b.start);
    // The student's placement wins: an overlap is said, never refused.
    const next: LocalPreview = { kind: "move", label: `Move to ${planning.dayLabel(date)} ${planning.clockLabel(start)}${clash ? `, over ${clash.title}` : ""}`, blocks: result.blocks, diff, result, pass: verification.pass, ms: Math.round(now() - t0), move: { block, date, start } };
    setPreview(next);
    return next;
  }, [state]);

  const commitMove = useCallback(async (block: string, date: string, start: number) => direct([{ kind: "move", block, date, start }], `move:${block}:${date}:${start}`), [direct]);

  /**
   * A drag and drop. The session shows where it landed straight away; the server then commits the move, in the order the student made them, with
   * the plan reflowing around it. Nothing about the plan refuses it: only the clock bounds where it lands (`studentLanding`). A move that fails
   * on the server returns the session to where it was and says why.
   */
  const dropMove = useCallback((block: string, date: string, start: number) => {
    if (!state || !reads) return;
    const target = state.blocks.find((b) => b.id === block);
    if (!target || target.state === "done") return;
    const placed = planning.studentLanding(date, start, target.end - target.start, state.snapshot.today, state.snapshot.nowMinute);
    if (placed.date === target.date && placed.start === target.start && target.state === "committed") return;
    setPreview(null);
    setMoving((current) => ({ ...current, [block]: placed }));
    const name = `move:${block}:${placed.date}:${placed.start}`;
    moveQueue.current = moveQueue.current.then(async () => {
      try {
        const value = await reads.direct(keyFor(name), [{ kind: "move", block, date: placed.date, start: placed.start }]);
        keys.current.delete(name);
        if (!alive.current) return;
        setState(value.state);
        committedNotice(value.summary || `Moved to ${planning.dayLabel(placed.date)} ${planning.clockLabel(placed.start)}.`);
        if (backend) refreshPlan(backend);
      } catch (error) {
        const kind = (error as BackendError)?.kind;
        if (["invalid", "conflict", "forbidden", "not-found"].includes(kind)) keys.current.delete(name);
        if (alive.current) notice(describeFailureText(error), { tone: "caution" });
      } finally {
        if (alive.current) setMoving((current) => { if (current[block]?.date !== placed.date || current[block]?.start !== placed.start) return current; const next = { ...current }; delete next[block]; return next; });
      }
    });
  }, [state, reads, keyFor, committedNotice, notice, backend]);

  const previewWhatIf = useCallback((whatIf: planning.WhatIf, label: string): LocalPreview | null => {
    if (!state) return null;
    const t0 = now();
    const input = { snapshot: state.snapshot, model: state.model, blocks: state.blocks, whatIf };
    const result = planning.solve(input);
    const verification = planning.verify(input, result);
    const diff = planning.diffPlans({ model: state.model, blocks: state.blocks }, { model: state.model, blocks: result.blocks }, state.snapshot.today);
    const next: LocalPreview = { kind: "whatif", label, blocks: result.blocks, diff, result, pass: verification.pass, ms: Math.round(now() - t0), whatIf };
    setPreview(next);
    return next;
  }, [state]);

  const keepWhatIf = useCallback(async (whatIf: planning.WhatIf) => {
    const value = await write(`whatif:${JSON.stringify(whatIf)}`, (key) => reads!.whatIf(key, whatIf));
    if (value) { setState(value.state); setPreview(null); }
  }, [write, reads]);

  /** Rates, ticks or adds topics. The plan is rebuilt on the server without the model and comes back as a proposal to review. */
  const editSyllabus = useCallback(async (edit: SyllabusEdit) => {
    const value = await write(`syllabus:${JSON.stringify(edit)}`, (key) => reads!.syllabus(key, edit));
    if (value) { setState(value.state); setPreview(null); setActivity(null); }
    return Boolean(value);
  }, [write, reads]);

  const saveSettings = useCallback(async (patch: Partial<planning.StudioSettings>) => {
    if (!reads) return;
    setBusy("settings");
    try { setState(await reads.settings(patch)); notice("Planning settings saved."); } catch (error) { notice(describeFailureText(error), { tone: "caution" }); } finally { setBusy(null); }
  }, [reads, notice]);

  const explain = useCallback(async (block: string) => (reads ? reads.explain(block).catch(() => null) : null), [reads]);
  /** One sentence from the model, phrased only from the solver's reasons. */
  const explainSentence = useCallback(async (block: string) => {
    if (!reads) return null;
    try { const result = (await reads.run({ workflow: "explain", block }, () => undefined)) as { sentence?: string | null } | null; return result?.sentence ?? null; } catch { return null; }
  }, [reads]);

  const view = useMemo(() => {
    if (!state) return null;
    // What the timeline draws: a local preview first, then a streamed preview, then an open proposal, then the committed plan.
    const showing = (preview?.blocks ?? activity?.preview?.blocks ?? state.proposal?.result.blocks ?? state.plan.blocks) as Block[];
    const placed = (b: Block): Block => { const to = moving[b.id]; return to ? { ...b, date: to.date, start: to.start, end: to.start + (b.end - b.start), pinned: true, state: b.state === "missed" || b.state === "skipped" ? "committed" : b.state } : b; };
    const moved = Object.keys(moving).length ? showing.map(placed) : showing;
    // The committed plan with the same drops applied, so a dropped session is never mistaken for a proposal while it saves.
    const committed = Object.keys(moving).length ? state.blocks.map(placed) : state.blocks;
    return { blocks: moved, committed, source: preview ? preview.kind : activity?.preview ? "stream" : state.proposal ? "proposal" : "plan" };
  }, [state, preview, activity, moving]);

  return {
    state, failure, offline, busy, activity, preview, view, reads,
    open, command, addGoal, answer, ask, brief, cancelRun, dismissActivity, accept, discard, undo, direct, previewMove, commitMove, dropMove, moving,
    previewWhatIf, keepWhatIf, clearPreview: () => setPreview(null), saveSettings, explain, explainSentence, editSyllabus, recheck, feedback,
  };
}
export type Studio = ReturnType<typeof useStudio>;
