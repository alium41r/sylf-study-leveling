// Sylvie's Markdown, as data. Model output is untrusted, so this is a small parser that produces blocks and spans and nothing else: no HTML passes
// through, links keep only http(s) targets, and what the renderer draws is always text. Maths (`$...$`, `$$...$$`) is marked so a renderer that can
// typeset it may, and one that cannot shows the source as code. Unknown syntax stays as plain text.
export type Span =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "math"; text: string }
  | { kind: "link"; text: string; href: string };
export type Block =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: Span[][] }
  | { kind: "code"; text: string; language: string }
  | { kind: "math"; text: string }
  | { kind: "quote"; spans: Span[] }
  | { kind: "table"; header: Span[][]; rows: Span[][][] };

export const safeHref = (href: string) => (/^https?:\/\/[^\s]+$/i.test(href.trim()) ? href.trim() : null);

const INLINE = /(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)|(\$[^$\n]+\$)|(\[[^\]\n]+\]\([^)\s]+\))/g;
export function parseInline(source: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ kind: "text", text: source.slice(last, at) });
    const token = match[0];
    if (match[1]) spans.push({ kind: "bold", text: token.slice(2, -2) });
    else if (match[2]) spans.push({ kind: "italic", text: token.slice(1, -1) });
    else if (match[3]) spans.push({ kind: "code", text: token.slice(1, -1) });
    else if (match[4]) spans.push({ kind: "math", text: token.slice(1, -1) });
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]!) : null;
      spans.push(href && link ? { kind: "link", text: link[1]!, href } : { kind: "text", text: link ? link[1]! : token });
    }
    last = at + token.length;
  }
  if (last < source.length) spans.push({ kind: "text", text: source.slice(last) });
  return spans;
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseRichText(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) }); paragraph = []; } };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (index++; index < lines.length && !/^```\s*$/.test(lines[index]!); index++) body.push(lines[index]!);
      blocks.push({ kind: "code", text: body.join("\n"), language: fence[1] ?? "" });
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      flush();
      const body: string[] = [];
      for (index++; index < lines.length && !/^\s*\$\$\s*$/.test(lines[index]!); index++) body.push(lines[index]!);
      blocks.push({ kind: "math", text: body.join("\n").trim() });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flush(); blocks.push({ kind: "heading", level: Math.min(3, heading[1]!.length) as 1 | 2 | 3, spans: parseInline(heading[2]!.trim()) }); continue; }
    if (line.includes("|") && index + 1 < lines.length && isRule(lines[index + 1]!) && cells(line).length > 1) {
      flush();
      const header = cells(line).map(parseInline);
      const rows: Span[][][] = [];
      for (index += 2; index < lines.length && lines[index]!.includes("|") && lines[index]!.trim() !== ""; index++) rows.push(cells(lines[index]!).map(parseInline));
      index--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const bullet = /^\s*(?:[-*•])\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const items: Span[][] = [];
      for (; index < lines.length; index++) {
        const match = (ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*(?:[-*•])\s+(.+)$/).exec(lines[index]!);
        if (!match) break;
        items.push(parseInline(match[1]!));
      }
      index--;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { flush(); blocks.push({ kind: "quote", spans: parseInline(quote[1]!) }); continue; }
    if (line.trim() === "") { flush(); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

/** True when a reply has maths, so a typesetter loads only then. */
export const hasMath = (blocks: Block[]): boolean => blocks.some((block) => block.kind === "math" || ("spans" in block && block.spans.some((span) => span.kind === "math")) || (block.kind === "list" && block.items.some((item) => item.some((span) => span.kind === "math"))));
