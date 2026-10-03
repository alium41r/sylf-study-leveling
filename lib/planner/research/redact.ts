/**
 * Keeping model-authored addresses out of what the student reads.
 *
 * The extraction schema has nowhere to *declare* a URL — that is Phase 1's provenance rule and it
 * holds: a model cannot add a source, promote a page to official, or point the fetcher anywhere.
 * But the schema's free-text fields are still the model's own words, and Phase 3's adversarial
 * re-pass found the gap those leave. A hostile page can tell the model to write
 *
 *   "see https://evil.example/leak.pdf"
 *
 * into `unresolved`, and `unresolved` becomes the candidate's `openQuestions` verbatim — which the
 * student reads, under "What Sylf could not settle", as Sylf's own suggestion. The URL is not
 * provenance and it is not fetched, but a link Sylf appears to recommend is a real thing to hand a
 * student, and the system prompt's rule ("never output a URL, a domain or a source name in any
 * field") was previously enforced on nothing but the structured fields.
 *
 * So this is the enforcement, applied at candidate assembly to the fields that carry model prose
 * into the interface. It is deliberately *not* applied to:
 *
 * - **queries** — they are the search provider's input, and a `site:` filter is a legitimate part
 *   of a query. Stripping it would silently change what was searched.
 * - **source titles and URLs** — those come from the search provider and the fetcher, not from the
 *   model. They are the provenance, and the student is meant to see them.
 * - **excerpts** — a quotation is the page's own wording and must survive byte for byte, or the
 *   server-side verification that makes it evidence would stop meaning anything.
 *
 * The removal is conservative on purpose. It matches things that are unambiguously addresses — a
 * scheme URL, a `www.` host, or a host-shaped token followed by a path — plus bare host-shaped
 * tokens whose final label is a plausible top-level domain. Single-letter and numeric final labels
 * are left alone, so `e.g.`, `Ph.D.`, `U.S.`, `Ch.1` and `Unit 3.2` survive intact; those are the
 * shapes that actually occur in syllabus copy, and mangling them would be a worse bug than the one
 * being fixed.
 */

/**
 * A dotted token whose last label looks like a domain: two to twenty-four letters, not digits.
 *
 * `e.g` fails it (final label is one letter), `3.2` fails it (digits), `nust.edu.pk` passes.
 * A trailing path is part of the same token when there is one, so `nust.edu.pk/spec.pdf` goes in
 * one piece rather than leaving `/spec.pdf` behind.
 */
const HOST_SHAPED = /\b[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b(?:\/[^\s<>()[\]"']*)?/g;

/**
 * An address that announces itself: anything with a scheme, `www.`, or a scheme that is itself the
 * payload.
 *
 * `javascript:`, `data:` and `vbscript:` carry no `//`, and they are the ones that matter most in
 * a string a student might click, so they are matched by name rather than by the `://` shape.
 */
const ADDRESS_WITH_MARKER =
  /\b(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.|(?:javascript|vbscript|data|mailto|tel):)[^\s<>()[\]"']*/gi;

/**
 * Replace the addresses in one string with nothing, then tidy what the removal left behind.
 *
 * Tidy rather than leave alone, because the string is shown to a student: "see  now" reads as a
 * bug, and a sentence ending "…according to , which lists" reads worse than one that never named
 * the address at all.
 *
 * The tidy is deliberately shallow — collapse runs of whitespace, re-attach punctuation that a
 * removal pushed away from its word, drop brackets left empty, and trim the ends. A general
 * punctuation repairer would be a larger thing than this problem needs, and every rule added to it
 * is a new way to damage ordinary prose.
 */
export function redactAddresses(text: string): string {
  /**
   * Drop the address, keep whatever punctuation was stuck to its end.
   *
   * Both patterns run to the end of the token, and a token at the end of a clause ends in a comma
   * or a full stop. Removing those with the address is how "see https://x.example, which" became
   * "see which" — a smaller bug than the one being fixed, but still a bug, and one the student
   * would see. The retained punctuation is re-attached by the tidy below.
   */
  const drop = (match: string) => `${/[.,;:!?]+$/.exec(match)?.[0] ?? ""} `;
  return text
    .replace(ADDRESS_WITH_MARKER, drop)
    .replace(HOST_SHAPED, drop)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:.–—-]+/, "")
    .replace(/[\s,;:]+$/, "")
    .trim();
}
