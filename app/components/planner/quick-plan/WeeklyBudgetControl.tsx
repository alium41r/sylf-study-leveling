"use client";
import { useState } from "react";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * "How much time can you realistically give this each week?"
 *
 * The student answers in hours; the engine needs a seven-value vector. That
 * translation is the server's job (`distributeWeeklyBudget`), and this control shows
 * the result rather than guessing at one: a client cannot know the account's rest
 * dates, its floating days off, or the work already committed to each day.
 *
 * The budget is a *target for this plan*, never an account-wide setting, and never a
 * hard cap — the engine's own hard limits still block what they always blocked.
 */

const PRESETS = [
  { minutes: 180, label: "3h" },
  { minutes: 300, label: "5h" },
  { minutes: 480, label: "8h" },
  { minutes: 600, label: "10h" },
  { minutes: 900, label: "15h" },
] as const;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const formatMinutes = (minutes: number): string => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
};

export default function WeeklyBudgetControl({
  weeklyMinutes,
  distribution,
  distributionNote,
  hardWeeklyLimitMinutes,
  scheduleWeeklyMinutes,
  disabled,
  onSetWeekly,
}: {
  weeklyMinutes: number | null;
  /** The server-computed weekday vector, or null before it has been computed. */
  distribution: readonly number[] | null;
  distributionNote: string | null;
  /** The engine's hard weekly ceiling, when the student has stated one. */
  hardWeeklyLimitMinutes?: number | null;
  /** The weekly figure the account's own Sylf schedule implies, when it has one. */
  scheduleWeeklyMinutes?: number | null;
  disabled?: boolean;
  onSetWeekly: (minutes: number | null) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [hours, setHours] = useState(weeklyMinutes ? String(Math.round((weeklyMinutes / 60) * 10) / 10) : "");

  const applyCustom = (value: string) => {
    setHours(value);
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onSetWeekly(null);
      return;
    }
    // Hours in, minutes out, bounded to the contract's own weekly maximum.
    onSetWeekly(Math.min(10080, Math.round(parsed * 60)));
  };

  const studyDays = distribution
    ? distribution.map((minutes, day) => ({ minutes, day })).filter((entry) => entry.minutes > 0)
    : [];

  return (
    // `tabIndex={-1}` so the Plan Brief's "Edit" action has somewhere real to send
    // focus; the id belongs to this control, never to a wrapper, so the label
    // association and the focus target are the same element.
    <fieldset
      id="quick-plan-budget"
      tabIndex={-1}
      className={s.field}
      style={{ border: "none", padding: 0, margin: 0 }}
    >
      <legend className={s.legend}>How much time can you give this each week?</legend>
      <p className={s.hint}>
        A realistic target, not a promise. Sylf spreads it around your rest days and
        whatever you have already planned.{" "}
        <span>Open the days editor below if your week is unusual.</span>
      </p>
      <div className={s.choices} role="group" aria-label="Weekly study time">
        {PRESETS.map((preset) => (
          <button
            key={preset.minutes}
            type="button"
            className={s.choice}
            aria-pressed={weeklyMinutes === preset.minutes}
            disabled={disabled}
            onClick={() => {
              setCustomOpen(false);
              onSetWeekly(preset.minutes);
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={s.choice}
          aria-pressed={customOpen || (weeklyMinutes !== null && !PRESETS.some((preset) => preset.minutes === weeklyMinutes))}
          aria-expanded={customOpen}
          disabled={disabled}
          onClick={() => setCustomOpen((open) => !open)}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div className={s.customRow}>
          <label>
            <span>Hours per week</span>
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              max={168}
              step={0.5}
              value={hours}
              disabled={disabled}
              onChange={(event) => applyCustom(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className={s.customRow}>
        {/* "Use my normal Sylf schedule" states no number: the server fills in the
            figure the account's own schedule implies, and the brief stays honest
            about which of the two the student actually chose. */}
        <button
          type="button"
          aria-pressed={weeklyMinutes === null && scheduleWeeklyMinutes !== null}
          disabled={disabled || scheduleWeeklyMinutes === null}
          onClick={() => onSetWeekly(null)}
        >
          Use my normal Sylf schedule
          {scheduleWeeklyMinutes ? ` (${formatMinutes(scheduleWeeklyMinutes)} a week)` : ""}
        </button>
      </div>

      {hardWeeklyLimitMinutes ? (
        <p className={s.hint}>
          You set a hard weekly limit of {formatMinutes(hardWeeklyLimitMinutes)}. It
          still applies.
        </p>
      ) : null}

      {distribution && studyDays.length > 0 && (
        <>
          <p className={s.hint} role="status">
            {distributionNote}
          </p>
          <ul className={s.preview} aria-label="How the weekly time is spread">
            {distribution.map((minutes, day) => (
              <li key={day} className={minutes === 0 ? s.previewOff : undefined}>
                <span>{WEEKDAY_NAMES[day]}</span>
                <span>{minutes === 0 ? "free" : formatMinutes(minutes)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {distribution && studyDays.length === 0 && (
        <p className={s.hint} role="status">
          No study time is placed yet. Set how much time you have, or open Customize
          days if your week is unusual.
        </p>
      )}
    </fieldset>
  );
}

export { formatMinutes, WEEKDAY_NAMES };
