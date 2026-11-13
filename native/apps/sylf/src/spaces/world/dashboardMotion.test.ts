import { describe, expect, it } from "vitest";
import { ISLAND_FRAME, islandMotion } from "./dashboardMotion";

describe("the dashboard island's motion", () => {
  it("creates no animation with reduced motion or the Still intensity", () => {
    expect(islandMotion(0, 0)).toBeNull();
    expect(islandMotion(0, 12)).toBeNull();
    expect(islandMotion(Number.NaN, 0)).toBeNull();
  });

  it("stays a few pixels and slow at every intensity", () => {
    for (const amount of [0.55, 1, 1.4, 3]) {
      const motion = islandMotion(amount, 0)!;
      for (const swing of [motion.float, motion.cloudNear, motion.cloudFar, motion.sea]) {
        expect(swing.distance).toBeGreaterThanOrEqual(1);
        expect(swing.distance).toBeLessThanOrEqual(32);
        expect(swing.duration).toBeGreaterThanOrEqual(6_000);
        expect(swing.steps).toBe(0);
      }
      expect(motion.float.distance).toBeLessThanOrEqual(6);
      expect(motion.glow.low).toBeGreaterThan(0.5);
    }
    expect(islandMotion(0.55, 0)!.cloudNear.distance).toBeLessThan(islandMotion(1, 0)!.cloudNear.distance);
  });

  it("moves a stepped theme one whole pixel at a time", () => {
    const motion = islandMotion(1, 12)!;
    for (const swing of [motion.float, motion.cloudNear, motion.cloudFar, motion.sea]) expect(swing.steps).toBe(swing.distance);
    expect(motion.glow.steps).toBeGreaterThan(1);
  });

  it("lets the gate rise out of the sky's top edge and hides its base", () => {
    expect(ISLAND_FRAME.gateBottom + ISLAND_FRAME.gateHeight).toBeGreaterThan(1 - ISLAND_FRAME.skyTop);
    expect(ISLAND_FRAME.gateBottom + ISLAND_FRAME.gateHeight).toBeLessThanOrEqual(1);
    expect(ISLAND_FRAME.gateBottom).toBeLessThan(0);
  });
});
