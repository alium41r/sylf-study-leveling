import { createHash } from "node:crypto";
import {
  EVIDENCE_LIMITS,
  EvidenceClaimSchema,
  type EvidenceKind,
  type EvidenceSupport,
  type ProposedEvidenceClaim,
} from "./search/contracts";

/**
 * The evidence ledger: what the research actually established, and the proof that it did.
 *
 * The rule this module enforces is that a claim is not evidence until the server has found its
 * quotation in text the server itself fetched. The model reads pages; it does not get to *say*
 * what they contain. Everything here is therefore verification rather than parsing — the model's
 * claim arrives, and the only question asked of it is "does this quotation exist on the page it
 * was attributed to?".
 *
 * Two properties make this checkable rather than merely declared:
 *
 * - **The stored excerpt is a verbatim span of the fetched text.** Not the model's version of
 *   it, whitespace-collapsed, but the actual bytes from `sourceText[start..end)`. The check
 *   locates the quotation and then stores what is really there, so the record cannot drift from
 *   the page even in whitespace.
 * - **Claim ids are derived, not issued.** The id is a digest of (source, objective, quotation),
 *   which makes merging two rounds idempotent: the same evidence extracted twice is one claim,
 *   and the same claim extracted in the follow-up round collides with itself instead of
 *   duplicating. It also means the model never supplies an identifier that later code trusts.
 */

/** A claim that passed verification. This is what the ledger stores. */
export interface VerifiedEvidenceClaim {
  claimId: string;
  objectiveId: string;
  sourceId: string;
  /** The model's paraphrase. Bounded, and never presented as a quotation. */
  statement: string;
  /** A verbatim span of the fetched page, located by `verifyExcerpt`. */
  excerpt: string;
  evidenceKind: EvidenceKind;
  support: EvidenceSupport;
  /**
   * A date the *page* states, quoted. Kept separate from provider-derived metadata: one is a
   * document date the server can defend, the other is a claim about content.
   */
  documentDate: string | null;
}

export const EVIDENCE_REJECTIONS = [
  "UNKNOWN_SOURCE",
  "UNKNOWN_OBJECTIVE",
  "EXCERPT_NOT_FOUND",
  "EXCERPT_TOO_SHORT",
  "EXCERPT_TOO_LONG",
  "SOURCE_NOT_FETCHED",
  "OVER_CLAIM_BOUND",
  "MALFORMED",
  "DUPLICATE",
] as const;
export type EvidenceRejection = (typeof EVIDENCE_REJECTIONS)[number];

export interface EvidenceLedger {
  claims: VerifiedEvidenceClaim[];
  /** Claims dropped, by reason. Reported so a thin run is legible rather than mysterious. */
  rejected: Record<EvidenceRejection, number>;
  accepted: number;
  /** Proposed claims the model sent, before any verification. */
  proposed: number;
}

export const emptyLedger = (): EvidenceLedger => ({
  claims: [],
  rejected: {
    UNKNOWN_SOURCE: 0,
    UNKNOWN_OBJECTIVE: 0,
    EXCERPT_NOT_FOUND: 0,
    EXCERPT_TOO_SHORT: 0,
    EXCERPT_TOO_LONG: 0,
    SOURCE_NOT_FETCHED: 0,
    OVER_CLAIM_BOUND: 0,
    MALFORMED: 0,
    DUPLICATE: 0,
  },
  accepted: 0,
  proposed: 0,
});

/**
 * Collapse whitespace and record where each surviving character came from.
 *
 * The map is the whole point. Fetched pages break sentences across lines, and a model quoting a
 * sentence will not reproduce those breaks — so the comparison has to be whitespace-insensitive.
 * But storing the *model's* version of a quotation would mean the ledger holds text no page
 * contains, which is precisely the thing this module exists to prevent. The map lets the search
 * happen on normalised text and the store happen on the original span.
 */
function normaliseWithMap(text: string): { normalised: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      // Leading whitespace is dropped; interior runs collapse to the index of their first
      // character, which is where the stored verbatim span will begin.
      pendingSpace = chars.length > 0;
      continue;
    }
    if (pendingSpace) {
      chars.push(" ");
      map.push(index);
      pendingSpace = false;
    }
    chars.push(char);
    map.push(index);
  }
  return { normalised: chars.join(""), map };
}

/** The normalised form of a quotation, for comparison only. */
function normaliseExcerpt(excerpt: string): string {
  return normaliseWithMap(excerpt).normalised;
}

export type ExcerptCheck =
  | { ok: true; excerpt: string }
  | { ok: false; reason: Extract<EvidenceRejection, "EXCERPT_NOT_FOUND" | "EXCERPT_TOO_SHORT" | "EXCERPT_TOO_LONG"> };

/**
 * Prove that a quotation exists in a fetched page, and return the page's own wording.
 *
 * Matching is whitespace-insensitive and case-sensitive. Case sensitivity is deliberate: a
 * specification that says "Paper 1" and a model that quotes "paper 1" has not quoted the page,
 * and the cost of being strict here is a dropped claim rather than a fabricated citation. Page
 * layout — the thing that genuinely differs between the page and a quotation — is handled by the
 * whitespace normalisation.
 */
export function verifyExcerpt(input: { excerpt: string; sourceText: string }): ExcerptCheck {
  const wanted = normaliseExcerpt(input.excerpt);
  if (wanted.length < EVIDENCE_LIMITS.minExcerptChars) return { ok: false, reason: "EXCERPT_TOO_SHORT" };
  if (input.excerpt.length > EVIDENCE_LIMITS.excerptChars) return { ok: false, reason: "EXCERPT_TOO_LONG" };
  const { normalised, map } = normaliseWithMap(input.sourceText);
  const at = normalised.indexOf(wanted);
  if (at < 0) return { ok: false, reason: "EXCERPT_NOT_FOUND" };
  const start = map[at];
  const end = map[at + wanted.length - 1] + 1;
  return { ok: true, excerpt: input.sourceText.slice(start, end) };
}

