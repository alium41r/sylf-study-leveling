// View models for World’s authenticated lobby.
/** User (name, level, sylph), UserStats (rank), the game engine for level progress, and the active TITLE and CLASS from UserCosmetic. */
export interface TravellerView {
  name: string;
  title: string;
  studyClass: string;
  level: number;
  levelProgress: number;
  rank: string;
  sylph: number;
  /** From XpLedger and SylphLedger for the current week. World itself mints none of this. */
  earnedThisWeek: { xp: number; sylph: number };
}

/** One UserCosmetic category. `items` are what the person owns, named from lib/cosmetics-catalog when the adapter is real. */
export interface CollectionGroup { id: string; label: string; items: { id: string; name: string; rarity: string; equipped: boolean }[] }
export interface CollectionView { groups: CollectionGroup[] }
