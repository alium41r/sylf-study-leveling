"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  NotebookPen,
  Plus,
  Shield,
  Sparkles,
  X,
  PenLine,
  Eye,
  EyeOff,
  Settings2,
  Repeat2,
  Bell,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { TimezoneService } from "@/lib/timezone-service";
import {
  addDays,
  dateLabel,
  eventTime,
  localTimeToISO,
  eventsOnDate,
  monthDates,
  shiftMonth,
  weekStart,
} from "@/lib/calendar/dates";
import { resolveGoalColor } from "@/lib/goal-theme";
import { invalidateClientCaches } from "@/lib/client-data-cache";
import {
  validDateKey,
  type CalendarEvent,
  type EventInput,
} from "@/lib/calendar/contracts";
import type { FloatingRestDayStatus } from "@/lib/study-schedule-types";
import StudyScheduleModal from "./StudyScheduleModal";
import DayInspectionPanel from "./DayInspectionPanel";
import CalendarDialog from "./CalendarDialog";
import CalendarEditor, { type EditorSelection } from "./CalendarEditor";
import { calendarRequest, useCalendarWorkspace } from "./useCalendarWorkspace";
import { editableDocument, isAnnotation } from "@/lib/calendar/ink";
import { recoveries, type NoteRecovery } from "@/lib/calendar/note-autosave";
import CalendarAnnotations from "./CalendarAnnotations";
import { InkPreview } from "./InkSurface";
import notebookStyles from "../Notebook.module.css";
import styles from "../Workspace.module.css";
import scheduleStyles from "../Scheduling.module.css";
import CalendarTimeline from "./CalendarTimeline";
import NotebookSearch from "./NotebookSearch";
import CalendarSettings from "./CalendarSettings";
import QuickAdd from "./QuickAdd";
import MonthEventHandle from "./MonthEventHandle";
import { useCalendarPreferences } from "./useCalendarPreferences";
import { publishCalendarPage } from "@/lib/ai/sylvie/calendar-page-context";
import { dayWorkload, timeAt } from "@/lib/calendar/scheduling";
import {
  newEventOperation,
  runEventOperation,
  pendingEventOperations,
  forgetEventOperation,
  type EventOperation,
} from "@/lib/calendar/event-operations";

