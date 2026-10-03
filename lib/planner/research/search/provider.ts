import "server-only";
import {
  RESEARCH_BOUNDS,
  SEARCH_PROVIDERS,
  type SearchErrorCode,
  type SearchProvider,
  type SearchProviderId,
  type SearchResult,
} from "./contracts";

/**
 * External web search for Planner research.
 *
 * Two documented APIs behind one interface, because which one Sylf uses is a matter of
 * which key the deployment holds, not of capability: both return real result URLs with
 * titles and snippets, both are meant for server-side calls, and neither adds an AI
 * layer we would then have to trust.
 *
 * The single most important property here is negative: **this module is the only place
 * a research URL can be born**. Nothing in it reads a model's output, and every URL it
 * returns was handed to us by the provider. Everything downstream — the fetcher, the
 * extraction, the candidate — may only reference what came out of here.
 */

export class SearchProviderError extends Error {
  constructor(public code: SearchErrorCode) {
    super(code);
    this.name = "SearchProviderError";
  }
}

/**
 * A URL we are willing to carry as provenance: absolute, http(s), and nothing else.
 *
 * The rule itself lives in `./url`, shared with the candidate pool, which has to agree with
 * this module about what "the same document" means.
 */
import { canonicalUrl, hostOf } from "./url";

/** One provider's raw payload → bounded, normalised, de-duplicated results. */
function toResults(
  raw: unknown,
  provider: SearchProviderId,
  limit: number,
  pick: (entry: Record<string, unknown>) => { url?: unknown; title?: unknown; snippet?: unknown } | null
): SearchResult[] {
  const entries: Record<string, unknown>[] = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const entry of entries) {
    if (out.length >= Math.min(limit, RESEARCH_BOUNDS.maxResultsPerQuery)) break;
    const fields = pick(entry);
    if (!fields || typeof fields.url !== "string") continue;
    const url = canonicalUrl(fields.url);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = typeof fields.title === "string" && fields.title.trim() ? fields.title.trim() : hostOf(url);
    if (!title) continue;
    out.push({
      url,
      title: title.slice(0, 300),
      snippet: typeof fields.snippet === "string" && fields.snippet.trim() ? fields.snippet.trim().slice(0, 1000) : null,
      rank: out.length + 1,
      provider,
    });
  }
  return out;
}

/** Status → code, so a caller can explain the failure instead of logging it. */
function codeForStatus(status: number): SearchErrorCode {
  if (status === 401 || status === 403) return "SEARCH_UNAUTHORIZED";
  if (status === 429) return "SEARCH_RATE_LIMITED";
  if (status >= 500) return "SEARCH_UNAVAILABLE";
  return "SEARCH_BAD_RESPONSE";
}

async function requestJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(RESEARCH_BOUNDS.searchTimeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: combined, cache: "no-store" });
  } catch (error) {
    if (signal?.aborted) throw new SearchProviderError("SEARCH_TIMEOUT");
    if (error instanceof Error && error.name === "TimeoutError") throw new SearchProviderError("SEARCH_TIMEOUT");
    throw new SearchProviderError("SEARCH_UNAVAILABLE");
  }
  if (!response.ok) throw new SearchProviderError(codeForStatus(response.status));
  try {
    return await response.json();
  } catch {
    throw new SearchProviderError("SEARCH_BAD_RESPONSE");
  }
}

/**
 * Brave Search API. `count` is capped by the API itself; we cap again, because a
 * provider is not a place to discover our own limits.
 */
export function braveSearch(apiKey: string): SearchProvider {
  return {
    id: "brave",
    async search({ query, limit, signal }) {
      const count = Math.min(limit, RESEARCH_BOUNDS.maxResultsPerQuery);
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
      const payload = (await requestJson(
        url,
        { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } },
        signal
      )) as { web?: { results?: Record<string, unknown>[] } } | null;
      const results = toResults(payload?.web?.results ?? [], "brave", count, (entry) => ({
        url: entry.url,
        title: entry.title,
        snippet: entry.description,
      }));
      if (!results.length) throw new SearchProviderError("SEARCH_ZERO_RESULTS");
      return results;
    },
  };
}

/** Serper (Google results). Same contract, different shape. */
export function serperSearch(apiKey: string): SearchProvider {
  return {
    id: "serper",
    async search({ query, limit, signal }) {
      const count = Math.min(limit, RESEARCH_BOUNDS.maxResultsPerQuery);
      const payload = (await requestJson(
        "https://google.serper.dev/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
          body: JSON.stringify({ q: query, num: count }),
        },
        signal
      )) as { organic?: Record<string, unknown>[] } | null;
      const results = toResults(payload?.organic ?? [], "serper", count, (entry) => ({
        url: entry.link,
        title: entry.title,
        snippet: entry.snippet,
      }));
      if (!results.length) throw new SearchProviderError("SEARCH_ZERO_RESULTS");
      return results;
    },
  };
}

/**
 * SearXNG — a self-hosted metasearch endpoint.
 *
 * It answers the same question as the two commercial APIs and returns the same three fields,
 * so it is a third implementation of one interface rather than a second architecture. What it
 * adds is breadth without a second vendor relationship: one request fans out across several
 * upstream engines, which is why the feature document wants it — "broad metasearch ... without
 * making Sylf dependent on a single provider".
 *
 * It is also the only provider whose *host* is deployment-supplied, so the URL is validated
 * here rather than trusted: an operator typo that produced a relative path or a `file:` URL
 * would otherwise become a request Sylf makes on a student's behalf. Only an absolute http(s)
 * origin is accepted, and the search path is appended to it rather than concatenated blindly.
 */
