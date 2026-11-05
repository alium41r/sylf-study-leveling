import { describe, expect, it } from "vitest";
import { glyphFor, skyAt } from "./todaySky";

describe("the sky Home looks at", () => {
  it("follows the hour through the whole day", () => {
    expect([4, 6, 11, 17, 20, 23].map(skyAt)).toEqual(["night", "dawn", "day", "sunset", "dusk", "night"]);
  });
  it("shows the moon only when it is dark", () => {
    expect(["dawn", "day", "sunset", "mist"].map((sky) => glyphFor(sky as never))).toEqual(["sun", "sun", "sun", "sun"]);
    expect(["dusk", "night"].map((sky) => glyphFor(sky as never))).toEqual(["moon", "moon"]);
  });
});
