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

const SUBJECT_COLOURS: Record<string, string> = { violet: "#8B5CF6", purple: "#8B5CF6", blue: "#3B82F6", green: "#10B981", emerald: "#10B981", amber: "#F59E0B", yellow: "#F59E0B", orange: "#F97316", red: "#EF4444", pink: "#EC4899", teal: "#14B8A6", cyan: "#06B6D4", slate: "#64748B" };
const FALLBACK_COLOURS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

/** A subject's own colour as a hex value. The server stores a name or a hex string, and a subject with neither gets a steady one from its id. */
export function subjectColour(subject: { id: number; color?: string | null }): string {
  const given = subject.color?.trim();
  if (given && /^#[0-9a-f]{6}$/i.test(given)) return given;
  if (given && SUBJECT_COLOURS[given.toLowerCase()]) return SUBJECT_COLOURS[given.toLowerCase()]!;
  return FALLBACK_COLOURS[Math.abs(subject.id) % FALLBACK_COLOURS.length]!;
}

/** The colour for a subject id, from the person's own subjects. Null for a quest with no subject. */
export function useSubjectColour(): (id: number | null | undefined) => string | null {
  const subjects = useSubjects();
  return useMemo(() => { const byId = new Map(subjects.map((subject) => [subject.id, subjectColour(subject)])); return (id) => (id == null ? null : byId.get(id) ?? subjectColour({ id })); }, [subjects]);
}
