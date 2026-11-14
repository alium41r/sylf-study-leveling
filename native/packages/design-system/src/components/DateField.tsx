// Choosing a day. `DateField` is the one control the app uses wherever it asks for a date: a tray that shows the day in words and opens the mini
// calendar in a popover. `MiniCalendar` is the month itself, for any surface that wants it inline. Dates are civil days written `YYYY-MM-DD`.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Icon } from "../icons";
import type { ViewHandle } from "../primitives/Layout";
import { Marker } from "../primitives/Marker";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { useControlHeight, useInputFormat, useTheme } from "../theme/context";
import { clampDay, formatDateKey, inRange, isDateKey, monthGrid, monthOf, monthOpen, monthTitle, shiftDays, shiftMonth, shiftMonths, todayKey, weekIndex, weekdayNames, type MonthRef } from "../logic/calendar";
import { Button, IconButton } from "./Button";
import { Popover } from "./Overlays";

export interface MiniCalendarProps {
  /** The chosen day, if any. */
  value?: string | null;
  onSelect: (day: string) => void;
  /** The earliest and latest days that can be chosen. Days outside stay visible but cannot be pressed. */
  min?: string | null;
  max?: string | null;
  /** The student's today, when it is not the device's (the planner's snapshot). */
  today?: string;
  label: string;
  /** Shown as a Clear action when the date is optional and set. */
  onClear?: () => void;
  testID?: string;
}

const cellSize = (format: string) => (format === "touch" ? 44 : 38);

/** The width a `MiniCalendar` needs, so a popover can be sized before it measures. */
export function useMiniCalendarWidth() {
  const { space } = useTheme();
  return cellSize(useInputFormat()) * 7 + space.md * 2;
}

/**
 * A month of days: the chosen day filled in the accent, today carrying the Marker, days that cannot be chosen faded. On a keyboard the arrows move by
 * day and week, Page Up and Page Down by month (with Shift, by year), Home and End to the ends of the week, and Enter chooses.
 */
