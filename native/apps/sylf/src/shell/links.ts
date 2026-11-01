// Deep links are a development tool: they select a Space, a theme or a Showcase chapter, which is how verification reaches
// every combination. Android uses sylf-native://showcase?chapter=studio and sylf-native://spaces?space=world, and the web
// build uses ?chapter=studio and ?space=world. accent, day and night take a hex without the #, to check custom colors.
// home picks a Home destination, and homeData=empty or slow shows those states of Home's and Workspace's templates.
// wsOpen=notes,pdfs opens Workspace tools, wsClear=1 empties the canvas first, wsLayout=split applies a preset and wsZoom=0.5
// sets the zoom, which is how a sweep on a device reaches Workspace without touching the screen. worldData=empty, slow or session
// and worldHost=fail-load, fail-save or slow show those states of World, and worldSky and worldSection pick the lobby's sky and
// section. session=running, paused or clear puts the study session in that state, and sessionLength sets its length in minutes, or
// open for no limit. textScale=1.3 sets the app's text size. r15=views replaces everything with the bare memory probe.
// Nothing here runs unless development tools are on.
import { HOME_DESTINATIONS, LOBBY_SECTIONS, SPACE_IDS, WORKSPACE_LAYOUTS, WORLD_SKIES, isToolId, type HomeDestination, type LobbySection, type SkyChoice, type SpaceId, type ToolId, type WorkspaceLayout, type WorldSky } from "@sylf/spaces";

export type HomeDataScenario = "sample" | "empty" | "slow";
const SCENARIOS: HomeDataScenario[] = ["sample", "empty", "slow"];
export type WorldDataScenario = HomeDataScenario;
const WORLD_DATA: WorldDataScenario[] = SCENARIOS;
export type SessionScenario = "running" | "paused" | "clear";
const SESSION_SCENARIOS: SessionScenario[] = ["running", "paused", "clear"];
export type WorldHostScenario = "normal" | "fail-load" | "fail-save" | "slow";
const WORLD_HOSTS: WorldHostScenario[] = ["normal", "fail-load", "fail-save", "slow"];

export interface AppLink {
  surface: "showcase" | "spaces" | null;
  chapter: string | null;
  theme: string | null;
  mode: "light" | "dark" | "system" | null;
  space: SpaceId | null;
  home: HomeDestination | null;
  homeData: HomeDataScenario | null;
  workspaceOpen: ToolId[];
  workspaceClear: boolean;
  workspaceLayout: WorkspaceLayout | null;
  workspaceZoom: number | null;
  worldData: WorldDataScenario | null;
  worldHost: WorldHostScenario | null;
  worldSky: SkyChoice | null;
  worldSection: LobbySection | null;
  session: SessionScenario | null;
  /** undefined leaves it alone. null is no limit. */
  sessionLength: number | null | undefined;
  textScale: number | null;
  probe: boolean;
  colors: { accentHex?: string; groundDay?: string; groundNight?: string };
}

const hex = (value: string | null) => (value && /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : undefined);

export function parseAppLink(url: string | null | undefined): AppLink | null {
  if (!url) return null;
  try {
    const params = new URL(url).searchParams;
    const host = /^[a-z-]+:\/\/([^/?#]*)/.exec(url)?.[1];
    const chapter = params.get("chapter");
    const space = params.get("space");
    const home = params.get("home");
    const homeData = params.get("homeData");
    const mode = params.get("mode");
    const wsLayout = params.get("wsLayout");
    const wsZoom = Number(params.get("wsZoom"));
    const worldData = params.get("worldData");
    const worldHost = params.get("worldHost");
    const worldSky = params.get("worldSky");
    const worldSection = params.get("worldSection");
    const session = params.get("session");
    const sessionLength = params.get("sessionLength");
    const textScale = Number(params.get("textScale"));
    const colors = { accentHex: hex(params.get("accent")), groundDay: hex(params.get("day")), groundNight: hex(params.get("night")) };
    return {
      surface: host === "showcase" || chapter ? "showcase" : host === "spaces" || space ? "spaces" : null,
      chapter,
      theme: params.get("theme"),
      mode: mode === "light" || mode === "dark" || mode === "system" ? mode : null,
      space: SPACE_IDS.includes(space as SpaceId) ? (space as SpaceId) : null,
      home: HOME_DESTINATIONS.includes(home as HomeDestination) ? (home as HomeDestination) : null,
      homeData: SCENARIOS.includes(homeData as HomeDataScenario) ? (homeData as HomeDataScenario) : null,
      workspaceOpen: (params.get("wsOpen") ?? "").split(",").filter(isToolId),
      workspaceClear: params.get("wsClear") === "1",
      workspaceLayout: WORKSPACE_LAYOUTS.includes(wsLayout as WorkspaceLayout) ? (wsLayout as WorkspaceLayout) : null,
      workspaceZoom: Number.isFinite(wsZoom) && wsZoom > 0 ? wsZoom : null,
      worldData: WORLD_DATA.includes(worldData as WorldDataScenario) ? (worldData as WorldDataScenario) : null,
      worldHost: WORLD_HOSTS.includes(worldHost as WorldHostScenario) ? (worldHost as WorldHostScenario) : null,
      worldSky: worldSky === "auto" || WORLD_SKIES.includes(worldSky as WorldSky) ? (worldSky as SkyChoice) : null,
      worldSection: LOBBY_SECTIONS.includes(worldSection as LobbySection) ? (worldSection as LobbySection) : null,
      session: SESSION_SCENARIOS.includes(session as SessionScenario) ? (session as SessionScenario) : null,
      sessionLength: sessionLength === "open" ? null : Number(sessionLength) > 0 ? Number(sessionLength) : undefined,
      textScale: textScale > 0 ? textScale : null,
      probe: params.has("r15"),
      colors: Object.fromEntries(Object.entries(colors).filter(([, value]) => value)),
    };
  } catch { return null; }
}

/** Off unless a development server or an explicit build flag turns it on, so a store build cannot ship the Showcase by accident. */
export const devToolsEnabled = (dev: boolean, flag: string | undefined) => dev || flag === "1";
