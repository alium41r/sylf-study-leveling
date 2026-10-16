/** Normalize model math delimiters without changing Markdown code examples. */
export function normalizeMathMarkdown(source: string): string {
  if (!source) return "";
  const convert = (prose: string) => prose
    .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_, math: string) => `$$${math.trim()}$$`)
    .replace(/(?<!\\)\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`)
    .replace(/(?<!\\)\$\$([\s\S]*?)\$\$/g, (whole: string, math: string, offset: number, text: string) => {
      if (!math.includes("\n")) return whole;
      // A multiline display fence must have its body and closing fence on
      // separate lines. Keep list indentation so it cannot swallow later steps.
      const prefix = text.slice(text.lastIndexOf("\n", offset - 1) + 1, offset);
      const indent = /^(?:[ \t]*)(?:(?:[-+*]|\d+[.)])\s+)?/.exec(prefix)![0].replace(/\S/g, " ");
      return `$$\n${indent}${math.trim().replace(/\n[ \t]*/g, `\n${indent}`)}\n${indent}$$`;
    });

  const parts: string[] = [];
  let prose = "", index = 0, indentedCode = false;
  const flush = () => { parts.push(convert(prose)); prose = ""; };
  while (index < source.length) {
    const lineStart = index === 0 || source[index - 1] === "\n";
    if (lineStart) {
      const lineEnd = source.indexOf("\n", index);
      const end = lineEnd < 0 ? source.length : lineEnd + 1;
      const line = source.slice(index, end);
      const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n?$/.exec(line);
      if (fence) {
        flush();
        const closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`);
        let blockEnd = end;
        while (blockEnd < source.length) {
          const next = source.indexOf("\n", blockEnd);
          const nextEnd = next < 0 ? source.length : next + 1;
          const closed = closing.test(source.slice(blockEnd, next < 0 ? nextEnd : next));
          blockEnd = nextEnd;
          if (closed) break;
        }
        parts.push(source.slice(index, blockEnd)); index = blockEnd; continue;
      }
      const indented = /^(?: {4}|\t)/.test(line);
      if (indented && (indentedCode || index === 0 || /\n[ \t\r]*\n$/.test(source.slice(Math.max(0, index - 128), index)))) {
        flush(); parts.push(line); index = end; indentedCode = true; continue;
      }
      indentedCode = false;
    }
    if (source[index] === "`") {
      let slashes = 0;
      for (let before = index - 1; before >= 0 && source[before] === "\\"; before--) slashes++;
      if (slashes % 2) { prose += source[index++]; continue; }
      const ticks = /^`+/.exec(source.slice(index))![0];
      let end = index + ticks.length;
      let closed = false;
      // CommonMark code spans close only with a run of the same length.
      while (end < source.length) {
        const next = source.indexOf("`", end);
        if (next < 0) { end = source.length; break; }
        const run = /^`+/.exec(source.slice(next))![0];
        end = next + run.length;
        if (run.length === ticks.length) { closed = true; break; }
      }
      if (!closed) { prose += ticks; index += ticks.length; continue; }
      flush(); parts.push(source.slice(index, end)); index = end; continue;
    }
    prose += source[index++];
  }
  flush();
  return parts.join("");
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName: string; hProperties: { className: string[] }; hChildren: MarkdownNode[] };
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/**
 * Recover a complete, unambiguous TeX atom after an orphan dollar, e.g.
 * `$\mathbf j along the normal`. Never absorb the following prose, invent a
 * closing brace, or change the stored/copied answer. Valid math is already
 * parsed by remark-math; code nodes and link destinations are left alone.
 */
export function remarkRecoverMath() {
  const atom = /\$(\s*\\(?:mathbf|mathrm|mathit|mathsf|mathbb|mathcal|boldsymbol|vec|hat|bar|overline|dot|ddot)\s*(?:\{[^{}\n]+\}|[A-Za-z](?![A-Za-z]))|\s*\\(?:alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|tau|phi|omega|Delta|Sigma|Omega|infty)\b)/g;
  let source = "";
  function walk(node: MarkdownNode) {
    const raw = source.slice(node.position?.start.offset, node.position?.end.offset);
    // remark-math treats same-line $$...$$ as inline math. Honor the model's
    // display intent without inserting Markdown line breaks inside lists.
    if (node.type === "inlineMath" && raw.startsWith("$$") && node.data) {
      node.data.hProperties.className = ["language-math", "math-display"];
    }
    if (!node.children || node.type === "code" || node.type === "inlineCode") return;
    node.children = node.children.flatMap(child => {
      if (child.type !== "text" || !child.value) { walk(child); return [child]; }
      const original = source.slice(child.position?.start.offset, child.position?.end.offset);
      // Markdown unescapes literal dollars before this transform. If a text
      // node contains one, preserve it rather than guessing its intent.
      if (original.includes("\\$")) return [child];
      const result: MarkdownNode[] = [];
      let start = 0;
      for (const match of child.value.matchAll(atom)) {
        const offset = match.index!;
        if (offset > start) result.push({ type: "text", value: child.value.slice(start, offset) });
        const value = match[1].trim();
        result.push({ type: "inlineMath", value, data: {
          hName: "code", hProperties: { className: ["language-math", "math-inline"] },
          hChildren: [{ type: "text", value }],
        } });
        start = offset + match[0].length;
      }
      if (!start) return [child];
      if (start < child.value.length) result.push({ type: "text", value: child.value.slice(start) });
      return result;
    });
  }
  return (tree: MarkdownNode, file: { value: unknown }) => { source = String(file.value); walk(tree); };
}
