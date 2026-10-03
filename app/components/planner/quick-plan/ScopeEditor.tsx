"use client";
import { useEffect, useRef, useState } from "react";
import type { ScopeNode } from "@/lib/planner/intake/brief";
import { parseScopeLines, scopeText, syncScopeNodes, type ScopeSync } from "@/lib/planner/intake/scope-sync";
import base from "../ExamPlanner.module.css";
import s from "./quick-plan.module.css";

/**
 * Manual scope entry: one unit per line.
 *
 * Temporarily the only scope source, and deliberately small — Phase 2 replaces the
 * source with research and upload, keeping the same brief. What this editor must get
 * right is that editing is *safe*: the text is only reconciled with the stored tree on
 * blur (never per keystroke), a unit that was not renamed keeps its identity so the
 * student's preparedness survives, and the strategy line tells them honestly when the
 * engine had to group units to fit.
 */
export default function ScopeEditor({
  nodes,
  units,
  leaves,
  strategy,
  disabled,
  onSave,
}: {
  nodes: ScopeNode[];
  /** Engine units this scope becomes. */
  units: number;
  /** Selected leaves before any grouping — what the student actually listed. */
  leaves: number;
  strategy: "TOPIC_UNITS" | "CHAPTER_UNITS" | "SEGMENTED";
  disabled?: boolean;
  onSave: (sync: ScopeSync) => void | Promise<void>;
}) {
  const stored = scopeText(nodes);
  const [text, setText] = useState(stored);
  const editing = useRef(false);
  // The server's order is the truth; adopt it whenever the field is not being typed in,
  // so the list never shows an order the plan does not have.
  useEffect(() => {
    if (!editing.current) setText(stored);
  }, [stored]);

  const commit = () => {
    editing.current = false;
    const sync = syncScopeNodes(nodes, parseScopeLines(text));
    if (!sync.changed) {
      setText(scopeText(sync.nodes));
      return;
    }
    void onSave(sync);
  };

  return (
    <div className={s.field}>
      <label htmlFor="quick-plan-scope">
        <span>What do you need to cover?</span>
      </label>
      <textarea
        id="quick-plan-scope"
        value={text}
        disabled={disabled}
        rows={6}
        spellCheck={false}
        aria-describedby="quick-plan-scope-help"
        onFocus={() => {
          editing.current = true;
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      <small id="quick-plan-scope-help">
        One topic per line — or a range, and Sylf will expand it. Try{" "}
        <em>Chapters 1-10</em> or <em>A-Level Physics P2 chapters 1-10</em>. Leave it blank
        if you are not sure yet — you can add units later.
      </small>
      {units > 0 && (
        <p className={base.muted} role="status">
          {units} unit{units === 1 ? "" : "s"} will be planned
          {strategy !== "TOPIC_UNITS" && leaves > units
            ? `, grouped from the ${leaves} you listed so the plan stays readable`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
