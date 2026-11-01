// Single source of truth for what may never enter a Sylf Native client bundle. Used by the Metro resolver
// (build-time enforcement) and tooling/checks/check-boundaries.mjs (static audit). Mirrors mobile/vite.config.ts.
const SERVER_ONLY_SPECIFIERS = [
  /^server-only$/, /^@prisma\//, /^prisma$/, /^pg$/, /^bcryptjs$/, /^nodemailer$/, /^@upstash\/redis$/, /^sharp$/,
  /^next(\/|$)/,
];
// Paths inside the Sylf repository (relative to its root) that are server-only or web-UI-only.
const FORBIDDEN_REPO_PATHS = [
  /^lib\/prisma(\.ts)?$/, /^lib\/auth-server/, /^lib\/auth-admin/, /^lib\/auth\.ts$/, /^lib\/auth-(native|password|service|session-service)/, /^lib\/supabase-storage/,
  /^lib\/ai\/(providers|orchestrator|syllabus-compiler)/, /^lib\/(.+\/)?server\//, /^lib\/redis/, /^lib\/email/,
  /^app\//, /^prisma\//, /^proxy\.ts$/, /^mobile\//, /^scripts\//,
];
module.exports = { SERVER_ONLY_SPECIFIERS, FORBIDDEN_REPO_PATHS };
