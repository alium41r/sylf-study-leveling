// ============================================================
// Cheap Answers — Math handler
// ============================================================
// Safe arithmetic evaluation (no eval(), no letters, bounds-checked):
// "whats 2+2" → "**4**" with zero LLM cost.
// ============================================================

// Longest phrases first — "what is the value of" must be stripped before
// "what is", which must be stripped before "whats" (alternation order in a
// single regex would let the prefix swallow the longer phrase).
const MATH_LEAD_IN_PHRASES = [
  "what is the value of",
  "what is the answer to",
  "whats the value of",
  "whats the answer to",
  "what is",
  "whats",
  "what does",
  "what would",
  "how much is",
  "do you know",
  "can you tell me",
  "can you",
  "could you",
  "work out",
  "the answer to",
  "calculate",
  "compute",
  "evaluate",
  "solve",
  "please",
  "answer",
  "result of",
  "equal to",
  "equals",
];

function stripMathLeadIns(input: string): string {
  let s = input;
  for (const phrase of MATH_LEAD_IN_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    s = s.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
  }
  return s;
}

export function tryMathQuestion(raw: string): string | null {
  // Apostrophes first ("what's" → "whats") so lead-in stripping can see it.
  const cleaned = stripMathLeadIns(raw.toLowerCase().replace(/'/g, ""))
    .replace(/[×]/g, " * ")
    .replace(/[÷]/g, " / ")
    // Natural operator words → symbols. Order matters:
    // "subtracted from" flips operand order (5 subtracted from 12 → 12 - 5).
    .replace(/(\d+(?:\.\d+)?)\s+subtracted from\s+(\d+(?:\.\d+)?)/g, "$2 - $1")
    .replace(/(\d+(?:\.\d+)?)\s+added to\s+(\d+(?:\.\d+)?)/g, "$2 + $1")
    .replace(/\b(plus|add)\b/g, "+")
    .replace(/\b(minus|subtract|take away)\b/g, "-")
    .replace(/\b(times|multiplied by|multiply by)\b/g, "*")
    .replace(/\b(divided by|divide by|over)\b/g, "/")
    .replace(/[?=,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length > 40) return null;
  if (!/^[\d\s+\-*/^%().]+$/.test(cleaned)) return null;
  if (!/[+\-*/^%]/.test(cleaned)) return null; // needs an operator
  const digitCount = (cleaned.match(/\d/g) || []).length;
  if (digitCount < 2 || digitCount > 25) return null;

  const value = evalArithmetic(cleaned);
  if (value === null) return null;

  const rounded = Math.round(value * 1e6) / 1e6;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, "");
  return `**${text}**`;
}

/** Recursive-descent parser for + - * / % ^ ( ) — pure and bounded. */
export function evalArithmetic(expr: string): number | null {
  const tokens = expr.match(/\d+(\.\d+)?|[+\-*/^%()]/g);
  if (!tokens || tokens.length === 0) return null;

  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parsePower();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const r = parsePower();
      if ((op === "/" || op === "%") && r === 0) throw new Error("div0");
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const parsePower = (): number => {
    const base = parseUnary();
    if (peek() === "^") {
      next();
      const exp = parsePower();
      const r = Math.pow(base, exp);
      if (!Number.isFinite(r)) throw new Error("inf");
      return r;
    }
    return base;
  };
  const parseUnary = (): number => {
    if (peek() === "-") { next(); return -parseUnary(); }
    if (peek() === "+") { next(); return parseUnary(); }
    if (peek() === "(") {
      next();
      const v = parseExpr();
      if (peek() !== ")") throw new Error("paren");
      next();
      return v;
    }
    const t = next();
    if (!t || !/^\d/.test(t)) throw new Error("token");
    const v = parseFloat(t);
    if (!Number.isFinite(v)) throw new Error("inf");
    return v;
  };

  try {
    const v = parseExpr();
    if (i !== tokens.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}
