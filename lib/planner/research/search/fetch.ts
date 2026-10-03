import "server-only";
import { lookup } from "node:dns/promises";
import { FETCH_ERROR_CODES, RESEARCH_BOUNDS, type FetchErrorCode } from "./contracts";
import { extractPdfText } from "@/lib/planner/import/pdf";

/**
 * Bounded, fail-closed retrieval of one public source.
 *
 * This exists because a syllabus snippet is usually not enough to read structure from,
 * and it is written as a squat rather than a door: every rule below narrows what can be
 * reached, none of them widens it. The threat is a URL that came from a search result —
 * which is attacker-influenced input — being used to make our server issue a request to
 * something it should not touch.
 *
 * There is deliberately no way to use this as a general fetch proxy: it accepts one
 * absolute http(s) URL, resolves it itself, re-checks every redirect, and returns text
 * only for a page or a PDF.
 */

export class FetchError extends Error {
  /**
   * `requests` is how many HTTP requests this attempt actually made.
   *
   * A redirect hop is a request but not a source, and Phase 4.1's report could not tell the
   * two apart: eleven fetch calls looked like eleven sources. The counter travels with the
   * error as well as the success so a *failed* attempt is accounted for too — otherwise a
   * run that tried eight unreadable pages would report no network work at all.
   */
  constructor(public code: FetchErrorCode, public requests = 1) {
    super(code);
    this.name = "FetchError";
  }
}

/** Non-routable, loopback, link-local and metadata address space. */
export function isBlockedAddress(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  // IPv4-mapped IPv6 (`::ffff:127.0.0.1`) must be judged as its IPv4 form, or the
  // obvious bypass works: the same address, spelled differently.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  const v4 = mapped ? mapped[1] : value;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // unique local
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb"))
    return true; // link-local
  if (value.startsWith("ff")) return true; // multicast
  return false;
}

/** Hostnames that are never a public source, whatever DNS says about them. */
export function isBlockedHostname(host: string): boolean {
  const value = host.trim().toLowerCase().replace(/\.$/, "");
  if (!value) return true;
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  if (value.endsWith(".local") || value.endsWith(".internal") || value.endsWith(".home.arpa")) return true;
  // A bare label (`intranet`, `metadata`) is a hostname only the local resolver knows.
  if (!value.includes(".")) return true;
  return false;
}

const DOCUMENT_MIME = ["text/html", "text/plain", "application/xhtml+xml", "application/pdf"] as const;

/** Parse and vet one URL. Throws rather than returning a repaired value. */
function vet(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError("FETCH_BLOCKED_SCHEME");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new FetchError("FETCH_BLOCKED_SCHEME");
  if (parsed.username || parsed.password) throw new FetchError("FETCH_BLOCKED_CREDENTIALS");
  if (isBlockedHostname(parsed.hostname)) throw new FetchError("FETCH_BLOCKED_HOST");
  return parsed;
}

/**
 * Resolve the host and refuse if any answer is non-routable.
 *
 * The honest limitation: we validate the addresses DNS returns *us*, then connect by
 * hostname, so a resolver that answers differently for the two lookups could still
 * point the connection somewhere else (DNS rebinding). Closing that properly means
 * pinning the connection to the validated address — an undici agent with a custom
 * lookup — which is deliberately out of scope here; runtimes in this deployment resolve
 * once per request. What is closed here is the whole obvious class: literal private
 * hosts, `localhost`, bare hostnames, and every private range including the metadata
 * endpoint.
 */
async function assertRoutable(host: string): Promise<void> {
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new FetchError("FETCH_FAILED");
  }
  if (!addresses.length) throw new FetchError("FETCH_FAILED");
  for (const entry of addresses) if (isBlockedAddress(entry.address)) throw new FetchError("FETCH_BLOCKED_PRIVATE");
}

