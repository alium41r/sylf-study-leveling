import { describe, expect, it } from "vitest";
import { devToolsEnabled, parseAppLink } from "./links";

describe("App links", () => {
  it("reads Showcase links on both runtimes", () => {
    expect(parseAppLink("sylf-native://showcase?chapter=studio&theme=voxel&mode=light")).toEqual({ surface: "showcase", chapter: "studio", theme: "voxel", mode: "light", space: null, home: null, workspaceOpen: [], workspaceClear: false, workspaceLayout: null, workspaceZoom: null, worldHost: null, worldSky: null, worldSection: null, session: null, sessionLength: undefined, textScale: null, probe: false, colors: {} });
    expect(parseAppLink("sylf://app/?chapter=controls")?.surface).toBe("showcase");
    expect(parseAppLink("sylf-native://showcase")?.surface).toBe("showcase");
  });
  it("reads Space links on both runtimes", () => {
    expect(parseAppLink("sylf-native://spaces?space=world&mode=dark")).toEqual({ surface: "spaces", chapter: null, theme: null, mode: "dark", space: "world", home: null, workspaceOpen: [], workspaceClear: false, workspaceLayout: null, workspaceZoom: null, worldHost: null, worldSky: null, worldSection: null, session: null, sessionLength: undefined, textScale: null, probe: false, colors: {} });
    expect(parseAppLink("sylf://app/?space=workspace&theme=cozy")?.space).toBe("workspace");
  });
  it("reads Home destinations and ignores retired data scenarios", () => {
    expect(parseAppLink("sylf-native://spaces?space=home&home=circle&homeData=empty")).toMatchObject({ space: "home", home: "circle" });
    expect(parseAppLink("sylf://app/?home=today&homeData=sample")).not.toHaveProperty("homeData");
    expect(parseAppLink("sylf://app/?home=garden")?.home).toBeNull();
  });
  it("reads Workspace sweeps", () => {
    expect(parseAppLink("sylf-native://spaces?space=workspace&wsClear=1&wsOpen=notes,pdfs,game&wsLayout=split&wsZoom=0.5")).toMatchObject({ workspaceClear: true, workspaceOpen: ["notes", "pdfs"], workspaceLayout: "split", workspaceZoom: 0.5 });
    expect(parseAppLink("sylf://app/?wsLayout=grid&wsZoom=none")).toMatchObject({ workspaceLayout: null, workspaceZoom: null, workspaceOpen: [] });
  });
  it("reads World's states", () => {
    expect(parseAppLink("sylf-native://spaces?space=world&worldData=empty&worldHost=fail-save&worldSky=dusk&worldSection=traveller")).toMatchObject({ worldHost: "fail-save", worldSky: "dusk", worldSection: "traveller" });
    expect(parseAppLink("sylf://app/?worldSky=auto")?.worldSky).toBe("auto");
    expect(parseAppLink("sylf://app/?worldData=all&worldHost=real&worldSky=green&worldSection=shop")).toMatchObject({ worldHost: null, worldSky: null, worldSection: null });
  });
  it("reads custom colors and rejects anything that is not a hex", () => {
    expect(parseAppLink("sylf-native://spaces?accent=E5FF00&day=7f8088&night=nope")?.colors).toEqual({ accentHex: "#e5ff00", groundDay: "#7f8088" });
  });
  it("ignores values it does not know", () => {
    expect(parseAppLink("sylf-native://spaces?space=mars&mode=sepia")).toMatchObject({ surface: "spaces", space: null, mode: null });
    expect(parseAppLink("sylf://app/")?.surface).toBeNull();
    expect(parseAppLink("not a url")).toBeNull();
    expect(parseAppLink(null)).toBeNull();
  });
});

describe("Development tools", () => {
  it("stay off in a release build unless the flag is set exactly", () => {
    expect(devToolsEnabled(false, undefined)).toBe(false);
    expect(devToolsEnabled(false, "0")).toBe(false);
    expect(devToolsEnabled(false, "true")).toBe(false);
    expect(devToolsEnabled(false, "1")).toBe(true);
    expect(devToolsEnabled(true, undefined)).toBe(true);
  });
  it("reads the study session's states", () => {
    expect(parseAppLink("sylf://app/?session=running&sessionLength=50")).toMatchObject({ session: "running", sessionLength: 50 });
    expect(parseAppLink("sylf://app/?session=clear&sessionLength=open")).toMatchObject({ session: "clear", sessionLength: null });
    expect(parseAppLink("sylf://app/?session=forever&sessionLength=-3&textScale=0")).toMatchObject({ session: null, sessionLength: undefined, textScale: null });
    expect(parseAppLink("sylf://app/?textScale=1.3")).toMatchObject({ textScale: 1.3 });
  });
});
