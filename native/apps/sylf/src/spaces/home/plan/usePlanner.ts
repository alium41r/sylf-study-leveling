// One plan's journey, as the server reports it. The screen reads `view.workspace` to know what may happen and never works it out itself. While a run
// is going, and only while the app is in the foreground, the view and its activity are read again every few seconds, stopping on any settled state.
// Leaving the screen never cancels a run: the server owns it, and coming back reads where it got to.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useNotice } from "@sylf/design-system";
import type { BackendError, PlannerActivity, PlannerView } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { refreshPlan } from "./usePlan";

const POLL_MS = 5_000;
/** A refusal means the request itself was wrong, so the same key must not be replayed. A lost answer is different: the same key finds the first outcome. */
const DEFINITE = new Set(["invalid", "conflict", "forbidden", "not-found"]);

export interface Problem { action: string; text: string; /** True when the outcome is unknown and the same action can be sent again safely. */ retryable: boolean }

export function usePlannerPlan(planId: string) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const [view, setView] = useState<PlannerView | null>(null);
  const [activity, setActivity] = useState<PlannerActivity | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const keys = useRef(new Map<string, string>());
  const alive = useRef(true);
  const reading = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!backend) return null;
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    try {
      const next = await backend.reads.plan.planner.view(planId, controller.signal);
      if (!alive.current || controller.signal.aborted) return null;
      setView(next); setFailure(null); setOffline(false);
      if (next.attempt && backend.reads.plan.planner.settled(next.attempt.state) === false) {
        const live = await backend.reads.plan.planner.activity(planId, next.attempt.attemptId, controller.signal).catch(() => null);
        if (alive.current && !controller.signal.aborted) setActivity(live);
      } else setActivity(null);
      return next;
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return null;
      const kind = (error as BackendError).kind;
      if (kind !== "cancelled") { setOffline(kind === "offline"); setFailure(describeFailureText(error)); }
      return null;
    }
  }, [backend, planId]);

  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; reading.current?.abort(); }; }, [load]);

  const running = view?.attempt ? backend?.reads.plan.planner.settled(view.attempt.state) === false : false;
  useEffect(() => {
    if (!running) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => { timer = setTimeout(() => { if (AppState.currentState === "active") void load().finally(schedule); else schedule(); }, POLL_MS); };
    schedule();
    return () => { if (timer) clearTimeout(timer); };
  }, [running, load]);

  const keyFor = (name: string) => {
    let key = keys.current.get(name);
    if (!key && backend) { key = backend.reads.plan.planner.newKey(); keys.current.set(name, key); }
    return key ?? "";
  };

  /** Sends one action. Nothing retries on its own, and a retry of the same action reuses its key. */
  const act = useCallback(async (name: string, send: (key: string) => Promise<unknown>, done?: string, applied?: boolean) => {
    if (!backend || busy) return false;
    setBusy(name); setProblem(null);
    let ok = false;
    try {
      await send(keyFor(name));
      keys.current.delete(name); ok = true;
      if (done) notice(done);
      if (applied) refreshPlan(backend);
    } catch (error) {
      const kind = (error as BackendError).kind;
      if (DEFINITE.has(kind)) keys.current.delete(name);
      if (kind !== "cancelled") setProblem({ action: name, text: describeFailureText(error), retryable: !DEFINITE.has(kind) });
    }
    await load();
    if (alive.current) setBusy(null);
    return ok;
  }, [backend, busy, load, notice]);

  return { view, activity, failure, offline, busy, problem, running, reload: load, act, reads: backend?.reads.plan.planner ?? null };
}
