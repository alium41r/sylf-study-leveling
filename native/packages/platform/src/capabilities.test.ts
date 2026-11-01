import { describe, expect, it } from "vitest";
import { formFactorFromScreen, windowSizeClass } from "./capabilities";

describe("window size classes", () => {
  it("classifies by window width, not device", () => {
    expect(windowSizeClass(394)).toBe("compact"); // Tab S9 FE pop-up view (Phase 2)
    expect(windowSizeClass(654)).toBe("medium"); // Tab S9 FE split screen
    expect(windowSizeClass(1316)).toBe("expanded"); // Tab S9 FE landscape
    expect(windowSizeClass(600)).toBe("medium");
    expect(windowSizeClass(1000)).toBe("expanded");
  });
  it("derives form factor from the shortest screen side", () => {
    expect(formFactorFromScreen(822)).toBe("tablet");
    expect(formFactorFromScreen(412)).toBe("phone");
  });
});
