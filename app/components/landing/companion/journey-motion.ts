import type { CompanionState } from "./model";

export function stateForWaypoint(pose?: string): CompanionState {
  switch (pose) {
    case "read":
      return "READING";
    case "sit":
      return "FOCUSING";
    case "wave":
      return "GREETING";
    case "celebrate":
      return "QUEST_COMPLETE";
    default:
      return "IDLE";
  }
}

/** CSS owns decorative float. This controller owns only page travel. */
export class JourneyMovement {
  y = 0;
  velocity = 0;
  active = false;
  rebase(y: number) {
    this.y = y;
    this.velocity = 0;
    this.active = false;
  }
  advance(target: number, dt: number) {
    const seconds = Math.min(Math.max(dt, 0), 0.048);
    const error = target - this.y;
    if (Math.abs(error) < 0.2 && Math.abs(this.velocity) < 2) {
      this.y = target;
      this.velocity = 0;
      this.active = false;
      return;
    }
    const acceleration = Math.max(
      -5400,
      Math.min(5400, error * 72 - this.velocity * 17)
    );
    this.velocity = Math.max(
      -1200,
      Math.min(1200, this.velocity + acceleration * seconds)
    );
    const next = this.y + this.velocity * seconds;
    if (error && Math.sign(target - next) !== Math.sign(error)) {
      this.y = target;
      this.velocity = 0;
      this.active = false;
    } else {
      this.y = next;
      this.active = true;
    }
  }
}
