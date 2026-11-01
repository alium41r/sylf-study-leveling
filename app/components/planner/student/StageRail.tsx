"use client";
import { Check } from "lucide-react";
import s from "./StudentPlannerWorkspace.module.css";

export const PLANNER_STAGES = [
  "Research",
  "Strategy",
  "Translation",
  "Schedule",
  "Review",
  "Ready",
] as const;

/** A faithful rail of the six persisted stages. The current node is the stage
 * reported by the planner; nothing here advances on a timer. */
export default function StageRail({
  index,
  live,
  tone,
}: {
  index: number;
  live: boolean;
  tone: "neutral" | "bad" | "good";
}) {
  return (
    <>
      <ol
        className={s.stages}
        data-live={live}
        data-tone={tone}
        aria-label="Planning stages"
      >
        {PLANNER_STAGES.map((stage, i) => (
          <li
            key={stage}
            data-current={i === index}
            data-done={i < index}
            aria-current={i === index ? "step" : undefined}
          >
            <span className={s.node}>
              {i < index || (tone === "good" && i === index) ? (
                <Check size={14} strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            {stage}
          </li>
        ))}
      </ol>
    </>
  );
}