/** Deterministic identity: the same evidence extracted twice is the same claim. */
export function claimIdFor(input: { sourceId: string; objectiveId: string; excerpt: string }): string {
  const digest = createHash("sha256")
    .update(`${input.sourceId}\u0000${input.objectiveId}\u0000${normaliseExcerpt(input.excerpt)}`)
    .digest("hex");
  return `ev-${digest.slice(0, 16)}`;
}

/** The text the server actually fetched, keyed by the source id it issued to the model. */
export interface FetchedExcerptText {
  sourceId: string;
  text: string;
}

/**
 * Turn the model's proposed claims into verified ones, dropping everything unprovable.
 *
 * Bounds are applied in a fixed order — per source, then per objective, then overall — so the
 * same inputs always accept the same claims. A bound that depended on iteration order would make
 * the ledger depend on it too, and the ledger is what the coverage states are computed from.
 */
export function buildLedger(input: {
  proposed: readonly unknown[];
  fetched: readonly FetchedExcerptText[];
  /** Objective ids the plan actually stated. Anything else is refused. */
  knownObjectiveIds: ReadonlySet<string>;
  /** Claims already verified in an earlier round, so a follow-up round merges instead of resetting. */
  carried?: readonly VerifiedEvidenceClaim[];
}): EvidenceLedger {
  const ledger = emptyLedger();
  const textBySource = new Map(input.fetched.map((entry) => [entry.sourceId, entry.text]));
  const perSource = new Map<string, number>();
  const perObjective = new Map<string, number>();
  const byId = new Map<string, VerifiedEvidenceClaim>();

  for (const claim of input.carried ?? []) {
    byId.set(claim.claimId, claim);
    ledger.claims.push(claim);
    perSource.set(claim.sourceId, (perSource.get(claim.sourceId) ?? 0) + 1);
    perObjective.set(claim.objectiveId, (perObjective.get(claim.objectiveId) ?? 0) + 1);
  }
  ledger.accepted = ledger.claims.length;
  ledger.proposed = input.proposed.length;

  for (const raw of input.proposed) {
    const parsed = EvidenceClaimSchema.safeParse(raw);
    if (!parsed.success) {
      ledger.rejected.MALFORMED += 1;
      continue;
    }
    const claim: ProposedEvidenceClaim = parsed.data;

    // A citation to a source that was never issued, or never read, is not evidence. The two
    // are counted apart because they are different defects: one is a model inventing a source,
    // the other is a model citing something it was given but that could not be read.
    const sourceText = textBySource.get(claim.sourceId);
    if (!sourceText) {
      if (input.fetched.some((entry) => entry.sourceId === claim.sourceId)) ledger.rejected.SOURCE_NOT_FETCHED += 1;
      else ledger.rejected.UNKNOWN_SOURCE += 1;
      continue;
    }
    if (!input.knownObjectiveIds.has(claim.objectiveId)) {
      ledger.rejected.UNKNOWN_OBJECTIVE += 1;
      continue;
    }

    const checked = verifyExcerpt({ excerpt: claim.excerpt, sourceText });
    if (!checked.ok) {
      ledger.rejected[checked.reason] += 1;
      continue;
    }

    const claimId = claimIdFor({ sourceId: claim.sourceId, objectiveId: claim.objectiveId, excerpt: checked.excerpt });
    if (byId.has(claimId)) {
      ledger.rejected.DUPLICATE += 1;
      continue;
    }
    const forSource = perSource.get(claim.sourceId) ?? 0;
    const forObjective = perObjective.get(claim.objectiveId) ?? 0;
    if (
      forSource >= EVIDENCE_LIMITS.claimsPerSource ||
      forObjective >= EVIDENCE_LIMITS.claimsPerObjective ||
      byId.size >= EVIDENCE_LIMITS.claims
    ) {
      ledger.rejected.OVER_CLAIM_BOUND += 1;
      continue;
    }

    const verified: VerifiedEvidenceClaim = {
      claimId,
      objectiveId: claim.objectiveId,
      sourceId: claim.sourceId,
      statement: claim.statement,
      excerpt: checked.excerpt,
      evidenceKind: claim.evidenceKind,
      support: claim.support,
      documentDate: claim.documentDate,
    };
    byId.set(claimId, verified);
    ledger.claims.push(verified);
    perSource.set(claim.sourceId, forSource + 1);
    perObjective.set(claim.objectiveId, forObjective + 1);
    ledger.accepted += 1;
  }

  return ledger;
}

/** Total rejections, for telemetry and for the report's cost accounting. */
export function rejectedCount(ledger: EvidenceLedger): number {
  return Object.values(ledger.rejected).reduce((sum, value) => sum + value, 0);
}

/**
 * The evidence behind one candidate node.
 *
 * Derived rather than stored. A node already cites its `sourceIds` and every claim already names
 * its `sourceId`, so the relation is a join — and storing a third copy of it would be a third
 * place for it to be wrong. §53 of the phase specification asks for `node → claim refs` at best
 * and `node → sourceIds` at minimum; this gives the first without growing either contract.
 */
export function nodeEvidenceClaimIds(
  node: { sourceIds?: readonly string[] },
  claims: readonly VerifiedEvidenceClaim[]
): string[] {
  const cited = new Set(node.sourceIds ?? []);
  if (!cited.size) return [];
  return claims.filter((claim) => cited.has(claim.sourceId)).map((claim) => claim.claimId);
}
