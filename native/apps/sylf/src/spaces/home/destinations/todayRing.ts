// The number in the middle of the hero ring. Pure, so it is tested without a screen.
/** "47 min" below an hour, "1.2 hr" above, so the number fits the ring. */
export function ringNumber(minutes: number): { value: string; unit: string } {
  return minutes < 60 ? { value: String(Math.max(0, Math.round(minutes))), unit: "min" } : { value: (minutes / 60).toFixed(minutes < 600 ? 1 : 0).replace(/\.0$/, ""), unit: "hr" };
}
