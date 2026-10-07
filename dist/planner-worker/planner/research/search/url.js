"use strict";
/**
 * What counts as the same URL, defined once.
 *
 * This lived inside the provider as a private helper, which was fine while the provider was
 * the only thing that ever saw a raw URL. Phase 1 gave the candidate pool a second opinion
 * about identity — it merges results from several queries and several providers — and two
 * implementations of "the same document" is how a student ends up shown the same page twice.
 *
 * So the rules live here and both callers use them: the provider canonicalises what a search
 * API returned, and the pool canonicalises again as it merges. The second pass is idempotent
 * on already-canonical URLs, which means it costs nothing today and protects the pool the day
 * a new provider (the feature document expects more) forgets to do it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalUrl = canonicalUrl;
exports.hostOf = hostOf;
/**
 * A URL we are willing to carry as provenance: absolute, http(s), and nothing else.
 *
 * Returns `null` rather than repairing. A relative path, a `javascript:` scheme or a
 * credential-bearing URL is not a document we can fetch, and inventing an absolute form for
 * one would put a URL into provenance that no provider ever returned.
 */
function canonicalUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        return null;
    // A fragment never identifies a document, and two results differing only by one are
    // the same source. Credentials in a URL are dropped rather than carried into
    // provenance and later replayed by the fetcher.
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    // `www.` is the same document served twice; a provider that returns both spellings must
    // not become two sources the student has to compare.
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    const href = parsed.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
}
/** The host of a URL, lowercased and without `www.`, or `""` when there is no usable one. */
function hostOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    }
    catch {
        return "";
    }
}
