// Progress's reads. One resource each, so every view says loading, offline and failed once, and a finished session or a claim reads again through the
// "progress" tag. Nothing here computes a reward or a rank: every number is the server's.
import { useMemo } from "react";
import type { AchievementRecord, Attributes, Backend, RankingSort, Rankings, RecentSessions, ResourceDefinition, StudySchedule, StudySummary } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";

export interface RecordView { summary: StudySummary; schedule: StudySchedule }

const recordResource = (backend: Backend): ResourceDefinition<RecordView> => ({
  key: "progress-record", tags: ["progress"], ttlMs: 60_000,
  async load(signal) {
    const [summary, schedule] = await Promise.all([backend.reads.studySummary(signal), backend.reads.schedule(signal)]);
    return { summary, schedule };
  },
});
const sessionsResource = (backend: Backend): ResourceDefinition<RecentSessions> => ({ key: "progress-sessions", tags: ["progress"], ttlMs: 60_000, load: (signal) => backend.reads.recentSessions(50, signal) });
const achievementsResource = (backend: Backend): ResourceDefinition<AchievementRecord[]> => ({ key: "progress-honours", tags: ["progress"], ttlMs: 60_000, load: async (signal) => (await backend.reads.achievements(signal)).achievements });
const attributesResource = (backend: Backend): ResourceDefinition<Attributes> => ({ key: "progress-attributes", tags: ["progress"], ttlMs: 60_000, load: (signal) => backend.reads.progress.attributes(signal) });
const rankingsResource = (backend: Backend, sort: RankingSort): ResourceDefinition<Rankings> => ({ key: `progress-rankings-${sort}`, tags: ["progress"], ttlMs: 2 * 60_000, load: (signal) => backend.reads.progress.rankings(sort, signal) });

function useLive<T>(backend: Backend | null, definition: (backend: Backend) => ResourceDefinition<T>, key: string) {
  // `key` says when the definition changed.
  const resource = useMemo(() => (backend ? backend.resources.resource(definition(backend)) : null), [backend, key]);
  return toLiveResult(useOptionalResource(resource), resource);
}

export const useRecord = () => useLive(useLiveBackend(), recordResource, "record");
export const useSessionList = () => useLive(useLiveBackend(), sessionsResource, "sessions");
export const useHonours = () => useLive(useLiveBackend(), achievementsResource, "honours");
export const useAttributes = () => useLive(useLiveBackend(), attributesResource, "attributes");
export const useRankings = (sort: RankingSort) => useLive(useLiveBackend(), (backend) => rankingsResource(backend, sort), sort);

/** After a claim, a spend or a session. The standing can have moved too, so it reads again. */
export function refreshProgress(backend: Backend) {
  for (const tag of ["progress", "traveller"]) backend.resources.invalidate(tag);
}
