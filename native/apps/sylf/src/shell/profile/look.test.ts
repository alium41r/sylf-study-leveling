import { describe, expect, it } from "vitest";
import { lookOf } from "./look";

describe("lookOf", () => {
  it("is plain for an account with the defaults", () => {
    expect(lookOf({ activeNameColor: "default", activeFrame: "none", activeTitle: "Novice" })).toEqual({ nameColour: null, frameColour: null, title: "Novice" });
    expect(lookOf({})).toEqual({ nameColour: null, frameColour: null, title: null });
  });
  it("turns known catalog ids into plain colours and the title's own words", () => {
    expect(lookOf({ activeNameColor: "color_cyan", activeFrame: "frame_gold", activeTitle: "title_scholar" })).toEqual({ nameColour: "#22D3EE", frameColour: "#FACC15", title: "Scholar" });
  });
  it("falls back to the standard look for an id it does not know, rather than guessing", () => {
    expect(lookOf({ activeNameColor: "color_unheard_of", activeFrame: "frame_new", activeTitle: "title_unknown" })).toEqual({ nameColour: null, frameColour: null, title: null });
  });
});
