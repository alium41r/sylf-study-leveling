/**
 * Studio-Grade Advanced Mathematical Expression Parsing & Evaluation Engine
 * Inspired by Desmos & Casio fx-991EX ClassWiz
 *
 * Supports:
 * - CSP-safe recursive descent AST evaluation (zero eval() / new Function())
 * - Order of operations (PEMDAS / BEDMAS) & nested parentheses
 * - Implicit multiplication: 2(3+4), 3pi, 4sin(30), 2e
 * - Full Trigonometry (DEG/RAD) + Inverses (sin⁻¹, cos⁻¹, tan⁻¹) + Hyperbolic (sinh, cosh, tanh)
 * - Powers & Radicals: x^y, sqrt, cbrt, 10^x, e^x, ln, log10, log2
 * - Combinatorics & Discrete: n! (factorial), nPr (permutations), nCr (combinations), mod, abs, %
 * - Constants: pi (π), e, tau (τ = 2π), phi (φ)
 * - Memory & Ans recall
 * - Live real-time preview evaluation
 * - High-precision IEEE 754 floating point cleanup
 */

export type AngleMode = "DEG" | "RAD";

export interface MathEvalResult {
  success: boolean;
  result: string;
  numericValue?: number;
  error?: string;
}

// Factorial helper with gamma approximation or exact integer loop
export function calcFactorial(n: number): number {
  if (n < 0) throw new Error("Factorial not defined for negative numbers");
  if (!Number.isInteger(n)) {
    // Stirling / Lanczos Gamma approximation for non-integers if needed, or error
    if (n > 170) return Infinity;
    // Gamma(n+1)
    let x = n;
    const g = 7;
    const p = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.138571095836526, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let y = p[0];
    for (let i = 1; i < g + 2; i++) {
      y += p[i] / (x + i);
    }
    const t = x + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * y;
  }
  if (n > 170) return Infinity;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

// Permutations: nPr = n! / (n-r)!
export function calcPermutation(n: number, r: number): number {
  if (n < 0 || r < 0 || r > n) throw new Error("Invalid nPr parameters");
  return Math.round(calcFactorial(n) / calcFactorial(n - r));
}

// Combinations: nCr = n! / (r! * (n-r)!)
export function calcCombination(n: number, r: number): number {
  if (n < 0 || r < 0 || r > n) throw new Error("Invalid nCr parameters");
  return Math.round(calcFactorial(n) / (calcFactorial(r) * calcFactorial(n - r)));
}

// Float precision sanitation (fixes 0.1 + 0.2 = 0.30000000000000004)
export function sanitizeNumber(val: number): number {
  if (isNaN(val)) return NaN;
  if (!isFinite(val)) return val;
  // If extremely close to an integer, round to integer
  if (Math.abs(val - Math.round(val)) < 1e-12) {
    return Math.round(val);
  }
  // Otherwise round to 12 decimal places
  return parseFloat(val.toPrecision(12));
}

export function formatResultNumber(val: number): string {
  if (isNaN(val)) return "Error";
  if (!isFinite(val)) return val > 0 ? "Infinity" : "-Infinity";

  const clean = sanitizeNumber(val);
  if (Number.isInteger(clean)) {
    return clean.toString();
  }

  // Scientific notation for very large or tiny numbers
  if (Math.abs(clean) >= 1e14 || (Math.abs(clean) > 0 && Math.abs(clean) < 1e-6)) {
    return clean.toExponential(6).replace("e+", "e");
  }

  return clean.toString();
}

/**
 * Preprocesses and normalizes mathematical input string
 */
export function normalizeExpression(raw: string, ansValue = 0): string {
  let expr = raw
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/\s+/g, "")
    .replace(/Ans/gi, `(${ansValue})`)
    .replace(/π/g, "pi")
    .replace(/τ/g, "tau")
    .replace(/φ/g, "phi");

  // Infix nPr and nCr replacement: "5nPr2" -> "nPr(5,2)"
  expr = expr.replace(/(\d+(\.\d+)?)\s*nPr\s*(\d+(\.\d+)?)/gi, "nPr($1,$3)");
  expr = expr.replace(/(\d+(\.\d+)?)\s*nCr\s*(\d+(\.\d+)?)/gi, "nCr($1,$3)");

  // Percentage "50%" -> "(50/100)"
  expr = expr.replace(/(\d+(\.\d+)?)%/g, "($1/100)");

  // Factorials: "5!" -> "fact(5)"
  expr = expr.replace(/(\d+(\.\d+)?)!/g, "fact($1)");

  return expr;
}

