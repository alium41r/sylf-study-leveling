import { ACADEMIC_LEVELS, EXAM_BOARDS } from "@/lib/study-systems";
import { classifyHost, resolveAuthorities, type AuthorityTarget } from "./authority";
import type { ResearchConfidence, ResearchSource, SourceType } from "./contracts";

/**
 * Source provenance, as pure functions.
 *
 * This module is deliberately client-importable: it performs no network, no
 * filesystem and no crypto — the hash below is pure JS — so the same rules that
 * decide a source's authority in the intake UI are the rules that decide it on
 * the server. Nothing here reads `process.env` or the clock.
 *
 * The central rule is negative, and it is worth stating before the helpers:
 * **content-looking-right is not evidence.** A URL is promoted to `OFFICIAL*`
 * only because its host is an authority (an exam board's domain, or a
 * `.gov`/`.edu`/`.ac` host) — never because its path or title says "syllabus",
 * "official" or "specification". A preparation blog at
 * `prep-blog.com/official-syllabus-caie` is still a preparation blog.
 */

/**
 * Curated authoritative hosts per exam board, keyed by the EXACT `value` in
 * `EXAM_BOARDS`. Every entry is justified by that board's registry label below;
 * a board value with no entry has no official domain, so no domain is assumed
 * for it. Domains are lowercase and `www.`-free (see `hostOf`).
 */
const OFFICIAL_DOMAINS_BY_BOARD: Readonly<Record<string, readonly string[]>> = {
  // CAIE — Cambridge International (the registry's "Cambridge" brand; cie.org.uk
  // is the legacy Cambridge International Examinations domain, still the CIE home).
  CAIE: ["cambridgeinternational.org", "cie.org.uk"],
  // Edexcel (Pearson) — Edexcel qualifications now live under Pearson's
  // qualifications site, with edexcel.com kept as the brand entry point.
  Edexcel: ["qualifications.pearson.com", "edexcel.com"],
  // Oxford AQA International — its own brand domain.
  "Oxford AQA International": ["oxfordaqa.com"],
  // AQA (UK).
  AQA: ["aqa.org.uk"],
  // OCR (UK).
  OCR: ["ocr.org.uk"],
  // WJEC / Eduqas (Wales) — two brands, two domains.
  "WJEC/Eduqas": ["wjec.co.uk", "eduqas.co.uk"],
  // CCEA (Northern Ireland).
  CCEA: ["ccea.org.uk"],
  // AP (College Board) — students land on apstudents, everyone else on collegeboard.
  AP: ["apstudents.collegeboard.org", "collegeboard.org"],
  // IB (International Baccalaureate).
  IB: ["ibo.org"],
  // FBISE — Federal Board (Pakistan).
  FBISE: ["fbise.edu.pk"],
  // BISE Punjab (Lahore) — the Lahore board's own site.
  "BISE Punjab": ["biselahore.com"],
  // BISE Sindh (Karachi) — Board of Intermediate Education, Karachi.
  "BISE Sindh": ["biek.edu.pk"],
  // BISE KPK (Peshawar) — BISE Peshawar.
  "BISE KPK": ["bisep.edu.pk"],
  // BISE Balochistan (Quetta).
  "BISE Balochistan": ["bisequetta.edu.pk"],
  // AKU-EB (Aga Khan University) — the examination board lives under aku.edu.
  "AKU-EB": ["aku.edu"],
  // CBSE (India) — the board site plus the academic (syllabus) portal.
  CBSE: ["cbse.gov.in", "cbseacademic.nic.in"],
  // CISCE — ICSE / ISC (India).
  CISCE: ["cisce.org"],
  // NIOS (India — Open Schooling).
  NIOS: ["nios.ac.in"],
  // State Board (India), University and Other are intentionally absent: each
  // state/university is its own authority, so there is no single official host.
};

/**
 * A few `ACADEMIC_LEVELS` values name a board outright ("AP", "IB HL", "IB SL"),
 * so a missing board field can still be resolved to the board's hosts. These are
 * the ONLY level values that imply a specific authority — "GCSE" or "A-Level" do
 * not, and are deliberately absent.
 */
const OFFICIAL_DOMAINS_BY_LEVEL: Readonly<Record<string, readonly string[]>> = {
  AP: ["apstudents.collegeboard.org", "collegeboard.org"],
  "IB HL": ["ibo.org"],
  "IB SL": ["ibo.org"],
};

// The curated tables above are consulted only for values the registries actually
// contain, so an arbitrary or misspelt board string can never resolve to domains.
const BOARD_VALUE_SET: ReadonlySet<string> = new Set(EXAM_BOARDS.map((entry) => entry.value));
const LEVEL_VALUE_SET: ReadonlySet<string> = new Set(ACADEMIC_LEVELS.map((entry) => entry.value));

