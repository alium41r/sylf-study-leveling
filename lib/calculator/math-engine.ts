/**
 * Studio-Grade Advanced Mathematical Expression Parsing & Evaluation Engine
 * Inspired by Desmos & Casio fx-991EX ClassWiz
 *
 * Supports:
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

  // Factorials: "5!" -> "fact(5)" or "(3+2)!" -> "fact(3+2)"
  expr = expr.replace(/(\d+(\.\d+)?)!/g, "fact($1)");
  expr = expr.replace(/\)!/g, ")_fact_"); // placeholder for parenthesized factorial

  // Implicit multiplication expansions:
  // 2( -> 2*(
  expr = expr.replace(/(\d)(\()/g, "$1*$2");
  // )2 -> )*2
  expr = expr.replace(/(\))(\d)/g, "$1*$2");
  // )( -> )*(
  expr = expr.replace(/(\))(\()/g, "$1*$2");
  // 2pi -> 2*pi, 2e -> 2*e, 2sqrt -> 2*sqrt, 2sin -> 2*sin
  const funcsAndConsts = [
    "pi", "tau", "phi", "e",
    "sin", "cos", "tan", "asin", "acos", "atan",
    "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "sqrt", "cbrt", "ln", "log10", "log2", "log", "exp", "abs", "fact", "nPr", "nCr"
  ];
  funcsAndConsts.forEach((fn) => {
    // number followed directly by function/constant: e.g. 5sin(30) -> 5*sin(30)
    const regex = new RegExp(`(\\d)(${fn})\\b`, "g");
    expr = expr.replace(regex, "$1*$2");
    // ) followed by function/constant: e.g. (2+3)sin(30) -> (2+3)*sin(30)
    const regexParen = new RegExp(`(\\))(${fn})\\b`, "g");
    expr = expr.replace(regexParen, "$1*$2");
  });

  return expr;
}

/**
 * High-performance, sandboxed Mathematical Expression Evaluator
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
    const expr = normalizeExpression(inputExpr, ansValue);

    // Angle conversion helpers
    const toRad = (x: number) => (angleMode === "DEG" ? (x * Math.PI) / 180 : x);
    const fromRad = (rad: number) => (angleMode === "DEG" ? (rad * 180) / Math.PI : rad);

    // Function context scope
    const scope: Record<string, any> = {
      // Constants
      pi: Math.PI,
      tau: 2 * Math.PI,
      e: Math.E,
      phi: (1 + Math.sqrt(5)) / 2,

      // Trigonometric (AngleMode-aware)
      sin: (x: number) => {
        const rad = toRad(x);
        // Clean up boundary angles in DEG
        if (angleMode === "DEG") {
          const mod = Math.abs(x) % 360;
          if (mod === 0 || mod === 180) return 0;
          if (mod === 90) return x > 0 ? 1 : -1;
          if (mod === 270) return x > 0 ? -1 : 1;
        }
        return Math.sin(rad);
      },
      cos: (x: number) => {
        const rad = toRad(x);
        if (angleMode === "DEG") {
          const mod = Math.abs(x) % 360;
          if (mod === 90 || mod === 270) return 0;
          if (mod === 0) return 1;
          if (mod === 180) return -1;
        }
        return Math.cos(rad);
      },
      tan: (x: number) => {
        if (angleMode === "DEG" && (Math.abs(x) % 180 === 90)) {
          throw new Error("Undefined (tan of 90°)");
        }
        return Math.tan(toRad(x));
      },

      // Inverse Trigonometric
      asin: (x: number) => {
        if (x < -1 || x > 1) throw new Error("Domain Error: asin out of [-1, 1]");
        return fromRad(Math.asin(x));
      },
      acos: (x: number) => {
        if (x < -1 || x > 1) throw new Error("Domain Error: acos out of [-1, 1]");
        return fromRad(Math.acos(x));
      },
      atan: (x: number) => fromRad(Math.atan(x)),

      // Hyperbolic & Inverses
      sinh: (x: number) => Math.sinh(x),
      cosh: (x: number) => Math.cosh(x),
      tanh: (x: number) => Math.tanh(x),
      asinh: (x: number) => Math.asinh(x),
      acosh: (x: number) => {
        if (x < 1) throw new Error("Domain Error: acosh out of [1, ∞)");
        return Math.acosh(x);
      },
      atanh: (x: number) => {
        if (x <= -1 || x >= 1) throw new Error("Domain Error: atanh out of (-1, 1)");
        return Math.atanh(x);
      },

      // Powers & Radicals
      sqrt: (x: number) => {
        if (x < 0) throw new Error("Domain Error: sqrt of negative");
        return Math.sqrt(x);
      },
      cbrt: (x: number) => Math.cbrt(x),
      ln: (x: number) => {
        if (x <= 0) throw new Error("Domain Error: ln(x) requires x > 0");
        return Math.log(x);
      },
      log: (x: number) => {
        if (x <= 0) throw new Error("Domain Error: log(x) requires x > 0");
        return Math.log10(x);
      },
      log10: (x: number) => {
        if (x <= 0) throw new Error("Domain Error: log10(x) requires x > 0");
        return Math.log10(x);
      },
      log2: (x: number) => {
        if (x <= 0) throw new Error("Domain Error: log2(x) requires x > 0");
        return Math.log2(x);
      },
      exp: (x: number) => Math.exp(x),
      abs: (x: number) => Math.abs(x),
      mod: (a: number, b: number) => a % b,

      // Combinatorics
      fact: (n: number) => calcFactorial(n),
      nPr: (n: number, r: number) => calcPermutation(n, r),
      nCr: (n: number, r: number) => calcCombination(n, r),
    };

    // Safe parser using Recursive Function Constructor with sandbox context
    // Replace ^ with ** for JavaScript exponentiation
    let jsExpr = expr.replace(/\^/g, "**");

    // Whitelist check
    const allowedTokens = /^[0-9+\-*/()., eE\t\n*a-zA-Z_]+$/;
    if (!allowedTokens.test(jsExpr)) {
      return { success: false, result: "Syntax Error", error: "Invalid characters in expression" };
    }

    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // eslint-disable-next-line no-new-func
    const evalFn = new Function(...scopeKeys, `"use strict"; return (${jsExpr});`);
    const num = evalFn(...scopeValues);

    if (typeof num !== "number" || isNaN(num)) {
      return { success: false, result: "Math Error", error: "Calculation produced NaN" };
    }

    if (!isFinite(num)) {
      return { success: false, result: num > 0 ? "Infinity" : "-Infinity", error: "Division by zero" };
    }

    const formatted = formatResultNumber(num);
    return { success: true, result: formatted, numericValue: num };
  } catch (err: any) {
    return { success: false, result: "Syntax Error", error: err?.message || "Invalid syntax" };
  }
}
