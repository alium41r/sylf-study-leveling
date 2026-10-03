"use client";
import { useMemo } from "react";
import { intensityAdvisories, type IntensityBearing } from "@/lib/planner/load";
import s from "./ExamPlanner.module.css";

/**
 * The one day-level intensity advisory a review may show, and nothing more.
 * Deliberately restrained: no per-item intensity badge, a single line at most,
 * and only when the day's academic rhythm is genuinely poor.
 */
export default function IntensityNote({
  items,
}: {
  items: readonly IntensityBearing[];
}) {
  const advisory = useMemo(
    () => intensityAdvisories(items)[0] ?? null,
    [items]
  );
  if (!advisory) return null;
  return <p className={s.muted}>{advisory.instruction}</p>;
}
