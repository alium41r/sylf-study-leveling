import {
  FULL_BODY_FORMS,
  PEDESTAL_OPTIONS,
  AURA_PRESETS,
  type CharacterConfig,
} from "./character-traits";
import { isRankSufficient } from "./shop-items";

export interface CollectionItem {
  id: number;
  quantity: number;
  isEquipped: boolean;
  acquiredAt: string;
  item: {
    id: number;
    sku: string;
    name: string;
    description: string;
    category: string;
    slot: string;
    rarity: string;
    rankRequirement: string;
    spriteLayer?: string | null;
  };
}
export interface CollectionCosmetic {
  category: string;
  itemKey: string;
}
export const PROFILE_CATEGORIES = ["FRAME", "TITLE", "NAME_COLOR"] as const;

export function ownedInventory(inventory: CollectionItem[]) {
  return inventory.filter(
    (entry) => Number.isFinite(entry.quantity) && entry.quantity > 0
  );
}
export function storedProfileCosmetics(cosmetics: CollectionCosmetic[]) {
  const defaults = new Set(["none", "frame_none", "title_novice", "default"]);
  const unique = new Map<string, CollectionCosmetic>();
  for (const cosmetic of cosmetics) {
    if (
      (PROFILE_CATEGORIES as readonly string[]).includes(cosmetic.category) &&
      !defaults.has(cosmetic.itemKey)
    ) {
      unique.set(`${cosmetic.category}:${cosmetic.itemKey}`, cosmetic);
    }
  }
  return [...unique.values()];
}
export function characterStyles(
  level: number,
  rank: string,
  config?: CharacterConfig
) {
  return [
    ...FULL_BODY_FORMS.map((option) => ({
      ...option,
      kind: "Character form",
      active: option.value === (config?.outfit || "form_tanjiro"),
    })),
    ...PEDESTAL_OPTIONS.map((option) => ({
      ...option,
      kind: "Pedestal",
      active:
        option.value ===
        (config?.pedestal || config?.pedestalKey || "pedestal_cyber"),
    })),
    ...AURA_PRESETS.filter((option) => option.id !== "none").map((option) => ({
      ...option,
      value: option.id,
      kind: "Aura",
      active: option.id === config?.aura,
      description: "Character energy aura.",
      imagePath: undefined,
    })),
  ].map((option) => ({
    ...option,
    available:
      level >= (option.requiredLevel || 1) &&
      isRankSufficient(rank, option.requiredRank || "RANK E"),
  }));
}
