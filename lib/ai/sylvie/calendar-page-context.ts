/** Transient navigation only. Never cache events, notes, account data or authority. */
export interface CalendarPageHint {
  selectedDate: string;
  start: string;
  end: string;
  view: "month" | "week" | "day";
}
let current: { owner: symbol; hint: CalendarPageHint } | undefined;
export function publishCalendarPage(hint: CalendarPageHint) {
  const owner = Symbol();
  current = { owner, hint };
  return () => {
    if (current?.owner === owner) current = undefined;
  };
}
export function currentCalendarPage(): CalendarPageHint | undefined {
  return current?.hint;
}
