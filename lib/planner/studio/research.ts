import "server-only";
// Research for the Planning Studio, used only when the model says it is not sure of a course: one web search, a few pages read, and their text handed
// back to the model to map the syllabus from. It reuses the Planner's research stack: `selectSearchProvider` (DeepSeek Search first, then Brave,
// Serper or SearXNG, whichever keys the deployment holds) is the only place a URL can come from, and `fetchSource` reads pages with its address,
// redirect, size and PDF rules. Page text is data for the model, never instructions; the model is never told it can browse.
import { selectSearchProvider } from "@/lib/planner/research/search/provider";
import { fetchSource } from "@/lib/planner/research/search/fetch";
import type { SearchResult } from "@/lib/planner/research/search/contracts";

export interface FoundSource { title: string; url: string; text: string }

/** Research is on unless switched off, and only where a search provider is configured. */
export function researchAvailable(): boolean {
  if ((process.env.SYLF_PLANNING_STUDIO_RESEARCH ?? "on").trim().toLowerCase() === "off") return false;
  return Boolean(selectSearchProvider(process.env, { preferDeepSeek: true }));
}

/** Official and educational hosts first, then documents (syllabus PDFs), then everything else in the provider's order. */
function score(result: SearchResult): number {
  let host = "";
  try { host = new URL(result.url).hostname.toLowerCase(); } catch { return -100; }
  let points = -result.rank;
  if (/\.(edu|gov|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2})$/.test(host) || /\.ac\.|\.edu\./.test(host)) points += 12;
  if (/(cambridgeinternational|cambridgeassessment|collegeboard|apcentral|pearson|qualifications\.pearson|aqa|ocr|ibo|wjec|sqa|ncert|cbse|cisce|knec|waec|neco|nesa|vcaa|ncea|nzqa|scaa|fbise|ibcc|kmk|ib\b)/.test(host)) points += 15;
  if (/syllabus|specification|curriculum|module|course|outline|contents/i.test(`${result.title} ${result.url}`)) points += 5;
  if (/\.pdf($|\?)/i.test(result.url)) points += 3;
  if (/(youtube|facebook|instagram|tiktok|pinterest|reddit|quora)\./.test(host)) points -= 20;
  return points;
}

/**
 * Searches once and reads up to three pages. Bounded to about twenty seconds and 18,000 characters of text, and never throws: no sources is an
 * answer the caller handles by keeping the model's own list.
 */
export async function findSources(query: string, signal?: AbortSignal): Promise<FoundSource[]> {
  const provider = selectSearchProvider(process.env, { preferDeepSeek: true });
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!provider || q.length < 4) return [];
  const deadline = AbortSignal.timeout(20_000);
  const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let results: SearchResult[];
  try { results = await provider.search({ query: q, limit: 8, signal: bounded }); } catch { return []; }
  const seen = new Set<string>();
  const ranked = [...results].sort((a, b) => score(b) - score(a)).filter((r) => {
    let host = "";
    try { host = new URL(r.url).hostname; } catch { return false; }
    if (seen.has(host)) return false;
    seen.add(host);
    return score(r) > -50;
  });
  const read = await Promise.all(ranked.slice(0, 3).map(async (r) => {
    try {
      const page = await fetchSource(r.url, { signal: bounded, extractText: true });
      const text = page.text.replace(/\s+/g, " ").trim();
      return { title: r.title, url: r.url, text: text.length > 200 ? text.slice(0, 6_000) : (r.snippet ?? "") };
    } catch {
      return { title: r.title, url: r.url, text: r.snippet ?? "" };
    }
  }));
  const rest = ranked.slice(3, 6).filter((r) => r.snippet).map((r) => ({ title: r.title, url: r.url, text: r.snippet! }));
  return [...read, ...rest].filter((s) => s.text.trim().length > 40);
}

/** Sources as the model reads them: numbered, titled, and inside the data tags the prompt treats as untrusted. */
export function sourcesForPrompt(sources: FoundSource[]): string {
  return sources.map((s, i) => `[S${i + 1}] ${s.title.slice(0, 120)} (${(() => { try { return new URL(s.url).hostname; } catch { return "web"; } })()})\n${s.text}`).join("\n\n").slice(0, 11_500);
}
