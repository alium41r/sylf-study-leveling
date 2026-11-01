"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Search } from "lucide-react";
import { SylvieIcon } from "@/app/components/icons";
import {
  workspaceRequest,
  streamWorkspaceActivity,
} from "@/lib/planner/v2/client/transport";
import type {
  PlannerActivity,
  PlannerReasoningText,
} from "@/lib/planner/v2/client/workspace";
import s from "./StudentPlannerWorkspace.module.css";

function ReasoningBlock({
  call,
  planId,
  attemptId,
  onInspect,
}: {
  call: PlannerActivity["calls"][number];
  planId: string;
  attemptId: string;
  onInspect: () => void;
}) {
  const [open, setOpen] = useState(call.state === "WORKING"),
    [full, setFull] = useState<PlannerReasoningText | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || call.state === "WORKING" || !call.reasoning?.recorded || full)
      return;
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
  }, [
    open,
    call.id,
    call.state,
    call.reasoning?.recorded,
    planId,
    attemptId,
    full,
  ]);
  const reasoning = full ?? call.reasoning;
  return (
    <details
      className={s.thinkingBlock}
      open={open}
      onToggle={(event) => {
        event.stopPropagation();
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open && call.state !== "WORKING") onInspect();
      }}
    >
      <summary>
        <span>
          {call.label}{" "}
          <small>
            ·{" "}
            {call.state === "WORKING"
              ? "Thinking"
              : call.state === "RECEIVED"
                ? "Response received"
                : "Stopped"}
          </small>
        </span>
        <ChevronDown size={14} />
        {reasoning?.text && (
          <span className={s.thinkingExcerpt}>{reasoning.text}</span>
        )}
      </summary>
      <div className={s.thinkingBody}>
        <p className={s.muted}>
          DeepSeek-provided reasoning
          {reasoning?.redacted
            ? " · sensitive details and internal references hidden"
            : ""}
          .
        </p>
        {reasoning?.recorded ? (
          <div className={s.thinkingText}>{reasoning.text}</div>
        ) : (
          <p>
            {call.state === "WORKING"
              ? "Waiting for the provider’s reasoning stream…"
              : "No provider reasoning was recorded for this response."}
          </p>
        )}
        {reasoning?.clipped && (
          <p className={s.muted}>
            {call.state === "WORKING"
              ? "Live display limit reached. The complete provider trace will be available when this response finishes."
              : "Loading the complete retained provider trace…"}
          </p>
        )}
        {failed && (
          <p role="status">
            The complete trace could not be loaded. The received preview is
            retained; reopen this block to retry.
          </p>
        )}
      </div>
    </details>
  );
}
function ToolAction({ event }: { event: PlannerActivity["research"][number] }) {
  const Icon = event.label === "Search" ? Search : FileText;
  return (
    <details className={s.traceAction}>
      <summary>
        <Icon size={15} />
        <span>
          {event.label} <span className={s.muted}>· {event.detail}</span>
          {event.working ? " · working" : ""}
        </span>
      </summary>
      {event.reason && <p>{event.reason}</p>}
    </details>
  );
}
export default function PlanningActivity({
  planId,
  attemptId,
  running,
}: {
  planId: string;
  attemptId: string;
  running: boolean;
}) {
  const [activity, setActivity] = useState<PlannerActivity | null>(null),
    [unavailable, setUnavailable] = useState(false),
    [expanded, setExpanded] = useState(running),
    [now, setNow] = useState(() => Date.now());
  const trace = useRef<HTMLDivElement>(null),
    following = useRef(true);
  useEffect(() => {
    if (trace.current && following.current)
      trace.current.scrollTop = trace.current.scrollHeight;
  }, [activity]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    let stopped = false,
      inFlight = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
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
        if (!stopped && running) timer = setTimeout(() => void refresh(), 2000);
      }
    };
    let stream: AbortController | undefined,
      connected = false,
      finished = false;
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
            } else if (event === "done") finished = true;
            else if (event === "unavailable")
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
  const duration =
    seconds === null ? "" : ` · ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const status =
    activity?.state === "SUCCEEDED"
      ? "Completed"
      : running
        ? "Thinking…"
        : "Planning trace";
  const known = new Set(activity?.calls.map((call) => call.id));
  const searches =
      activity?.research.filter((event) => event.label === "Search").length ??
      0,
    reads = (activity?.research.length ?? 0) - searches;
  return (
    <details
      className={s.feed}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className={s.feedHead}>
        <SylvieIcon size={15} />
        <span>
          {status}
          {duration}
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
        <ChevronDown size={15} />
      </summary>
      {unavailable && (
        <p role="status" className={s.feedNote}>
          Live updates paused. Reconnecting…
        </p>
      )}
      {!activity && !unavailable && (
        <p className={s.feedNote}>Reading saved activity…</p>
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
                <Check size={11} strokeWidth={3} />
              ) : (
                <i className={s.stepPulse} />
              )}
            </span>
            <ReasoningBlock
              call={call}
              planId={planId}
              attemptId={attemptId}
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
        {activity?.output && (
          <details className={s.traceDraft}>
            <summary>
              Generated strategy{" "}
              <span className={s.muted}>
                ·{" "}
                {activity.output.state === "WRITING"
                  ? "streaming"
                  : activity.output.state === "INTERRUPTED"
                    ? "retained partial response"
                    : "received"}
              </span>
            </summary>
            <div className={s.thinkingText}>{activity.output.text}</div>
            {activity.output.clipped && (
              <p>
                The full strategy is retained separately when generation
                finishes.
              </p>
            )}
          </details>
        )}
      </div>
    </details>
  );
}
