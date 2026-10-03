import { expect, it } from "vitest";
import {
  JourneyMovement,
  stateForWaypoint,
} from "@/app/components/landing/companion/journey-motion";

it("accelerates, settles without overshoot and reverses without teleporting", () => {
  const m = new JourneyMovement();
  m.rebase(100);
  m.advance(400, 1 / 60);
  expect(m.y).toBeGreaterThan(100);
  expect(m.y).toBeLessThan(103);
  for (let i = 0; i < 240; i++) {
    m.advance(400, 1 / 60);
    expect(m.y).toBeLessThanOrEqual(400);
  }
  expect(m.y).toBe(400);
  expect(m.active).toBe(false);
  m.advance(100, 1 / 60);
  expect(m.y).toBeGreaterThan(397);
  for (let i = 0; i < 240; i++) m.advance(100, 1 / 60);
  expect(m.y).toBe(100);
  expect(m.velocity).toBe(0);
});
it("bounds a stalled frame and preserves positions when rebasing", () => {
  const m = new JourneyMovement();
  m.rebase(180);
  m.advance(2000, 9);
  expect(m.y - 180).toBeLessThan(13);
  m.rebase(520);
  expect(m.y).toBe(520);
  expect(m.active).toBe(false);
});
it("maps existing landing waypoint poses to the canonical vocabulary", () => {
  expect(stateForWaypoint("read")).toBe("READING");
  expect(stateForWaypoint("sit")).toBe("FOCUSING");
  expect(stateForWaypoint("wave")).toBe("GREETING");
  expect(stateForWaypoint("celebrate")).toBe("QUEST_COMPLETE");
  expect(stateForWaypoint("anything")).toBe("IDLE");
});
