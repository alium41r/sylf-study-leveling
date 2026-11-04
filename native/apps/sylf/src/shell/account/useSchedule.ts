// The study schedule in one line, for the Account page. Plan owns it and edits it, so this only reads, through the same resource key Plan's tag clears.
import { useMemo } from "react";
import type { StudySchedule } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../backend";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function useScheduleLine(): (StudySchedule & { restLine: string }) | null {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend?.resources.resource({ key: "account-schedule", tags: ["plan"], ttlMs: 60_000, load: (signal) => backend.reads.schedule(signal) }) ?? null, [backend]);
  const data = useOptionalResource(resource)?.data ?? null;
  if (!data) return null;
  const rest = [...data.restDays].sort((a, b) => a - b).map((day) => DAYS[day]).filter(Boolean);
  return { ...data, restLine: rest.length ? `Rest on ${rest.join(" and ")}.` : "No fixed rest days." };
}
