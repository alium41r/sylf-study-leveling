import { describe, expect, it } from "vitest";
import { skyAt } from "./todaySky";

describe("the sky Home looks at", () => {
  it("follows the hour through the whole day", () => {
    expect([4, 6, 11, 17, 20, 23].map(skyAt)).toEqual(["night", "dawn", "day", "sunset", "dusk", "night"]);
  });
});
