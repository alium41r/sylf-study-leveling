// A real month, with the student's real events on it. Changing month works and is remembered by the window, and each month is one read. A new event
// on one day can be added here. Editing, repeating events and shared calendars stay with the Calendar service on the web, and the tool says so.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Button, IconButton, ListRow, Press, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { describeFailureText } from "../../../shell/account/failure";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { monthRange } from "../data/live";
import { dayKey } from "../data/sample";
import { ToolFootnote, ToolLoading, ToolPage, type ToolProps } from "./shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NOW = () => new Date();
const load = (adapter: WorkspaceDataAdapter) => adapter.calendar(NOW());

function monthCells(year: number, month: number) {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, index) => { const day = index - lead + 1; return day >= 1 && day <= days ? day : null; });
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** One new event on the chosen day. A blank time makes it an all-day event. */
function AddEvent({ day }: { day: string }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const timeError = time.trim() && !TIME.test(time.trim()) ? "Use 24-hour time, such as 14:30." : undefined;
  const add = async () => {
    if (!backend || !title.trim() || timeError || busy) return;
    setBusy(true);
    const match = TIME.exec(time.trim());
    const startsAt = match ? new Date(`${day}T${match[1].padStart(2, "0")}:${match[2]}:00`) : null;
    const endsAt = startsAt ? new Date(startsAt.getTime() + 3_600_000) : null;
    try {
      // The day and the times are this device's, so the zone sent with them must be too.
      await backend.reads.createEvent({ id: globalThis.crypto.randomUUID(), title: title.trim(), day, endDay: endsAt ? dayKey(endsAt) : day, startsAt: startsAt?.toISOString() ?? null, endsAt: endsAt?.toISOString() ?? null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setTitle(""); setTime("");
      backend.resources.invalidate("calendar");
    } catch (error) { notice(describeFailureText(error)); }
    setBusy(false);
  };
  return (
    <Stack gap="sm">
      <TextField label="New event" hideLabel placeholder="New event" value={title} onChangeText={setTitle} testID="calendar-new-title" returnKeyType="done" onSubmitEditing={() => void add()} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}><TextField label="Time, 24-hour" hideLabel placeholder="Time (optional)" value={time} onChangeText={setTime} error={timeError} testID="calendar-new-time" keyboardType="numbers-and-punctuation" /></View>
        <Button title={busy ? "Adding" : "Add"} disabled={busy || !title.trim() || Boolean(timeError)} testID="calendar-add" onPress={() => void add()} />
      </View>
    </Stack>
  );
}

export default function CalendarTool({ window, patch, onProvenance }: ToolProps) {
  const { color, shape, space } = useTheme();
  const backend = useLiveBackend();
  const today = useMemo(() => new Date(), []);
  const offset = typeof window.state.monthOffset === "number" ? window.state.monthOffset : 0;
  const shown = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const range = monthRange(shown);
  const result = useToolResult("calendar", load, `${range.start}/${range.end}`);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  const cells = monthCells(shown.getFullYear(), shown.getMonth());
  const selected = typeof window.state.day === "string" ? window.state.day : dayKey(today);
  const todayKey = dayKey(today);
  if (!result) return <ToolLoading />;
  const entries = result.data ?? [];
  const onDay = entries.filter((entry) => entry.day === selected);
  return (
    <View style={{ flex: 1 }}>
    <ToolPage>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="subheading" role="heading" aria-level={2} style={{ flex: 1 }}>{shown.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
        <IconButton icon="chevronLeft" size="small" label="Previous month" onPress={() => patch({ monthOffset: offset - 1 })} />
        <IconButton icon="chevronRight" size="small" label="Next month" onPress={() => patch({ monthOffset: offset + 1 })} />
      </View>
      <View>
        <View style={{ flexDirection: "row" }}>{WEEKDAYS.map((day) => <Text key={day} variant="micro" tone="soft" align="center" style={{ flex: 1 }}>{day}</Text>)}</View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: space.xs }}>
          {cells.map((day, index) => {
            const key = day ? dayKey(new Date(shown.getFullYear(), shown.getMonth(), day)) : `blank-${index}`;
            const picked = key === selected;
            const busy = entries.some((entry) => entry.day === key);
            return (
              <View key={key} style={{ width: `${100 / 7}%`, aspectRatio: 1.25, padding: 1 }}>
                {day ? (
                  <Press label={`${day}${busy ? ", has events" : ""}`} selected={picked} radius={shape.radius.sm} onPress={() => patch({ day: key })} bodyStyle={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: picked ? color.selected : "transparent" }} style={{ flex: 1 }}>
                    <Text variant="small" tone={key === todayKey ? "accent" : "ink"}>{day}</Text>
                    <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: busy ? color.inkSoft : "transparent" }} />
                  </Press>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
      <Stack gap="xs">
        <Text variant="caption" tone="soft">{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text>
        {result.live?.failure && !result.data ? <Text variant="small" tone="soft" testID="calendar-failed">{`This month didn't load. ${result.live.failure}`}</Text> : onDay.length ? onDay.map((entry) => <ListRow key={entry.id} title={entry.title} value={entry.time} />) : <Text variant="small" tone="soft">Nothing on this day.</Text>}
      </Stack>
      {backend ? <AddEvent day={selected} /> : null}
    </ToolPage>
    {backend ? <ToolFootnote><Text variant="caption" tone="soft">Changing an event stays on Sylf for the web for now.</Text></ToolFootnote> : null}
    </View>
  );
}
