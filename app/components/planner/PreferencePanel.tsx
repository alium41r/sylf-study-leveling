"use client";
import { useState } from "react";
import {
  PREFERENCE_SOURCE_COPY,
  PREFERENCE_TYPE_LABEL,
  preferenceValueCopy,
} from "@/lib/planner/preference-fields";
import {
  activePreferences,
  ignorePreferenceForPlan,
  resetPreferenceForPlan,
  type ActivePreference,
} from "@/lib/planner/preferences-client";
import s from "./ExamPlanner.module.css";

/**
 * The compact "Planning preferences" management surface. Lists active planning
 * preferences with a high-level origin, and lets the student ignore one for this
 * plan or reset it. Language stays "planning preference" — never a claim about
 * tracked behaviour, and never raw evidence.
 *
 * The read is lazy: it happens only when the surface is opened, so rendering the
 * planner never starts a request by itself.
 */
export default function PreferencePanel({ planId }: { planId: string }) {
  const [preferences, setPreferences] = useState<ActivePreference[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const load = async () => {
    if (started) return;
    setStarted(true);
    try {
      setPreferences(await activePreferences(planId));
      setError("");
    } catch {
      setError("Planning preferences could not be loaded.");
    }
  };

  const act = async (preferenceType: ActivePreference["preferenceType"], action: "IGNORE" | "RESET") => {
    setBusy(`${action}:${preferenceType}`);
    setError("");
    try {
      if (action === "IGNORE") await ignorePreferenceForPlan(planId, preferenceType);
      else await resetPreferenceForPlan(planId, preferenceType);
      setPreferences(await activePreferences(planId));
    } catch {
      setError("That change could not be saved. Your plan is unchanged.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <details
      className={s.item}
      onToggle={(event) => {
        if ((event.target as HTMLDetailsElement).open) void load();
      }}
    >
      <summary>
        Planning preferences
        {preferences && (
          <span className={s.muted}> · {preferences.length}</span>
        )}
      </summary>
      <p className={s.muted}>
        Planning preferences from your earlier choices. Ignore one for this plan,
        or reset it.
      </p>
      {started && preferences === null && (
        <p className={s.muted} role="status">
          Loading planning preferences…
        </p>
      )}
      {preferences !== null && preferences.length === 0 && (
        <p className={s.muted}>No planning preferences yet.</p>
      )}
      {preferences !== null && preferences.length > 0 && (
        <ul>
          {preferences.map((preference) => (
            <li key={preference.preferenceType} className={s.preferenceRow}>
              <strong>{PREFERENCE_TYPE_LABEL[preference.preferenceType]}</strong>{" "}
              <span className={s.muted}>
                {preferenceValueCopy(preference.preferenceType, preference.value)}
              </span>
              <br />
              <span className={s.muted}>
                {PREFERENCE_SOURCE_COPY[preference.source]}
              </span>
              <div className={s.row}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(preference.preferenceType, "IGNORE")}
                >
                  Ignore for this plan
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(preference.preferenceType, "RESET")}
                >
                  Reset
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {busy !== null && (
        <p className={s.muted} role="status" aria-live="polite">
          Saving…
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