/** Strip boilerplate, keep the structure a syllabus is made of. */
export function htmlToText(html: string): string {
  const withoutHead = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const structured = withoutHead
    // Headings and list items carry the outline, so they become markdown rather than
    // plain text: the extraction step reads structure, and losing it here would.
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_all, level: string, body: string) => `\n${"#".repeat(Number(level))} ${body}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_all, body: string) => `\n- ${body}\n`)
    .replace(/<\/(p|div|tr|table|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(structured)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (all, name: string) => named[name.toLowerCase()] ?? all);
}

const safeCodePoint = (code: number): string => {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
};

/** Read a response body with a hard byte ceiling, aborting the moment it is passed. */
async function readBounded(response: Response, signal: AbortSignal): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    if (signal.aborted) throw new FetchError("FETCH_CANCELLED");
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > RESEARCH_BOUNDS.maxFetchBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FetchError("FETCH_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated: false };
}

export interface FetchedSource {
  /** The URL actually retrieved, after every redirect was validated. */
  finalUrl: string;
  contentType: string;
  text: string;
  partial: boolean;
  partialReason: string | null;
  bytes: number;
  /** HTTP requests made to reach it, redirects included. One source, possibly many requests. */
  requests: number;
}

export async function fetchSource(
  url: string,
  options: { signal?: AbortSignal } = {}
): Promise<FetchedSource> {
  const timeout = AbortSignal.timeout(RESEARCH_BOUNDS.fetchTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let current = vet(url);
  /**
   * Requests made so far, carried onto whichever outcome this attempt reaches.
   *
   * Counted here because it is the only place that knows: the redirect loop below issues one
   * request per hop, and a caller sees one `fetchSource` call either way.
   */
  let requests = 0;

  for (let hop = 0; hop <= RESEARCH_BOUNDS.maxRedirects; hop += 1) {
    await assertRoutable(current.hostname);
    requests += 1;
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: {
          // Identify ourselves honestly; do not pretend to be a browser.
          "User-Agent": "SylfPlanner/1.0 (+https://sylf.app; syllabus research)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9",
        },
      });
    } catch (error) {
      if (options.signal?.aborted) throw new FetchError("FETCH_CANCELLED", requests);
      if (error instanceof Error && error.name === "TimeoutError") throw new FetchError("FETCH_TIMEOUT", requests);
      throw new FetchError("FETCH_FAILED", requests);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new FetchError("FETCH_BLOCKED_REDIRECT", requests);
      // A redirect is a *new* URL from an untrusted source, so it goes through exactly
      // the same vetting as the original — including the private-range check.
      current = vet(new URL(location, current).toString());
      if (hop === RESEARCH_BOUNDS.maxRedirects) throw new FetchError("FETCH_TOO_MANY_REDIRECTS", requests);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new FetchError("FETCH_FAILED", requests);
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(DOCUMENT_MIME as readonly string[]).includes(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      throw new FetchError("FETCH_UNSUPPORTED_TYPE", requests);
    }

    const { bytes } = await readBounded(response, signal);

    if (contentType === "application/pdf") {
      const extraction = await extractPdfText(Buffer.from(bytes));
      return {
        finalUrl: current.toString(),
        contentType,
        text: extraction.text.slice(0, RESEARCH_BOUNDS.maxSourceChars),
        partial: extraction.partial || extraction.text.length > RESEARCH_BOUNDS.maxSourceChars,
        partialReason: extraction.partialReason ?? (extraction.text.length > RESEARCH_BOUNDS.maxSourceChars ? "TEXT_LIMIT" : null),
        bytes: bytes.byteLength,
        requests,
      };
    }

    const raw = new TextDecoder("utf-8").decode(bytes);
    const text = (contentType === "text/plain" ? raw : htmlToText(raw)).slice(0, RESEARCH_BOUNDS.maxSourceChars);
    const truncated = text.length >= RESEARCH_BOUNDS.maxSourceChars;
    return {
      finalUrl: current.toString(),
      contentType,
      text,
      partial: truncated,
      partialReason: truncated ? "TEXT_LIMIT" : null,
      bytes: bytes.byteLength,
      requests,
    };
  }
  throw new FetchError("FETCH_TOO_MANY_REDIRECTS", requests);
}

export { FETCH_ERROR_CODES };
