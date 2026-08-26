// ============================================================================
// Prelaunch Lockdown Mode
// ============================================================================
// Set PRELAUNCH_MODE=true (or "1") in the environment to lock the app down
// while the landing page collects waitlist signups:
//   - /login and /register redirect to the landing page
//   - account creation (email + OAuth) is blocked with a 403
// The waitlist API itself is NOT affected — signups keep working.
// ============================================================================

export function isPrelaunchMode(): boolean {
  const value = process.env.PRELAUNCH_MODE;
  return value === "true" || value === "1";
}
