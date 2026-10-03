"use client";
import { useState } from "react";
import type { PlanBriefV1 } from "@/lib/planner/intake/brief";
import { ACADEMIC_LEVELS, EXAM_BOARDS } from "@/lib/study-systems";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * The background curriculum: what the student studied *before* the target.
 *
 * It is optional at every level, and the surface has to make that obvious, because the
 * failure mode of a field like this is a student believing they cannot continue without
 * filling it in. So: the whole control sits inside a disclosure, the copy says what it
 * is for, and nothing about generation depends on it.
 *
 * Two details are deliberate:
 *
 * - **Free text is allowed.** `label` and `subjects` are words the student types, because
 *   a student whose system is not in Sylf's registry must not be forced into an enum.
 *   `board` and `level` offer the registry's vocabulary *and* an "other" escape, since
 *   those two are what make an official source recognisable at all.
 * - **Comparison is an explicit act.** Nothing is researched on a keystroke; the button
 *   exists only when comparison could actually run, and says why when it cannot.
 */

export interface BackgroundCurriculumControlProps {
  background: PlanBriefV1["backgroundCurriculum"];
  /** Whether a comparison can run at all, and why not when it cannot. */
  comparisonAvailable: boolean;
  comparisonReason: string | null;
  /** True once a comparison exists and still applies. */
  hasComparison: boolean;
  comparisonStale: boolean;
  busy: boolean;
  onSave: (input: {
    label: string | null;
    level: string | null;
    board: string | null;
    subjects: string[];
  }) => void;
  onCompare: (options?: { force?: boolean }) => void;
}

/** Subjects as the student typed them: comma or newline separated, deduped, bounded. */
export function parseSubjects(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n;]/)) {
    const subject = part.trim().replace(/\s+/g, " ");
    if (!subject) continue;
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(subject.slice(0, 120));
    if (out.length >= 20) break;
  }
  return out;
}

export default function BackgroundCurriculumControl({
  background,
  comparisonAvailable,
  comparisonReason,
  hasComparison,
  comparisonStale,
  busy,
  onSave,
  onCompare,
}: BackgroundCurriculumControlProps) {
  /**
   * Local typing, with the server's value as the fallback.
   *
   * A response that arrives while the student is typing (another tab, a re-read after
   * another action) must become the truth — otherwise the form would keep stale words
   * and save them over a newer answer. The comparison below resets the local draft only
   * when the *server's* value actually changed, which is React's documented
   * adjust-state-on-prop-change pattern, and deliberately not an effect: an effect that
   * reset on every render would fight the person typing.
   */
  const serverLabel = background?.label ?? "";
  const serverSubjects = (background?.subjects ?? []).join(", ");
  const [seen, setSeen] = useState(`${serverLabel}\u0000${serverSubjects}`);
  const [edited, setEdited] = useState<{ label: string; subjects: string } | null>(null);
  const current = `${serverLabel}\u0000${serverSubjects}`;
  if (seen !== current) {
    setSeen(current);
    setEdited(null);
  }
  const label = edited?.label ?? serverLabel;
  const subjects = edited?.subjects ?? serverSubjects;
  const setLabel = (value: string) => setEdited({ label: value, subjects });
  const setSubjects = (value: string) => setEdited({ label, subjects: value });

  const [open, setOpen] = useState(Boolean(background));
  const stated = Boolean(background?.label);
  const commit = (patch: Partial<Parameters<BackgroundCurriculumControlProps["onSave"]>[0]>) => {
    onSave({
      label: label.trim() || null,
      level: background?.level ?? null,
      board: background?.board ?? null,
      subjects: parseSubjects(subjects),
      ...patch,
    });
  };

  return (
    <details
      className={`${base.card} ${s.background}`}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <strong>
          {stated ? `Background: ${background!.label}` : "Add your background curriculum"}
        </strong>{" "}
        <span className={s.optional}>(optional)</span>
      </summary>

      <p className={s.hint}>
        What you studied before — a qualification, a board and level, and the subjects.
        Sylf uses it to compare the two curricula: which topics you have already met on
        paper, and which are new. It never assumes anything about how well you know
        them, and you can skip this entirely.
      </p>

      <label className={s.field} htmlFor="quick-plan-background-label">
        <span>Qualification or programme</span>
        <input
          id="quick-plan-background-label"
          type="text"
          value={label}
          maxLength={200}
          placeholder="CAIE A-Level, FSc Pre-Engineering, IB Diploma…"
          disabled={busy}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            if ((label.trim() || null) !== (background?.label ?? null)) commit({});
          }}
        />
      </label>

      <div className={s.field}>
        <label htmlFor="quick-plan-background-subjects">
          <span>Subjects</span>
        </label>
        <input
          id="quick-plan-background-subjects"
          type="text"
          value={subjects}
          maxLength={400}
          placeholder="Mathematics, Physics, Computer Science"
          disabled={busy}
          onChange={(event) => setSubjects(event.target.value)}
          onBlur={() => {
            const next = parseSubjects(subjects);
            const current = background?.subjects ?? [];
            if (next.join("|") !== current.join("|")) commit({ subjects: next });
          }}
        />
        <small>Separate them with commas. {parseSubjects(subjects).length} named.</small>
      </div>

      <div className={base.row}>
        <label className={s.field} htmlFor="quick-plan-background-board">
          <span>Board or system</span>
          <select
            id="quick-plan-background-board"
            value={background?.board ?? ""}
            disabled={busy}
            onChange={(event) => commit({ board: event.target.value || null })}
          >
            <option value="">Not sure / other</option>
            {EXAM_BOARDS.map((board) => (
              <option key={board.value} value={board.value}>
                {board.label}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field} htmlFor="quick-plan-background-level">
          <span>Level</span>
          <select
            id="quick-plan-background-level"
            value={background?.level ?? ""}
            disabled={busy}
            onChange={(event) => commit({ level: event.target.value || null })}
          >
            <option value="">Level not set</option>
            {ACADEMIC_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={base.actions}>
        <button
          type="button"
          className={base.primary}
          disabled={busy || !stated || !comparisonAvailable}
          onClick={() => onCompare({ force: hasComparison })}
        >
          {hasComparison && !comparisonStale ? "Compare again" : "Compare with my syllabus"}
        </button>
        {stated && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setLabel("");
              setSubjects("");
              onSave({ label: null, level: null, board: null, subjects: [] });
            }}
          >
            Remove background
          </button>
        )}
      </div>

      <p className={s.hint} role="status" aria-live="polite">
        {!stated
          ? "Name what you studied and Sylf can compare it with your target."
          : comparisonAvailable
            ? "Sylf can look up this curriculum and compare it with your confirmed scope. Nothing is looked up until you ask."
            : comparisonReason ?? "Comparison is not available right now."}
      </p>
    </details>
  );
}
