// ============================================================
// Intent Vocabulary — shared lexicons + lightweight NLP
// ============================================================
// Three bounded, SHARED resources (not per-intent synonym sprawl):
//   STOPWORDS   — English function words + conversational filler. These
//                 carry no intent and are ignored during matching.
//   REJECT_MARKERS — advice / hypothetical / meta phrases that mean the
//                 message is NOT a deterministic data lookup (→ LLM).
//   stem()/fuzzy() — suffix stripping + edit-distance tolerance so
//                 "studied/studying", typos and plurals all normalize.
// Concept synonyms live per-intent in signals.ts (small, audited sets).
// ============================================================

export function stem(word: string): string {
  if (word.length <= 3) return word;
  let w = word;
  if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.endsWith("edly")) w = w.slice(0, -4);
  else if (w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.endsWith("ly")) w = w.slice(0, -2);
  else if (w.endsWith("es")) w = w.slice(0, -2);
  else if (w.endsWith("s")) w = w.slice(0, -1);
  return w || word;
}

/** Edit distance (Levenshtein) — bounded for tiny strings. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** True when two stems match exactly or within a small typo tolerance. */
export function fuzzyEquals(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false;
  return editDistance(a, b) <= 1;
}

/**
 * English function words + conversational filler. Anything here is ignored
 * during matching; anything NOT here, not a concept word, and not a number
 * is "content noise" (which lowers confidence → escalation).
 */
export const STOPWORDS = new Set(
  (
    "a an the my mine me i you your yours it its we us our he she they them him her this that these those " +
    "am is are was were be been being do did does have has had having get got getting " +
    "can could would will may might must " +
    "how what when where which who whose " +
    "much many more most less few some any all " +
    "on in at of for to from with by and or but if then than as " +
    "just curious wondering kinda sorta like actually basically literally honestly really very so such too quite rather " +
    "please thanks thank anyway anyways also oh wait look looking tell telling show showing " +
    "know knowing knew known remind reminding say says said saying " +
    "currently right up down out about into onto over under here there " +
    "still already yet again once even ever never always " +
    "let us see check checking going go give giving " +
    "my bad sorry hey yo hi hello ok okay well um uh hmm " +
    "per every each terms as if is are was were "
  ).split(/\s+/)
);

/**
 * Advice / hypothetical / meta markers. A message containing any of these
 * is NOT a plain data lookup — route it to the LLM even if it also mentions
 * a concept (e.g. "what level should i aim for").
 */
export const REJECT_MARKERS = [
  "should i", "should my", "what should", "how should", "should be",
  "could you recommend", "can you recommend", "recommend", "advice", "advise",
  "do you think", "what do you think", "you think", "your opinion", "opinion",
  "help me", "plan my", "plan for", "make a plan", "schedule my", "organize",
  "why", "explain", "how come", "what does it mean", "what do you mean",
  "am i doing", "how am i", "am i on track", "am i struggling", "am i falling behind",
  "improve", "productivity", "compare", "versus", " vs ", "which is better",
  "am i studying enough", "studying enough", "enough?",
  "what level should", "level can i reach", "what level do you think", "level should i",
  "how much xp should", "xp should i",
  "what should i study", "what to study", "what should i do", "what do i do",
];
