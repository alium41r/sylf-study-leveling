/** Inventory consumable product icons. Companion artwork uses Pixel assets. */
export function resolveConsumableUrl(consumableKey?: string | null): string | null {
  if (!consumableKey || consumableKey === "none") return null;
  if (consumableKey.startsWith("/")) return consumableKey;
  return `/sprites/character/consumables/${consumableKey}.png`;
}
