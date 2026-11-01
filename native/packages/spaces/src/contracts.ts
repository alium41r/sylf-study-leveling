// Contracts for the three Sylf Spaces (master plan §2–§3). The Home rail, Command Center and World host are built in
// Phases 6–9. This package holds everything about Spaces that is not UI: identifiers, the restoration state, the store
// that outlives React (Android can recreate the root, observed in Phase 2), World's exit flow and the switcher's logic.
export const SPACE_IDS = ["home", "workspace", "world"] as const;
export type SpaceId = (typeof SPACE_IDS)[number];
export type FormFactor = "tablet" | "phone" | "desktop";

/** Phones get the companion (Home essentials only); Workspace and World are large-screen Spaces. */
export function availableSpaces(formFactor: FormFactor): SpaceId[] {
  return formFactor === "phone" ? ["home"] : [...SPACE_IDS];
}

/** The Spaces a person studies in. Leaving World returns to the last one of these. */
export type StudySpaceId = Exclude<SpaceId, "world">;

export interface SpacesRestorationState {
  version: 1;
  activeSpace: SpaceId;
  returnSpace: StudySpaceId;
  /** Each Space owns its own small serialized snapshot; heavy resources are never persisted here. */
  snapshots: Partial<Record<SpaceId, unknown>>;
}

export const INITIAL_SPACES_STATE: SpacesRestorationState = { version: 1, activeSpace: "home", returnSpace: "home", snapshots: {} };

/** Parses persisted state defensively: unknown versions or Spaces fall back to the initial state. */
export function parseSpacesState(raw: unknown, formFactor: FormFactor): SpacesRestorationState {
  if (!raw || typeof raw !== "object") return INITIAL_SPACES_STATE;
  const value = raw as Partial<SpacesRestorationState>;
  if (value.version !== 1 || !SPACE_IDS.includes(value.activeSpace as SpaceId)) return INITIAL_SPACES_STATE;
  const available = availableSpaces(formFactor);
  const active = available.includes(value.activeSpace as SpaceId) ? (value.activeSpace as SpaceId) : "home";
  const returnSpace = value.returnSpace === "workspace" && available.includes("workspace") ? "workspace" : "home";
  return { version: 1, activeSpace: active, returnSpace, snapshots: typeof value.snapshots === "object" && value.snapshots ? value.snapshots : {} };
}
