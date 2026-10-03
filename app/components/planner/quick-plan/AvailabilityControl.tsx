"use client";
import { useState } from "react";
import { WEEKDAY_NAMES } from "./WeeklyBudgetControl";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * The detailed week, behind "Customize days".
 *
 * Quick Plan shows hours first and this only when asked, but the capabilities are the
 * wizard's: a stated per-weekday value always wins over the balanced split, and a
 * weekday marked unavailable is a *hard* exclusion the engine will not break. A dated
 * exclusion is the right tool for a one-off day off, which is why both live here.
 */
export default function AvailabilityControl({
  dailyOverrides,
  restWeekdays,
  hardUnavailableWeekdays,
  blockedDates,
  distribution,
  disabled,
  onSetDailyOverrides,
  onMarkWeekday,
  onMarkDate,
}: {
  dailyOverrides: readonly (number | null)[] | null;
  restWeekdays: readonly number[];
  hardUnavailableWeekdays: readonly number[];
  blockedDates: readonly string[];
  distribution: readonly number[] | null;
  disabled?: boolean;
  onSetDailyOverrides: (overrides: (number | null)[] | null) => void;
  onMarkWeekday: (weekday: number, unavailable: boolean) => void;
  onMarkDate: (date: string, unavailable: boolean) => void;
}) {
  const [date, setDate] = useState("");
  const stated = (day: number): string => {
    const value = dailyOverrides?.[day];
    return value === null || value === undefined ? "" : String(value);
  };

  const write = (day: number, raw: string) => {
    const next: (number | null)[] = Array.from({ length: 7 }, (_, index) =>
      dailyOverrides?.[index] ?? null
    );
    if (raw.trim() === "") next[day] = null;
    else {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      next[day] = Math.min(720, Math.max(0, parsed));
    }
    onSetDailyOverrides(next.some((value) => value !== null) ? next : null);
  };

  return (
    <div className={s.field}>
      <span className={s.legend}>Your week, day by day</span>
      <p className={s.hint}>
        Leave a day blank to let Sylf spread your weekly time across it. A number you
        type here is used exactly as written.
      </p>
      <div className={s.days}>
        {WEEKDAY_NAMES.map((name, day) => {
          const off = restWeekdays.includes(day) || hardUnavailableWeekdays.includes(day);
          return (
            <div className={s.dayRow} key={name}>
              <label htmlFor={`quick-plan-day-${day}`}>
                <span>
                  {name}
                  {off ? " · unavailable" : ""}
                </span>
              </label>
              <input
                id={`quick-plan-day-${day}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={720}
                step={5}
                disabled={disabled || off}
                placeholder={distribution ? String(distribution[day] || "") : ""}
                value={stated(day)}
                onChange={(event) => write(day, event.target.value)}
              />
            </div>
          );
        })}
      </div>
      <div className={s.days}>
        <span className={s.hint}>Days you cannot study at all</span>
        {WEEKDAY_NAMES.map((name, day) => (
          <label className={base.check} key={`off-${name}`}>
            <input
              type="checkbox"
              checked={hardUnavailableWeekdays.includes(day)}
              disabled={disabled}
              onChange={(event) => onMarkWeekday(day, event.target.checked)}
            />
            {name}
          </label>
        ))}
      </div>
      <div className={s.blocked}>
        <label>
          <span>Single day off</span>
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !date}
          onClick={() => {
            if (!date) return;
            onMarkDate(date, true);
            setDate("");
          }}
        >
          Exclude that day
        </button>
      </div>
      {blockedDates.length > 0 && (
        <ul className={s.preview} aria-label="Days excluded from this plan">
          {[...blockedDates].sort().map((blocked) => (
            <li key={blocked}>
              <span>{blocked}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onMarkDate(blocked, false)}
              >
                Include again
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