type View = "month" | "week" | "day";
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes}m`;
const colorStyle = (color: string): CSSProperties => {
  const theme = resolveGoalColor(color);
  return {
    "--item-color": theme.base,
    "--item-ink": "var(--text-secondary)",
    "--item-tint": theme.dim,
  } as CSSProperties;
};

export default function CalendarWorkspace() {
  const { user } = useAuth();
  // Remounting on identity changes prevents a prior account's drafts or data
  // surviving an account switch in the shared client shell.
  return user ? (
    <Workspace
      key={user.id}
      userId={user.id}
      timezone={
        TimezoneService.validateTimezone(user.timezone || "")
          ? user.timezone!
          : "UTC"
      }
    />
  ) : null;
}
function Workspace({ userId, timezone }: { userId: number; timezone: string }) {
  const { refreshStats } = useAuth();
  const [today, setToday] = useState(() =>
    TimezoneService.getUserLocalDate(timezone)
  );
  const [selected, setSelected] = useState(today);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const date = new URLSearchParams(window.location.search).get("date");
      if (date && validDateKey(date)) setSelected(date);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const preferences = useCalendarPreferences(userId);
  const { settings } = preferences;
  const view = settings.view;
  const setView = (view: View) => preferences.update({ view });
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<EventOperation[]>(() =>
    pendingEventOperations(userId)
  );
  const [eventBusy, setEventBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<{
    event: CalendarEvent;
    data: EventInput;
    source: CalendarEvent[];
  } | null>(null);
  useEffect(() => {
    const update = () => setPendingEvents(pendingEventOperations(userId));
    window.addEventListener("calendar-events-pending", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("calendar-events-pending", update);
      window.removeEventListener("storage", update);
    };
  }, [userId]);
  const [editor, setEditor] = useState<EditorSelection | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [insights, setInsights] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [restResult, setRestResult] = useState<FloatingRestDayStatus | null>(
    null
  );
  const rest = restResult?.dateKey === selected ? restResult : null;
  const [restBusy, setRestBusy] = useState(false);
  const [restRevision, setRestRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href),
        result = url.searchParams.get("connections");
      if (!result) return;
      setSettingsOpen(true);
      if (result === "connected")
        setNotice(
          "Calendar connected. Its events will appear as sync completes."
        );
      else
        setError(
          "Calendar connection was not completed. Try again in Connected calendars and allow the requested permissions."
        );
      url.searchParams.delete("connections");
      window.history.replaceState(window.history.state, "", url);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const workspace = useRef<HTMLElement>(null);
  const drawingRoot = useRef<HTMLElement>(null);
  const [annotating, setAnnotating] = useState(false);
  const showAnnotations = settings.filters.annotations;
  const setShowAnnotations = (
    value: boolean | ((previous: boolean) => boolean)
  ) =>
    preferences.update({
      filters: {
        ...settings.filters,
        annotations:
          typeof value === "function" ? value(showAnnotations) : value,
      },
    });
  const [drafts, setDrafts] = useState<NoteRecovery[]>(() =>
    recoveries(userId)
  );
  useEffect(() => {
    const update = () => setDrafts(recoveries(userId));
    window.addEventListener("calendar-drafts-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("calendar-drafts-updated", update);
      window.removeEventListener("storage", update);
    };
  }, [userId]);
  const dates =
    view === "month"
      ? monthDates(selected)
      : view === "week"
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(selected), i))
        : [selected];
  // Keep one month projection for all views: switching views paints immediately
  // without refetching the same study history or briefly showing an empty day.
  const data = useCalendarWorkspace(userId, monthDates(selected));
  const visibleStart = dates[0],
    visibleEnd = addDays(dates[dates.length - 1], 1);
  useEffect(
    () =>
      publishCalendarPage({
        selectedDate: selected,
        start: visibleStart,
        end: visibleEnd,
        view,
      }),
    [selected, visibleStart, visibleEnd, view]
  );
  const month = data.study.find(
    (value) =>
      `${value.year}-${String(value.month + 1).padStart(2, "0")}` ===
      selected.slice(0, 7)
  );
  const day = data.days.get(selected);
  const filters = settings.organization
    ? settings.filters
    : {
        ...settings.filters,
        personal: true,
        blocks: true,
        objectives: true,
        notes: true,
        study: true,
        categories: ["personal", "work", "learning", "health"],
      };
  const projectedEvents = data.personal.events.map((event) =>
    optimistic &&
    optimistic.source === data.personal.events &&
    event.id === optimistic.event.id &&
    event.occurrenceDate === optimistic.event.occurrenceDate
      ? { ...event, ...optimistic.data, recurrence: event.recurrence }
      : event
  );
  const coverageComplete = data.personal.externalCoverage?.complete !== false;
  const calendarEvents = projectedEvents.filter(
    (event) =>
      event.external?.visible !== false &&
      (event.category === "time-block"
        ? filters.blocks
        : filters.personal &&
          filters.categories.includes(event.category || "personal"))
  );
  const events = eventsOnDate(calendarEvents, selected, timezone);
  const load = dayWorkload(
    eventsOnDate(projectedEvents, selected, timezone),
    selected,
    timezone
  );
  const journalNotes = data.personal.notes.filter(
    (note) => filters.notes && !isAnnotation(note.document)
  );
  const annotationNotes = data.personal.notes.filter((note) =>
    isAnnotation(note.document)
  );
  const notes = journalNotes.filter((note) => note.dateKey === selected);
  const annotationLayer = (
    <CalendarAnnotations
      root={drawingRoot}
      owner={userId}
      notes={annotationNotes}
      active={annotating}
      visible={showAnnotations}
      onExit={() => setAnnotating(false)}
    />
  );
  const milestones = data.milestones.filter(
    (value) => filters.objectives && value.date === selected
  );
  const select = (date: string, focusWorkspace = false) => {
    if (date < "2000-02-01" || date > "2100-11-30") return;
    setSelected(date);
    if (focusWorkspace)
      requestAnimationFrame(() =>
        workspace.current?.focus({ preventScroll: false })
      );
  };
  useEffect(() => {
    const tick = () => setToday(TimezoneService.getUserLocalDate(timezone));
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [timezone]);
  useEffect(() => {
    const controller = new AbortController();
    void calendarRequest(
      `/api/user/study-schedule/floating-rest-day?dateKey=${selected}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Rest-day settings could not load.");
        const value = await response.json();
        if (!controller.signal.aborted) setRestResult(value);
      })
      .catch(() => {
        /* Existing study schedule remains usable; retry with insights. */
      });
    return () => controller.abort();
  }, [selected, restRevision]);
  const reload = () => {
    data.reload();
    setRestRevision((value) => value + 1);
  };
  async function toggleRest() {
    if (!rest || restBusy) return;
    setRestBusy(true);
    setError("");
    try {
      const response = await calendarRequest(
        "/api/user/study-schedule/floating-rest-day",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateKey: selected,
            enabled: !rest.isFloatingRest,
          }),
        }
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error || result.message || "Could not update rest day."
        );
      }
      invalidateClientCaches([
        "/api/calendar",
        "/api/quests",
        "/api/goals",
        "/api/planner",
        "/api/user/stats",
      ]);
      reload();
      void refreshStats();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update rest day."
      );
    } finally {
      setRestBusy(false);
    }
  }
  const navigate = (direction: number) => {
    const date =
      view === "month"
        ? shiftMonth(selected, direction)
        : addDays(selected, direction * (view === "week" ? 7 : 1));
    if (date >= "2000-02-01" && date <= "2100-11-30") select(date);
  };
  const newItem = (kind: "event" | "note", date = selected) => {
    setNotice("");
    setEditor({ kind, date });
  };
  const keyNavigate = (
    event: KeyboardEvent<HTMLButtonElement>,
    date: string
  ) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    if (offset === undefined) return;
    event.preventDefault();
    const next = addDays(date, offset);
    select(next);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`)
        ?.focus()
    );
  };
  const calendarData = data.personal.events;
  async function reschedule(event: CalendarEvent, data: EventInput) {
    if (
      eventBusy ||
      event.external?.writable === false ||
      event.shared?.role === "VIEWER"
    )
      return;
    if (event.external) {
      setEditor({
        kind: "event",
        date: data.startDate,
        item: event,
        initial: data,
        hints: [
          "Review this change before saving it to your connected calendar.",
        ],
      });
      return;
    }
    setEventBusy(true);
    setError("");
    setNotice("Saving your schedule…");
    setOptimistic({ event, data, source: calendarData });
    const operation = newEventOperation(
      userId,
      "PATCH",
      {
        kind: "event",
        id: event.id,
        revision: event.revision,
        ...(event.shared ? { sharedCalendarId: event.shared.calendarId } : {}),
        ...(event.occurrenceDate
          ? { occurrenceDate: event.occurrenceDate }
          : {}),
        data: {
          ...data,
          recurrence: event.occurrenceDate ? null : data.recurrence,
        },
      },
      event.title
    );
    try {
      await runEventOperation(operation);
      select(
        data.allDay
          ? data.startDate
          : TimezoneService.getUserLocalDate(timezone, new Date(data.startsAt!))
      );
      setNotice(
        event.occurrenceDate
          ? "This occurrence has been rescheduled."
          : "Event rescheduled."
      );
    } catch (err) {
      setOptimistic(null);
      setNotice("");
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. The change is kept for retry."
      );
    } finally {
      setEventBusy(false);
    }
  }
  const createBlock = (date: string, minute: number) => {
    try {
      const initial: EventInput = {
        title: "",
        description: "",
        color: "VIOLET",
        category: "time-block",
        recurrence: null,
        reminders: [],
        allDay: false,
        startDate: date,
        endDate: minute + 60 >= 1440 ? addDays(date, 1) : date,
        startsAt: "",
        endsAt: "",
        timezone,
      };
      initial.startsAt = localTimeToISO(date, timeAt(minute), timezone);
      initial.endsAt = localTimeToISO(
        initial.endDate,
        timeAt((minute + 60) % 1440),
        timezone
      );
      setEditor({ kind: "event", date, initial });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Choose another time.");
    }
  };
  const timeline = (days: string[]) => (
    <CalendarTimeline
      dates={days}
      events={calendarEvents}
      workloadEvents={projectedEvents}
      sessions={
        filters.study
          ? dates.flatMap((date) => data.days.get(date)?.sessions || [])
          : []
      }
      selected={selected}
      timezone={timezone}
      busy={eventBusy || data.loading}
      workload={settings.workload && coverageComplete}
      onSelect={select}
      onEdit={(item) => setEditor({ kind: "event", date: selected, item })}
      onCreate={createBlock}
      onMove={(event, input) => void reschedule(event, input)}
      onError={setError}
    />
  );
  const renderEvent = (
    event: CalendarEvent,
    compact = false,
    date = selected
  ) => (
    <button
      key={`${event.id}:${event.occurrenceDate || ""}`}
      className={compact ? styles.agendaEvent : styles.eventCard}
      style={colorStyle(event.color)}
      onClick={() => setEditor({ kind: "event", date: selected, item: event })}
    >
      <span className={styles.eventDot} />
      <span className={styles.itemText}>
        <strong
          data-ink-anchor={`${date}/event:${event.id}${event.occurrenceDate ? "@" + event.occurrenceDate : ""}`}
        >
          {event.title}
        </strong>
        <small>
          {eventTime(event, timezone)}
          {event.external && ` · ${event.external.calendarName}`}
          {event.shared && ` · ${event.shared.name}`}
          {(event.recurrence || event.external?.recurring) && (
            <>
              {" "}
              ·{" "}
              <span className={scheduleStyles.repeatTag}>
                <Repeat2 size={11} /> Repeats
              </span>
            </>
          )}
          {event.category === "time-block" && " · Time block"}
          {!!event.reminders?.length && <Bell size={11} />}
        </small>
        {!compact && event.description && (
          <span className={styles.eventDescription}>{event.description}</span>
        )}
      </span>
      <ArrowUpRight size={14} />
    </button>
  );

  return (
    <div className={styles.workspaceRoot}>
      {preferences.error && (
        <div className={styles.error} role="alert">
          {preferences.error}
          <button className={styles.textButton} onClick={preferences.retry}>
            Retry settings
          </button>
        </div>
      )}
      {!!pendingEvents.length && (
        <div className={notebookStyles.recoveryBar} role="status">
          <span>Event changes waiting to save</span>
          {pendingEvents.map((operation) => (
            <span key={operation.key}>
              <button
                onClick={() => {
                  if ("data" in operation.body)
                    setEditor({
                      kind: "event",
                      date: operation.body.data.startDate,
                      operation,
                    });
                  else {
                    setEventBusy(true);
                    void runEventOperation(operation)
                      .catch((err) => setError(err.message))
                      .finally(() => setEventBusy(false));
                  }
                }}
                disabled={eventBusy}
              >
                {operation.title} ·{" "}
                {operation.method === "DELETE"
                  ? "Retry deletion"
                  : "Review & retry"}
              </button>
              <button
                aria-label={`Dismiss pending change: ${operation.title}`}
                title="Discard this pending retry; acknowledged server changes are kept"
                onClick={() => forgetEventOperation(operation)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {!!drafts.length && (
        <div className={notebookStyles.recoveryBar} role="status">
          <span>Writing saved on this device</span>
          {drafts.map((draft) => (
            <button
              key={draft.key}
              onClick={() => {
                select(draft.data.dateKey);
                if (isAnnotation(draft.data.document)) {
                  setShowAnnotations(true);
                  setAnnotating(true);
                } else
                  setEditor({
                    kind: "note",
                    date: draft.data.dateKey,
                    recovery: draft,
                  });
              }}
            >
              {draft.data.title || "Untitled note"} ·{" "}
              {dateLabel(draft.data.dateKey, {
                month: "short",
                day: "numeric",
              })}
            </button>
          ))}
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.periodNavigation}>
          <h2 aria-live="polite">
            {view === "day"
              ? dateLabel(selected, { month: "long", day: "numeric" })
              : dateLabel(selected, { month: "long", year: "numeric" })}
          </h2>
          <div className={styles.navigationButtons}>
            <label className={styles.dateJump} title="Go to date">
              <CalendarDays size={15} />
              <input
                type="date"
                aria-label="Go to date"
                min="2000-02-01"
                max="2100-11-30"
                value={selected}
                onChange={(event) => {
                  if (validDateKey(event.target.value))
                    select(event.target.value);
                }}
              />
            </label>
            <button
              className={styles.iconButton}
              aria-label={`Previous ${view}`}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className={styles.iconButton}
              aria-label={`Next ${view}`}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button className={styles.todayButton} onClick={() => select(today)}>
            Today
          </button>
        </div>
        <div className={styles.toolbarActions}>
          <div
            className={styles.viewSwitch}
            role="group"
            aria-label="Calendar view"
          >
            {(["month", "week", "day"] as View[]).map((value) => (
              <button
                key={value}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <button
            className={styles.primaryButton}
            onClick={() => newItem("event")}
          >
            <Plus size={17} />
            New event
          </button>
          <button
            className={styles.iconButton}
            aria-label="Calendar settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>
      <QuickAdd
        today={today}
        selected={selected}
        timezone={timezone}
        onReview={(initial, hints) =>
          setEditor({ kind: "event", date: initial.startDate, initial, hints })
        }
      />
      {settings.organization && (
        <div
          className={scheduleStyles.filters}
          role="group"
          aria-label="Calendar filters"
        >
          {(
            [
              ["personal", "Events"],
              ["objectives", "Quests & goals"],
              ["study", "Study sessions"],
              ["blocks", "Time blocks"],
              ["notes", "Notes"],
              ["annotations", "Annotations"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={settings.filters[key]}
              onClick={() =>
                preferences.update({
                  filters: {
                    ...settings.filters,
                    [key]: !settings.filters[key],
                  },
                })
              }
            >
              {label}
            </button>
          ))}
          <label>
            Category{" "}
            <select
              aria-label="Event category filter"
              value={
                settings.filters.categories.length === 1
                  ? settings.filters.categories[0]
                  : "all"
              }
              onChange={(e) =>
                preferences.update({
                  filters: {
                    ...settings.filters,
                    categories:
                      e.target.value === "all"
                        ? ["personal", "work", "learning", "health"]
                        : [e.target.value as "personal"],
                  },
                })
              }
            >
              <option value="all">All categories</option>
              {["personal", "work", "learning", "health"].map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <details className={styles.inkActions}>
        <summary>Writing tools</summary>
        <button
          className={styles.textButton}
          aria-pressed={annotating}
          onClick={() => {
            setAnnotating((value) => !value);
            setShowAnnotations(true);
          }}
        >
          <PenLine size={14} />
          {annotating ? "Finish annotating" : "Annotate calendar"}
        </button>
        <button
          className={styles.textButton}
          aria-label={showAnnotations ? "Hide annotations" : "Show annotations"}
          aria-pressed={showAnnotations}
          onClick={() => {
            setShowAnnotations((v) => !v);
            setAnnotating(false);
          }}
        >
          {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </details>
      <div className={styles.utilityBar}>
        <span className={styles.timezoneLabel}>
          <Clock3 size={13} />
          {timezone.replaceAll("_", " ")}
        </span>
        <div>
          <button
            className={styles.textButton}
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((value) => !value)}
          >
            <BarChart3 size={14} />
            Study stats
          </button>
        </div>
      </div>
      {statsOpen && month && (
        <section
          className={styles.monthStats}
          aria-label="Monthly study statistics"
        >
          <div>
            <strong>{duration(month.monthStats.totalMinutes)}</strong>
            <span>Study this month</span>
          </div>
          <div>
            <strong>
              {month.monthStats.activeDays}
              <small> / {month.monthStats.totalDays}</small>
            </strong>
            <span>Active days</span>
          </div>
          <div>
            <strong>
              {Math.round(
                (month.monthStats.activeDays /
                  Math.max(1, month.monthStats.totalDays)) *
                  100
              )}
              %
            </strong>
            <span>Consistency</span>
          </div>
          <footer className={styles.heatmapControls}>
            <button
              className={styles.textButton}
              aria-pressed={showActivity}
              onClick={() => setShowActivity((value) => !value)}
            >
              {showActivity ? "Hide" : "Show"} study heatmap
            </button>
            <span>
              Less{" "}
              {[0, 15, 30, 60, 120].map((minutes) => (
                <i
                  key={minutes}
                  title={`${minutes}+ study minutes`}
                  style={{
                    background: `color-mix(in srgb, var(--accent-primary) ${minutes ? Math.min(45, 8 + minutes / 3) : 0}%, var(--surface-1))`,
                  }}
                />
              ))}{" "}
              More
            </span>
          </footer>
        </section>
      )}
      {data.errors.length > 0 && (
        <div className={styles.error} role="alert">
          <span>
            {data.errors.join(" ")} Your displayed data may be out of date.
          </span>
          <button onClick={reload} className={styles.textButton}>
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          <Check size={15} />
          {notice}
        </p>
      )}
      {!coverageComplete && (
        <p className={scheduleStyles.hint} role="status">
          Connected calendars are still syncing or need attention. Free-time
          estimates are paused. Check Connected calendars in settings.
        </p>
      )}
      {settings.workload && coverageComplete && (
        <div className={scheduleStyles.workload} aria-label="Schedule workload">
          <strong>{view === "week" ? "This week" : "Selected day"}</strong>
          {projectedEvents.length > calendarEvents.length && (
            <small>Includes hidden events</small>
          )}
          <span>
            {view === "week"
              ? Math.round(
                  (dates.reduce(
                    (sum, date) =>
                      sum +
                      dayWorkload(
                        eventsOnDate(projectedEvents, date, timezone),
                        date,
                        timezone
                      ).busy,
                    0
                  ) /
                    60) *
                    10
                ) / 10
              : Math.round((load.busy / 60) * 10) / 10}
            h booked
          </span>
          <span>
            {load.conflicts
              ? `${load.conflicts} overlapping commitments on ${selected}`
              : "No overlaps on selected day"}
          </span>
          <span>
            {load.free ? (
              <>
                Free {timeAt(load.largest.start)}–{timeAt(load.largest.end)}
              </>
            ) : (
              "No free window"
            )}{" "}
            <small>
              (timed commitments, 8 AM–8 PM)
              {load.allDay ? ` · ${load.allDay} all-day` : ""}
            </small>
          </span>
          {load.largest.end - load.largest.start >= 30 && (
            <button onClick={() => createBlock(selected, load.largest.start)}>
              Plan in this window
            </button>
          )}
        </div>
      )}
      <div
        className={`${styles.calendarLayout} ${view === "day" ? styles.dayLayout : view === "week" ? styles.weekLayout : ""}`}
      >
        {view === "month" && (
          <section
            className={styles.calendarBoard}
            ref={drawingRoot}
            aria-label="Month calendar"
            aria-busy={data.loading}
          >
            {annotationLayer}
            <div className={styles.weekdayRow}>
              {weekdays.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className={styles.monthGrid}>
              {dates.map((date) => {
                const summary = data.days.get(date),
                  dayEvents = eventsOnDate(calendarEvents, date, timezone);
                const dayNotes = journalNotes.filter(
                    (note) => note.dateKey === date
                  ),
                  goals = data.milestones.filter(
                    (goal) => filters.objectives && goal.date === date
                  );
                const previews: {
                  id: string | number;
                  title: string;
                  color: string;
                  type: string;
                  event?: CalendarEvent;
                }[] = [
                  ...dayEvents.map((event) => ({
                    id: `${event.id}:${event.occurrenceDate || ""}`,
                    event,
                    title: event.title,
                    color: event.color,
                    type: "event",
                  })),
                  ...goals.map((goal) => ({
                    id: `goal-${goal.id}`,
                    title: goal.title,
                    color: goal.color,
                    type: "goal",
                  })),
                  ...(filters.objectives ? summary?.quests || [] : []).map(
                    (quest) => ({
                      id: `quest-${quest.id}`,
                      title: quest.title,
                      color: quest.goal?.color || "VIOLET",
                      type: "quest",
                    })
                  ),
                ];
                const isRest = summary?.isRestDay || data.floating.has(date);
                return (
                  <div
                    key={date}
                    data-month-date={date}
                    data-ink-anchor={`${date}/day`}
                    style={
                      showActivity &&
                      filters.study &&
                      summary?.totalMinutes &&
                      date !== selected
                        ? {
                            background: `color-mix(in srgb, var(--accent-primary) ${Math.min(24, 5 + summary.totalMinutes / 5)}%, var(--surface-1))`,
                          }
                        : undefined
                    }
                    className={`${styles.monthCell} ${date === selected ? styles.selectedCell : ""} ${date.slice(0, 7) !== selected.slice(0, 7) ? styles.outsideCell : ""}`}
                  >
                    <button
                      className={styles.dateSelect}
                      data-calendar-date={date}
                      aria-current={date === today ? "date" : undefined}
                      aria-pressed={date === selected}
                      aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${dayEvents.length} events, ${summary?.questsCount || 0} quests, ${goals.length} deadlines, ${dayNotes.length} notes${isRest ? ", rest day" : ""}${summary?.totalMinutes ? `, ${summary.totalMinutes} study minutes` : ""}`}
                      tabIndex={date === selected ? 0 : -1}
                      onKeyDown={(event) => keyNavigate(event, date)}
                      onClick={() => select(date, window.innerWidth < 1200)}
                    />
                    <span className={styles.cellHeader}>
                      <span
                        data-ink-anchor={`${date}/date`}
                        className={`${styles.dateNumber} ${date === today ? styles.todayNumber : ""}`}
                      >
                        {Number(date.slice(8))}
                      </span>
                      {isRest && (
                        <Shield size={11} className={styles.restIcon} />
                      )}
                      {filters.study && !!summary?.totalMinutes && (
                        <span
                          className={styles.studyPip}
                          title={`${summary.totalMinutes} study minutes`}
                          style={{
                            opacity: Math.min(
                              1,
                              0.25 + summary.totalMinutes / 120
                            ),
                          }}
                        />
                      )}
                    </span>
                    <span className={styles.cellPreviews}>
                      {previews.slice(0, 2).map((preview) => (
                        <span
                          key={preview.id}
                          style={colorStyle(preview.color)}
                          className={styles.cellChip}
                          title={
                            preview.event?.external
                              ? `${preview.title} · ${preview.event.external.calendarName}`
                              : preview.title
                          }
                        >
                          <i />
                          {preview.type === "goal" && <Flag size={9} />}
                          <span
                            data-ink-anchor={`${date}/${preview.type}:${preview.event ? `${preview.event.id}${preview.event.occurrenceDate ? "@" + preview.event.occurrenceDate : ""}` : String(preview.id).replace(/^(goal|quest)-/, "")}`}
                          >
                            {preview.title}
                          </span>
                          {settings.timePlanning &&
                            preview.event &&
                            preview.event.external?.writable !== false &&
                            preview.event.shared?.role !== "VIEWER" && (
                              <MonthEventHandle
                                event={preview.event}
                                date={date}
                                busy={eventBusy || data.loading}
                                onMove={(item, input) =>
                                  void reschedule(item, input)
                                }
                                onError={setError}
                              />
                            )}
                        </span>
                      ))}
                      {!!dayNotes.length && (
                        <button
                          type="button"
                          className={styles.cellNote}
                          aria-label={`Open note: ${dayNotes[0].title || "Daily note"}`}
                          onClick={() =>
                            setEditor({ kind: "note", date, item: dayNotes[0] })
                          }
                        >
                          <NotebookPen size={11} />
                          <span className={notebookStyles.inkCellPreview}>
                            <InkPreview
                              strokes={
                                editableDocument(dayNotes[0].document).ink
                                  .strokes
                              }
                            />
                          </span>
                          <span>
                            {dayNotes[0].title ||
                              dayNotes[0].document.text ||
                              "Daily note"}
                          </span>
                        </button>
                      )}
                      {previews.length > 2 && (
                        <span className={styles.overflowCount}>
                          +{previews.length - 2} more
                        </span>
                      )}
                    </span>
                    <span className={styles.mobileIndicators}>
                      {previews.slice(0, 3).map((preview) => (
                        <i
                          key={preview.id}
                          style={{
                            background: resolveGoalColor(preview.color).base,
                          }}
                        />
                      ))}
                      {!!dayNotes.length && (
                        <button
                          className={styles.mobileNotePreview}
                          aria-label={`Open note: ${dayNotes[0].title || "Daily note"}`}
                          onClick={() =>
                            setEditor({ kind: "note", date, item: dayNotes[0] })
                          }
                        >
                          <NotebookPen size={10} />
                          <span className={notebookStyles.inkCellPreview}>
                            <InkPreview
                              strokes={
                                editableDocument(dayNotes[0].document).ink
                                  .strokes
                              }
                            />
                          </span>
                        </button>
                      )}
                    </span>
                    {filters.study && !!summary?.totalMinutes && (
                      <span className={styles.cellStudy}>
                        {duration(summary.totalMinutes)} study
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <footer className={styles.boardFooter}>
              <span>
                <i className={styles.studyPip} />
                Study activity
              </span>
              <span>
                <Shield size={12} />
                Rest day
              </span>
              <span>
                <NotebookPen size={12} />
                Daily note
              </span>
              {data.loading && <span role="status">Refreshing…</span>}
            </footer>
          </section>
        )}
        {view === "week" && (
          <section
            className={styles.weekBoard}
            ref={drawingRoot}
            aria-label="Week agenda"
            aria-busy={data.loading}
          >
            {annotationLayer}
            <div className={styles.weekHeading}>
              <span>
                {dateLabel(dates[0], { month: "short", day: "numeric" })} –{" "}
                {dateLabel(dates[6], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>
                {settings.timePlanning ? "Weekly plan" : "Week agenda"}
              </span>
            </div>
            {settings.timePlanning && timeline(dates)}
            <div
              className={`${styles.weekColumns} ${settings.timePlanning ? styles.planningAgenda : ""}`}
            >
              {dates.map((date) => {
                const summary = data.days.get(date),
                  entries = eventsOnDate(calendarEvents, date, timezone),
                  dayNotes = journalNotes.filter(
                    (note) => note.dateKey === date
                  ),
                  goals = data.milestones.filter(
                    (goal) => filters.objectives && goal.date === date
                  );
                return (
                  <div
                    key={date}
                    data-ink-anchor={`${date}/day`}
                    className={`${styles.weekColumn} ${date === selected ? styles.selectedWeek : ""}`}
                  >
                    <button
                      className={styles.weekDate}
                      aria-pressed={selected === date}
                      onClick={() => select(date, window.innerWidth < 1600)}
                    >
                      <span>{dateLabel(date, { weekday: "short" })}</span>
                      <strong
                        data-ink-anchor={`${date}/date`}
                        className={date === today ? styles.todayNumber : ""}
                      >
                        {Number(date.slice(8))}
                      </strong>
                    </button>
                    {(summary?.isRestDay || data.floating.has(date)) && (
                      <span className={styles.weekRest}>
                        <Shield size={11} />
                        Rest
                      </span>
                    )}
                    {!settings.timePlanning &&
                      entries.map((event) => renderEvent(event, true, date))}
                    {goals.map((goal) => (
                      <button
                        key={goal.id}
                        data-ink-anchor={`${date}/goal:${goal.id}`}
                        style={colorStyle(goal.color)}
                        className={styles.agendaQuest}
                        onClick={() => select(date, true)}
                      >
                        <Flag size={12} />
                        <span>
                          {goal.title}
                          <small>Goal deadline</small>
                        </span>
                      </button>
                    ))}
                    {filters.objectives &&
                      summary?.quests.map((quest) => (
                        <button
                          key={quest.id}
                          data-ink-anchor={`${date}/quest:${quest.id}`}
                          style={colorStyle(quest.goal?.color || "VIOLET")}
                          className={styles.agendaQuest}
                          onClick={() => select(date, true)}
                        >
                          {quest.status === "COMPLETED" ? (
                            <Check size={12} />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span>
                            {quest.title}
                            <small>
                              {duration(
                                quest.plannedMinutes ?? quest.requiredMinutes
                              )}{" "}
                              · {quest.plannerOwned ? "Planned study" : "Quest"}
                            </small>
                          </span>
                        </button>
                      ))}
                    {dayNotes.map((note) => (
                      <button
                        key={note.id}
                        className={styles.weekNote}
                        onClick={() =>
                          setEditor({ kind: "note", date, item: note })
                        }
                      >
                        <NotebookPen size={12} />
                        <InkPreview
                          strokes={editableDocument(note.document).ink.strokes}
                        />
                        <span>
                          {note.title ||
                            note.document.text.slice(0, 60) ||
                            "Daily note"}
                        </span>
                      </button>
                    ))}
                    {!entries.length &&
                      !summary?.quests.length &&
                      !goals.length &&
                      !dayNotes.length && (
                        <p className={styles.weekEmpty}>Room to plan</p>
                      )}
                    <button
                      className={styles.weekAdd}
                      aria-label={`Add event on ${date}`}
                      onClick={() => newItem("event", date)}
                    >
                      <Plus size={14} />
                      <span>Add</span>
                    </button>
                    {filters.study && !!summary?.totalMinutes && (
                      <small className={styles.weekStudy}>
                        {duration(summary.totalMinutes)} studied
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <aside
          ref={(node) => {
            workspace.current = node;
            if (view === "day") drawingRoot.current = node;
          }}
          data-ink-anchor={view === "day" ? `${selected}/day` : undefined}
          tabIndex={-1}
          className={styles.dailyWorkspace}
          aria-label="Daily workspace"
        >
          {view === "day" && annotationLayer}
          <header className={styles.dailyHeader}>
            <div>
              <p>
                {selected === today
                  ? "TODAY"
                  : dateLabel(selected, { weekday: "long" }).toUpperCase()}
              </p>
              <h3>
                {dateLabel(selected, { month: "long" })}{" "}
                <b data-ink-anchor={`${selected}/date`}>
                  {Number(selected.slice(8))}
                </b>
                <span>{dateLabel(selected, { year: "numeric" })}</span>
              </h3>
            </div>
            <button
              className={styles.iconButton}
              aria-label="New daily note"
              onClick={() => newItem("note")}
            >
              <NotebookPen size={19} />
            </button>
          </header>
          {(day?.isRestDay || data.floating.has(selected)) && (
            <div className={styles.restBanner}>
              <Shield size={14} />
              <span>
                {data.floating.has(selected) ? "Floating rest day" : "Rest day"}
                <small>Your study streak and HP are protected.</small>
              </span>
            </div>
          )}
          {data.loading && !day && (
            <p className={styles.loading} role="status">
              Loading your day…
            </p>
          )}
          {view === "day" && settings.timePlanning && timeline([selected])}
          <section className={styles.dailySection}>
            <div className={styles.sectionHeading}>
              <h4>
                Events <span>{events.length}</span>
              </h4>
              <button
                className={styles.iconButton}
                aria-label="Add event"
                onClick={() => newItem("event")}
              >
                <Plus size={16} />
              </button>
            </div>
            {events.length ? (
              <div className={styles.eventList}>
                {events.map((event) => renderEvent(event))}
              </div>
            ) : (
              <button
                className={styles.emptyPrompt}
                onClick={() => newItem("event")}
              >
                <CalendarDays size={22} />
                <span>
                  A little space for your plans
                  <small>Add an event to shape your day.</small>
                </span>
                <Plus size={16} />
              </button>
            )}
          </section>
          {filters.objectives && (
            <section className={styles.dailySection}>
              <div className={styles.sectionHeading}>
                <h4>
                  Quests & goals{" "}
                  <span>{(day?.questsCount || 0) + milestones.length}</span>
                </h4>
                <Link
                  href="/quests"
                  className={styles.textButton}
                  aria-label="Open objectives"
                >
                  <ArrowUpRight size={15} />
                </Link>
              </div>
              {milestones.map((goal) => (
                <Link
                  href="/goals"
                  key={goal.id}
                  data-ink-anchor={`${selected}/goal:${goal.id}`}
                  className={styles.objectiveCard}
                  style={colorStyle(goal.color)}
                >
                  <Flag size={17} />
                  <span>
                    <strong>{goal.title}</strong>
                    <small>Goal deadline</small>
                  </span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
              {filters.objectives &&
                day?.quests.map((quest) => (
                  <Link
                    href="/quests"
                    key={quest.id}
                    data-ink-anchor={`${selected}/quest:${quest.id}`}
                    className={`${styles.objectiveCard} ${quest.status === "COMPLETED" ? styles.completedQuest : ""}`}
                    style={colorStyle(quest.goal?.color || "VIOLET")}
                  >
                    {quest.status === "COMPLETED" ? (
                      <Check size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    <span>
                      <strong>{quest.title}</strong>
                      <small>
                        {quest.goal?.title || "Personal quest"} ·{" "}
                        {duration(
                          quest.plannedMinutes ?? quest.requiredMinutes
                        )}
                        {quest.plannerOwned ? " · Planned study" : ""}
                        {quest.status === "COMPLETED" ? " · Complete" : ""}
                      </small>
                      {quest.description && (
                        <small className={styles.questDescription}>
                          {quest.description}
                        </small>
                      )}
                    </span>
                    <ArrowUpRight size={13} />
                  </Link>
                ))}
              {!day?.questsCount && !milestones.length && (
                <p className={styles.emptyText}>
                  No quests or deadlines on this date.
                </p>
              )}
            </section>
          )}
          {filters.notes && (
            <section className={styles.dailySection}>
              <div className={styles.sectionHeading}>
                <h4>
                  Notes <span>{notes.length}</span>
                </h4>
                <button
                  className={styles.iconButton}
                  aria-label="Add note"
                  onClick={() => newItem("note")}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className={styles.notesList}>
                {notes.map((note) => (
                  <button
                    className={styles.noteCard}
                    key={note.id}
                    onClick={() =>
                      setEditor({ kind: "note", date: selected, item: note })
                    }
                  >
                    <NotebookPen size={15} />
                    <div>
                      <strong>{note.title || "Daily note"}</strong>
                      <InkPreview
                        strokes={editableDocument(note.document).ink.strokes}
                      />
                      <p>
                        {note.document.text ||
                          (note.hasHandwriting ? "Handwritten page" : "") ||
                          "An unwritten thought. Open to continue."}
                      </p>
                      <small>
                        Open note <ArrowUpRight size={11} />
                      </small>
                    </div>
                  </button>
                ))}
              </div>
              {!notes.length && (
                <button
                  className={styles.emptyNote}
                  onClick={() => newItem("note")}
                >
                  <NotebookPen size={18} />
                  <span>Leave a thought for this day…</span>
                  <Plus size={15} />
                </button>
              )}
            </section>
          )}
          {filters.study && !!day?.sessions?.length && (
            <section className={styles.dailySection}>
              <div className={styles.sectionHeading}>
                <h4>
                  Study sessions <span>{day.sessions.length}</span>
                </h4>
              </div>
              <div className={styles.eventList}>
                {day.sessions.map((session) => (
                  <div className={scheduleStyles.studyRecord} key={session.id}>
                    <Clock3 size={15} />
                    <span>
                      <strong>{session.title}</strong>
                      <small>
                        {TimezoneService.getUserLocalTime(
                          timezone,
                          new Date(session.startedAt)
                        )}{" "}
                        · {duration(session.minutes)} studied
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer className={styles.dailyFooter}>
            <span>
              <Clock3 size={14} />
              <strong>{duration(day?.totalMinutes || 0)}</strong> studied
              {day?.dailyGoalMinutes
                ? ` / ${duration(day.dailyGoalMinutes)}`
                : ""}
            </span>
            <button
              className={styles.textButton}
              onClick={() => {
                setInsights(true);
                setRestRevision((value) => value + 1);
              }}
            >
              Study details <ArrowUpRight size={13} />
            </button>
          </footer>
        </aside>
      </div>
      {editor && (
        <CalendarEditor
          key={`${editor.kind}-${editor.item?.id || (editor.kind === "event" ? editor.operation?.key || editor.initial?.startsAt : undefined) || editor.date}-${editor.kind === "event" ? editor.item?.occurrenceDate || "" : ""}`}
          selection={editor}
          detailed={settings.detailedEvents}
          timezone={timezone}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setNotice("Your calendar is saved.");
            requestAnimationFrame(() =>
              workspace.current?.focus({ preventScroll: true })
            );
          }}
        />
      )}
      {searchOpen && (
        <NotebookSearch
          onClose={() => setSearchOpen(false)}
          onOpen={(note) => {
            setSearchOpen(false);
            select(note.dateKey);
            setEditor({
              kind: "note",
              date: note.dateKey,
              item: {
                id: note.id,
                title: note.title,
                dateKey: note.dateKey,
                revision: note.revision,
                createdAt: "",
                updatedAt: "",
                document: { version: 1, text: "" },
                preview: true,
              },
            });
          }}
        />
      )}
      {settingsOpen && (
        <CalendarSettings
          owner={userId}
          settings={settings}
          loaded={preferences.loaded}
          onChange={preferences.update}
          onClose={() => setSettingsOpen(false)}
          onSearchNotes={() => {
            setSettingsOpen(false);
            setSearchOpen(true);
          }}
          onStudySettings={() => {
            setSettingsOpen(false);
            setScheduleOpen(true);
          }}
        />
      )}
      {scheduleOpen && month && (
        <StudyScheduleModal
          isOpen
          onClose={() => setScheduleOpen(false)}
          initialGoalMinutes={month.dailyGoalMinutes}
          initialRestDays={month.restDays}
          initialEnableHpPenalty={month.enableHpPenalty}
          onSaveSuccess={() => {
            invalidateClientCaches([
              "/api/calendar",
              "/api/quests",
              "/api/user/stats",
            ]);
            reload();
            void refreshStats();
          }}
        />
      )}
      {insights && (
        <CalendarDialog
          labelledBy="study-details-title"
          wide
          onClose={() => {
            if (!restBusy) setInsights(false);
          }}
        >
          <header className={styles.dialogHeader}>
            <h2 id="study-details-title">Study details</h2>
            <button
              className={styles.iconButton}
              aria-label="Close study details"
              onClick={() => setInsights(false)}
              disabled={restBusy}
            >
              <X size={19} />
            </button>
          </header>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {!rest && (
            <p className={styles.emptyText}>
              Rest-day controls could not load yet.{" "}
              <button
                className={styles.textButton}
                onClick={() => setRestRevision((value) => value + 1)}
              >
                Retry
              </button>
            </p>
          )}
          {day ? (
            <DayInspectionPanel
              dayData={day}
              milestones={milestones}
              floatingRestStatus={rest}
              onToggleFloatingRest={toggleRest}
              isTogglingFloatingRest={restBusy}
              onClose={() => setInsights(false)}
              embedded
            />
          ) : (
            <p className={styles.emptyText}>
              Study details are unavailable.{" "}
              <button className={styles.textButton} onClick={reload}>
                Retry
              </button>
            </p>
          )}
        </CalendarDialog>
      )}
    </div>
  );
}
