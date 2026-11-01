// What the World lobby remembers and decides, with no UI. The record lives in the `world` Spaces snapshot, so it survives a restart
// and stays small. Skies are the owner's six sky states from the Sylf World visual direction.
import type { WorldSaveReceipt } from "./host";

export const LOBBY_SECTIONS = ["gate", "traveller", "collection", "preparations"] as const;
export type LobbySection = (typeof LOBBY_SECTIONS)[number];
export const LOBBY_LABELS: Record<LobbySection, string> = { gate: "Gate", traveller: "Traveller", collection: "Collection", preparations: "Preparations" };

export const WORLD_SKIES = ["dawn", "day", "sunset", "dusk", "night", "mist"] as const;
export type WorldSky = (typeof WORLD_SKIES)[number];
export type SkyChoice = "auto" | WorldSky;
export const SKY_LABELS: Record<SkyChoice, string> = { auto: "Follow the day", dawn: "Dawn", day: "Day", sunset: "Sunset", dusk: "Dusk", night: "Night", mist: "Mist" };

export interface WorldSnapshot {
  leftAt?: number;
  section?: LobbySection;
  sky?: SkyChoice;
  /** Clouds and petals. Reduced motion always wins over this. */
  drift?: boolean;
  save?: WorldSaveReceipt;
}

const isSave = (value: unknown): value is WorldSaveReceipt => {
  const save = value as Partial<WorldSaveReceipt> | null;
  return !!save && typeof save === "object" && typeof save.ref === "string" && typeof save.savedAt === "number" && save.location === "device" && typeof save.pendingSync === "boolean";
};

/** Reads whatever storage holds. A value that does not belong is dropped alone, so one bad field cannot cost the rest. */
export function parseWorldSnapshot(raw: unknown): WorldSnapshot {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const parsed: WorldSnapshot = {};
  if (typeof value.leftAt === "number" && Number.isFinite(value.leftAt)) parsed.leftAt = value.leftAt;
  if (LOBBY_SECTIONS.includes(value.section as LobbySection)) parsed.section = value.section as LobbySection;
  if (value.sky === "auto" || WORLD_SKIES.includes(value.sky as WorldSky)) parsed.sky = value.sky as SkyChoice;
  if (typeof value.drift === "boolean") parsed.drift = value.drift;
  if (isSave(value.save)) parsed.save = value.save;
  return parsed;
}

/**
 * The sky for a choice. World's art is authored and stays independent of the appearance theme (Confirmed, owner, Phase 10), so "Follow the
 * day" means the local clock and nothing else. The interface is what follows the person, solved against whichever sky this is.
 */
export function resolveSky(choice: SkyChoice | undefined, hour: number): WorldSky {
  if (choice && choice !== "auto") return choice;
  if (hour >= 5 && hour < 10) return "dawn";
  if (hour >= 10 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "sunset";
  if (hour >= 19 && hour < 21) return "dusk";
  return "night";
}

/** Master plan G4: below this World asks for more room. The lobby itself still works, so a person can look around. */
export const WORLD_MIN_WINDOW = { width: 600, height: 420 };

export type WorldEntryBlock = { kind: "window" } | { kind: "session"; title: string };

/**
 * Why someone cannot enter now, or null. Master plan G1: time in World must never count as study, so a running session comes first and
 * the person chooses what to do with it. The window comes second, because the session is the one they can act on from here.
 */
export function worldEntryBlock(window: { width: number; height: number }, session: { title: string } | null): WorldEntryBlock | null {
  if (session) return { kind: "session", title: session.title };
  if (window.width < WORLD_MIN_WINDOW.width || window.height < WORLD_MIN_WINDOW.height) return { kind: "window" };
  return null;
}
