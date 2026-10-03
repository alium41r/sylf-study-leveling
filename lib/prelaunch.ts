// ============================================================================
// Prelaunch Lockdown Mode
// ============================================================================
// Set PRELAUNCH_MODE=true (or "1") in the environment to lock the app down
// while the landing page collects waitlist signups:
//   - all other page routes redirect to the landing page, even with a session
//   - account creation (email + OAuth) is blocked with a 403
// APIs and public assets keep their existing behavior; waitlist signups work.
// Leave this unset/false locally to retain app access on the dev server.
// ============================================================================

export function isPrelaunchMode(): boolean {
  const value = process.env.PRELAUNCH_MODE;
  return value === "true" || value === "1";
}
