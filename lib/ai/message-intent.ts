// ============================================================
// Message Intent Normalizer — the shared canonical view of a
// user utterance. Used by the intent matcher, the deterministic
// responder and the workload classifier.
//
// Pipeline: lowercase → punctuation/apostrophes → contractions →
// abbreviation expansion → polite/greeting lead-ins → question-form
// canonicalization ("what level am i" → "my level").
//
// Deliberately conservative: never changes meaning, never strips
// "what/whats" (part of the query), and never removes words that
// could carry intent (e.g. "doing", "why") — those are left intact
// so the matcher can reject them and escalate to the LLM.
// ============================================================

/**
 * Canonical form: lowercase, punctuation/apostrophes removed,
 * contractions/abbreviations expanded, fillers and polite lead-ins
 * stripped, and common question constructions collapsed to
 * "my <subject>" statements.
 */
export function normalizeMessage(raw: string): string {
  let m = raw
    .toLowerCase()
    .replace(/'/g, "") // remove apostrophes BEFORE punctuation so "what's" → "whats" → "what is"
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Contractions & abbreviations (incl. common texting shorthand)
  const REPLACEMENTS: Array<[RegExp, string]> = [
    [/\bim\b/g, "i am"],
    [/\bive\b/g, "i have"],
    [/\byoure\b/g, "you are"],
    [/\bwhats\b/g, "what is"],
    [/\bhows\b/g, "how is"],
    [/\bwheres\b/g, "where is"],
    [/\bthats\b/g, "that is"],
    [/\bdont\b/g, "do not"],
    [/\bcant\b/g, "can not"],
    [/\blvl\b/g, "level"],
    [/\bmins\b/g, "minutes"],
    [/\bhrs\b/g, "hours"],
    [/\bsecs\b/g, "seconds"],
    [/\btmrw\b/g, "tomorrow"],
    [/\btmr\b/g, "tomorrow"],
    [/\btmw\b/g, "tomorrow"],
    [/\brn\b/g, "right now"],
    [/\bpls\b/g, "please"],
    [/\bplz\b/g, "please"],
    [/\bjus\b/g, "just"],
    [/\btodays\b/g, "today"],
    [/\bid\b/g, "i would"],
  ];
  for (const [re, rep] of REPLACEMENTS) m = m.replace(re, rep);

  // Polite / conversational lead-ins (prefix loop, like the old PREAMBLES,
  // extended with natural conversation openers).
  const LEAD_INS = [
    /^(hi|hey|hello|yo|hiya|howdy|sup|good (morning|afternoon|evening))\b[ ,.!]*/,
    /^(um|uh|hmm|well|okay|ok|right)\b[ ,.!]*/,
    /^so\b(?!\s*far)[ ,.!]*/,
    /^(please|kindly|just)\b[ ,.!]*/,
    /^(can you|could you|would you|can u|could u|will you|do you know|i was wondering|i am wondering|i want to know|i need to know|i would like to know|may i know|can i know|is it possible to|please tell me|tell me please|please let me know|let me know|tell me|show me)\b[ ,.!]*/,
    /^(hey there|hey|bro|dude|man|yo)\b[ ,.!]*/,
  ];
  let prev: string;
  for (let i = 0; i < 6; i++) {
    prev = m;
    for (const lead of LEAD_INS) {
      const stripped = m.replace(lead, "").replace(/[ ,.!]+/g, " ").trim();
      if (stripped && stripped !== m) m = stripped;
    }
    if (m === prev) break;
  }

  // Question-form canonicalization → "my <subject>" statements so every
  // phrasing of the same request collapses to the same token sequence.
  const CANONICAL: Array<[RegExp, string]> = [
    [/\bwhats?\s+(?:is\s+)?my\b/g, "my"],
    [/\bwhat\s+(?:are\s+)?my\b/g, "my"],
    [/\bwhat\s+(\w+)\s+(?:do|did)\s+i\s+have\b/g, "my $1"],
    [/\bwhat\s+(\w+)\s+(?:do|did)\s+i\s+(?:have\s+)?(?:got|get)\b/g, "my $1"],
    [/\bwhat\s+(\w+)\s+am\s+i\b/g, "my $1"],
    [/\bwhich\s+(\w+)\s+am\s+i\s+(?:on|at|in)\b/g, "my $1"],
    [/\bhow\s+is\s+my\b/g, "my"],
    [/\bhow\s+much\s+(\w+)\s+(?:do|did)\s+i\s+have\b/g, "my $1"],
    [/\bhow\s+many\s+(\w+)\s+(?:do|did)\s+i\s+have\b/g, "my $1"],
    [/\bhow\s+(?:long|much)\s+(?:have|did|has)\s+i\s+(\w+)\b/g, "my $1"],
    [/\bwhat\s+do\s+i\s+have\b/g, "my quests"],
    [/\bwhat\s+have\s+i\s+(?:got|get)\b/g, "my quests"],
    [/\bdo\s+i\s+have\s+(?:any\s+)?(quests?|tasks?|missions?|goals?|objectives?|subjects?|sylphs?|xp|hp)\b/g, "my $1"],
    [/\bwhats?\s+(?:going\s+)?on\s+my\b/g, "my"],
    [/\btell\s+me\s+about\s+my\b/g, "my"],
  ];
  for (const [re, rep] of CANONICAL) m = m.replace(re, rep);

  return m.replace(/\s+/g, " ").trim();
}

/**
 * True when the message names a specific calendar anchor that needs
 * schedule context and reasoning (a weekday, "next week", etc.).
 * "today / yesterday / tomorrow / this week / this month" are NOT
 * included — those are deterministic parameter scopes.
 */
export function isDateSpecificQuery(message: string): boolean {
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|next month|this weekend|next weekend|this year|next year)\b/i.test(
    message
  );
}
