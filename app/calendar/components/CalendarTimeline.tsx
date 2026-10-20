"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GripVertical, Repeat2 } from "lucide-react";
import { eventsOnDate, dateLabel, eventTime } from "@/lib/calendar/dates";
import {
  moveEvent,
  timeAt,
  timelineSegments,
  dayWorkload,
} from "@/lib/calendar/scheduling";
import { resolveGoalColor } from "@/lib/goal-theme";
import type { CalendarEvent, EventInput } from "@/lib/calendar/contracts";
import styles from "../Scheduling.module.css";

type Drag = {
  event: CalendarEvent;
  date: string;
  minute: number;
  resize: boolean;
  pointerId: number;
  moved: boolean;
  x: number;
  y: number;
  offset: number;
};
export default function CalendarTimeline({
  dates,
  events,
  workloadEvents = events,
  sessions,
  timezone,
  selected,
  busy,
  workload,
  onSelect,
  onEdit,
  onCreate,
  onMove,
  onError,
}: {
  dates: string[];
  events: CalendarEvent[];
  workloadEvents?: CalendarEvent[];
  timezone: string;
  selected: string;
  busy: boolean;
  workload: boolean;
  sessions: {
    id: number;
    title: string;
    startedAt: string;
    endedAt: string | null;
    minutes: number;
  }[];
  onSelect: (date: string) => void;
  onEdit: (event: CalendarEvent) => void;
  onCreate: (date: string, minute: number) => void;
  onMove: (event: CalendarEvent, data: EventInput) => void;
  onError: (message: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null);
  const active = useRef<Drag | null>(null),
    [preview, setPreview] = useState<Drag | null>(null);
  const frame = useRef(0),
    last = useRef<Drag | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rangeKey = dates.join(",");
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const reveal = () => {
      if (active.current) return;
      const column = root.current?.querySelector<HTMLElement>(
        `[data-time-column="${selected}"]`
      );
      if (!column) return;
      const rect = column.getBoundingClientRect(),
        area = node.getBoundingClientRect();
      if (rect.left < area.left + 48 || rect.right > area.right)
        node.scrollLeft += rect.left - area.left - 48;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(node);
    const frame = requestAnimationFrame(reveal);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [selected, rangeKey]);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 480;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const location = (x: number, y: number) => {
    const columns = [
      ...root.current!.querySelectorAll<HTMLElement>("[data-time-column]"),
    ];
    const column =
      columns.find((node) => {
        const rect = node.getBoundingClientRect();
        return x >= rect.left && x <= rect.right;
      }) ||
      columns[
        x < columns[0].getBoundingClientRect().left ? 0 : columns.length - 1
      ];
    const rect = column.getBoundingClientRect();
    return {
      date: column.dataset.timeColumn!,
      minute: Math.max(
        0,
        Math.min(
          1440,
          Math.round((((y - rect.top) / rect.height) * 1440) / 15) * 15
        )
      ),
    };
  };
  const start = (
    e: ReactPointerEvent<HTMLButtonElement>,
    event: CalendarEvent,
    date: string,
    resize: boolean,
    startMinute: number
  ) => {
    if (busy || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    root.current!.setPointerCapture(e.pointerId);
    const point = location(e.clientX, e.clientY);
    active.current = {
      event,
      date,
      minute: resize ? point.minute : startMinute,
      resize,
      pointerId: e.pointerId,
      moved: false,
      x: e.clientX,
      y: e.clientY,
      offset: resize ? 0 : point.minute - startMinute,
    };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = active.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4 && !drag.moved)
      return;
    const point = location(e.clientX, e.clientY);
    const minute = Math.max(
      0,
      Math.min(drag.resize ? 1440 : 1425, point.minute - drag.offset)
    );
    const next = { ...drag, moved: true, date: point.date, minute };
    active.current = next;
    last.current = next;
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setPreview(last.current);
      });
    const area = viewport.current!.getBoundingClientRect();
    if (e.clientY > area.bottom - 50) viewport.current!.scrollTop += 14;
    if (e.clientY < area.top + 100) viewport.current!.scrollTop -= 14;
    if (e.clientX > area.right - 35) viewport.current!.scrollLeft += 12;
    if (e.clientX < area.left + 35) viewport.current!.scrollLeft -= 12;
  };
  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancel = false) => {
    const drag = active.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    active.current = null;
    last.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setPreview(null);
    if (!cancel && drag.moved) {
      try {
        onMove(
          drag.event,
          moveEvent(drag.event, drag.date, drag.minute, timezone, drag.resize)
        );
      } catch (err) {
        onError(err instanceof Error ? err.message : "Choose another time.");
      }
    }
  };
  const keyMove = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    event: CalendarEvent,
    date: string,
    minute: number,
    resize: boolean
  ) => {
    const delta = e.key === "ArrowUp" ? -15 : e.key === "ArrowDown" ? 15 : 0;
    if (!delta || busy) return;
    e.preventDefault();
    try {
      onMove(
        event,
        moveEvent(
          event,
          date,
          Math.max(0, Math.min(1440, minute + delta * (e.shiftKey ? 4 : 1))),
          timezone,
          resize
        )
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Choose another time.");
    }
  };
  const shown = preview
    ? events.map((event) => {
        if (
          event.id !== preview.event.id ||
          event.occurrenceDate !== preview.event.occurrenceDate
        )
          return event;
        try {
          return {
            ...event,
            ...moveEvent(
              event,
              preview.date,
              preview.minute,
              timezone,
              preview.resize
            ),
          };
        } catch {
          return event;
        }
      })
    : events;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const nowTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const nowMinute = Number(nowTime.slice(0, 2)) * 60 + Number(nowTime.slice(3));
  return (
    <section
      className={styles.timeline}
      aria-label={dates.length === 1 ? "Day timeline" : "Week timeline"}
      aria-busy={busy}
    >
      <div className={styles.timelineIntro}>
        <span>Time planning</span>
        <small>Drag a handle to move · Arrow keys adjust 15 minutes</small>
      </div>
      <div className={styles.timeScroll} ref={viewport} data-calendar-scroll>
        <div
          ref={root}
          onPointerMove={move}
          onPointerUp={(e) => finish(e)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
          className={styles.timeGrid}
          style={{ "--day-count": dates.length } as CSSProperties}
        >
          <div className={styles.timeHeader} data-calendar-time-header>
            <span className={styles.timeGutter} />
            {dates.map((date) => {
              const dayEvents = eventsOnDate(shown, date, timezone),
                load = dayWorkload(
                  eventsOnDate(workloadEvents, date, timezone),
                  date,
                  timezone
                );
              return (
                <div
                  key={date}
                  className={styles.timeDayHeader}
                  data-selected={date === selected}
                >
                  <button
                    onClick={() => onSelect(date)}
                    aria-pressed={date === selected}
                  >
                    <span>{dateLabel(date, { weekday: "short" })}</span>
                    <b>{Number(date.slice(8))}</b>
                  </button>
                  {workload && (
                    <small>
                      {Math.round((load.busy / 60) * 10) / 10}h booked
                      {load.conflicts ? ` · ${load.conflicts} overlap` : ""}
                    </small>
                  )}
                  <div className={styles.allDayEvents}>
                    {dayEvents
                      .filter((event) => event.allDay)
                      .map((event) => (
                        <button
                          key={`${event.id}:${event.occurrenceDate}`}
                          style={{
                            borderColor: resolveGoalColor(event.color).base,
                          }}
                          onClick={() => onEdit(event)}
                        >
                          {event.title}
                          <small>All day</small>
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.timeBody}>
            <div className={styles.hourLabels}>
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} style={{ top: `${(hour / 24) * 100}%` }}>
                  {hour === 0
                    ? "12 AM"
                    : hour < 12
                      ? `${hour} AM`
                      : hour === 12
                        ? "12 PM"
                        : `${hour - 12} PM`}
                </span>
              ))}
            </div>
            {dates.map((date) => (
              <div
                key={date}
                data-time-column={date}
                className={styles.timeColumn}
              >
                {Array.from({ length: 48 }, (_, slot) => (
                  <button
                    key={slot}
                    className={styles.timeSlot}
                    data-slot={`${date}:${slot}`}
                    tabIndex={slot === 18 ? 0 : -1}
                    aria-label={`Create time block ${date} at ${timeAt(slot * 30)}`}
                    onClick={() => onCreate(date, slot * 30)}
                    disabled={busy}
                    onKeyDown={(e) => {
                      const delta =
                        e.key === "ArrowUp"
                          ? -1
                          : e.key === "ArrowDown"
                            ? 1
                            : 0;
                      const dayDelta =
                        e.key === "ArrowLeft"
                          ? -1
                          : e.key === "ArrowRight"
                            ? 1
                            : 0;
                      if (!delta && !dayDelta) return;
                      e.preventDefault();
                      const nextDate =
                        dates[
                          Math.max(
                            0,
                            Math.min(
                              dates.length - 1,
                              dates.indexOf(date) + dayDelta
                            )
                          )
                        ];
                      root.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-slot="${nextDate}:${Math.max(0, Math.min(47, slot + delta))}"]`
                        )
                        ?.focus();
                    }}
                  />
                ))}
                {sessions
                  .filter(
                    (session) =>
                      session.endedAt &&
                      new Date(session.endedAt).getTime() >
                        new Date(session.startedAt).getTime()
                  )
                  .flatMap((session) => {
                    const entry: CalendarEvent = {
                      id: String(session.id),
                      title: session.title,
                      description: "",
                      color: "EMERALD",
                      allDay: false,
                      startDate: date,
                      endDate: date,
                      startsAt: session.startedAt,
                      endsAt: session.endedAt,
                      timezone,
                      revision: 1,
                      createdAt: "",
                      updatedAt: "",
                    };
                    if (!eventsOnDate([entry], date, timezone).length)
                      return [];
                    return timelineSegments([entry], date, timezone).map(
                      (item) => (
                        <div
                          key={session.id}
                          className={styles.recordedBlock}
                          style={{
                            top: `${(item.start / 1440) * 100}%`,
                            height: `${(Math.max(15, item.end - item.start) / 1440) * 100}%`,
                          }}
                          title={`${session.title}: ${session.minutes} minutes studied`}
                        >
                          <span>{session.title} · Study record</span>
                        </div>
                      )
                    );
                  })}
                {date === today && (
                  <div
                    className={styles.nowLine}
                    role="img"
                    style={{ top: `${(nowMinute / 1440) * 100}%` }}
                    aria-label={`Current time ${nowTime}`}
                  />
                )}
                {timelineSegments(
                  eventsOnDate(shown, date, timezone),
                  date,
                  timezone
                ).map((item) => (
                  <div
                    key={`${item.event.id}:${item.event.occurrenceDate}`}
                    className={styles.timeEvent}
                    data-overlap={item.overlap}
                    data-dragging={
                      preview?.event.id === item.event.id &&
                      preview?.event.occurrenceDate ===
                        item.event.occurrenceDate
                    }
                    style={
                      {
                        top: `${(item.start / 1440) * 100}%`,
                        height: `${(Math.max(22, item.end - item.start) / 1440) * 100}%`,
                        left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / item.lanes}% - 5px)`,
                        "--event-color": resolveGoalColor(item.event.color)
                          .base,
                        "--event-tint": resolveGoalColor(item.event.color).dim,
                      } as CSSProperties
                    }
                  >
                    <button
                      className={styles.timeEventContent}
                      onClick={() => onEdit(item.event)}
                      aria-label={`${item.event.title}, ${eventTime(item.event, timezone)}${item.overlap ? ", overlaps another event" : ""}`}
                    >
                      <strong
                        data-ink-anchor={`${date}/event:${item.event.id}${item.event.occurrenceDate ? "@" + item.event.occurrenceDate : ""}`}
                      >
                        {item.event.title}
                      </strong>
                      <small>
                        {eventTime(item.event, timezone)}
                        {item.event.recurrence && <Repeat2 size={10} />}
                      </small>
                      {item.end - item.start >= 60 && (
                        <small>
                          {item.event.external?.calendarName ||
                            item.event.shared?.name ||
                            (item.event.category === "time-block"
                              ? "Time block"
                              : item.event.category || "Personal")}
                        </small>
                      )}
                    </button>
                    <button
                      className={styles.moveHandle}
                      aria-label={`Move ${item.event.title}`}
                      title="Drag to move; ↑/↓ adjusts 15 min, Shift for 1 hour"
                      disabled={
                        busy ||
                        item.event.external?.writable === false ||
                        item.event.shared?.role === "VIEWER"
                      }
                      onPointerDown={(e) =>
                        start(e, item.event, date, false, item.start)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          active.current = null;
                          setPreview(null);
                        } else keyMove(e, item.event, date, item.start, false);
                      }}
                    >
                      <GripVertical size={13} />
                    </button>
                    <button
                      className={styles.resizeHandle}
                      aria-label={`Resize ${item.event.title}`}
                      title="Drag to change end time; ↑/↓ adjusts 15 min"
                      disabled={
                        busy ||
                        item.event.external?.writable === false ||
                        item.event.shared?.role === "VIEWER"
                      }
                      onPointerDown={(e) =>
                        start(e, item.event, date, true, item.end)
                      }
                      onKeyDown={(e) =>
                        keyMove(e, item.event, date, item.end, true)
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.timelineFoot} role="status">
        {preview
          ? `${preview.resize ? "End" : "Move"}: ${preview.date} at ${timeAt(preview.minute % 1440)}${preview.event.recurrence || preview.event.external?.recurring ? " · This occurrence" : ""}`
          : "Choose a free half-hour to add a block. Quests and goals remain in their date-based plan below."}
      </p>
    </section>
  );
}
