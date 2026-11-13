"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Search } from "lucide-react";
import {
  workspaceRequest,
  streamWorkspaceActivity,
} from "@/lib/planner/v2/client/transport";
import type {
  PlannerActivity,
  PlannerReasoningText,
} from "@/lib/planner/v2/client/workspace";
import s from "./StudentPlannerWorkspace.module.css";

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function inferLiveStage(calls: PlannerActivity["calls"]): number | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    const label = calls[i].label;
    if (/Reviewing/i.test(label)) return 4;
    if (/Translating/i.test(label)) return 2;
    if (/strategy/i.test(label)) return 1;
  }
  return calls.length > 0 ? 0 : null;
}

function ReasoningBlock({
  call,
  planId,
  attemptId,
  now,
  onInspect,
}: {
  call: PlannerActivity["calls"][number];
  planId: string;
  attemptId: string;
  now: number;
  onInspect: () => void;
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null),
    [full, setFull] = useState<PlannerReasoningText | null>(null),
    [failed, setFailed] = useState(false);
  const hasReasoning = Boolean(
    call.reasoning?.recorded &&
      (call.reasoning.characters > 0 || call.reasoning.text.length > 0)
  );
  const open = manualOpen ?? (call.state === "WORKING" && hasReasoning);
  const streamRef = useRef<HTMLDivElement>(null),
    pinnedRef = useRef(true);

  useEffect(() => {
    if (!open || call.state === "WORKING" || !hasReasoning || full) return;
    const controller = new AbortController();
    let active = true;
    void workspaceRequest<PlannerReasoningText>(
      `/workspace?planId=${encodeURIComponent(planId)}&attemptId=${encodeURIComponent(attemptId)}&activity=true&reasoningCallId=${encodeURIComponent(call.id)}`,
      undefined,
      controller.signal
    )
      .then((value) => {
        if (active && typeof value.text === "string") {
          setFull(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, call.id, call.state, hasReasoning, planId, attemptId, full]);

  const reasoning = full ?? call.reasoning;
  const activeText = reasoning?.text ?? "";

  useEffect(() => {
    if (call.state !== "WORKING") return;
    const el = streamRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeText, call.state]);

  const callSeconds =
    call.state === "WORKING" && call.startedAt
      ? Math.max(0, Math.floor((now - Date.parse(call.startedAt)) / 1000))
      : null;

  if (!hasReasoning && call.state !== "WORKING") {
    return (
      <div className={s.stepPlain}>
        <span className={s.thinkingLabel}>
          <span>{call.label}</span>
          <small>{call.state === "RECEIVED" ? "Done" : "Stopped"}</small>
        </span>
      </div>
    );
  }

  if (!hasReasoning && call.state === "WORKING") {
    return (
      <div className={s.stepPlain} data-live="true">
        <span className={s.thinkingLabel}>
          <span>{call.label}</span>
          <small>
            {callSeconds !== null ? formatElapsed(callSeconds) : "Working"}
          </small>
        </span>
      </div>
    );
  }

  return (
    <details
      className={s.thinkingBlock}
      data-live={call.state === "WORKING"}
      open={open}
      onToggle={(event) => {
        event.stopPropagation();
        if (event.currentTarget.open !== open)
          setManualOpen(event.currentTarget.open);
        if (event.currentTarget.open && call.state !== "WORKING") onInspect();
      }}
    >
      <summary>
        <span className={s.thinkingLabel}>
          <span>{call.label}</span>
          <small>
            {call.state === "WORKING"
              ? callSeconds !== null
                ? `Thinking · ${formatElapsed(callSeconds)}`
                : "Thinking"
              : call.state === "RECEIVED"
                ? "Done"
                : "Stopped"}
          </small>
        </span>
        <ChevronDown size={13} />
      </summary>
      <div className={s.thinkingBody}>
        <div
          ref={streamRef}
          className={s.thinkingText}
          data-streaming={call.state === "WORKING"}
          onScroll={() => {
            const el = streamRef.current;
            if (el) {
              pinnedRef.current =
                el.scrollHeight - el.clientHeight - el.scrollTop < 36;
            }
          }}
        >
          {reasoning?.text}
          {call.state === "WORKING" && (
            <span className={s.streamCursor} aria-hidden="true" />
          )}
        </div>
        {reasoning?.clipped && call.state !== "WORKING" && (
          <p className={s.thinkingStatus}>Loading full trace…</p>
        )}
        {failed && (
          <p role="status" className={s.thinkingStatus}>
            Trace unavailable. Reopen to retry.
          </p>
        )}
      </div>
    </details>
  );
}

function ToolAction({ event }: { event: PlannerActivity["research"][number] }) {
  const Icon = event.label === "Search" ? Search : FileText;
  if (!event.reason) {
    return (
      <div className={s.traceStatic}>
        <Icon size={13} />
        <span>
          {event.label} <span className={s.muted}>· {event.detail}</span>
          {event.working ? " · …" : ""}
        </span>
      </div>
    );
  }
  return (
    <details className={s.traceAction}>
      <summary>
        <Icon size={13} />
        <span>
          {event.label} <span className={s.muted}>· {event.detail}</span>
          {event.working ? " · …" : ""}
        </span>
      </summary>
      <p>{event.reason}</p>
    </details>
  );
}

export default function PlanningActivity({
  planId,
  attemptId,
  running,
  onStageHint,
  onActivityStep,
}: {
  planId: string;
  attemptId: string;
  running: boolean;
  onStageHint?: (stageIndex: number | null) => void;
  onActivityStep?: () => void;
}) {
  const [activity, setActivity] = useState<PlannerActivity | null>(null),
    [unavailable, setUnavailable] = useState(false),
    [manualExpanded, setManualExpanded] = useState<boolean | null>(null),
    [draftManualOpen, setDraftManualOpen] = useState<boolean | null>(null),
    [now, setNow] = useState(() => Date.now());
  const expanded = manualExpanded ?? running;
  const trace = useRef<HTMLDivElement>(null),
    draftRef = useRef<HTMLDivElement>(null),
    following = useRef(true),
    stepCbRef = useRef(onActivityStep),
    stageCbRef = useRef(onStageHint);

  useEffect(() => {
    stepCbRef.current = onActivityStep;
    stageCbRef.current = onStageHint;
  }, [onActivityStep, onStageHint]);

  useEffect(() => {
    if (!activity) return;
    stageCbRef.current?.(inferLiveStage(activity.calls));
  }, [activity]);

  useEffect(() => {
    if (trace.current && following.current)
      trace.current.scrollTop = trace.current.scrollHeight;
    if (
      draftRef.current &&
      following.current &&
      activity?.output?.state === "WRITING"
    )
      draftRef.current.scrollTop = draftRef.current.scrollHeight;
  }, [activity]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    let stopped = false,
      inFlight = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      notifyTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const notifyParent = () => {
      if (stopped || !stepCbRef.current) return;
      if (notifyTimer) clearTimeout(notifyTimer);
      notifyTimer = setTimeout(() => {
        if (!stopped) stepCbRef.current?.();
      }, 250);
    };
    const refresh = async () => {
      if (stopped || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await workspaceRequest<PlannerActivity>(
          `/workspace?planId=${encodeURIComponent(planId)}&attemptId=${encodeURIComponent(attemptId)}&activity=true`,
          undefined,
          controller.signal
        );
        if (
          !stopped &&
          next.attemptId === attemptId &&
          Array.isArray(next.calls) &&
          Array.isArray(next.research)
        ) {
          setActivity(next);
          setUnavailable(false);
        }
      } catch {
        if (!stopped) setUnavailable(true);
      } finally {
        inFlight = false;
        if (!stopped && running) timer = setTimeout(() => void refresh(), 2500);
      }
    };
    let stream: AbortController | undefined,
      connected = false,
      finished = false,
      seenInitial = false;
    const connect = async () => {
      if (stopped || document.hidden || connected || !running) return;
      connected = true;
      stream = new AbortController();
      try {
        await streamWorkspaceActivity(
          `/workspace?planId=${encodeURIComponent(planId)}&attemptId=${encodeURIComponent(attemptId)}&activity=true&stream=true`,
          stream.signal,
          (event, value) => {
            if (stopped) return;
            if (event === "activity") {
              const next = value as PlannerActivity;
              if (
                next.attemptId === attemptId &&
                Array.isArray(next.calls) &&
                Array.isArray(next.research)
              ) {
                setActivity(next);
                setUnavailable(false);
                if (seenInitial) notifyParent();
                seenInitial = true;
              }
            } else if (event === "preview") {
              const preview = value as {
                attemptId: string;
                reasoning?: PlannerActivity["calls"][number]["reasoning"] & {
                  callId: string;
                };
                output?: PlannerActivity["output"];
              };
              if (preview.attemptId === attemptId)
                setActivity((current) =>
                  current
                    ? {
                        ...current,
                        calls: current.calls.map((call) =>
                          preview.reasoning?.callId === call.id &&
                          call.state === "WORKING"
                            ? { ...call, reasoning: preview.reasoning }
                            : call
                        ),
                        ...(preview.output ? { output: preview.output } : {}),
                      }
                    : current
                );
            } else if (event === "done") {
              finished = true;
              notifyParent();
            } else if (event === "unavailable")
              throw new Error("Stream interrupted");
          }
        );
      } catch {
        if (!stopped && !stream.signal.aborted) {
          setUnavailable(true);
          await refresh();
        }
      } finally {
        connected = false;
        if (!stopped && running && !finished && !document.hidden)
          timer = setTimeout(() => void connect(), 1000);
      }
    };
    const resume = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) stream?.abort();
      else if (running) void connect();
      else void refresh();
    };
    if (running) void connect();
    else void refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      stopped = true;
      controller.abort();
      stream?.abort();
      if (timer) clearTimeout(timer);
      if (notifyTimer) clearTimeout(notifyTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [planId, attemptId, running]);

  const seconds = activity?.startedAt
    ? Math.max(
        0,
        Math.floor(
          ((activity.finishedAt ? Date.parse(activity.finishedAt) : now) -
            Date.parse(activity.startedAt)) /
            1000
        )
      )
    : null;
  const status =
    activity?.state === "SUCCEEDED"
      ? "Completed"
      : running
        ? "Live"
        : "Trace";
  const known = new Set(activity?.calls.map((call) => call.id));
  const searches =
      activity?.research.filter((event) => event.label === "Search").length ??
      0,
    reads = activity?.research.filter((event) => event.label === "Read").length ?? 0;
  const showOutput =
    !!activity?.output && (running || activity.output.state !== "RECEIVED");

  return (
    <details
      className={s.feed}
      data-running={running}
      open={expanded}
      onToggle={(event) => {
        if (event.currentTarget.open !== expanded)
          setManualExpanded(event.currentTarget.open);
      }}
    >
      <summary className={s.feedHead}>
        <span
          className={s.feedDot}
          data-live={running}
          data-done={activity?.state === "SUCCEEDED"}
          aria-hidden="true"
        />
        <span className={s.feedTitle}>
          <span>{status}</span>
          {seconds !== null && (
            <small className={s.feedDuration}>{formatElapsed(seconds)}</small>
          )}
        </span>
        {activity && (
          <span className={s.feedStats}>
            {activity.calls.length > 0 && (
              <span>
                {activity.calls.length}{" "}
                {activity.calls.length === 1 ? "step" : "steps"}
              </span>
            )}
            {searches > 0 && (
              <span>
                {searches} {searches === 1 ? "search" : "searches"}
              </span>
            )}
            {reads > 0 && <span>{reads} read</span>}
          </span>
        )}
        <ChevronDown size={14} />
      </summary>
      {unavailable && (
        <p role="status" className={s.feedNote}>
          Live updates paused. Reconnecting…
        </p>
      )}
      {!activity && !unavailable && (
        <p className={s.feedNote}>Starting…</p>
      )}
      <div
        className={s.feedBody}
        ref={trace}
        onScroll={() => {
          const el = trace.current;
          if (el)
            following.current =
              el.scrollHeight - el.clientHeight - el.scrollTop < 64;
        }}
      >
        {activity?.calls.map((call) => (
          <div key={call.id} className={s.step}>
            <span
              className={s.stepDot}
              data-state={call.state}
              aria-hidden="true"
            >
              {call.state === "RECEIVED" ? (
                <Check size={10} strokeWidth={3} />
              ) : (
                <i className={s.stepPulse} />
              )}
            </span>
            <ReasoningBlock
              call={call}
              planId={planId}
              attemptId={attemptId}
              now={now}
              onInspect={() => {
                following.current = false;
              }}
            />
            {activity.research
              .filter((event) => event.callId === call.id)
              .map((event) => (
                <ToolAction key={event.id} event={event} />
              ))}
          </div>
        ))}
        {activity?.research
          .filter((event) => !event.callId || !known.has(event.callId))
          .map((event) => (
            <ToolAction key={event.id} event={event} />
          ))}
        {showOutput && activity?.output && (
          <details
            className={s.traceDraft}
            open={draftManualOpen ?? activity.output.state === "WRITING"}
            onToggle={(event) => {
              event.stopPropagation();
              const desired =
                draftManualOpen ?? activity.output?.state === "WRITING";
              if (event.currentTarget.open !== desired) {
                setDraftManualOpen(event.currentTarget.open);
              }
            }}
          >
            <summary>
              Strategy{" "}
              <span className={s.muted}>
                ·{" "}
                {activity.output.state === "WRITING"
                  ? "writing…"
                  : activity.output.state === "INTERRUPTED"
                    ? "partial"
                    : "done"}
              </span>
            </summary>
            <div ref={draftRef} className={s.strategyStreamText}>
              {activity.output.text}
              {activity.output.state === "WRITING" && (
                <span className={s.streamCursor} aria-hidden="true" />
              )}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
