"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { TimezoneService } from "@/lib/timezone-service";
import { addDays, localTimeToISO } from "@/lib/calendar/dates";
import { eventFields } from "@/lib/calendar/scheduling";
import {
  calendarColors,
  eventInputSchema,
  type EventInput,
} from "@/lib/calendar/contracts";
import { recurrenceLabel, type Recurrence } from "@/lib/calendar/recurrence";
import {
  newEventOperation,
  eventOperationDurable,
  runEventOperation,
  forgetEventOperation,
  type EventOperation,
} from "@/lib/calendar/event-operations";
import { resolveGoalColor } from "@/lib/goal-theme";
import CalendarDialog from "./CalendarDialog";
import { calendarRequest } from "./useCalendarWorkspace";
import type { EditorSelection } from "./CalendarEditor";
import styles from "../Workspace.module.css";
import schedule from "../Scheduling.module.css";

type Selection = Extract<EditorSelection, { kind: "event" }>;
export default function EventEditor({
  selection,
  timezone,
  detailed = false,
  onClose,
  onSaved,
}: {
  selection: Selection;
  timezone: string;
  detailed?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [source, setSource] = useState(selection);
  const [scope, setScope] = useState<"occurrence" | "series">(
    selection.item?.occurrenceDate || selection.item?.external?.recurring
      ? "occurrence"
      : "series"
  );
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const changeScope = async (next: "occurrence" | "series") => {
    if (next === scope) return;
    if (next === "occurrence") {
      setSource(selection);
      setScope(next);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await calendarRequest(
        `/api/calendar/personal?kind=event&id=${selection.item!.id}${selection.item?.external ? "&scope=series" : ""}`
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Series could not load.");
      setSource({
        kind: "event",
        date: result.event.startDate,
        item: result.event,
      });
      setScope(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Series could not load.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <EventForm
      key={`${source.item?.id || "new"}:${scope}:${source.initial?.title || ""}`}
      selection={source}
      timezone={timezone}
      detailed={detailed}
      onClose={onClose}
      onSaved={onSaved}
      scope={scope}
      scopeControl={
        (source.item?.recurrence || source.item?.external?.recurring) &&
        !source.operation &&
        source.item?.external?.writable !== false ? (
          <div className={schedule.scope}>
            <Repeat2 size={15} />
            <label>
              Edit{" "}
              <select
                aria-label="Edit recurring event"
                value={scope}
                disabled={loading}
                onChange={(e) =>
                  void changeScope(e.target.value as typeof scope)
                }
              >
                <option value="occurrence">This occurrence</option>
                <option value="series">Entire series</option>
              </select>
            </label>
            {loading && <small>Loading…</small>}
            {error && <p role="alert">{error}</p>}
          </div>
        ) : null
      }
      onDuplicate={(data) => {
        setSource({
          kind: "event",
          date: data.startDate,
          initial: {
            ...data,
            title: `Copy of ${data.title}`,
            recurrence: null,
          },
        });
        setScope("series");
      }}
    />
  );
}
function EventForm({
  selection,
  timezone,
  detailed,
  onClose,
  onSaved,
  scope,
  scopeControl,
  onDuplicate,
}: {
  selection: Selection;
  timezone: string;
  detailed: boolean;
  onClose: () => void;
  onSaved: () => void;
  scope: "occurrence" | "series";
  scopeControl: React.ReactNode;
  onDuplicate: (data: EventInput) => void;
}) {
  const { user } = useAuth();
  const event = selection.item;
  const pendingData =
    selection.operation && "data" in selection.operation.body
      ? selection.operation.body.data
      : undefined;
  const initial = pendingData || selection.initial || event;
  const readonly =
    event?.external?.writable === false || event?.shared?.role === "VIEWER";
  const complexSeries =
    scope === "series" && event?.external?.unsupportedRecurrence;
  const [destinations, setDestinations] = useState<
    { id: string; name: string; provider: string }[]
  >([]);
  const [destination, setDestination] = useState("");
  const provider =
    event?.external?.provider ||
    (destinations.find((c) => c.id === destination)?.provider === "shared"
      ? undefined
      : destinations.find((c) => c.id === destination)?.provider);
  const sharedCalendarId =
    event?.shared?.calendarId ||
    (destinations.find((c) => c.id === destination)?.provider === "shared"
      ? destination
      : undefined);
  useEffect(() => {
    if (event || selection.operation) return;
    const controller = new AbortController();
    void Promise.allSettled([
      calendarRequest("/api/calendar/connections", {
        signal: controller.signal,
      }).then(async (r) => (r.ok ? r.json() : null)),
      calendarRequest("/api/calendar/shared", {
        signal: controller.signal,
      }).then(async (r) => (r.ok ? r.json() : null)),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const providerData =
          results[0].status === "fulfilled" ? results[0].value : null,
        sharedData =
          results[1].status === "fulfilled" ? results[1].value : null;
      setDestinations([
        ...(providerData?.connections || []).flatMap(
          (c: {
            provider: string;
            status: string;
            calendars: { id: string; name: string; writable: boolean }[];
          }) =>
            c.status === "ACTIVE"
              ? c.calendars
                  .filter((k) => k.writable)
                  .map((k) => ({ ...k, provider: c.provider }))
              : []
        ),
        ...(sharedData?.calendars || [])
          .filter(
            (c: { status: string; role: string }) =>
              c.status === "ACTIVE" && c.role !== "VIEWER"
          )
          .map((c: { id: string; name: string }) => ({
            ...c,
            provider: "shared",
          })),
      ]);
    });
    return () => controller.abort();
  }, [event, selection.operation]);
  const external = event?.external
    ? {
        calendarId: event.external.calendarId,
        scope: event.external.recurring ? scope : ("event" as const),
        etag: event.external.etag,
      }
    : destination && !sharedCalendarId
      ? { calendarId: destination, scope: "event" as const }
      : undefined;
  const zone = initial?.timezone || timezone;
  const [id] = useState(
    () => event?.id || selection.operation?.body.id || crypto.randomUUID()
  );
  const [title, setTitle] = useState(initial?.title || ""),
    [text, setText] = useState(initial?.description || "");
  const [start, setStart] = useState(initial?.startDate || selection.date),
    [end, setEnd] = useState(
      initial
        ? initial.allDay
          ? addDays(initial.endDate, -1)
          : initial.endDate
        : selection.date
    );
  const [startTime, setStartTime] = useState(
    initial?.startsAt
      ? TimezoneService.getUserLocalTime(zone, new Date(initial.startsAt))
      : "09:00"
  );
  const [endTime, setEndTime] = useState(
    initial?.endsAt
      ? TimezoneService.getUserLocalTime(zone, new Date(initial.endsAt))
      : "10:00"
  );
  const [allDay, setAllDay] = useState(initial?.allDay || false),
    [color, setColor] = useState(initial?.color || "VIOLET");
  const [category, setCategory] = useState(initial?.category || "personal"),
    [rule, setRule] = useState<Recurrence | null>(
      scope === "occurrence" ? null : initial?.recurrence || null
    );
  const [reminders, setReminders] = useState(initial?.reminders || []);
  const [advanced, setAdvanced] = useState(
    detailed || !!initial?.recurrence || (initial?.reminders?.length || 0) > 1
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [operation, setOperation] = useState<EventOperation | null>(
    selection.operation || null
  );
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const state = JSON.stringify({
    title,
    text,
    start,
    end,
    startTime,
    endTime,
    allDay,
    color,
    category,
    rule,
    reminders,
    destination,
  });
  const [original] = useState(state),
    dirty = state !== original;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || operation) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, operation]);
  const close = () => {
    if (!busy) {
      if (operation) onClose();
      else if (dirty) setConfirm("discard");
      else onClose();
    }
  };
  const read = () =>
    eventInputSchema.parse({
      title,
      description: text,
      color,
      category,
      recurrence: rule,
      reminders,
      allDay,
      startDate: start,
      endDate: allDay ? addDays(end, 1) : end,
      timezone: zone,
      startsAt: allDay
        ? null
        : initial?.startsAt &&
            start === initial.startDate &&
            startTime ===
              TimezoneService.getUserLocalTime(zone, new Date(initial.startsAt))
          ? initial.startsAt
          : localTimeToISO(start, startTime, zone),
      endsAt: allDay
        ? null
        : initial?.endsAt &&
            end === initial.endDate &&
            endTime ===
              TimezoneService.getUserLocalTime(zone, new Date(initial.endsAt))
          ? initial.endsAt
          : localTimeToISO(end, endTime, zone),
    });
  async function commit(op: EventOperation) {
    setOperation(op);
    setBusy(true);
    setError("");
    try {
      await runEventOperation(op);
      setOperation(null);
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. Your draft is kept."
      );
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    if (busy || readonly) return;
    if (operation) {
      void commit(operation);
      return;
    }
    try {
      const data = read();
      void commit(
        newEventOperation(
          user!.id,
          event ? "PATCH" : "POST",
          {
            kind: "event",
            id,
            revision: event?.revision || 1,
            ...(scope === "occurrence" && event?.occurrenceDate
              ? { occurrenceDate: event.occurrenceDate }
              : {}),
            data,
            ...(external ? { external } : {}),
            ...(sharedCalendarId ? { sharedCalendarId } : {}),
          },
          title
        )
      );
    } catch (err) {
      setError(
        (err as { issues?: { message: string }[] }).issues?.[0]?.message ||
          (err instanceof Error ? err.message : "Check the event details.")
      );
    }
  }
  const remove = () =>
    event &&
    void commit(
      newEventOperation(
        user!.id,
        "DELETE",
        {
          kind: "event",
          id,
          revision: event.revision,
          ...(external ? { external } : {}),
          ...(sharedCalendarId ? { sharedCalendarId } : {}),
          ...(scope === "occurrence" && event.occurrenceDate
            ? { occurrenceDate: event.occurrenceDate }
            : {}),
        },
        title
      )
    );
  const duplicate = () => {
    try {
      onDuplicate({ ...read(), recurrence: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check event details.");
    }
  };
  return (
    <CalendarDialog labelledBy="calendar-editor-title" onClose={close}>
      <form className={styles.editor} onSubmit={save} aria-busy={busy}>
        <header className={styles.dialogHeader}>
          <div className={styles.headingWithIcon}>
            <CalendarDays size={21} />
            <h2 id="calendar-editor-title">
              {readonly ? "Event details" : event ? "Edit event" : "New event"}
            </h2>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Close editor"
            onClick={close}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </header>
        {selection.hints?.length ? (
          <p className={schedule.hint}>{selection.hints.join(" ")}</p>
        ) : null}
        {event?.shared && (
          <p className={schedule.hint}>
            {event.shared.name} · Shared calendar ·{" "}
            {readonly ? "Can view" : "Changes are visible to accepted members"}
          </p>
        )}
        {event?.external && (
          <p className={schedule.hint}>
            {event.external.calendarName} ·{" "}
            {event.external.provider === "microsoft"
              ? "Outlook"
              : event.external.provider === "google"
                ? "Google Calendar"
                : "Subscription"}{" "}
            · {readonly ? "Read only" : "Changes save to this provider"}
            {event.external.meeting
              ? ". Meeting changes may notify attendees."
              : ""}
          </p>
        )}
        {!event && destinations.length > 0 && (
          <label className={styles.field}>
            Calendar
            <select
              aria-label="Destination calendar"
              value={destination}
              disabled={busy || !!operation}
              onChange={(e) => {
                setDestination(e.target.value);
                setCategory("personal");
                if (
                  destinations.find((c) => c.id === e.target.value)
                    ?.provider === "microsoft"
                )
                  setReminders((v) => v.slice(0, 1));
              }}
            >
              <option value="">Sylf · Personal</option>
              {destinations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ·{" "}
                  {c.provider === "shared"
                    ? "Shared"
                    : c.provider === "google"
                      ? "Google"
                      : "Outlook"}
                </option>
              ))}
            </select>
          </label>
        )}
        {!dirty && !operation && scopeControl}
        {dirty && (event?.recurrence || event?.external?.recurring) && (
          <p className={schedule.hint}>
            Editing{" "}
            {scope === "occurrence" ? "this occurrence" : "the entire series"}.
          </p>
        )}
        <fieldset
          disabled={busy || !!operation || readonly}
          className={styles.editorFields}
        >
          <label className={styles.field}>
            Title
            <input
              data-autofocus
              value={title}
              maxLength={180}
              required
              placeholder="What’s happening?"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className={schedule.check}>
            <input
              type="checkbox"
              checked={allDay}
              disabled={complexSeries}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            All day
          </label>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              Starts
              <input
                disabled={complexSeries}
                aria-label="Start date"
                type="date"
                required
                value={start}
                min="2000-01-01"
                max="2100-12-30"
                onChange={(e) => {
                  const next = e.target.value;
                  if (end < next) setEnd(next);
                  setStart(next);
                }}
              />
            </label>
            {!allDay && (
              <label className={styles.field}>
                Time
                <input
                  disabled={complexSeries}
                  aria-label="Start time"
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
            )}
            <label className={styles.field}>
              Ends
              <input
                disabled={complexSeries}
                aria-label="End date"
                type="date"
                required
                min={start}
                max="2100-12-30"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            {!allDay && (
              <label className={styles.field}>
                Time
                <input
                  disabled={complexSeries}
                  aria-label="End time"
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            )}
          </div>
          {!allDay && (
            <small className={schedule.hint}>{zone.replaceAll("_", " ")}</small>
          )}
          {!sharedCalendarId && (
            <label className={styles.field}>
              <span>
                <Bell size={14} /> Reminder
              </span>
              <select
                aria-label="Basic reminder"
                value={reminders.length ? String(reminders[0]) : "none"}
                onChange={(e) =>
                  setReminders(
                    e.target.value === "none"
                      ? []
                      : [
                          Number(e.target.value),
                          ...reminders
                            .slice(1)
                            .filter(
                              (value) => value !== Number(e.target.value)
                            ),
                        ]
                  )
                }
              >
                <option value="none">No reminder</option>
                {[
                  0,
                  5,
                  10,
                  15,
                  30,
                  60,
                  1440,
                  ...(reminders.length &&
                  ![0, 5, 10, 15, 30, 60, 1440].includes(reminders[0])
                    ? [reminders[0]]
                    : []),
                ].map((value) => (
                  <option key={value} value={value}>
                    {value === 0
                      ? "At event start"
                      : value >= 1440
                        ? `${value / 1440} day(s) before`
                        : `${value} minutes before`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {sharedCalendarId && (
            <p className={schedule.hint}>
              Shared events appear for all accepted members. For a personal
              reminder, create a private event.
            </p>
          )}
          <button
            className={schedule.advancedDisclosure}
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((value) => !value)}
          >
            <span>More options{rule ? ` · ${recurrenceLabel(rule)}` : ""}</span>
            <ChevronDown size={16} />
          </button>
          {advanced && (
            <div className={schedule.advancedFields}>
              {scope === "occurrence" &&
              (event?.recurrence || event?.external?.recurring) ? (
                <p className={schedule.hint}>
                  {event.recurrence
                    ? recurrenceLabel(event.recurrence)
                    : "Repeating event"}
                  . Change repeat rules by editing the entire series.
                </p>
              ) : event?.external?.unsupportedRecurrence ? (
                <p className={schedule.hint}>
                  This provider’s repeat pattern is more complex. Edit its
                  pattern in the provider; other details can be changed here.
                </p>
              ) : (
                <RecurrenceFields
                  rule={rule}
                  start={start}
                  onChange={setRule}
                />
              )}
              {!provider && (
                <>
                  <label className={styles.field}>
                    Category
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as typeof category)
                      }
                    >
                      {[
                        "personal",
                        "work",
                        "learning",
                        "health",
                        "time-block",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {value === "time-block"
                            ? "Time block"
                            : value[0].toUpperCase() + value.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className={schedule.colorChoices}>
                    <legend>Color</legend>
                    {calendarColors.map((value) => (
                      <button
                        type="button"
                        aria-label={`${value.toLowerCase()} event color`}
                        aria-pressed={color === value}
                        key={value}
                        style={{ background: resolveGoalColor(value).base }}
                        onClick={() => setColor(value)}
                      >
                        {color === value && <Check size={15} />}
                      </button>
                    ))}
                  </fieldset>
                </>
              )}
              <label className={styles.field}>
                Description
                <textarea
                  rows={3}
                  maxLength={10000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add a few details…"
                />
              </label>
              {!sharedCalendarId && (
                <fieldset className={schedule.reminders}>
                  <legend>Additional reminders</legend>
                  {reminders.map((value, index) => (
                    <div key={index}>
                      <label>
                        Minutes before
                        <input
                          aria-label={`Reminder ${index + 1} minutes before`}
                          type="number"
                          min={0}
                          max={40320}
                          value={value}
                          onChange={(e) =>
                            setReminders((items) =>
                              items.map((v, i) =>
                                i === index ? Number(e.target.value) : v
                              )
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Remove reminder ${index + 1}`}
                        onClick={() =>
                          setReminders((items) =>
                            items.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {reminders.length < (provider === "microsoft" ? 1 : 5) && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() =>
                        setReminders((items) => [
                          ...items,
                          [15, 60, 1440, 10080, 40320].find(
                            (value) => !items.includes(value)
                          )!,
                        ])
                      }
                    >
                      + Add reminder
                    </button>
                  )}
                  <p className={schedule.hint}>
                    {provider
                      ? "Reminders are delivered by the calendar provider. Sylf does not send duplicate alerts."
                      : `Reminders appear while Sylf is open. Browser alerts are optional in Calendar settings. All-day reminders count back from midnight in ${zone}.`}
                  </p>
                </fieldset>
              )}
              {scope === "series" && event?.recurrence && (
                <p className={schedule.hint}>
                  Existing occurrence edits keep their details on matching dates
                  when you change the repeat pattern.
                </p>
              )}
            </div>
          )}
        </fieldset>
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        {operation && !busy && (
          <p className={schedule.hint}>
            {operation && !eventOperationDurable(operation)
              ? "Device storage is unavailable. This change is kept only in this tab; keep it open until saving succeeds."
              : "This exact operation is saved on this device for retry."}{" "}
            You can close and resume it from the calendar. If another edit
            conflicts, reopen the latest event or save a separate copy.
          </p>
        )}
        {confirm && (
          <div className={schedule.confirm} role="alert">
            <p>
              {confirm === "delete"
                ? scope === "occurrence"
                  ? "Delete this occurrence?"
                  : "Delete this event and its entire series?"
                : "Discard these unsaved changes?"}
            </p>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={confirm === "delete" ? remove : onClose}
            >
              {confirm === "delete" ? "Delete" : "Discard"}
            </button>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => setConfirm(null)}
            >
              Keep editing
            </button>
          </div>
        )}
        <footer className={styles.editorFooter}>
          {event && !operation && !readonly && (
            <button
              type="button"
              aria-label="Delete event"
              className={styles.iconButton}
              onClick={() => setConfirm("delete")}
              disabled={busy}
            >
              <Trash2 size={17} />
            </button>
          )}
          {(event || operation) && (
            <button
              type="button"
              className={styles.textButton}
              disabled={busy}
              onClick={() => {
                if (operation) {
                  const data =
                    "data" in operation.body
                      ? operation.body.data
                      : event && eventFields(event);
                  if (data) {
                    forgetEventOperation(operation);
                    onDuplicate({ ...data, recurrence: null });
                  }
                } else duplicate();
              }}
            >
              <Copy size={14} />
              {operation ? "Save a copy" : "Duplicate"}
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={close}
            disabled={busy}
          >
            {operation ? "Keep for later" : "Cancel"}
          </button>
          {!readonly && (
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={busy}
            >
              <Check size={16} />
              {busy ? "Saving…" : operation ? "Retry" : "Save event"}
            </button>
          )}
        </footer>
      </form>
    </CalendarDialog>
  );
}
function RecurrenceFields({
  rule,
  start,
  onChange,
}: {
  rule: Recurrence | null;
  start: string;
  onChange: (value: Recurrence | null) => void;
}) {
  const day = new Date(start + "T12:00Z").getUTCDay();
  return (
    <fieldset className={schedule.recurrence}>
      <legend>Repeat</legend>
      <select
        aria-label="Repeat frequency"
        value={rule?.frequency || "none"}
        onChange={(e) =>
          onChange(
            e.target.value === "none"
              ? null
              : {
                  frequency: e.target.value as Recurrence["frequency"],
                  interval: 1,
                  weekdays: [day],
                  monthly: "date",
                  until: null,
                  count: null,
                }
          )
        }
      >
        {["none", "daily", "weekly", "monthly", "yearly"].map((value) => (
          <option key={value} value={value}>
            {value === "none"
              ? "Does not repeat"
              : value[0].toUpperCase() + value.slice(1)}
          </option>
        ))}
      </select>
      {rule && (
        <>
          <label>
            Every
            <input
              aria-label="Repeat interval"
              type="number"
              min={1}
              max={99}
              value={rule.interval}
              onChange={(e) =>
                onChange({ ...rule, interval: Number(e.target.value) })
              }
            />
            {
              {
                daily: "day(s)",
                weekly: "week(s)",
                monthly: "month(s)",
                yearly: "year(s)",
              }[rule.frequency]
            }
          </label>
          {rule.frequency === "weekly" && (
            <div
              className={schedule.weekdays}
              role="group"
              aria-label="Repeat weekdays"
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (name, i) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={rule.weekdays?.includes(i) || false}
                    onClick={() =>
                      onChange({
                        ...rule,
                        weekdays: rule.weekdays?.includes(i)
                          ? rule.weekdays.filter((v) => v !== i)
                          : [...(rule.weekdays || []), i],
                      })
                    }
                  >
                    {name}
                  </button>
                )
              )}
            </div>
          )}
          {rule.frequency === "monthly" && (
            <select
              aria-label="Monthly pattern"
              value={rule.monthly || "date"}
              onChange={(e) =>
                onChange({
                  ...rule,
                  monthly: e.target.value as "date" | "weekday",
                })
              }
            >
              <option value="date">
                On day {Number(start.slice(8))} (skip short months)
              </option>
              <option value="weekday">
                On the{" "}
                {Number(start.slice(8)) + 7 >
                new Date(
                  Date.UTC(
                    Number(start.slice(0, 4)),
                    Number(start.slice(5, 7)),
                    0
                  )
                ).getUTCDate()
                  ? "last"
                  : ["first", "second", "third", "fourth", "fifth"][
                      Math.floor((Number(start.slice(8)) - 1) / 7)
                    ]}{" "}
                {new Intl.DateTimeFormat("en", {
                  weekday: "long",
                  timeZone: "UTC",
                }).format(new Date(start + "T12:00Z"))}
              </option>
            </select>
          )}
          <label>
            Ends
            <select
              aria-label="Repeat ending"
              value={rule.until ? "date" : rule.count ? "count" : "never"}
              onChange={(e) =>
                onChange({
                  ...rule,
                  until: e.target.value === "date" ? addDays(start, 30) : null,
                  count: e.target.value === "count" ? 10 : null,
                })
              }
            >
              <option value="never">Never</option>
              <option value="date">On a date</option>
              <option value="count">After a number of occurrences</option>
            </select>
          </label>
          {rule.until && (
            <input
              aria-label="Repeat until"
              type="date"
              min={start}
              max="2100-12-31"
              value={rule.until}
              onChange={(e) => onChange({ ...rule, until: e.target.value })}
            />
          )}
          {rule.count !== null && (
            <input
              aria-label="Occurrence count"
              type="number"
              min={1}
              max={10000}
              value={rule.count}
              onChange={(e) =>
                onChange({ ...rule, count: Number(e.target.value) })
              }
            />
          )}
          <small className={schedule.hint}>
            Local wall time stays fixed across clock changes. Nonexistent
            clock-change times are skipped.
          </small>
        </>
      )}
    </fieldset>
  );
}