/** Lowercased host with a leading `www.` stripped, or null when the URL is unparseable. */
function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** True only for an absolute http/https URL — the only schemes a source may carry. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Whether the URL path looks like a document rather than a landing page. */
function looksLikeDocument(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".pdf") || path.includes("/pdf/");
  } catch {
    return false;
  }
}

/**
 * Government or university hosts are authoritative by construction — the domain
 * itself is the credential, so no curated table is needed for them.
 */
function isGovernmentOrUniversityHost(host: string): boolean {
  return (
    /\.gov$/.test(host) ||
    /\.gov\.[a-z]{2}$/.test(host) ||
    /\.edu$/.test(host) ||
    /\.edu\.[a-z]{2}$/.test(host) ||
    /\.ac\.[a-z]{2}$/.test(host) ||
    /\.mil$/.test(host)
  );
}

/** The publisher is the host, derived from the URL and never from model prose. */
export function publisherFromUrl(url: string): string | null {
  return hostOf(url);
}

/**
 * Authoritative hosts for a board (and, for the board-naming levels, a level).
 * An unknown board contributes nothing: no official domain is assumed for it,
 * which is the safe direction — a wrong "official" badge is worse than none.
 */
export function officialDomainsFor(input: {
  goal?: string | null;
  board?: string | null;
  level?: string | null;
}): string[] {
  const domains: string[] = [];
  const seen = new Set<string>();
  const add = (list: readonly string[] | undefined): void => {
    if (!list) return;
    for (const domain of list) {
      if (!seen.has(domain)) {
        seen.add(domain);
        domains.push(domain);
      }
    }
  };
  // The registry is the gate: only a value it lists can name an authority.
  if (input.board != null && BOARD_VALUE_SET.has(input.board)) {
    add(OFFICIAL_DOMAINS_BY_BOARD[input.board]);
  }
  if (input.level != null && LEVEL_VALUE_SET.has(input.level)) {
    add(OFFICIAL_DOMAINS_BY_LEVEL[input.level]);
  }
  return domains;
}

/**
 * Classify a source by its host and shape — in this order, and never by content:
 *  1. official host + document path  -> OFFICIAL_PDF
 *  2. official host                  -> OFFICIAL
 *  3. government/university host     -> OFFICIAL
 *  4. everything else                -> SECONDARY
 * A URL whose text mentions "syllabus"/"official"/"specification" on a blog host
 * still falls through to SECONDARY: the words do not confer authority.
 */
/**
 * Classify one source by *who publishes it*, not by what it looks like.
 *
 * Phase 2 treated any `.edu`, `.ac.*` or `.gov.*` host as OFFICIAL, which let a
 * university page about someone else's exam borrow that exam's authority. The verdict
 * now comes from the authority registry: OFFICIAL requires a host verified as belonging
 * to the body that owns *this* target, a credible academic or government host is
 * INSTITUTIONAL, and everything else is SECONDARY. The path decides only whether an
 * official source is a document (OFFICIAL_PDF) or a page.
 */
export function classifySource(url: string, context: AuthorityTarget): SourceType {
  const host = hostOf(url);
  if (!host) return "SECONDARY";
  const verdict = classifyHost(host, context);
  if (verdict === "OFFICIAL") return looksLikeDocument(url) ? "OFFICIAL_PDF" : "OFFICIAL";
  if (verdict === "INSTITUTIONAL") return "INSTITUTIONAL";
  return "SECONDARY";
}

/**
 * A canonical form used both for dedupe and for the deterministic source id:
 * lowercase host, strip `www.`, drop the fragment, drop a trailing slash, and
 * keep the query string (it can identify the document). The scheme and any
 * explicit port are preserved.
 */
