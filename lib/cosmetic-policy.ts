import { COSMETICS_CATALOG, LEGACY_CLASS_MAP, type CosmeticCategory } from "@/lib/cosmetics-catalog";
import { RANK_LADDER } from "@/lib/game-engine";

/**
 * What a person may wear. Appearance (theme and background) is a person's own colors, so it is not here. Everything else is shown to other
 * people, so a value must be free, owned, unlocked by the catalog's own condition, or what they already wear. The last case means this check
 * can never take away something an account held before it existed, and web's identity editor, which saves every field at once, keeps working.
 */
export type WornField = "activeAvatar" | "activeFrame" | "activeTitle" | "activeAura" | "activeNameColor";
export const WORN_FIELDS: readonly WornField[] = ["activeAvatar", "activeFrame", "activeTitle", "activeAura", "activeNameColor"];

const CATEGORY: Record<WornField, CosmeticCategory | null> = { activeAvatar: "CLASS", activeFrame: "FRAME", activeTitle: "TITLE", activeNameColor: "NAME_COLOR", activeAura: null };
const OWNED_AS: Record<WornField, string | null> = { activeAvatar: "AVATAR", activeFrame: "FRAME", activeTitle: "TITLE", activeNameColor: "NAME_COLOR", activeAura: null };
/** Values the schema and web use for "nothing special", which the catalog does not list. */
const FREE: Record<WornField, readonly string[]> = { activeAvatar: [], activeFrame: ["none"], activeTitle: ["Novice"], activeNameColor: ["default"], activeAura: ["none", "aura_monarch"] };

export class CosmeticNotAllowedError extends Error {
  readonly code = "COSMETIC_NOT_OWNED";
  constructor(readonly field: WornField) { super("You don't own that yet."); }
}

export interface Wearer { id: number; level: number; hunterRank: string | null; activeAvatar: string | null; activeFrame: string | null; activeTitle: string | null; activeAura: string | null; activeNameColor: string | null }

interface CosmeticReader {
  userCosmetic: { findFirst(args: { where: { userId: number; category: never; itemKey: string }; select: { id: true } }): Promise<{ id: number } | null> };
  userInventory: { findFirst(args: { where: { userId: number; quantity: { gt: number }; item: { sku: string; category: never } }; select: { id: true } }): Promise<{ id: number } | null> };
}

const rankFloor = (rank: string) => RANK_LADDER.find((step) => step.display === rank)?.level ?? null;

/** "Default", "Level 5" or "C-Rank", the catalog's only three forms. Anything else stays locked. */
export function catalogUnlocks(condition: string, level: number): boolean {
  if (condition === "Default") return true;
  const byLevel = /^Level (\d+)$/.exec(condition);
  if (byLevel) return level >= Number(byLevel[1]);
  const byRank = /^([A-Z]+)-Rank$/.exec(condition);
  const floor = byRank ? rankFloor(byRank[1]) : null;
  return floor !== null && level >= floor;
}

export async function assertMayWear(reader: unknown, user: Wearer, field: WornField, value: string): Promise<void> {
  if (value === user[field] || FREE[field].includes(value)) return;
  const category = CATEGORY[field];
  const entry = category ? COSMETICS_CATALOG[category].find((item) => item.id === value || item.id === LEGACY_CLASS_MAP[value]) : undefined;
  if (entry && catalogUnlocks(entry.unlockCondition, user.level)) return;
  const db = reader as CosmeticReader;
  const owned = OWNED_AS[field]
    ? await db.userCosmetic.findFirst({ where: { userId: user.id, category: OWNED_AS[field] as never, itemKey: value }, select: { id: true } })
    : await db.userInventory.findFirst({ where: { userId: user.id, quantity: { gt: 0 }, item: { sku: value, category: "AURA" as never } }, select: { id: true } });
  if (!owned) throw new CosmeticNotAllowedError(field);
}

export const WEARER_SELECT = { id: true, level: true, hunterRank: true, activeAvatar: true, activeFrame: true, activeTitle: true, activeAura: true, activeNameColor: true } as const;
