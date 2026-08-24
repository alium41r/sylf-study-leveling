// ============================================================
// Intent Matcher — semantic routing (confidence-based)
// ============================================================
// Pipeline:
//   normalize → reject-markers (advice/hypothetical → LLM)
//   → tokenize (stemmed) → tag each token as concept / stopword /
//     number / content-noise
//   → candidates = intents whose required concept groups are all
//     present (fuzzy) and whose excluded groups are absent
//   → content-noise check (unexplained words → lower confidence)
//   → scope extraction (independent of intent)
//   → rank candidates by example-similarity; require margin + threshold.
//
// The generalization comes from three SHARED resources — a large English
// stopword/discourse lexicon, suffix stemming + typo tolerance, and
// explicit advice/hypothetical reject markers — not from per-phrase rules.
// ============================================================

import { normalizeMessage } from "../message-intent";
import { GLUE_WORDS, PHRASES, WORD_SIGNALS, SIGNAL_GROUPS } from "./signals";
import { INTENTS, IntentDef, IntentParams, TimeScope } from "./registry";
import { STOPWORDS, REJECT_MARKERS, stem, fuzzyEquals } from "./vocabulary";

interface Token {
  text: string;
  stem: string;
  group?: string;
}

const NUM_RE = /^\d+(\.\d+)?$/;

// Stemmed concept indexes (built once at module load).
const WORD_CONCEPT_STEMS: Record<string, string> = {};
const PHRASE_CONCEPT_STEMS: Array<{ words: string[]; group: string }> = [];
{
  for (const group of SIGNAL_GROUPS) {
    for (const term of group.terms) {
      const parts = term.split(" ").map(stem);
      if (parts.length === 1) {
        WORD_CONCEPT_STEMS[parts[0]] = group.id;
      } else {
        PHRASE_CONCEPT_STEMS.push({ words: parts, group: group.id });
      }
    }
  }
  PHRASE_CONCEPT_STEMS.sort((a, b) => b.words.length - a.words.length);
}

function matchWordConcept(stemWord: string): string | undefined {
  if (WORD_CONCEPT_STEMS[stemWord]) return WORD_CONCEPT_STEMS[stemWord];
  for (const [stemKey, group] of Object.entries(WORD_CONCEPT_STEMS)) {
    if (fuzzyEquals(stemWord, stemKey)) return group;
  }
  return undefined;
}

function tokenize(normalized: string): Token[] {
  const raw = normalized.split(" ").filter(Boolean);
  const stems = raw.map(stem);
  const tokens: Token[] = [];
  let i = 0;

  while (i < raw.length) {
    let matched = false;
    for (const p of PHRASE_CONCEPT_STEMS) {
      const windowStems = stems.slice(i, i + p.words.length);
      if (windowStems.length === p.words.length && windowStems.every((s, k) => s === p.words[k])) {
        tokens.push({ text: raw.slice(i, i + p.words.length).join(" "), stem: windowStems.join(" "), group: p.group });
        i += p.words.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const word = raw[i];
    const stemWord = stems[i];
    const group = matchWordConcept(stemWord);
    tokens.push({ text: word, stem: stemWord, group });
    i += 1;
  }

  return tokens;
}

/** Character trigram set for a short similarity signal. */
function trigrams(s: string): Set<string> {
  const t = new Set<string>();
  const padded = `  ${s}  `;
  for (let i = 0; i + 3 <= padded.length; i++) t.add(padded.slice(i, i + 3));
  return t;
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / Math.sqrt(ta.size * tb.size);
}

const SCOPE_FROM_GROUP: Partial<Record<string, TimeScope>> = {
  TIME_TODAY: "today",
  TIME_YESTERDAY: "yesterday",
  TIME_TOMORROW: "tomorrow",
  TIME_WEEK: "this_week",
  TIME_MONTH: "this_month",
  TOTAL: "total",
};

export interface IntentMatch {
  intent: IntentDef;
  params: IntentParams;
  confidence: number;
}

export function matchIntent(raw: string): IntentMatch | null {
  const normalized = normalizeMessage(raw);
  if (!normalized || normalized.length > 120) return null;

  // Advice / hypothetical / meta → never a plain deterministic lookup.
  for (const marker of REJECT_MARKERS) {
    if (normalized.includes(marker)) return null;
  }

  const tokens = tokenize(normalized);
  if (tokens.length === 0) return null;

  const present = new Set<string>();
  for (const t of tokens) if (t.group) present.add(t.group);

  const noise = tokens.filter(
    (t) => !t.group && !STOPWORDS.has(t.text) && !GLUE_WORDS.has(t.text) && !NUM_RE.test(t.text)
  );

  // Unexplained content words make a data lookup unreliable → LLM.
  // (Filler was already neutralized by STOPWORDS/GLUE during tokenize.)
  if (noise.length > 0) return null;

  const scopeSignals = [
    "TIME_TODAY", "TIME_YESTERDAY", "TIME_TOMORROW", "TIME_WEEK", "TIME_MONTH", "TOTAL",
  ].filter((s) => present.has(s));

  const candidates: IntentDef[] = [];
  for (const intent of INTENTS) {
    if (!intent.requires.every((r) => present.has(r))) continue;
    if (intent.excludes.some((e) => present.has(e))) continue;

    // Scope validity (independent of intent recognition).
    let timeScope: TimeScope | null = intent.defaultScope;
    if (scopeSignals.length > 1) continue; // competing scopes → ambiguous
    if (scopeSignals.length === 1) {
      const s = SCOPE_FROM_GROUP[scopeSignals[0]];
      if (s) {
        if (intent.allowedScopes.length === 0) {
          if (intent.neutralScopes?.includes(s)) timeScope = intent.defaultScope;
          else continue;
        } else {
          if (!intent.allowedScopes.includes(s)) continue;
          timeScope = s;
        }
      }
    }
    (intent as any).__scope = timeScope;
    candidates.push(intent);
  }

  if (candidates.length === 0) return null;

  // Rank by example similarity; a clear margin avoids mis-routing when two
  // intents share a concept (e.g. XP vs XP-to-next).
  const scored = candidates
    .map((intent) => {
      let best = 0;
      for (const ex of intent.examples) {
        best = Math.max(best, similarity(normalized, normalizeMessage(ex)));
      }
      const matchedCount = intent.requires.filter((r) => present.has(r)).length;
      return { intent, score: best + matchedCount * 0.05 };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (scored.length > 1) {
    const margin = top.score - scored[1].score;
    if (margin < 0.08) return null; // too close to call → LLM
  }

  const intent = top.intent;
  const coverage = intent.requires.filter((r) => present.has(r)).length / intent.requires.length;
  const confidence = Math.min(1, 0.72 + coverage * 0.2 + Math.min(0.1, top.score * 0.1));
  if (confidence < 0.6) return null;

  return {
    intent,
    params: { stat: intent.requires[0], timeScope: (intent as any).__scope ?? intent.defaultScope },
    confidence,
  };
}