function normalizeUrlForDedupe(url: string): string {
  const u = new URL(url);
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  let path = u.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${host}${port}${path}${u.search}`;
}

/**
 * Collapse duplicates, keeping the first occurrence and preserving order.
 * Two sources collapse when their normalised URLs match, or when their hosts
 * match AND their (non-null) titles are identical. A null title is not evidence
 * of sameness, so two untitled documents on one host are kept apart.
 */
export function dedupeSources<T extends { url: string; title: string | null }>(
  sources: readonly T[],
): T[] {
  const seenUrl = new Set<string>();
  const seenTitleHost = new Set<string>();
  const out: T[] = [];
  for (const source of sources) {
    let key: string;
    try {
      key = normalizeUrlForDedupe(source.url);
    } catch {
      key = source.url; // unparseable URLs can't be normalised; fall back to raw
    }
    if (seenUrl.has(key)) continue;
    const host = hostOf(source.url);
    if (source.title != null && host != null) {
      const titleHost = `${host}\u0000${source.title.trim()}`;
      if (seenTitleHost.has(titleHost)) continue;
      seenTitleHost.add(titleHost);
    }
    seenUrl.add(key);
    out.push(source);
  }
  return out;
}

/** Deterministic, locale-independent string comparison (plain code-unit order). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const SOURCE_TYPE_WEIGHT: Record<SourceType, number> = {
  OFFICIAL_PDF: 0,
  OFFICIAL: 1,
  INSTITUTIONAL: 2,
  // A file the student supplied themselves outranks an unrelated blog: it is at least
  // their own material for their own course.
  USER_UPLOAD: 3,
  SECONDARY: 4,
};

const CONFIDENCE_WEIGHT: Record<ResearchConfidence, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/**
 * Deterministic display order: (1) source type, official documents first; then
 * (2) mapping confidence; (3) number of supported nodes, most first; then
 * (4) publisher domain; then (5) URL. Every tie-breaker is total, so the same
 * data always sorts the same way regardless of input order.
 */
/**
 * How much a document looks like the *content* we came for, within its own authority tier.
 *
 * Authority and relevance are different questions and this answers only the second. A host is
 * official or it is not, and nothing here can change that; but among several pages published by
 * the same authority, "9709 specification 2026" is the document a scope comes from and "grade
 * thresholds" is not. Ordering by domain name instead — which is what the comparator did before
 * — put them in alphabetical order, so a live comparison against a background curriculum
 * fetched grade thresholds, notices and a subject list, read them, and correctly concluded it
 * could classify nothing. The pipeline was honest; the selection was arbitrary.
 *
 * Three signals, all from the URL and the provider's own title, which are provider-supplied
 * facts rather than model prose:
 *
 * - **content words** (`syllabus`, `specification`, `subject content`, `curriculum`, …) raise it;
 * - **administrative words** (`grade threshold`, `notice`, `timetable`, `fees`, …) lower it;
 * - a **stated year** breaks the remaining ties, newest first, because a current specification
 *   beats the same document from three years ago.
 *
 * Deliberately closed lists, and deliberately small: an unrecognised path scores neutral, so the
 * effect is to lift the documents we can recognise rather than to bury the ones we cannot.
 */
const CONTENT_SIGNALS = [
  "syllabus",
  "syllabuses",
  "specification",
  "subject-content",
  "subject content",
  "curriculum",
  "scope-and-sequence",
  "learning-objectives",
  "learning objectives",
  "programme-of-study",
  "course-content",
  "course content",
];
const ADMINISTRATIVE_SIGNALS = [
  "grade-threshold",
  "grade threshold",
  "grade-boundaries",
  "grade boundaries",
  "notice",
  "timetable",
  "calendar",
  "fees",
  "fee-schedule",
  "results",
  "press",
  "news",
  "vacancy",
  "handbook",
  "policy",
  "privacy",
  "contact",
  "about-us",
];

/**
 * The lowercased path and title of a source, which is all the signal there is.
 *
 * Typed on the two fields it reads rather than on `ResearchSource`, because Phase 2's selection
 * scores candidates from the pool — before a `ResearchSource` exists. Narrowing the parameter is
 * what lets retrieval-time scoring and post-fetch ranking share one definition of relevance
 * instead of two that drift.
 */
function relevanceText(source: { url: string; title: string | null }): string {
  let path = "";
  try {
    path = new URL(source.url).pathname;
  } catch {
    path = "";
  }
  return `${path} ${source.title ?? ""}`.toLowerCase().replace(/[_/]+/g, "-");
}

export function documentRelevance(source: { url: string; title: string | null }): number {
  const text = relevanceText(source);
  let score = 0;
  if (CONTENT_SIGNALS.some((signal) => text.includes(signal))) score += 2;
  if (ADMINISTRATIVE_SIGNALS.some((signal) => text.includes(signal))) score -= 2;
  // A stated year only ever breaks a tie, so an undated document is not penalised for it.
  const year = Number((text.match(/\b(19|20)\d{2}\b/) ?? [])[0] ?? 0);
  if (year >= 1990 && year <= 2199) score += (year - 2000) / 1000;
  return score;
}

export function rankSources(sources: readonly ResearchSource[]): ResearchSource[] {
  return [...sources].sort((a, b) => {
    return (
      SOURCE_TYPE_WEIGHT[a.sourceType] - SOURCE_TYPE_WEIGHT[b.sourceType] ||
      // Relevance orders *within* a tier, and never across one: a verified authority's
      // administrative page still outranks a preparation blog's syllabus-shaped one.
      documentRelevance(b) - documentRelevance(a) ||
      CONFIDENCE_WEIGHT[a.mappingConfidence] - CONFIDENCE_WEIGHT[b.mappingConfidence] ||
      b.nodeIds.length - a.nodeIds.length ||
      compareStrings(a.publisherOrDomain ?? "", b.publisherOrDomain ?? "") ||
      compareStrings(a.url, b.url)
    );
  });
}

/**
 * A year a title states explicitly, e.g. "Specification (2026)" or "…2025…".
 * Only 19xx/20xx tokens qualify: a syllabus CODE like "9231" is four digits too,
 * and reading it as a year would fabricate a document date.
 */
function yearFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parenthesized = title.match(/\(((?:19|20)\d{2})\)/);
  if (parenthesized) return parenthesized[1];
  const bare = title.match(/\b((?:19|20)\d{2})\b/);
  return bare ? bare[1] : null;
}

/**
 * Construct a `ResearchSource`, or null when the URL is not an absolute http/https
 * URL or exceeds the contract ceiling. It never throws and never repairs: a bad
 * URL is dropped, never "completed" into a URL that looks right.
 */
export function buildSource(input: {
  url: string;
  title: string | null;
  /** The target being researched: authority is relative to it, not absolute. */
  context: AuthorityTarget;
  retrievedAt: string;
  nodeIds?: string[];
  mappingConfidence?: ResearchConfidence;
}): ResearchSource | null {
  if (!isAbsoluteHttpUrl(input.url)) return null;
  if (input.url.length > 2048) return null;
  const title = input.title == null ? null : input.title.trim();
  return {
    sourceId: `src-${sha256Hex(normalizeUrlForDedupe(input.url)).slice(0, 16)}`,
    url: input.url,
    title: title != null && title.length > 300 ? title.slice(0, 300) : title,
    publisherOrDomain: publisherFromUrl(input.url),
    sourceType: classifySource(input.url, input.context),
    retrievedAt: input.retrievedAt,
    // Title-derived, so it is only ever present when the title states a year —
    // the document's real publication date is usually unknowable.
    documentDate: yearFromTitle(input.title),
    nodeIds: input.nodeIds ?? [],
    // Unmapped sources have earned no coverage confidence; the extractor raises
    // it once the source is matched to nodes.
    mappingConfidence: input.mappingConfidence ?? "LOW",
  };
}

export function sourceTypeLabel(type: SourceType): string {
  const LABELS: Record<SourceType, string> = {
    OFFICIAL: "Official",
    OFFICIAL_PDF: "Official PDF",
    INSTITUTIONAL: "Institutional",
    SECONDARY: "Secondary",
    USER_UPLOAD: "Your upload",
  };
  return LABELS[type];
}

/**
 * What each source type actually means, in one sentence, for the student.
 *
 * The label alone was not enough. "Institutional" reads like a promotion to anyone who
 * has not been told otherwise, and the difference it stands for is the one that
 * matters: a university page about *someone else's* exam is credible material, but it
 * is not the examination authority's own word. Saying so is the whole point of having a
 * class between "official" and "secondary".
 *
 * These sentences are shown once per panel, for the types actually present, rather
 * than repeated on every row.
 */
export function sourceTypeMeaning(type: SourceType): string {
  const MEANING: Record<SourceType, string> = {
    OFFICIAL:
      "Verified as an authority for this exam or curriculum — the board, ministry or exam body's own material.",
    OFFICIAL_PDF:
      "Verified as an authority for this exam or curriculum, published as a PDF document.",
    INSTITUTIONAL:
      "A credible academic or government institution, but not verified as the authority for this specific exam or curriculum.",
    SECONDARY:
      "Someone else's material. It may be accurate and useful to read, but it is not an authority and Sylf does not treat it as one.",
    USER_UPLOAD:
      "A file you provided. Sylf reads it for you, and nobody else has verified it.",
  };
  return MEANING[type];
}

/** A source is "official" only when a recognised authority published it; the
 * student's own upload is trusted differently and is not an official source. */
export function sourceTypeIsOfficial(type: SourceType): boolean {
  return type === "OFFICIAL" || type === "OFFICIAL_PDF";
}

// ── Pure-JS SHA-256 ────────────────────────────────────────────────────────────
// No node:crypto, so the module stays client-importable; used only to derive a
// stable, content-free id from a URL.

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(message: string): string {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const bitLenHi = Math.floor(bitLen / 0x100000000);
  const bitLenLo = bitLen >>> 0;

  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLenHi);
  view.setUint32(padded.length - 4, bitLenLo);

  for (let offset = 0; offset < padded.length; offset += 64) {
    const w = new Array<number>(64);
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}
