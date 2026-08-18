import crypto from "crypto";

/**
 * Format a numeric user ID into the official Scholar ID format (#000001).
 */
export function formatScholarId(id: number): string {
  return `#${id.toString().padStart(6, "0")}`;
}

/**
 * Generate a unique random alphanumeric Scholar ID (e.g. #A94F12).
 * Used when a numeric ID isn't known yet, or as a collision-safe fallback.
 */
export function generateRandomScholarId(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return `#${result}`;
}
