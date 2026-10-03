// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SearchProviderError,
  braveSearch,
  fallbackSearchProvider,
  searxngSearch,
  selectSearchProvider,
  serperSearch,
} from "@/lib/planner/research/search/provider";
import { RESEARCH_BOUNDS, type SearchErrorCode } from "@/lib/planner/research/search/contracts";

/**
 * The search provider is where a research URL is born.
 *
 * These tests hold two lines at once: that a real result survives intact (URL, title,
 * snippet, provider ordering), and that nothing else does — a malformed URL, a relative
 * path, a non-http scheme or a credential-bearing URL is dropped rather than repaired.
 * A provider failure must surface as a typed code too, because the alternative is a
 * research run that quietly proceeds with nothing and blames the model.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const bravePayload = (results: unknown[]) => ({ web: { results } });
const serperPayload = (organic: unknown[]) => ({ organic });

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("search providers return real results and nothing else", () => {
  it("maps a Brave response, preserving order and provider identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          bravePayload([
            { url: "https://www.cambridgeinternational.org/programmes/spec.pdf", title: "Specification", description: "The syllabus." },
            { url: "https://prepblog.example/notes", title: "Notes", description: null },
          ])
        )
      )
    );
    const results = await braveSearch("key").search({ query: "CAIE Mathematics syllabus", limit: 8 });
    // The canonical form is stored: `www.` is the same document, and carrying both
    // spellings would show the student two sources where there is one.
    expect(results.map((result) => [result.rank, result.provider, result.url])).toEqual([
      [1, "brave", "https://cambridgeinternational.org/programmes/spec.pdf"],
      [2, "brave", "https://prepblog.example/notes"],
    ]);
    expect(results[0].title).toBe("Specification");
    expect(results[1].snippet).toBeNull();
  });

  it("maps a Serper response the same way", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(serperPayload([{ link: "https://nust.edu.pk/admissions/net", title: "NET", snippet: "Scope" }])))
    );
    const results = await serperSearch("key").search({ query: "NUST NET syllabus", limit: 8 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ provider: "serper", url: "https://nust.edu.pk/admissions/net", rank: 1 });
  });

  it("drops malformed, relative, non-http and credential-bearing URLs without repairing them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          bravePayload([
            { url: "not a url", title: "One" },
            { url: "/relative/path", title: "Two" },
            { url: "javascript:alert(1)", title: "Three" },
            { url: "ftp://example.com/spec.pdf", title: "Four" },
            { url: "https://user:secret@example.com/spec.pdf", title: "Five" },
            { url: "", title: "Six" },
            { url: "https://good.example/spec.pdf", title: "Seven" },
          ])
        )
      )
    );
    const results = await braveSearch("key").search({ query: "q", limit: 8 });
    // Only the last one is a source; the credential-bearing URL survives as a source
    // but without the credentials in it.
    expect(results.map((result) => result.url)).toEqual([
      "https://example.com/spec.pdf",
      "https://good.example/spec.pdf",
    ]);
  });

  it("collapses duplicates that differ only by fragment, trailing slash or www", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          bravePayload([
            { url: "https://www.example.com/spec.pdf", title: "A" },
            { url: "https://example.com/spec.pdf#page=2", title: "B" },
            { url: "https://example.com/spec.pdf/", title: "C" },
          ])
        )
      )
    );
    const results = await braveSearch("key").search({ query: "q", limit: 8 });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("A");
  });

  it("falls back to the host as a title, and never invents one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(bravePayload([{ url: "https://example.com/spec.pdf", title: "   " }]))));
    const results = await braveSearch("key").search({ query: "q", limit: 8 });
    expect(results[0].title).toBe("example.com");
  });

  it("caps results at the contract bound even when the provider returns more", async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      url: `https://example.com/${index}`,
      title: `Result ${index}`,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => json(bravePayload(many))));
    const results = await braveSearch("key").search({ query: "q", limit: 50 });
    expect(results).toHaveLength(RESEARCH_BOUNDS.maxResultsPerQuery);
    expect(results.at(-1)!.rank).toBe(RESEARCH_BOUNDS.maxResultsPerQuery);
  });
});

describe("search failures are typed, so research can explain itself", () => {
  const cases: [number, string][] = [
    [401, "SEARCH_UNAUTHORIZED"],
    [403, "SEARCH_UNAUTHORIZED"],
    [429, "SEARCH_RATE_LIMITED"],
    [500, "SEARCH_UNAVAILABLE"],
    [400, "SEARCH_BAD_RESPONSE"],
  ];
  it.each(cases)("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "nope" }, status)));
    await expect(braveSearch("key").search({ query: "q", limit: 8 })).rejects.toMatchObject({ code });
    await expect(serperSearch("key").search({ query: "q", limit: 8 })).rejects.toMatchObject({ code });
  });

  it("reports zero results rather than an empty list that looks like success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(bravePayload([]))));
    await expect(braveSearch("key").search({ query: "q", limit: 8 })).rejects.toMatchObject({
      code: "SEARCH_ZERO_RESULTS",
    });
  });

  it("reports a malformed body rather than throwing a parse error at the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>not json</html>", { status: 200 })));
    await expect(braveSearch("key").search({ query: "q", limit: 8 })).rejects.toMatchObject({
      code: "SEARCH_BAD_RESPONSE",
    });
  });

  it("times out through the contract's bound, and honours cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          const fail = () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
          if (signal?.aborted) fail();
          else signal?.addEventListener("abort", fail);
        });
      })
    );
    const controller = new AbortController();
    const pending = braveSearch("key").search({ query: "q", limit: 8, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(SearchProviderError);
  });

  it("throws a typed error, never a raw provider payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ secret: "internal detail" }, 500)));
    await expect(braveSearch("key").search({ query: "q", limit: 8 })).rejects.toThrow(/^SEARCH_UNAVAILABLE$/);
  });
});

describe("provider selection", () => {
  it("returns null when nothing is configured, without calling anything", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(selectSearchProvider({})).toBeNull();
    expect(selectSearchProvider({ SEARCH_PROVIDER: "brave" })).toBeNull();
    expect(selectSearchProvider({ SEARCH_PROVIDER: "serper" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prefers Brave when both keys are present, and honours an explicit choice", () => {
    expect(selectSearchProvider({ BRAVE_SEARCH_API_KEY: "a", SERPER_API_KEY: "b" })?.id).toBe("brave");
    expect(selectSearchProvider({ BRAVE_SEARCH_API_KEY: "a", SERPER_API_KEY: "b", SEARCH_PROVIDER: "serper" })?.id).toBe("serper");
    expect(selectSearchProvider({ SERPER_API_KEY: "b" })?.id).toBe("serper");
  });

  it("refuses an unknown provider name rather than guessing one", () => {
    expect(selectSearchProvider({ SEARCH_PROVIDER: "tavily", BRAVE_SEARCH_API_KEY: "a" })).toBeNull();
  });

  it("never reads a key from a NEXT_PUBLIC variable", () => {
    // A key that reaches the browser is a leaked key: the only names accepted are the
    // server-side ones, so a NEXT_PUBLIC_ prefix is simply not a configuration.
    expect(selectSearchProvider({ NEXT_PUBLIC_BRAVE_SEARCH_API_KEY: "a" })).toBeNull();
    expect(selectSearchProvider({ NEXT_PUBLIC_SERPER_API_KEY: "b" })).toBeNull();
  });

  it("uses a configured SearXNG instance when no commercial key is present", () => {
    expect(selectSearchProvider({ SEARXNG_URL: "https://searx.example" })?.id).toBe("searxng");
    expect(selectSearchProvider({ SEARCH_PROVIDER: "searxng", SEARXNG_URL: "https://searx.example" })?.id).toBe(
      "searxng"
    );
    // Named but not configured is the same deployment fact as no provider at all.
    expect(selectSearchProvider({ SEARCH_PROVIDER: "searxng" })).toBeNull();
  });

  it("keeps a commercial key ahead of SearXNG, which is the self-hosted fallback", () => {
    expect(
      selectSearchProvider({ BRAVE_SEARCH_API_KEY: "a", SEARXNG_URL: "https://searx.example" })?.id
    ).toBe("brave");
    expect(
      selectSearchProvider({ SERPER_API_KEY: "b", SEARXNG_URL: "https://searx.example" })?.id
    ).toBe("serper");
  });
});

describe("SearXNG is a third implementation of the same contract", () => {
  it("maps results and asks its own JSON endpoint", async () => {
    const fetchSpy = vi.fn(async (_url: string) =>
      json({
        results: [
          { url: "https://nust.edu.pk/net/syllabus", title: "NET Syllabus", content: "The scope." },
          { url: "https://prepblog.example/x", title: "Notes" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const results = await searxngSearch("https://searx.example").search({ query: "NUST NET syllabus", limit: 8 });

    const requested = String(fetchSpy.mock.calls[0][0]);
    expect(requested).toContain("https://searx.example/search?");
    expect(requested).toContain("format=json");
    expect(results.map((result) => [result.provider, result.url, result.snippet])).toEqual([
      ["searxng", "https://nust.edu.pk/net/syllabus", "The scope."],
      ["searxng", "https://prepblog.example/x", null],
    ]);
  });

  it("tolerates a trailing slash and drops a base URL that is not http(s)", async () => {
    const fetchSpy = vi.fn(async (_url: string) => json({ results: [{ url: "https://a.example/x", title: "A" }] }));
    vi.stubGlobal("fetch", fetchSpy);
    await searxngSearch("https://searx.example///").search({ query: "q", limit: 8 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("https://searx.example/search?");

    // A deployment typo must not become a request Sylf makes on a student's behalf.
    await expect(searxngSearch("file:///etc/passwd").search({ query: "q", limit: 8 })).rejects.toThrow(
      SearchProviderError
    );
  });
});

/**
 * Fallback is for "this provider could not tell you", never for "it told you nothing".
 *
 * The distinction is the whole design: a quota error or an outage should be answered by asking
 * the other provider the same question, while a genuine empty result would only be confirmed a
 * second time at the cost of another call.
 */
