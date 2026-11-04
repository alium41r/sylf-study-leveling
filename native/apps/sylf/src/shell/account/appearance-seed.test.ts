import { describe, expect, it } from "vitest";
import { seedMarker, seedPatch, untouched } from "./appearance-seed";

const fresh = { themeId: "signature", overrides: {}, saved: [] };

describe("seeding Native's appearance from the account", () => {
  it("takes a real custom accent", () => { expect(seedPatch({ activeTheme: "#22AA55" }, fresh)).toEqual({ accentHex: "#22aa55" }); });
  it("ignores web's default accent, which nobody chose", () => { expect(seedPatch({ activeTheme: "#7C3AED" }, fresh)).toBeNull(); });
  it("ignores a preset name and anything that is not a colour", () => {
    expect(seedPatch({ activeTheme: "cyberpunk", activeBackground: "simple" }, fresh)).toBeNull();
    expect(seedPatch({ activeTheme: "#12345", activeBackground: "javascript:1" }, fresh)).toBeNull();
  });
  it("puts a dark ground in night and a light one in day", () => {
    expect(seedPatch({ activeBackground: "#101820" }, fresh)).toEqual({ groundNight: "#101820" });
    expect(seedPatch({ activeBackground: "#F5F0E6" }, fresh)).toEqual({ groundDay: "#f5f0e6" });
  });
  it("never changes an appearance someone has already touched", () => {
    expect(seedPatch({ activeTheme: "#22aa55" }, { ...fresh, themeId: "dusk" })).toBeNull();
    expect(seedPatch({ activeTheme: "#22aa55" }, { ...fresh, overrides: { accentHex: "#000000" } })).toBeNull();
    expect(seedPatch({ activeTheme: "#22aa55" }, { ...fresh, saved: [{ id: "x" } as never] })).toBeNull();
    expect(untouched(fresh)).toBe(true);
  });
  it("keeps one marker for each account", () => { expect(seedMarker(1)).not.toBe(seedMarker(2)); });
});
