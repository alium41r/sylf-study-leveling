// Maths, readable everywhere. A model writes LaTeX; a phone has no typesetter, and shipping one means a web view on every platform. This turns the common
// part of LaTeX into plain Unicode a person can read at a glance: fractions, roots, powers, Greek letters, operators, sums and integrals. It is a reader, not
// a typesetter: anything it does not know is shown as it was written rather than guessed at, so it can never make a formula say something else.
// A real typesetter (KaTeX in an Expo DOM component) is the planned upgrade for the tablet.

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", propto: "∝", infty: "∞", partial: "∂", nabla: "∇",
  to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", mapsto: "↦",
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", cup: "∪", cap: "∩", emptyset: "∅", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  sum: "∑", prod: "∏", int: "∫", oint: "∮", sqrt: "√", ldots: "…", cdots: "⋯", dots: "…", degree: "°", circ: "∘", angle: "∠", perp: "⊥", parallel: "∥", hbar: "ħ", ell: "ℓ",
  mathbb: "", mathrm: "", mathbf: "", mathit: "", text: "", operatorname: "", left: "", right: "", quad: " ", qquad: "  ", ",": " ", ";": " ", "!": "", " ": " ",
};
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", k: "ᵏ", m: "ᵐ", t: "ᵗ" };
const SUBSCRIPT: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", x: "ₓ", t: "ₜ" };

/** Reads a `{...}` group starting at `from`, which must be the opening brace. Returns the inside and where it ended, or null if it never closes. */
function group(source: string, from: number): { inner: string; end: number } | null {
  if (source[from] !== "{") return null;
  let depth = 0;
  for (let at = from; at < source.length; at++) {
    if (source[at] === "{") depth++;
    else if (source[at] === "}" && --depth === 0) return { inner: source.slice(from + 1, at), end: at + 1 };
  }
  return null;
}

/** One argument: a braced group, or the single character or command that follows. */
function argument(source: string, from: number): { inner: string; end: number } | null {
  let at = from;
  while (source[at] === " ") at++;
  if (at >= source.length) return null;
  if (source[at] === "{") return group(source, at);
  if (source[at] === "\\") { const name = /^\\[A-Za-z]+/.exec(source.slice(at)); return name ? { inner: name[0], end: at + name[0].length } : { inner: source.slice(at, at + 2), end: at + 2 }; }
  return { inner: source[at]!, end: at + 1 };
}

const wrap = (text: string) => (/^[\p{L}\p{N}.]+$/u.test(text) ? text : `(${text})`);
function script(text: string, table: Record<string, string>, mark: string) {
  const mapped = [...text].map((char) => table[char]);
  return mapped.every(Boolean) ? mapped.join("") : `${mark}${wrap(text)}`;
}

/** LaTeX to readable text. Anything unknown stays as written. */
export function readMath(source: string): string {
  let out = "";
  let at = 0;
  const text = source.trim();
  while (at < text.length) {
    const char = text[at]!;
    if (char === "\\") {
      const name = /^\\([A-Za-z]+|.)/.exec(text.slice(at));
      const word = name?.[1] ?? "";
      at += name?.[0].length ?? 1;
      if (word === "frac" || word === "dfrac" || word === "tfrac") {
        const top = argument(text, at);
        const bottom = top ? argument(text, top.end) : null;
        if (top && bottom) { out += `${wrap(readMath(top.inner))}⁄${wrap(readMath(bottom.inner))}`; at = bottom.end; continue; }
      } else if (word === "sqrt") {
        let root = "";
        if (text[at] === "[") { const close = text.indexOf("]", at); if (close > at) { root = readMath(text.slice(at + 1, close)); at = close + 1; } }
        const body = argument(text, at);
        if (body) { out += `${root ? `${script(root, SUPERSCRIPT, "^")}` : ""}√${wrap(readMath(body.inner))}`; at = body.end; continue; }
      } else if (["mathbb", "mathrm", "mathbf", "mathit", "text", "operatorname", "mathcal"].includes(word)) {
        const body = argument(text, at);
        if (body) { out += readMath(body.inner); at = body.end; continue; }
      } else if (word === "binom") {
        const top = argument(text, at);
        const bottom = top ? argument(text, top.end) : null;
        if (top && bottom) { out += `(${readMath(top.inner)} choose ${readMath(bottom.inner)})`; at = bottom.end; continue; }
      } else if (word === "overline" || word === "bar" || word === "hat" || word === "vec") {
        const body = argument(text, at);
        if (body) { out += `${readMath(body.inner)}${word === "vec" ? "⃗" : word === "hat" ? "̂" : "̄"}`; at = body.end; continue; }
      } else if (["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min", "det", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"].includes(word)) { out += word; continue; }
      else if (word in SYMBOLS) { out += SYMBOLS[word]; continue; }
      else if (word === "{" || word === "}" || word === "%" || word === "$" || word === "_" || word === "&" || word === "#") { out += word; continue; }
      else if (word === "\\") { out += " "; continue; }
      // Not known: keep it exactly as written, braces and all.
      out += `\\${word}`;
      const kept = text[at] === "{" ? group(text, at) : null;
      if (kept) { out += `{${readMath(kept.inner)}}`; at = kept.end; }
      continue;
    }
    if (char === "^" || char === "_") {
      const body = argument(text, at + 1);
      if (body) { out += script(readMath(body.inner), char === "^" ? SUPERSCRIPT : SUBSCRIPT, char); at = body.end; continue; }
    }
    if (char === "{" || char === "}") { at++; continue; }
    out += char;
    at++;
  }
  return out.replace(/ {2,}/g, " ");
}
