"use client";
import { useState } from "react";
import {
  CanonicalIntentV2Schema,
  type CanonicalIntentV2,
} from "@/lib/planner/v2/contracts";
import { WEEKDAYS } from "@/lib/planner/v2/client/workspace";
import s from "./StudentPlannerWorkspace.module.css";
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
/** Edits the accepted contract; no inferred facts, new evidence or authority. */
export default function AcceptedDetailsEditor({
  intent,
  busy,
  onSave,
  onCancel,
}: {
  intent: CanonicalIntentV2;
  busy: boolean;
  onSave: (intent: CanonicalIntentV2) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(intent)),
    [error, setError] = useState<string | null>(null);
  const availability = draft.availability;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const parsed = CanonicalIntentV2Schema.safeParse(draft);
        if (!parsed.success) {
          setError(
            "Check your availability, deadline and goal details. Each study window must end after it starts."
          );
          return;
        }
        void onSave(parsed.data).catch((e) => setError(e.message));
      }}
    >
      <label>
        Plan name
        <input
          required
          maxLength={120}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label>
        Accepted goal
        <textarea
          required
          rows={3}
          maxLength={1000}
          value={draft.outcome}
          onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
        />
      </label>
      <div className={s.columns}>
        <label>
          Planning approach
          <select
            value={draft.policy}
            onChange={(e) =>
              setDraft({
                ...draft,
                policy: e.target.value as CanonicalIntentV2["policy"],
                policySelection: "USER_OVERRIDE",
              })
            }
          >
            <option value="GENERAL">General learning / school mock</option>
            <option value="EXAM">Official external exam</option>
            <option value="MASTERY">Mastery</option>
            <option value="ROADMAP">Learning roadmap</option>
          </select>
        </label>
        <label>
          Deadline
          <input
            type="date"
            value={draft.deadline.kind === "NONE" ? "" : draft.deadline.date}
            onChange={(e) =>
              setDraft({
                ...draft,
                deadline: e.target.value
                  ? {
                      kind: "FIXED",
                      date: e.target.value,
                      examDayStudyAllowed: false,
                    }
                  : { kind: "NONE" },
              })
            }
          />
        </label>
      </div>
      {draft.policy === "EXAM" && (
        <fieldset className={s.exam}>
          <legend>Official assessment identity</legend>
          <p className={s.muted}>
            Enter what you know. Research must verify the governing issuer and
            applicability; these entries are student claims.
          </p>
          {(
            [
              ["institution", "Issuer / exam board"],
              ["qualification", "Qualification"],
              ["syllabusCode", "Syllabus code"],
              ["component", "Component"],
              ["examinationCycle", "Examination cycle"],
            ] as const
          ).map(([field, title]) => (
            <label key={field}>
              {title}
              <input
                maxLength={120}
                value={draft.assessment?.[field] ?? ""}
                onChange={(e) => {
                  const next = { ...draft.assessment };
                  if (e.target.value) next[field] = e.target.value;
                  else delete next[field];
                  setDraft({ ...draft, assessment: next });
                }}
              />
            </label>
          ))}
        </fieldset>
      )}
      {availability && (
        <>
          <h4>Study availability · {availability.timezone}</h4>
          <p className={s.muted}>
            Your Calendar and account rest days also apply. Existing date
            overrides and additional windows stay retained unless you remove
            them.
          </p>
          {WEEKDAYS.map((day, weekday) => {
            const windows =
                availability.studyWindows?.weekly.filter(
                  (w) => w.weekday === weekday
                ) ?? [],
              rest = availability.restWeekdays.includes(weekday);
            return (
              <div key={day} className={s.dayEditor}>
                <label className={s.check}>
                  <input
                    type="checkbox"
                    checked={!rest}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        availability: {
                          ...availability,
                          restWeekdays: e.target.checked
                            ? availability.restWeekdays.filter(
                                (d) => d !== weekday
                              )
                            : [...availability.restWeekdays, weekday],
                        },
                      })
                    }
                  />
                  {day}
                </label>
                <label>
                  Daily limit
                  <input
                    aria-label={`${day} daily limit`}
                    type="number"
                    min={0}
                    max={1440}
                    value={availability.dailyCeilingMinutes[weekday]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        availability: {
                          ...availability,
                          dailyCeilingMinutes:
                            availability.dailyCeilingMinutes.map((v, i) =>
                              i === weekday ? Number(e.target.value) : v
                            ),
                        },
                      })
                    }
                  />
                </label>
                {windows.map((w, i) => (
                  <div className={s.columns} key={i}>
                    {(["startMinute", "endMinute"] as const).map((field) => (
                      <label key={field}>
                        {field === "startMinute" ? "From" : "Until"}
                        <input
                          type="time"
                          required
                          aria-label={`${day} ${i + 1} ${field}`}
                          value={w[field] === 1440 ? "00:00" : time(w[field])}
                          onChange={(e) => {
                            let n = -1;
                            const weekly =
                              availability.studyWindows!.weekly.map((v) => {
                                if (v.weekday === weekday) n++;
                                return v.weekday === weekday && n === i
                                  ? {
                                      ...v,
                                      [field]:
                                        field === "endMinute" &&
                                        minute(e.target.value) === 0
                                          ? 1440
                                          : minute(e.target.value),
                                    }
                                  : v;
                              });
                            setDraft({
                              ...draft,
                              availability: {
                                ...availability,
                                studyWindows: {
                                  ...availability.studyWindows!,
                                  weekly,
                                },
                              },
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ))}
                <button
                  type="button"
                  className={s.textButton}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      availability: {
                        ...availability,
                        studyWindows: {
                          schemaVersion: 1,
                          overrides: availability.studyWindows?.overrides ?? [],
                          weekly: [
                            ...(availability.studyWindows?.weekly ?? []),
                            { weekday, startMinute: 1020, endMinute: 1140 },
                          ],
                        },
                      },
                    })
                  }
                >
                  Add window
                </button>
              </div>
            );
          })}
          <label>
            Recovery margin (%)
            <input
              type="number"
              min={0}
              max={50}
              value={availability.recoveryPercent}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  availability: {
                    ...availability,
                    recoveryPercent: Number(e.target.value),
                  },
                })
              }
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className={s.alert}>
          {error}
        </p>
      )}
      <div className={s.actions}>
        <button type="button" className={s.button} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={s.primary} disabled={busy}>
          Accept these details
        </button>
      </div>
    </form>
  );
}
