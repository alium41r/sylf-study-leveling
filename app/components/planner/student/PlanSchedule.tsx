"use client";
import { useMemo, useState } from "react";
import { ChevronDown, Clock, Layers, ListChecks } from "lucide-react";
import type { StudentWorkspace } from "@/lib/planner/v2/client/workspace";
import s from "./StudentPlannerWorkspace.module.css";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const parts = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString(undefined, { ...o, timeZone: "UTC" });
  return {
    day: fmt({ day: "numeric" }),
    weekday: fmt({ weekday: "short" }),
    month: fmt({ month: "short" }),
    long: fmt({ weekday: "short", month: "short", day: "numeric" }),
  };
};
const hours = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;

type Blueprint = NonNullable<
  NonNullable<StudentWorkspace["draft"]>["blueprints"][number]
>["blueprint"];
type Activity = Blueprint["activities"][number];
interface Item {
  a: Activity;
  date: string | null;
  minutes: number;
}

/** Presents the existing blueprint and allocation as a day-by-day timeline.
 * Everything displayed is read from persisted planner artifacts. */
export default function PlanSchedule({
  view,
  blueprint,
}: {
  view: StudentWorkspace;
  blueprint: Blueprint;
}) {
  const [mode, setMode] = useState<{ open: boolean; n: number }>({
    open: false,
    n: 0,
  });
  const draft = view.draft;
  const { dated, flexible, rhythm, total } = useMemo(() => {
    const items: Item[] = blueprint.activities.map((a) => {
      const placement = draft?.allocation?.placements.find(
        (p) =>
          p.planRef === draft.blueprints[0].planRef &&
          p.activityRef === a.localId
      );
      return { a, date: placement?.date ?? null, minutes: a.timeboxMinutes };
    });
    const byDate = new Map<string, Item[]>();
    const loose = new Map<string, Item[]>();
    for (const item of items) {
      if (item.date)
        byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
      else {
        const k =
          item.a.commitment.category === "COMMITTED"
            ? "Unscheduled"
            : label(item.a.commitment.category);
        loose.set(k, [...(loose.get(k) ?? []), item]);
      }
    }
    const dated = [...byDate.entries()].sort(([x], [y]) => (x < y ? -1 : 1));
    const max = Math.max(
      1,
      ...dated.map(([, v]) => v.reduce((n, i) => n + i.minutes, 0))
    );
    return {
      dated,
      flexible: [...loose.entries()],
      rhythm: dated.map(([date, v]) => {
        const m = v.reduce((n, i) => n + i.minutes, 0);
        return { date, m, h: Math.max(6, Math.round((m / max) * 36)) };
      }),
      total:
        draft?.allocation?.committedMinutes ??
        blueprint.activities.reduce((n, a) => n + a.timeboxMinutes, 0),
    };
  }, [blueprint, draft]);

  const card = (i: Item, flex: boolean) => {
    const { a } = i;
    return (
      <details
        key={`${a.localId}-${mode.n}`}
        className={s.activity}
        data-kind={flex ? "flex" : "set"}
        open={mode.open || undefined}
      >
        <summary>
          <span className={s.activityTitle}>
            <strong>{a.title}</strong>
            <small>{a.purpose}</small>
          </span>
          <span className={s.time}>{hours(a.timeboxMinutes)}</span>
          <ChevronDown size={14} />
        </summary>
        <div className={s.activityBody}>
          <div>
            <h4>Tasks</h4>
            <p className={s.prose}>{a.instructions}</p>
          </div>
          <div>
            <h4>Check</h4>
            <p>{a.completionCriterion}</p>
            {a.stoppingCondition && (
              <p className={s.muted}>Stop: {a.stoppingCondition}</p>
            )}
          </div>
          {(a.hardDependencies.length > 0 ||
            a.commitment.category === "CONTINGENT") && (
            <div className={s.facts}>
              {a.hardDependencies.length > 0 && (
                <span className={s.fact}>
                  After:{" "}
                  {a.hardDependencies
                    .map(
                      (ref) =>
                        blueprint.activities.find((v) => v.localId === ref)
                          ?.title ?? ref
                    )
                    .join(", ")}
                </span>
              )}
              {a.commitment.category === "CONTINGENT" && (
                <span className={s.fact}>
                  If: {a.commitment.trigger.condition}
                </span>
              )}
            </div>
          )}
        </div>
      </details>
    );
  };

  return (
    <>
      <div className={s.scheduleHead}>
        <p>
          {hours(total)} · {blueprint.activities.length} sessions
          {dated.length > 0 && ` · ${dated.length} days`}
        </p>
        <button
          type="button"
          className={s.ghost}
          onClick={() => setMode((m) => ({ open: !m.open, n: m.n + 1 }))}
        >
          <ListChecks size={14} />
          {mode.open ? "Collapse" : "Expand all"}
        </button>
      </div>
      {rhythm.length > 1 && (
        <ul className={s.rhythm} aria-label="Study minutes per day">
          {rhythm.map((r, n) => (
            <li
              key={r.date}
              style={{
                height: r.h,
                animationDelay: `${Math.min(n, 40) * 14}ms`,
              }}
              title={`${parts(r.date).long} · ${r.m} min`}
            />
          ))}
        </ul>
      )}
      {dated.map(([date, v]) => {
        const p = parts(date);
        return (
          <section key={date} className={s.dayGroup} aria-label={p.long}>
            <div className={s.dayLabel}>
              <strong>{p.day}</strong>
              <span>
                {p.weekday} · {p.month}
              </span>
              <small>{hours(v.reduce((n, i) => n + i.minutes, 0))}</small>
            </div>
            <div className={s.dayItems}>{v.map((i) => card(i, false))}</div>
          </section>
        );
      })}
      {flexible.map(([name, v]) => (
        <section key={name} className={s.dayGroup} aria-label={name}>
          <div className={s.dayLabel}>
            <strong>
              {name === "Unscheduled" ? (
                <Layers size={16} />
              ) : (
                <Clock size={16} />
              )}
            </strong>
            <span>{name}</span>
          </div>
          <div className={s.dayItems}>{v.map((i) => card(i, true))}</div>
        </section>
      ))}
    </>
  );
}
