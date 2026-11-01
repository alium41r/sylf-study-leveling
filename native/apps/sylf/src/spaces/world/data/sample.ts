// Sample content for reviewing the lobby. None of it belongs to a real person, and every result is marked "sample", so the screens say
// so. The level and rank match Home's Progress sample, so a reviewer sees one person. Cosmetic names here are invented for the
// template and are not the catalog: lib/cosmetics-catalog stays the owner of the real ones.
import type { WorldDataScenario } from "../../../shell/links";
import type { CollectionView, TravellerView, WorldDataAdapter, WorldResult } from "./contracts";

const sample = <T,>(data: T | null): WorldResult<T> => ({ provenance: "sample", data });

export const SAMPLE_TRAVELLER: TravellerView = { name: "Sample Student", title: "Early Riser", studyClass: "Scholar", level: 12, levelProgress: 0.64, rank: "Rank D", sylph: 1240, earnedThisWeek: { xp: 860, sylph: 145 } };

export const SAMPLE_COLLECTION: CollectionView = {
  groups: [
    { id: "frame", label: "Frames", items: [{ id: "frame-a", name: "Quiet Margin", rarity: "Common", equipped: true }, { id: "frame-b", name: "Lantern Edge", rarity: "Rare", equipped: false }] },
    { id: "title", label: "Titles", items: [{ id: "title-a", name: "Early Riser", rarity: "Common", equipped: true }, { id: "title-b", name: "Long Hours", rarity: "Rare", equipped: false }, { id: "title-c", name: "First Light", rarity: "Epic", equipped: false }] },
    { id: "name", label: "Name colors", items: [{ id: "name-a", name: "Pearl", rarity: "Common", equipped: true }] },
  ],
};

const sampleWorldData: WorldDataAdapter = {
  traveller: async () => sample(SAMPLE_TRAVELLER),
  collection: async () => sample(SAMPLE_COLLECTION),
};

const emptyWorldData: WorldDataAdapter = {
  traveller: async () => ({ provenance: "live", data: null }),
  collection: async () => ({ provenance: "live", data: null }),
};

const slowWorldData = (adapter: WorldDataAdapter, ms: number): WorldDataAdapter => {
  const later = <T,>(load: () => Promise<T>) => async () => { await new Promise((resolve) => setTimeout(resolve, ms)); return load(); };
  return { traveller: later(adapter.traveller), collection: later(adapter.collection) };
};

/** Without development tools nothing sample can reach a screen. */
export function worldDataFor(devTools: boolean, scenario: WorldDataScenario | null): WorldDataAdapter {
  if (!devTools || scenario === "empty") return emptyWorldData;
  return scenario === "slow" ? slowWorldData(sampleWorldData, 1800) : sampleWorldData;
}
