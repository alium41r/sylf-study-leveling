export type ItemCategory =
  | "HUNTER_FORM"
  | "PEDESTAL"
  | "AURA"
  | "RELIC"
  | "WEAPON"
  | "CONSUMABLE"
  | "EQUIPMENT"
  | "SET_BUNDLE";

export type ItemSlot = "HELMET" | "CHESTPLATE" | "PANTS" | "BOOTS" | "WEAPON" | "RELIC" | "NONE";
export type ItemRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "MYTHIC";

export interface CatalogItemDefinition {
  id?: number;
  sku: string;
  name: string;
  description: string;
  category: ItemCategory;
  slot: ItemSlot;
  rarity: ItemRarity;
  rankRequirement: string;
  costSylph: number;
  effectPayload?: Record<string, any>;
  spriteLayer?: string;
  setKey?: string;
}

export type CatalogItem = CatalogItemDefinition;

export const RANK_WEIGHTS: Record<string, number> = {
  MONARCH: 8,
  NATIONAL: 7,
  "RANK S": 6,
  "RANK A": 5,
  "RANK B": 4,
  "RANK C": 3,
  "RANK D": 2,
  "RANK E": 1,
  // Shorthand aliases
  S: 6,
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
};

/**
 * Validates whether a user's current rank tier satisfies an item's rank requirement.
 */
export function isRankSufficient(userRank: string, requiredRank: string): boolean {
  const userWeight = RANK_WEIGHTS[userRank] ?? 1;
  const reqWeight = RANK_WEIGHTS[requiredRank] ?? 1;
  return userWeight >= reqWeight;
}

/**
 * Calculates a discounted set bundle price given individual piece prices and discount rate (default 15%).
 */
export function calculateSetBundlePrice(piecePrices: number[], discountPercentage: number = 15): number {
  const total = piecePrices.reduce((sum, p) => sum + p, 0);
  return Math.floor(total * (1 - discountPercentage / 100));
}

// ─── Production Dynamic Store Catalog (Empty Baseline) ────────
// Database-driven armory: Items are populated dynamically as new PixelLab MCP assets are forged.
export const CATALOG_ITEMS: CatalogItemDefinition[] = [];

// ─── Legacy & Test Reference Catalog Items ────────────────────
export { CATALOG_ITEMS as ARCHIVED_CATALOG_ITEMS } from "@/archive/legacy_catalog/shop-items.legacy";

export interface LegacyShopItem {
  id: string;
  itemKey: string;
  name: string;
  description: string;
  price: number;
  icon: string;
}

export const SHOP_ITEMS: LegacyShopItem[] = CATALOG_ITEMS.map((item) => ({
  id: item.sku,
  itemKey: item.sku,
  name: item.name,
  description: item.description,
  price: item.costSylph,
  icon: item.category === "CONSUMABLE" ? "🧪" : item.category === "WEAPON" ? "⚔️" : item.category === "SET_BUNDLE" ? "📦" : "🛡️",
}));
