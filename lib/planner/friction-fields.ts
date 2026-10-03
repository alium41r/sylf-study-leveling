import { z } from "zod";

/**
 * Client-safe closed vocabulary for planner friction feedback.
 *
 * The single source of truth for the six friction reasons and their user-facing
 * copy. It lives outside `server/` so both the write service (`server/friction.ts`)
 * and the planner item UI can import the same codes and labels without a drift
 * between what the server accepts and what the UI shows.
 */
export const FRICTION_REASONS = [
  "TOO_LONG",
  "TOO_HARD",
  "UNCLEAR",
  "NO_MATERIAL",
  "ALREADY_KNEW",
  "LOW_VALUE",
] as const;
export type FrictionReason = (typeof FRICTION_REASONS)[number];
export const FrictionReasonSchema = z.enum(FRICTION_REASONS);

export const FRICTION_REASON_LABEL: Record<FrictionReason, string> = {
  TOO_LONG: "Too long",
  TOO_HARD: "Too hard",
  UNCLEAR: "Unclear",
  NO_MATERIAL: "No material",
  ALREADY_KNEW: "Already knew this",
  LOW_VALUE: "Low value",
};
