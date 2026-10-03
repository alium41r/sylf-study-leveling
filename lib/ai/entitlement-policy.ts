// ============================================================================
// AI Entitlements — the single server-side source of truth for unlimited
// AI/planner access on explicitly configured Sylf accounts.
// ============================================================================
//
// SYLF grants APPLICATION-LEVEL AI quotas (chat/day, planner/week, compile/day,
// scope/day, planner expansion and rebalance/week). Those quotas are product
// usage limits, not security controls: a configured owner account may exceed
// them without limit.
//
// This module is the ONE place that decision is made. Nothing else in the
// runtime may read the environment variable, compare an email, or otherwise
// invent a second privilege rule.
//
// ── Security invariants (all are load-bearing) ──────────────────────────────
//  1. SERVER-ONLY. `server-only` makes importing this from a client component a
//     build error, so the configured ids can never reach the browser bundle.
//     The variable is deliberately NOT named `NEXT_PUBLIC_*`.
//  2. The only accepted authority is the AUTHENTICATED DATABASE USER ID — the
//     `session.userId` produced by `getSession()`, which verifies the signed
//     cookie AND re-reads the user row to check `tokenVersion` (revocation).
//     A request body field, query parameter, header, or JWT claim can never
//     reach this function's argument as authority, and even if one did, it
//     would have to equal a configured id to matter.
//  3. EXACT id match. No email, username, name, display name, domain, prefix,
//     wildcard, or range matching exists here — by construction there is no
//     string for one to be written against.
//  4. FAILS CLOSED. A missing, empty, blank, or wholly malformed variable
//     yields an empty set, which grants nobody anything. Malformed individual
//     entries are dropped (so they can never accidentally match a real user)
//     and reported once on the server console.
//
// ── Configuration ───────────────────────────────────────────────────────────
//   SYLF_UNLIMITED_AI_USER_IDS="<User.id>[,<User.id>...]"
//
//   `User.id` is an autoincrement integer in this schema, so each entry is a
//   positive int4 value. Values are trimmed before validation, and duplicates
//   collapse. Because the variable is read from the process environment and
//   compared as a canonical decimal string, an entry such as `77abc`, `077`,
//   `-1`, `0`, `1e3`, `{}` or `owner@example.com` matches nothing at all. A
//   trailing comma is simply a blank slot and is ignored, so `"77,"` and
//   `"77"` are equivalent.
// ============================================================================


/** The only environment variable that can grant unlimited AI usage. */
export const UNLIMITED_AI_USER_IDS_ENV = "SYLF_UNLIMITED_AI_USER_IDS";

/** Largest value storable in the schema's `User.id` (Postgres `int4`). */
const MAX_USER_ID = 2_147_483_647;

/** Canonical decimal form of a valid `User.id` (no sign, no leading zero). */
const CANONICAL_USER_ID = /^[1-9][0-9]{0,9}$/;

/**
 * The semantic entitlement surface. Callers should prefer this over
 * `isUnlimitedAiUser` when they need to distinguish which quota family is
 * being bypassed; both read the identical configuration.
 */
export interface AiEntitlements {
  /** The authenticated user the entitlement was resolved for. */
  readonly userId: number;
  /** True only for an exactly configured, authenticated `User.id`. */
  readonly unlimitedAi: boolean;
  /** Product AI quotas (chat / compile / scope) may be exceeded without limit. */
  readonly bypassAiQuota: boolean;
  /** Planner product quotas (generate / expansion / rebalance) may be exceeded. */
  readonly bypassPlannerQuota: boolean;
}

const NO_ENTITLEMENTS = (userId: number): AiEntitlements => ({
  userId,
  unlimitedAi: false,
  bypassAiQuota: false,
  bypassPlannerQuota: false,
});

/** True when `value` is a usable `User.id` value to match against. */
function isMatchableUserId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_USER_ID
  );
}

/**
 * Parse the configured id list into a canonical set.
 *
 * Exported only so the policy is directly testable; the runtime never needs to
 * call it. Every entry is trimmed before validation, malformed entries are
 * dropped (never coerced), and duplicates collapse.
 */
export function parseUnlimitedAiUserIds(raw: string | undefined | null): Set<string> {
  const ids = new Set<string>();
  if (typeof raw !== "string") return ids;

  const malformed: string[] = [];
  for (const entry of raw.split(",")) {
    const token = entry.trim();
    // A trailing comma, an empty variable, and a blank slot all land here.
    if (token === "") continue;
    if (!CANONICAL_USER_ID.test(token) || Number(token) > MAX_USER_ID) {
      malformed.push(token);
      continue;
    }
    ids.add(token);
  }

  if (malformed.length > 0) {
    // Never echo the value itself — only that it was rejected. Console-only;
    // this never reaches a response body.
    console.warn(
      `[ai-entitlements] ${UNLIMITED_AI_USER_IDS_ENV}: ignored ${malformed.length} malformed entr${malformed.length === 1 ? "y" : "ies"}; expected positive integer User.id values.`
    );
  }

  return ids;
}

// The raw string is the cache key, so a changed environment value is always
// re-parsed instead of being served from a stale cache.
let cachedRaw: string | undefined;
let cachedIds: ReadonlySet<string> = new Set<string>();

function configuredUnlimitedIds(): ReadonlySet<string> {
  const raw = process.env[UNLIMITED_AI_USER_IDS_ENV];
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = parseUnlimitedAiUserIds(raw);
  }
  return cachedIds;
}

/**
 * The canonical entitlement check.
 *
 * `userId` MUST be the authenticated database user id (`session.userId`), never
 * a value read from a request. Returns false for every account that is not
 * exactly configured, and false for everything when the environment variable
 * is absent or malformed.
 */
export function isUnlimitedAiUser(userId: number): boolean {
  if (!isMatchableUserId(userId)) return false;
  return configuredUnlimitedIds().has(String(userId));
}

/**
 * Resolve the full entitlement set for an authenticated user. One source of
 * truth: every quota family is answered from the same decision.
 */
export function getAiEntitlements(userId: number): AiEntitlements {
  if (!isUnlimitedAiUser(userId)) return NO_ENTITLEMENTS(userId);
  return {
    userId,
    unlimitedAi: true,
    bypassAiQuota: true,
    bypassPlannerQuota: true,
  };
}
