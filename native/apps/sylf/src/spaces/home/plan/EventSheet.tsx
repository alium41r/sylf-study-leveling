// One event, new or changing. A title is enough, and the rest is there when it is wanted. A stale save keeps the draft: the server said someone else
// moved this, so the person chooses what happens to their words. Events from a connected or shared calendar are read here, because they belong elsewhere.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Callout, DateField, Select, Sheet, Stack, Text, TextField, Toggle, useNotice, useTheme } from "@sylf/design-system";
import type { EventData, PlanEvent } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import { addDays, deviceTimezone, instantOf, timeOf, validDay, validTime, weekday } from "./shared";
import { refreshPlan } from "./usePlan";

const CATEGORIES = [{ value: "personal", label: "Personal" }, { value: "learning", label: "Learning" }, { value: "work", label: "Work" }, { value: "health", label: "Health" }, { value: "time-block", label: "Time block" }] as const;
type Category = (typeof CATEGORIES)[number]["value"];
const REPEATS = [{ value: "none", label: "Doesn't repeat" }, { value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "Every month" }] as const;
type Repeat = (typeof REPEATS)[number]["value"];
const REMINDERS = [{ value: "none", label: "No reminder" }, { value: "10", label: "10 minutes before" }, { value: "30", label: "30 minutes before" }, { value: "60", label: "1 hour before" }, { value: "1440", label: "1 day before" }] as const;
type Reminder = (typeof REMINDERS)[number]["value"];

export interface EventTarget { event: PlanEvent | null; day: string; time?: string }

export function EventSheet({ target, onClose }: { target: EventTarget | null; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const event = target?.event ?? null;
  const readOnly = event?.external !== undefined || (event?.shared !== undefined && event.shared.role === "VIEWER");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [day, setDay] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [category, setCategory] = useState<Category>("personal");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [reminder, setReminder] = useState<Reminder>("none");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!target) return;
    const source = target.event;
    setTitle(source?.title ?? ""); setNotes(source?.description ?? ""); setStale(false);
    setAllDay(source ? source.allDay : !target.time);
    setDay(source ? (source.startsAt ? new Date(source.startsAt).toLocaleDateString("en-CA") : source.startDate) : target.day);
    const opening = source?.startsAt ? timeOf(source.startsAt) : target.time ?? "09:00";
    setStart(opening);
    setEnd(source?.endsAt ? timeOf(source.endsAt) : `${String((Number(opening.split(":")[0]) + 1) % 24).padStart(2, "0")}:${opening.split(":")[1]}`);
    setCategory((CATEGORIES.find((item) => item.value === source?.category)?.value ?? "personal"));
    setRepeat((REPEATS.find((item) => item.value === source?.recurrence?.frequency)?.value ?? "none"));
    setReminder((REMINDERS.find((item) => item.value === String(source?.reminders?.[0]))?.value ?? "none"));
  }, [target]);

  const invalid = !title.trim() || !validDay(day) || (!allDay && (!validTime(start) || !validTime(end)));
  const data = (): EventData => {
    const startsAt = allDay ? null : instantOf(day, start);
    const endsAt = allDay ? null : instantOf(day, end);
    // Past midnight means the next day, and the same time would be an event of no length.
    const adjusted = endsAt && startsAt && endsAt <= startsAt ? instantOf(addDays(day, 1), end) : endsAt;
    return {
      title: title.trim(), description: notes, color: event?.color ?? "BLUE", category, allDay,
      startDate: day, endDate: allDay ? addDays(day, 1) : adjusted ? new Date(adjusted).toLocaleDateString("en-CA") : day, startsAt, endsAt: adjusted,
      timezone: event?.timezone ?? deviceTimezone(), reminders: reminder === "none" ? [] : [Number(reminder)],
      recurrence: repeat === "none" ? null : event?.recurrence?.frequency === repeat ? event.recurrence : { frequency: repeat, interval: 1, until: null, count: null, ...(repeat === "weekly" ? { weekdays: [weekday(day)] } : {}) },
    };
  };
  const save = async () => {
    if (!backend || invalid || busy) return;
    setBusy(true);
    try {
      if (event) await backend.reads.plan.updateEvent(event.id, event.revision, data());
      else await backend.reads.plan.createEvent(globalThis.crypto.randomUUID(), data());
      refreshPlan(backend); onClose();
    } catch (error) {
      if ((error as { detail?: { status?: number }; kind?: string }).kind === "conflict") setStale(true);
      else notice(describeFailureText(error));
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!backend || !event || busy) return;
    setBusy(true);
    try { await backend.reads.plan.deleteEvent(event.id, event.revision); refreshPlan(backend); onClose(); notice("Event deleted."); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  const reload = () => { if (backend) refreshPlan(backend); onClose(); };

  return (
    <Sheet open={target !== null} onClose={onClose} title={event ? "Event" : "New event"}>
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          {readOnly ? <Text variant="small" tone="soft">{`From ${event?.external?.calendarName ?? event?.shared?.name}. Change it there.`}</Text> : null}
          {stale ? <View testID="event-stale"><Callout tone="caution" title="This event changed elsewhere" message="Your words are still here. Open the latest version to save them over it." /></View> : null}
          <TextField label="Title" value={title} onChangeText={setTitle} testID="event-title" editable={!readOnly} returnKeyType="done" />
          <Toggle label="All day" value={allDay} onChange={setAllDay} disabled={readOnly} />
          <DateField label="Date" value={day} onChange={setDay} testID="event-day" disabled={readOnly} />
          {allDay ? null : (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}><TextField label="Starts" value={start} onChangeText={setStart} testID="event-start" error={validTime(start) ? undefined : "Use 24-hour time, such as 14:30."} editable={!readOnly} /></View>
              <View style={{ flex: 1 }}><TextField label="Ends" value={end} onChangeText={setEnd} testID="event-end" error={validTime(end) ? undefined : "Use 24-hour time, such as 15:30."} editable={!readOnly} /></View>
            </View>
          )}
          {readOnly ? null : <Select<Category> label="Kind" value={category} options={[...CATEGORIES]} onChange={setCategory} />}
          {readOnly ? null : <Select<Repeat> label="Repeats" value={repeat} options={[...REPEATS]} onChange={setRepeat} />}
          {readOnly ? null : <Select<Reminder> label="Reminder" value={reminder} options={[...REMINDERS]} onChange={setReminder} />}
          <TextField label="Notes" value={notes} onChangeText={setNotes} multiline editable={!readOnly} />
          {event?.recurrence && !readOnly ? <Text variant="caption" tone="soft">Changes here apply to the whole series.</Text> : null}
          {readOnly ? null : stale ? <Button title="Open the latest version" variant="emphasis" testID="event-reload" onPress={reload} /> : <Button title={busy ? "Saving" : event ? "Save" : "Add event"} variant="emphasis" disabled={invalid || busy} testID="event-save" onPress={() => void save()} />}
          {event && !readOnly ? <Button title="Delete event" variant="critical" disabled={busy} testID="event-delete" onPress={() => void remove()} /> : null}
        </Stack>
      </View>
    </Sheet>
  );
}