export function searxngSearch(baseUrl: string): SearchProvider {
  const origin = normaliseBase(baseUrl);
  return {
    id: "searxng",
    async search({ query, limit, signal }) {
      if (!origin) throw new SearchProviderError("SEARCH_UNAVAILABLE");
      const count = Math.min(limit, RESEARCH_BOUNDS.maxResultsPerQuery);
      const url = `${origin}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`;
      const payload = (await requestJson(url, { headers: { Accept: "application/json" } }, signal)) as {
        results?: Record<string, unknown>[];
      } | null;
      const results = toResults(payload?.results ?? [], "searxng", count, (entry) => ({
        url: entry.url,
        title: entry.title,
        // SearXNG calls the excerpt `content`; some deployments also echo `snippet`.
        snippet: entry.content ?? entry.snippet,
      }));
      if (!results.length) throw new SearchProviderError("SEARCH_ZERO_RESULTS");
      return results;
    },
  };
}

/** An absolute http(s) origin with no trailing slash, or `null` if it is not usable. */
function normaliseBase(baseUrl: string): string | null {
  try {
    const parsed = new URL(baseUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * A provider that falls back to a second one when the first cannot answer.
 *
 * The feature document asks for graceful degradation rather than a single point of failure,
 * and the failure this exists for is the ordinary one: a key that has hit its quota, an
 * upstream that is briefly down, a self-hosted SearXNG instance mid-restart. Those all arrive
 * as a `SearchProviderError` with a code, and the honest response is to ask the other provider
 * the same question rather than to fail the student's research.
 *
 * What it deliberately does **not** do is fall back on a *bad answer*. `SEARCH_ZERO_RESULTS`
 * is a real answer — the other provider would be asked the same question with the same
 * expected outcome, and a second attempt would spend quota to confirm nothing. Only the codes
 * that mean "this provider could not tell you" fall through.
 *
 * Results keep the `provider` id of whichever service actually returned them, so provenance
 * still names where a URL came from. The wrapper's own `id` is the primary's, which is what
 * configuration selects and what telemetry reports as the configured provider; when the
 * fallback answers, `CandidatePoolEntry.providers` shows both.
 */
export function fallbackSearchProvider(primary: SearchProvider, secondary: SearchProvider): SearchProvider {
  const fallbackCodes = new Set<SearchErrorCode>([
    "SEARCH_UNAVAILABLE",
    "SEARCH_UNAUTHORIZED",
    "SEARCH_RATE_LIMITED",
    "SEARCH_TIMEOUT",
    "SEARCH_BAD_RESPONSE",
  ]);
  return {
    id: primary.id,
    async search({ query, limit, signal }) {
      try {
        return await primary.search({ query, limit, signal });
      } catch (error) {
        if (error instanceof SearchProviderError && fallbackCodes.has(error.code)) {
          // The student's own cancellation is not a provider fault, and retrying it would
          // ignore the request to stop.
          if (signal?.aborted) throw error;
          return await secondary.search({ query, limit, signal });
        }
        throw error;
      }
    },
  };
}

/**
 * The configured provider, or `null` when Sylf has no search configured at all.
 *
 * `null` is deliberately not an error: "no search is configured" is a deployment fact
 * the research service reports as `RESEARCH_UNAVAILABLE` with a real explanation, and
 * it must never be confused with "search ran and found nothing".
 *
 * Selection order is unchanged for the two providers that already existed — an explicit
 * `SEARCH_PROVIDER` wins, then Brave, then Serper — with SearXNG added at both ends: it can be
 * named explicitly, and a configured `SEARXNG_URL` is used when no commercial key is present.
 * When more than one is available they are composed into a fallback chain rather than chosen
 * between, so a quota error degrades instead of failing.
 */
export function selectSearchProvider(env: Record<string, string | undefined> = process.env): SearchProvider | null {
  const explicit = env.SEARCH_PROVIDER?.trim().toLowerCase();
  const braveKey = env.BRAVE_SEARCH_API_KEY?.trim();
  const serperKey = env.SERPER_API_KEY?.trim();
  const searxngUrl = env.SEARXNG_URL?.trim();
  if (explicit && !(SEARCH_PROVIDERS as readonly string[]).includes(explicit)) return null;

  const searxng = searxngUrl ? searxngSearch(searxngUrl) : null;
  const brave = braveKey ? braveSearch(braveKey) : null;
  const serper = serperKey ? serperSearch(serperKey) : null;

  if (explicit === "serper") return withFallbacks(serper, [brave, searxng]);
  if (explicit === "brave") return withFallbacks(brave, [searxng, serper]);
  if (explicit === "searxng") return withFallbacks(searxng, [brave, serper]);
  // Prefer Brave when several are present: it is the provider we rank first for official
  // documents, and having two keys should not make behaviour depend on env order. SearXNG
  // comes last because it is the fallback we can host ourselves rather than a first choice.
  return withFallbacks(brave, [serper, searxng]) ?? withFallbacks(serper, [searxng]) ?? searxng;
}

/** Compose a chain from whichever providers are configured, or `null` if none are. */
function withFallbacks(primary: SearchProvider | null, rest: (SearchProvider | null)[]): SearchProvider | null {
  if (!primary) return null;
  const available = rest.filter((provider): provider is SearchProvider => provider !== null);
  return available.length
    ? available.reduce<SearchProvider>((chain, next) => fallbackSearchProvider(chain, next), primary)
    : primary;
}
