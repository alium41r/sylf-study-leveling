// The reads several surfaces share: who this person is, and their subjects. Anything a single screen needs lives with that screen's adapter.
import { useMemo } from "react";
import type { Subject, UserStats } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "./backend";

/** The person, as the server sees them. Null with nobody signed in, and until the first answer. */
export function useStats(): UserStats | null {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend?.resources.resource({ key: "user-stats", load: (signal) => backend.reads.stats(signal), tags: ["progress", "traveller"], ttlMs: 30_000 }) ?? null, [backend]);
  return useOptionalResource(resource)?.data ?? null;
}

export function useSubjects(): Subject[] {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend?.resources.resource({ key: "subjects", load: (signal) => backend.reads.subjects(signal), tags: ["subjects"], ttlMs: 5 * 60_000 }) ?? null, [backend]);
  return useOptionalResource(resource)?.data ?? [];
}