// Token definitions for CSP-safe parser
type TokenType =
  | "NUMBER"
  | "IDENT"
  | "PLUS"
  | "MINUS"
  | "MUL"
  | "DIV"
  | "POW"
  | "MOD"
  | "BANG"
  | "PERCENT"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const KNOWN_CONSTANTS = new Set(["pi", "tau", "phi", "e", "ans"]);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers (e.g. 123, 123.45, .45, 1e-5, 2e3)
    if (/[0-9]/.test(ch) || (ch === "." && i + 1 < input.length && /[0-9]/.test(input[i + 1]))) {
      let numStr = "";
      const start = i;
      while (i < input.length && /[0-9.]/.test(input[i])) {
        numStr += input[i];
        i++;
      }
      // Check for scientific notation in number: e.g. 1e5 or 1e-5
      if (i < input.length && (input[i] === "e" || input[i] === "E")) {
        const nextChar = input[i + 1];
        if (nextChar && (/[0-9]/.test(nextChar) || ((nextChar === "+" || nextChar === "-") && /[0-9]/.test(input[i + 2] || "")))) {
          numStr += input[i];
          i++;
          if (input[i] === "+" || input[i] === "-") {
            numStr += input[i];
            i++;
          }
          while (i < input.length && /[0-9]/.test(input[i])) {
            numStr += input[i];
            i++;
          }
        }
      }
      tokens.push({ type: "NUMBER", value: numStr, pos: start });
      continue;
    }

    // Special unicode operators / symbols
    if (ch === "×") {
      tokens.push({ type: "MUL", value: "*", pos: i++ });
      continue;
    }
    if (ch === "÷") {
      tokens.push({ type: "DIV", value: "/", pos: i++ });
      continue;
    }
    if (ch === "−" || ch === "–") {
      tokens.push({ type: "MINUS", value: "-", pos: i++ });
      continue;
    }
    if (ch === "π") {
      tokens.push({ type: "IDENT", value: "pi", pos: i++ });
      continue;
    }
    if (ch === "τ") {
      tokens.push({ type: "IDENT", value: "tau", pos: i++ });
      continue;
    }
    if (ch === "φ") {
      tokens.push({ type: "IDENT", value: "phi", pos: i++ });
      continue;
    }

    // Standard ASCII operators
    if (ch === "+") {
      tokens.push({ type: "PLUS", value: "+", pos: i++ });
      continue;
    }
    if (ch === "-") {
      tokens.push({ type: "MINUS", value: "-", pos: i++ });
      continue;
    }
    if (ch === "*") {
      if (input[i + 1] === "*") {
        tokens.push({ type: "POW", value: "^", pos: i });
        i += 2;
      } else {
        tokens.push({ type: "MUL", value: "*", pos: i++ });
      }
      continue;
    }
    if (ch === "/") {
      tokens.push({ type: "DIV", value: "/", pos: i++ });
      continue;
    }
    if (ch === "^") {
      tokens.push({ type: "POW", value: "^", pos: i++ });
      continue;
    }
    if (ch === "!") {
      tokens.push({ type: "BANG", value: "!", pos: i++ });
      continue;
    }
    if (ch === "%") {
      tokens.push({ type: "PERCENT", value: "%", pos: i++ });
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i++ });
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i++ });
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA", value: ",", pos: i++ });
      continue;
    }

    // Identifiers (functions, constants, Ans, nPr, nCr, mod)
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident, pos: start });
      continue;
    }

    throw new Error(`Unexpected character: '${ch}'`);
  }

  // Insert implicit multiplication:
  // e.g. NUMBER ( -> NUMBER * (
  // ) NUMBER -> ) * NUMBER
  // ) ( -> ) * (
  // NUMBER IDENT -> NUMBER * IDENT (e.g. 2pi, 4sin(30))
  // ) IDENT -> ) * IDENT (e.g. (2+3)sin(30))
  // CONSTANT ( -> CONSTANT * ( (e.g. pi(3) -> pi * 3)
  // BANG NUMBER / IDENT / LPAREN -> 5! 2 -> 5! * 2
  // PERCENT NUMBER / IDENT / LPAREN -> 50% 2 -> 50% * 2
  const enriched: Token[] = [];

  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx];
    enriched.push(cur);

    if (idx + 1 < tokens.length) {
      const next = tokens[idx + 1];

      const curCanMultiply =
        cur.type === "NUMBER" ||
        cur.type === "RPAREN" ||
        cur.type === "BANG" ||
        cur.type === "PERCENT" ||
        (cur.type === "IDENT" && KNOWN_CONSTANTS.has(cur.value.toLowerCase()));

      const nextCanMultiply =
        next.type === "NUMBER" ||
        next.type === "LPAREN" ||
        next.type === "IDENT";

      // Exception: if cur is an IDENT that is a function followed by LPAREN (e.g. sin(), not implicit mult
      const isFunctionCall =
        cur.type === "IDENT" &&
        !KNOWN_CONSTANTS.has(cur.value.toLowerCase()) &&
        next.type === "LPAREN";

      // Exception: nPr, nCr, and mod act as infix binary operators
      const isInfixKeyword =
        cur.value.toLowerCase() === "npr" ||
        cur.value.toLowerCase() === "ncr" ||
        cur.value.toLowerCase() === "mod";

      const nextIsInfixKeyword =
        next.value.toLowerCase() === "npr" ||
        next.value.toLowerCase() === "ncr" ||
        next.value.toLowerCase() === "mod";

      if (
        curCanMultiply &&
        nextCanMultiply &&
        !isFunctionCall &&
        !isInfixKeyword &&
        !nextIsInfixKeyword
      ) {
        enriched.push({ type: "MUL", value: "*", pos: cur.pos });
      }
    }
  }

  enriched.push({ type: "EOF", value: "", pos: input.length });
  return enriched;
}

