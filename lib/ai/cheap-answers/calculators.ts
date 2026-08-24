// ============================================================
// Cheap Answers — calculators (percent, comparison, text count)
// ============================================================
// Pure functions. Each returns a ready-to-send reply string or
// null (escalate to the LLM). Never fabricate: invalid inputs
// always escalate instead of guessing.
// ============================================================

const NUM = "\\d+(?:\\.\\d+)?";

function fmt(n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
}

// ─── Percentage ("what is 15% of 240") ────────────────────────

const PERCENT_RE = new RegExp(
  `^(?:whats?|what is|calculate|compute)?\\s*(${NUM})\\s*(?:percent|%)\\s*of\\s*(${NUM})\\s*$`,
  "i"
);

export function tryPercentage(raw: string): string | null {
  const m = raw.trim().match(PERCENT_RE);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  const base = parseFloat(m[2]);
  if (!Number.isFinite(pct) || !Number.isFinite(base)) return null;
  return `**${fmt((pct / 100) * base)}** (${fmt(pct)}% of ${fmt(base)})`;
}

// ─── Numeric comparison ───────────────────────────────────────

const COMPARE_WHICH_RE = new RegExp(
  `^(?:which is|whats|what is)?\\s*(bigger|larger|greater|smaller|lower|higher)\\s*(?:,|out of|between|of|:)?\\s*(${NUM})\\s*(?:and|or|vs|versus)\\s*(${NUM})$`,
  "i"
);
const COMPARE_IS_RE = new RegExp(
  `^is\\s*(${NUM})\\s*(bigger|greater|more|higher|larger|smaller|less|lower)\\s*than\\s*(${NUM})$`,
  "i"
);

export function tryComparison(raw: string): string | null {
  let m = raw.trim().match(COMPARE_WHICH_RE);
  if (m) {
    const a = parseFloat(m[2]);
    const b = parseFloat(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const wantBig = /^(bigger|larger|greater|higher)$/i.test(m[1]);
    const winner = (a >= b) === wantBig ? a : b;
    return `**${fmt(winner)}**`;
  }

  m = raw.trim().match(COMPARE_IS_RE);
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const wantTrue = /^(bigger|greater|more|higher|larger)$/i.test(m[2]);
    const result = (a > b) === wantTrue;
    return result ? `Yes — ${fmt(a)} ${m[2]} than ${fmt(b)}.` : `No — ${fmt(a)} is not ${m[2]} than ${fmt(b)}.`;
  }

  return null;
}

// ─── Text counting ("how many words in ...") ──────────────────

const TEXT_COUNT_RE =
  /^how many\s+(characters|letters|words)\s*(?:are|is)?\s*in\s*["'“”‘’]?(.+?)["'“”‘’]?$/i;

export function tryTextCount(raw: string): string | null {
  const m = raw.trim().match(TEXT_COUNT_RE);
  if (!m) return null;
  const target = m[2].trim();
  if (!target || target.length > 200) return null;

  let count: number;
  switch (m[1].toLowerCase()) {
    case "characters":
      count = target.length;
      break;
    case "letters":
      count = (target.match(/[a-z]/gi) || []).length;
      break;
    case "words":
      count = target.split(/\s+/).filter(Boolean).length;
      break;
    default:
      return null;
  }
  return `**${count}** ${m[1].toLowerCase()} in "${target.slice(0, 60)}${target.length > 60 ? "…" : ""}".`;
}