export function MiniCalendar({ value, onSelect, min, max, today: todayProp, label, onClear, testID }: MiniCalendarProps) {
  const { color, space, shape } = useTheme();
  const format = useInputFormat();
  const cell = cellSize(format);
  const today = todayProp && isDateKey(todayProp) ? todayProp : todayKey();
  const chosen = isDateKey(value) ? value : null;
  const start = chosen ?? clampDay(today, min, max);
  const [shown, setShown] = useState<MonthRef>(() => monthOf(start));
  const [focus, setFocus] = useState(start);
  const rows = useMemo(() => monthGrid(shown), [shown]);
  const names = useMemo(() => weekdayNames("short"), []);
  const prefix = useId();
  const grid = useRef<ViewHandle>(null);
  const pending = useRef<string | null>(null);
  const cellId = (day: string) => `${prefix}-${day}`;

  // The day that Tab reaches: the focused day when it is in view, else the chosen day, today, or the month's first open day.
  const visible = (day: string | null) => !!day && monthOf(day).year === shown.year && monthOf(day).month === shown.month && inRange(day, min, max);
  const openDays = rows.flat().filter((day): day is string => !!day && inRange(day, min, max));
  const tabDay = [focus, chosen, today].find(visible) ?? openDays[0] ?? null;

  // A keyboard move lands focus on its new day once that month has rendered.
  useEffect(() => {
    if (Platform.OS !== "web" || !pending.current) return;
    const target = document.getElementById(cellId(pending.current));
    pending.current = null;
    target?.focus({ preventScroll: true });
  });
  // Opening in a popover: the focus trap takes the first control, so the chosen day takes focus back on the next frame.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const frame = requestAnimationFrame(() => { if (tabDay && grid.current && (grid.current as unknown as HTMLElement).contains?.(document.activeElement)) return; if (tabDay) document.getElementById(cellId(tabDay))?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, []); // Only on opening: later, focus follows the student.

  const moveTo = (day: string) => {
    const next = clampDay(day, min, max);
    setFocus(next);
    setShown(monthOf(next));
    pending.current = next;
  };
  const onKeyDown = (event: { key: string; shiftKey: boolean; preventDefault(): void }) => {
    const from = tabDay ?? start;
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    const next = step ? shiftDays(from, step)
      : event.key === "PageUp" || event.key === "PageDown" ? shiftMonths(from, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1))
      : event.key === "Home" ? shiftDays(from, -weekIndex(from))
      : event.key === "End" ? shiftDays(from, 6 - weekIndex(from))
      : null;
    if (!next) return;
    event.preventDefault();
    moveTo(next);
  };

  const previous = shiftMonth(shown, -1);
  const following = shiftMonth(shown, 1);
  const todayOpen = inRange(today, min, max);

  return (
    <View style={{ padding: space.md, gap: space.sm }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <IconButton icon="chevronLeft" size="small" label="Previous month" disabled={!monthOpen(previous, min, max)} onPress={() => setShown(previous)} testID={testID ? `${testID}-previous` : undefined} />
        <Text variant="label" align="center" style={{ flex: 1 }} role="heading" aria-live="polite" testID={testID ? `${testID}-month` : undefined}>{monthTitle(shown)}</Text>
        <IconButton icon="chevronRight" size="small" label="Next month" disabled={!monthOpen(following, min, max)} onPress={() => setShown(following)} testID={testID ? `${testID}-next` : undefined} />
      </View>
      {/* Each day's name says its full date, so the weekday letters are for the eye only. */}
      <View ref={grid} role="group" aria-label={label} {...(Platform.OS === "web" ? { onKeyDown } as object : {})}>
        <View aria-hidden style={{ flexDirection: "row" }}>
          {names.map((name, index) => <View key={index} style={{ width: cell, alignItems: "center", paddingBottom: space.xs }}><Text variant="caption" tone="soft" numberOfLines={1}>{name}</Text></View>)}
        </View>
        {rows.map((row, index) => (
          <View key={index} style={{ flexDirection: "row" }}>
            {row.map((day, column) => {
              if (!day) return <View key={column} style={{ width: cell, height: cell }} />;
              const open = inRange(day, min, max);
              const isChosen = day === chosen;
              const isToday = day === today;
              const spoken = `${formatDateKey(day, "spoken")}${isToday ? ", today" : ""}${isChosen ? ", chosen" : ""}`;
              return (
                <Press
                  key={day}
                  id={cellId(day)}
                  testID={testID ? `${testID}-day-${day}` : undefined}
                  label={spoken}
                  disabled={!open}
                  onPress={() => onSelect(day)}
                  onFocus={() => setFocus(day)}
                  height={cell}
                  radius={shape.radius.sm}
                  {...({ tabIndex: day === tabDay ? 0 : -1 } as object)}
                  style={{ width: cell }}
                  bodyStyle={{ height: cell, alignItems: "center", justifyContent: "center", backgroundColor: isChosen ? color.accent.fill : undefined }}
                >
                  <Text variant="small" tone={open ? "ink" : "soft"} style={[isChosen ? { color: color.accent.on } : null, isChosen || isToday ? { fontWeight: "700" } : null]}>{String(Number(day.slice(8)))}</Text>
                  {isToday ? <View pointerEvents="none" style={{ position: "absolute", bottom: Math.round(cell * 0.14) }}><Marker scale={0.5} color={isChosen ? color.accent.on : undefined} /></View> : null}
                </Press>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Button title="Today" size="small" variant="ghost" disabled={!todayOpen} onPress={() => onSelect(today)} testID={testID ? `${testID}-today` : undefined} />
        <View style={{ flex: 1 }} />
        {onClear ? <Button title="Clear" size="small" variant="ghost" onPress={onClear} testID={testID ? `${testID}-clear` : undefined} /> : null}
      </View>
    </View>
  );
}

export interface DateFieldProps {
  label: string;
  hideLabel?: boolean;
  /** A `YYYY-MM-DD` day, or empty. */
  value: string | null | undefined;
  /** Receives the chosen day, or "" when an optional date is cleared. */
  onChange: (day: string) => void;
  min?: string | null;
  max?: string | null;
  today?: string;
  /** An optional date can be cleared, from the field and from the calendar. */
  optional?: boolean;
  placeholder?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

/** A tray like a text field that shows the day in words. Pressing it opens the mini calendar beside it; choosing a day closes it. */
export function DateField({ label, hideLabel, value, onChange, min, max, today, optional, placeholder = "Choose a date", helper, error, disabled, testID }: DateFieldProps) {
  const { color, shape, space } = useTheme();
  const height = useControlHeight();
  const width = useMiniCalendarWidth();
  const [open, setOpen] = useState(false);
  const anchor = useRef<ViewHandle>(null);
  const set = isDateKey(value) ? value : null;
  const clear = () => onChange("");
  return (
    <View style={{ gap: space.xs + 2 }}>
      {hideLabel ? null : <Text variant="caption" tone="soft">{label}</Text>}
      <View ref={anchor} collapsable={false} style={{ flexDirection: "row", alignItems: "center", minHeight: height, backgroundColor: color.sunken, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: error ? color.critical.ink : open ? color.accent.line : color.line, opacity: disabled ? 0.55 : 1 }}>
        <Press
          testID={testID}
          label={`${label}: ${set ? formatDateKey(set, "spoken") : "no date chosen"}`}
          hint="Opens a calendar"
          expanded={open}
          disabled={disabled}
          onPress={() => setOpen(true)}
          height={height - 2}
          radius={shape.radius.sm}
          style={{ flex: 1, minWidth: 0 }}
          bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md }}
        >
          <Icon name="calendar" size={16} active={!!set} color={set ? color.inkSoft : color.inkFaint} />
          <Text variant="small" tone={set ? "ink" : "faint"} numberOfLines={1} style={{ flex: 1 }}>{set ? formatDateKey(set) : placeholder}</Text>
          {optional && set && !disabled ? null : <Icon name="chevronDown" size={14} color={color.inkFaint} />}
        </Press>
        {optional && set && !disabled ? <Press label={`Clear ${label}`} onPress={clear} height={height - 2} radius={shape.radius.sm} testID={testID ? `${testID}-clear-field` : undefined} bodyStyle={{ width: height - 2, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={14} color={color.inkSoft} /></Press> : null}
      </View>
      {error ? <Text variant="caption" tone="critical">{error}</Text> : helper ? <Text variant="caption" tone="soft">{helper}</Text> : null}
      <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label={label} width={width}>
        <MiniCalendar value={set} min={min} max={max} today={today} label={label} testID={testID ? `${testID}-calendar` : undefined} onSelect={(day) => { onChange(day); setOpen(false); }} onClear={optional && set ? () => { clear(); setOpen(false); } : undefined} />
      </Popover>
    </View>
  );
}