/**
 * Sandboxed, zero-eval AST evaluator for mathematical expressions
 */
export class MathExpressionEvaluator {
  private tokens: Token[];
  private current = 0;
  private angleMode: AngleMode;
  private ansValue: number;

  constructor(tokens: Token[], angleMode: AngleMode = "DEG", ansValue = 0) {
    this.tokens = tokens;
    this.angleMode = angleMode;
    this.ansValue = ansValue;
  }

  private peek(): Token {
    return this.tokens[this.current] || { type: "EOF", value: "", pos: -1 };
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message);
  }

  public parse(): number {
    const result = this.expression();
    if (!this.isAtEnd()) {
      throw new Error(`Unexpected token '${this.peek().value}'`);
    }
    return result;
  }

  private toRad(x: number): number {
    return this.angleMode === "DEG" ? (x * Math.PI) / 180 : x;
  }

  private fromRad(rad: number): number {
    return this.angleMode === "DEG" ? (rad * 180) / Math.PI : rad;
  }

  // Precedence levels:
  // expression -> addition / subtraction
  // addition -> multiplication / division / modulo / nPr / nCr
  // unary -> + -
  // power -> exponentiation (right associative)
  // postfix -> ! %
  // primary -> numbers, constants, parentheses, function calls

  private expression(): number {
    return this.addition();
  }

  private addition(): number {
    let expr = this.multiplication();

    while (this.match("PLUS", "MINUS")) {
      const op = this.previous().type;
      const right = this.multiplication();
      if (op === "PLUS") {
        expr += right;
      } else {
        expr -= right;
      }
    }

    return expr;
  }

  private multiplication(): number {
    let expr = this.unary();

    while (true) {
      if (this.match("MUL")) {
        expr *= this.unary();
      } else if (this.match("DIV")) {
        const right = this.unary();
        if (right === 0) {
          throw new Error("Division by zero");
        }
        expr /= right;
      } else if (this.match("MOD")) {
        const right = this.unary();
        expr = expr % right;
      } else if (
        this.check("IDENT") &&
        (this.peek().value.toLowerCase() === "npr" ||
          this.peek().value.toLowerCase() === "ncr" ||
          this.peek().value.toLowerCase() === "mod")
      ) {
        const keyword = this.advance().value.toLowerCase();
        const right = this.unary();
        if (keyword === "npr") {
          expr = calcPermutation(expr, right);
        } else if (keyword === "ncr") {
          expr = calcCombination(expr, right);
        } else {
          expr = expr % right;
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private unary(): number {
    if (this.match("PLUS")) {
      return this.unary();
    }
    if (this.match("MINUS")) {
      return -this.power();
    }

    return this.power();
  }

  private power(): number {
    let expr = this.postfix();

    if (this.match("POW")) {
      // Exponentiation is right-associative: 2 ^ 3 ^ 2 = 2 ^ (3 ^ 2)
      const right = this.unary();
      expr = Math.pow(expr, right);
    }

    return expr;
  }

  private postfix(): number {
    let expr = this.primary();

    while (true) {
      if (this.match("BANG")) {
        expr = calcFactorial(expr);
      } else if (this.match("PERCENT")) {
        expr = expr / 100;
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): number {
    if (this.match("NUMBER")) {
      return parseFloat(this.previous().value);
    }

    if (this.match("LPAREN")) {
      const expr = this.expression();
      this.consume("RPAREN", "Expected ')' after expression");
      return expr;
    }

    if (this.match("IDENT")) {
      const name = this.previous().value;
      const lower = name.toLowerCase();

      // Constants
      if (lower === "pi") return Math.PI;
      if (lower === "tau") return 2 * Math.PI;
      if (lower === "phi") return (1 + Math.sqrt(5)) / 2;
      if (lower === "e") return Math.E;
      if (lower === "ans") return this.ansValue;

      // Function calls
      if (this.match("LPAREN")) {
        const args: number[] = [];
        if (!this.check("RPAREN")) {
          do {
            args.push(this.expression());
          } while (this.match("COMMA"));
        }
        this.consume("RPAREN", `Expected ')' after arguments for function '${name}'`);

        return this.callFunction(name, args);
      }

      throw new Error(`Unknown identifier '${name}'`);
    }

    throw new Error(`Unexpected token '${this.peek().value || "EOF"}'`);
  }

  private callFunction(name: string, args: number[]): number {
    const fn = name.toLowerCase();

    switch (fn) {
      case "sin": {
        const x = args[0] ?? 0;
        if (this.angleMode === "DEG") {
          const mod = Math.abs(x) % 360;
          if (mod === 0 || mod === 180) return 0;
          if (mod === 90) return x > 0 ? 1 : -1;
          if (mod === 270) return x > 0 ? -1 : 1;
        }
        return Math.sin(this.toRad(x));
      }
      case "cos": {
        const x = args[0] ?? 0;
        if (this.angleMode === "DEG") {
          const mod = Math.abs(x) % 360;
          if (mod === 90 || mod === 270) return 0;
          if (mod === 0) return 1;
          if (mod === 180) return -1;
        }
        return Math.cos(this.toRad(x));
      }
      case "tan": {
        const x = args[0] ?? 0;
        if (this.angleMode === "DEG" && Math.abs(x) % 180 === 90) {
          throw new Error("Undefined (tan of 90°)");
        }
        return Math.tan(this.toRad(x));
      }
      case "asin": {
        const x = args[0] ?? 0;
        if (x < -1 || x > 1) throw new Error("Domain Error: asin out of [-1, 1]");
        return this.fromRad(Math.asin(x));
      }
      case "acos": {
        const x = args[0] ?? 0;
        if (x < -1 || x > 1) throw new Error("Domain Error: acos out of [-1, 1]");
        return this.fromRad(Math.acos(x));
      }
      case "atan": {
        const x = args[0] ?? 0;
        return this.fromRad(Math.atan(x));
      }
      case "sinh":
        return Math.sinh(args[0] ?? 0);
      case "cosh":
        return Math.cosh(args[0] ?? 0);
      case "tanh":
        return Math.tanh(args[0] ?? 0);
      case "asinh":
        return Math.asinh(args[0] ?? 0);
      case "acosh": {
        const x = args[0] ?? 0;
        if (x < 1) throw new Error("Domain Error: acosh out of [1, ∞)");
        return Math.acosh(x);
      }
      case "atanh": {
        const x = args[0] ?? 0;
        if (x <= -1 || x >= 1) throw new Error("Domain Error: atanh out of (-1, 1)");
        return Math.atanh(x);
      }
      case "sqrt": {
        const x = args[0] ?? 0;
        if (x < 0) throw new Error("Domain Error: sqrt of negative");
        return Math.sqrt(x);
      }
      case "cbrt":
        return Math.cbrt(args[0] ?? 0);
      case "ln": {
        const x = args[0] ?? 0;
        if (x <= 0) throw new Error("Domain Error: ln(x) requires x > 0");
        return Math.log(x);
      }
      case "log":
      case "log10": {
        const x = args[0] ?? 0;
        if (x <= 0) throw new Error("Domain Error: log(x) requires x > 0");
        return Math.log10(x);
      }
      case "log2": {
        const x = args[0] ?? 0;
        if (x <= 0) throw new Error("Domain Error: log2(x) requires x > 0");
        return Math.log2(x);
      }
      case "exp":
        return Math.exp(args[0] ?? 0);
      case "abs":
        return Math.abs(args[0] ?? 0);
      case "fact":
        return calcFactorial(args[0] ?? 0);
      case "npr":
        return calcPermutation(args[0] ?? 0, args[1] ?? 0);
      case "ncr":
        return calcCombination(args[0] ?? 0, args[1] ?? 0);
      case "mod":
        return (args[0] ?? 0) % (args[1] ?? 1);
      default:
        throw new Error(`Unknown function '${name}'`);
    }
  }
}

/**
 * High-performance, sandboxed Mathematical Expression Evaluator
 * Operates without eval() or new Function(), fully compatible with strict CSP in production.
 */
export function evaluateMath(
  inputExpr: string,
  angleMode: AngleMode = "DEG",
  ansValue = 0
): MathEvalResult {
  if (!inputExpr || !inputExpr.trim()) {
    return { success: true, result: "0", numericValue: 0 };
  }

  try {
    const tokens = tokenize(inputExpr);
    const evaluator = new MathExpressionEvaluator(tokens, angleMode, ansValue);
    const num = evaluator.parse();

    if (typeof num !== "number" || isNaN(num)) {
      return { success: false, result: "Math Error", error: "Calculation produced NaN" };
    }

    if (!isFinite(num)) {
      return { success: false, result: num > 0 ? "Infinity" : "-Infinity", error: "Division by zero" };
    }

    const formatted = formatResultNumber(num);
    return { success: true, result: formatted, numericValue: num };
  } catch (err: any) {
    if (err?.message === "Division by zero") {
      return { success: false, result: "Infinity", error: "Division by zero" };
    }
    return { success: false, result: "Syntax Error", error: err?.message || "Invalid syntax" };
  }
}
