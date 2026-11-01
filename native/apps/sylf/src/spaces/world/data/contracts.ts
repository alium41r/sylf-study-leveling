// What the lobby needs to draw, shaped as view models and not as server records. Everything here has an existing owner in Sylf's
// backend, named beside it, so the lobby adds no server concept. Phase 11 checks these against the real contracts and Phase 13
// replaces the adapter. Every result says where it came from, as Home's and Workspace's do. World's own saves are a new domain, and
// they belong to Phase 15 (master plan §2.3): they are not here.
import type { LiveStatus } from "../../../shell/live-result";

export type Provenance = "sample" | "live";

export interface WorldResult<T> { provenance: Provenance; data: T | null; live?: LiveStatus }

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

export interface WorldDataAdapter {
  traveller(): Promise<WorldResult<TravellerView>>;
  collection(): Promise<WorldResult<CollectionView>>;
}
