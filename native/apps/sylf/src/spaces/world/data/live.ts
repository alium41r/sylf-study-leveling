// The lobby over the real backend: who is about to step through, and what they own. Identity and progression are read as the server gives them, and
// names come from the existing cosmetics catalog. Nothing here is a game concept, and World's own saves wait for Phase 15.
import type { Backend, Cosmetics, ResourceDefinition, UserStats } from "@sylf/backend";
import type { CollectionView, TravellerView } from "./contracts";

const CATEGORY_LABELS: Record<string, string> = { FRAME: "Frames", TITLE: "Titles", NAME_COLOR: "Name colors", AVATAR: "Avatars", THEME: "Themes", BACKGROUND: "Backgrounds", CLASS: "Classes" };
const ORDER = ["FRAME", "TITLE", "NAME_COLOR", "CLASS", "AVATAR", "THEME", "BACKGROUND"];
const NEVER_EQUIPPED: (string | null | undefined)[] = [undefined, null, "none", "default"];

export function mapTraveller(stats: UserStats, earned: { xp: number; sylph: number }, naming: Pick<Backend["reads"], "className" | "cosmetic">): TravellerView {
  const title = stats.activeTitle ?? "";
  return {
    name: stats.name || stats.username || "Traveller",
    title: title ? naming.cosmetic("TITLE", title).name : "No title",
    studyClass: naming.className(stats.activeAvatar),
    level: stats.level,
    levelProgress: Math.min(1, stats.currentXP / Math.max(1, stats.xpToNextLevel)),
    rank: `Rank ${stats.hunterRank}`,
    sylph: stats.sylph ?? 0,
    earnedThisWeek: earned,
  };
}

export function mapCollection({ cosmetics, active }: Cosmetics, naming: Pick<Backend["reads"], "cosmetic">): CollectionView {
  const equipped = new Set(Object.values(active).filter((value) => !NEVER_EQUIPPED.includes(value as string)));
  const groups = ORDER.map((category) => {
    const items = cosmetics.filter((item) => item.category === category).map((item) => {
      const named = naming.cosmetic(category, item.itemKey);
      return { id: `${category}-${item.itemKey}`, name: named.name, rarity: named.rarity, equipped: equipped.has(item.itemKey) };
    });
    return { id: category.toLowerCase(), label: CATEGORY_LABELS[category], items };
  }).filter((group) => group.items.length > 0);
  return { groups };
}

export interface WorldViews { traveller: TravellerView; collection: CollectionView }
export type WorldView = keyof WorldViews;

export function liveWorldViews(backend: Backend) {
  const { reads } = backend;
  const views: { [K in WorldView]: ResourceDefinition<WorldViews[K]> } = {
    traveller: {
      key: "world-traveller", tags: ["traveller"], ttlMs: 60_000,
      async load(signal) {
        const [stats, earned] = await Promise.all([reads.stats(signal), reads.earnedThisWeek(signal)]);
        return mapTraveller(stats, earned, reads);
      },
    },
    collection: { key: "world-collection", tags: ["traveller"], ttlMs: 5 * 60_000, load: async (signal) => mapCollection(await reads.cosmetics(signal), reads) },
  };
  return views;
}