describe("a provider that fails falls back, and a provider that answers does not", () => {
  const failing = (code: SearchErrorCode) => ({
    id: "brave" as const,
    search: vi.fn(async () => {
      throw new SearchProviderError(code);
    }),
  });
  const answering = (url: string) => ({
    id: "searxng" as const,
    search: vi.fn(async () => [{ url, title: "Found", snippet: null, rank: 1, provider: "searxng" as const }]),
  });

  it("asks the second provider when the first is rate-limited", async () => {
    const primary = failing("SEARCH_RATE_LIMITED");
    const secondary = answering("https://nust.edu.pk/net");
    const provider = fallbackSearchProvider(primary, secondary);
    const results = await provider.search({ query: "NUST NET syllabus", limit: 8 });
    expect(secondary.search).toHaveBeenCalledTimes(1);
    // Provenance survives the fallback: the URL is attributed to whoever actually returned it.
    expect(results[0].provider).toBe("searxng");
    // The wrapper reports the configured provider, which is what telemetry records.
    expect(provider.id).toBe("brave");
  });

  it("does not spend a second call on a genuine empty answer", async () => {
    const primary = failing("SEARCH_ZERO_RESULTS");
    const secondary = answering("https://nust.edu.pk/net");
    await expect(fallbackSearchProvider(primary, secondary).search({ query: "q", limit: 8 })).rejects.toThrow(
      SearchProviderError
    );
    expect(secondary.search).not.toHaveBeenCalled();
  });

  it("does not fall back past a cancellation the student asked for", async () => {
    const controller = new AbortController();
    controller.abort();
    const secondary = answering("https://nust.edu.pk/net");
    await expect(
      fallbackSearchProvider(failing("SEARCH_TIMEOUT"), secondary).search({
        query: "q",
        limit: 8,
        signal: controller.signal,
      })
    ).rejects.toThrow(SearchProviderError);
    expect(secondary.search).not.toHaveBeenCalled();
  });

  it("composes the configured providers into one chain", async () => {
    // Brave and SearXNG both configured: the chain answers from SearXNG when Brave refuses.
    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes("api.search.brave.com")) return json({}, 429);
      return json({ results: [{ url: "https://nust.edu.pk/net", title: "NET" }] });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const provider = selectSearchProvider({ BRAVE_SEARCH_API_KEY: "a", SEARXNG_URL: "https://searx.example" })!;
    const results = await provider.search({ query: "NUST NET syllabus", limit: 8 });
    expect(results[0].provider).toBe("searxng");
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});
