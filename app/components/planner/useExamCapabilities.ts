"use client";
import { useEffect, useState } from "react";
import { plannerFetch, type ExamCapabilities } from "@/lib/planner/exam-client";

/**
 * The account facts Planner Modes need (today, timezone, rest days, subjects).
 *
 * There is no availability gate to read any more — Planner Modes are permanent — so a
 * failed read leaves `null` rather than a fabricated "disabled" capability, and the
 * surface says plainly that it could not load instead of pretending the feature is
 * switched off.
 */
export function useExamCapabilities(active = true) {
  const [capabilities, setCapabilities] = useState<ExamCapabilities | null>(null);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    plannerFetch<ExamCapabilities>("/capabilities")
      .then((value) => {
        if (mounted) setCapabilities(value);
      })
      .catch(() => {
        if (mounted) setCapabilities(null);
      });
    return () => {
      mounted = false;
    };
  }, [active]);
  return capabilities;
}
