"use client";
import {
  coverageMap,
  type CoverageMap,
  type CoverageMilestoneInput,
  type CoverageTouchInput,
} from "./coverage";
import type { ValidatedDraftV1 } from "./contracts";

/**
 * Client-side derivation of the Coverage Map from data the plan detail already
 * returns. Traceability only: no assessment, no mastery, and nothing stored —
 * the same pure `coverageMap` the server-side tests pin.
 */

export interface CoverageLink {
  itemKey: string;
  disposition: string;
  questId: number | null;
}

export interface CoverageExecution {
  itemKey: string;
  status: string | null;
  completedAt: string | null;
}

/** The bounded projection the plan detail returns for earlier confirmed work. */
export interface CoverageHistoryItem {
  key: string;
  title: string;
  date: string;
  minutes: number;
  stage: string | null;
  type: string;
  topicKey: string;
}

type MilestoneLike = {
  key: string;
  date: string;
  removed?: boolean;
  topicKeys?: string[];
};

export function deriveCoverageMap(args: {
  draft: ValidatedDraftV1;
  links?: readonly CoverageLink[];
  execution?: readonly CoverageExecution[];
  historyItems?: readonly CoverageHistoryItem[];
}): CoverageMap {
  const links = args.links ?? [];
  const execution = args.execution ?? [];
  const history = args.historyItems ?? [];
  const linkByItem = new Map(links.map((link) => [link.itemKey, link]));
  const execByItem = new Map(execution.map((entry) => [entry.itemKey, entry]));

  const items: CoverageTouchInput[] = [];
  for (const item of args.draft.items) {
    if (item.removed) continue;
    const link = linkByItem.get(item.key);
    const exec = execByItem.get(item.key);
    items.push({
      key: item.key,
      topicKey: item.topicKey,
      type: item.type,
      stage: item.stage ?? null,
      masteryStage: item.masteryStage ?? null,
      date: item.date,
      role: item.role === "STRETCH" ? "STRETCH" : "CORE",
      removed: false,
      superseded: false,
      execution: {
        linked: Boolean(link && link.questId !== null),
        status: exec?.status ?? null,
        completed: Boolean(exec?.completedAt),
      },
    });
  }

  // Completed work from earlier confirmed revisions is history that still counts.
  for (const item of history) {
    items.push({
      key: item.key,
      topicKey: item.topicKey,
      type: item.type,
      stage: null,
      masteryStage: item.stage ?? null,
      date: item.date,
      role: "CORE",
      removed: false,
      superseded: false,
      execution: { linked: true, status: null, completed: true },
    });
  }

  const milestones: CoverageMilestoneInput[] = (args.draft.milestones as MilestoneLike[])
    .filter((milestone) => !milestone.removed)
    .map((milestone) => ({
      key: milestone.key,
      date: milestone.date,
      topicKeys: milestone.topicKeys ?? [],
      removed: false,
    }));

  return coverageMap({
    units: args.draft.topics.map((topic) => ({
      key: topic.key,
      title: topic.title,
    })),
    items,
    milestones,
  });
}
