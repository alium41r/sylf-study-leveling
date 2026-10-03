import "server-only";
import { inflateRawSync, inflateSync } from "node:zlib";
import { RESEARCH_LIMITS, type ExtractionResult } from "../research/contracts";

/**
 * A bounded, dependency-free text extractor for PDFs that have a real text layer.
 *
 * This is deliberately not a PDF renderer: it locates page objects, resolves their
 * content streams, and walks the text-showing operators for the words in reading
 * order. Anything it cannot decode honestly — scanned pages, encrypted files, hex or
 * CID-encoded text, unknown stream filters — is admitted as *unread* rather than
 * guessed, because the caller offers a vision path for exactly those documents.
 *
 * Every loop and allocation below is capped so a hostile or merely enormous PDF
 * fails fast instead of hanging the server.
 */

/**
 * Hard ceilings on work per parse, not tuning knobs. Each guards one abuse: a
 * million-object file, a FlateDecode zip bomb, a content stream that never ends.
 */
const PDF_LIMITS = {
  maxObjects: 20_000,
  /** Raw bytes of one stream we will even inspect. */
  maxStreamBytes: 4 * 1024 * 1024,
  /** Inflated bytes allowed per stream (guards FlateDecode zip bombs). */
  maxInflatedBytes: 2 * 1024 * 1024,
  /** Tokens tokenised from one content stream. */
  maxTokensPerStream: 100_000,
  /** Items collected inside one TJ array. */
  maxArrayItems: 10_000,
} as const;

const DEFAULT_MAX_PAGES = 40;

interface PdfObject {
  num: number;
  body: string;
  offset: number;
}

/** latin1 is a byte-for-byte mapping, so string indices are byte offsets we can slice the Buffer at. */
const latin1 = (buf: Buffer): string => buf.toString("latin1");

function result(
  text: string,
  pages: { from: number; to: number }[],
  partial: boolean,
  partialReason: string | null
): ExtractionResult {
  return { text, pages, partial, partialReason, method: "TEXT" };
}

const fail = (reason: string): ExtractionResult => result("", [], true, reason);

export async function extractPdfText(
  buffer: Buffer,
  options?: { maxPages?: number }
): Promise<ExtractionResult> {
  const maxPages = options?.maxPages && options.maxPages > 0 ? options.maxPages : DEFAULT_MAX_PAGES;
  const src = latin1(buffer);

  // The header must appear near the front; some writers pad a little junk before it.
  if (src.slice(0, 1024).indexOf("%PDF-") === -1) return fail("UNPARSEABLE");
  if (/\/Encrypt\b/.test(src)) return fail("ENCRYPTED");

  const objects = collectObjects(src);
  if (objects.size === 0) return fail("UNPARSEABLE");

  const pageOrder = orderedPages(objects);
  if (pageOrder.length === 0) return fail("UNPARSEABLE");

  const totalPages = pageOrder.length;
  const toRead = pageOrder.slice(0, maxPages);

  let fullText = "";
  const readPages: number[] = [];
  for (let index = 0; index < toRead.length; index += 1) {
    const pageBody = objects.get(toRead[index])?.body ?? "";
    const pageText = extractPageText(pageBody, objects);
    if (pageText.trim()) {
      fullText += (fullText ? "\n\n" : "") + pageText.trim();
      readPages.push(index + 1);
    }
  }

  const textTruncated = fullText.length > RESEARCH_LIMITS.extractedChars;
  const text = textTruncated ? fullText.slice(0, RESEARCH_LIMITS.extractedChars) : fullText;

  if (!text.trim()) return fail("NO_TEXT_LAYER");

  const pageLimited = totalPages > maxPages;
  const unreadWithinCap = toRead.length - readPages.length;

  // Precedence is documented: output truncation is the most severe, then pages we chose
  // not to read, then pages we tried and could not read.
  const partialReason = textTruncated
    ? "TEXT_LIMIT"
    : pageLimited
      ? "PAGE_LIMIT"
      : unreadWithinCap > 0
        ? "PAGES_UNREADABLE"
        : null;

  return result(text, buildRanges(readPages), partialReason !== null, partialReason);
}

/** Collect every `n g obj` block by scanning the raw file; bounded and best-effort. */
function collectObjects(src: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const headerRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(src)) && objects.size < PDF_LIMITS.maxObjects) {
    const num = parseInt(match[1], 10);
    if (objects.has(num)) continue;
    const bodyStart = match.index + match[0].length;
    const end = src.indexOf("endobj", bodyStart);
    const body = end === -1 ? src.slice(bodyStart) : src.slice(bodyStart, end);
    objects.set(num, { num, body, offset: match.index });
  }
  return objects;
}

/** Return page object numbers in reading order, via the `/Pages` tree when one exists. */
function orderedPages(objects: Map<number, PdfObject>): number[] {
  const pageNums = new Set<number>();
  const isPages = new Set<number>();
  const kids = new Map<number, number[]>();

  for (const object of objects.values()) {
    if (/\/Type\s*\/Pages\b/.test(object.body)) {
      isPages.add(object.num);
      kids.set(object.num, parseKids(object.body));
    } else if (/\/Type\s*\/Page\b/.test(object.body)) {
      pageNums.add(object.num);
    }
  }

  if (isPages.size === 0) {
    // No page tree: document order is the only order we have, and it matches page order
    // for simple single-stream files.
    return [...pageNums].sort((a, b) => objects.get(a)!.offset - objects.get(b)!.offset);
  }

  const isKid = new Set<number>();
  for (const childIds of kids.values()) for (const id of childIds) isKid.add(id);

  const roots = [...isPages]
    .filter((num) => !isKid.has(num))
    .sort((a, b) => objects.get(a)!.offset - objects.get(b)!.offset);

  const order: number[] = [];
  const visited = new Set<number>();
  const walk = (num: number): void => {
    if (visited.has(num)) return;
    visited.add(num);
    for (const child of kids.get(num) ?? []) {
      if (isPages.has(child)) walk(child);
      else if (pageNums.has(child)) order.push(child);
    }
  };
  for (const root of roots) walk(root);

  // Any page the tree failed to reach (a malformed Kids array) is appended in document order.
  const reached = new Set(order);
  const rest = [...pageNums]
    .filter((num) => !reached.has(num))
    .sort((a, b) => objects.get(a)!.offset - objects.get(b)!.offset);
  order.push(...rest);
  return order;
}

function parseKids(body: string): number[] {
  const match = body.match(/\/Kids\s*\[([^\]]*)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((ref) => parseInt(ref[1], 10));
}

/** Resolve a page's `/Contents` (one ref or an array of refs) and concatenate its text. */
function extractPageText(pageBody: string, objects: Map<number, PdfObject>): string {
  const refs = contentRefs(pageBody);
  let text = "";
  for (const ref of refs) {
    const streamBody = objects.get(ref)?.body;
    if (!streamBody) continue;
    const chunk = extractStreamText(streamBody);
    if (chunk) text += (text ? " " : "") + chunk;
  }
  // A few writers inline the content stream in the page object itself.
  if (refs.length === 0 && pageBody.includes("stream")) {
    const chunk = extractStreamText(pageBody);
    if (chunk) text += (text ? " " : "") + chunk;
  }
  return text;
}

function contentRefs(body: string): number[] {
  const match = body.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
  if (!match) return [];
  const value = match[1];
  if (value.startsWith("[")) {
    return [...value.matchAll(/(\d+)\s+\d+\s+R/g)].map((ref) => parseInt(ref[1], 10));
  }
  const ref = value.match(/(\d+)\s+\d+\s+R/);
  return ref ? [parseInt(ref[1], 10)] : [];
}

/** Inflate one stream body and run its text operators; empty when there is no decodable text. */
function extractStreamText(body: string): string {
  const streamIndex = body.indexOf("stream");
  if (streamIndex === -1) return "";

  const filter = body.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
  let needsInflate = false;
  if (filter) {
    const value = filter[1];
    if (value.startsWith("[")) {
      const names = value.match(/\/[A-Za-z0-9]+/g) ?? [];
      needsInflate = names.length === 1 && /^\/Fl(ateDecode)?$/i.test(names[0]);
      if (!needsInflate) return ""; // multiple or unknown filters (e.g. DCTDecode images)
    } else {
      needsInflate = /^\/Fl(ateDecode)?$/i.test(value);
      if (!needsInflate) return "";
    }
  }

  // The raw data sits between the `stream` keyword's line ending and `endstream`; `/Length`
  // gives the exact byte count so binary data cannot hide an early `endstream`.
  let start = streamIndex + "stream".length;
  if (body[start] === "\r" && body[start + 1] === "\n") start += 2;
  else if (body[start] === "\n" || body[start] === "\r") start += 1;

  const lengthMatch = body.match(/\/Length\s+(\d+)/);
  let raw: string;
  if (lengthMatch) {
    const length = Math.min(parseInt(lengthMatch[1], 10), PDF_LIMITS.maxStreamBytes);
    raw = body.slice(start, start + length);
  } else {
    const end = body.indexOf("endstream", start);
    raw = body.slice(start, end === -1 ? start + PDF_LIMITS.maxStreamBytes : end);
  }

  let content = raw;
  if (needsInflate) {
    const inflated = inflate(Buffer.from(raw, "latin1"));
    if (!inflated) return "";
    content = inflated.toString("latin1");
  }
  return textFromContent(content);
}

function inflate(data: Buffer): Buffer | null {
  try {
    return inflateSync(data, { maxOutputLength: PDF_LIMITS.maxInflatedBytes });
  } catch {
    try {
      return inflateRawSync(data, { maxOutputLength: PDF_LIMITS.maxInflatedBytes });
    } catch {
      return null;
    }
  }
}

// ─── Content-stream text extraction ─────────────────────────────────────────────

type Token =
  | { type: "str"; text: string }
  | { type: "hex"; text: string | null } // null when the bytes are not plain ASCII
  | { type: "num"; value: number }
  | { type: "name"; name: string }
  | { type: "array"; items: Token[] }
  | { type: "op"; name: string };

const WS = /[\s]/;
const DELIMITER = /[\s()<>[\]{}/%]/;
const NUM_CHAR = /[0-9+\-.eE]/;
const KEYWORD_CHAR = /[A-Za-z*'"]/;
const DIGIT = /[0-7]/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let guard = 0;
  while (index < src.length && guard++ < PDF_LIMITS.maxTokensPerStream) {
    const char = src[index];
    if (WS.test(char)) { index += 1; continue; }
    if (char === "%") { while (index < src.length && src[index] !== "\n" && src[index] !== "\r") index += 1; continue; }
    if (char === "/") { const r = readName(src, index); tokens.push({ type: "name", name: r.name }); index = r.end; continue; }
    if (char === "(") { const r = readString(src, index); tokens.push({ type: "str", text: r.text }); index = r.end; continue; }
    if (char === "<") {
      if (src[index + 1] === "<") { index = readDict(src, index); continue; }
      const r = readHex(src, index); tokens.push({ type: "hex", text: r.text }); index = r.end; continue;
    }
    if (char === "[") { const r = readArray(src, index); tokens.push({ type: "array", items: r.items }); index = r.end; continue; }
    if (NUM_CHAR.test(char)) { const r = readNumber(src, index); tokens.push({ type: "num", value: r.value }); index = r.end; continue; }
    if (KEYWORD_CHAR.test(char)) { const r = readKeyword(src, index); tokens.push({ type: "op", name: r.name }); index = r.end; continue; }
    index += 1; // unknown byte (binary junk) — skip
  }
  return tokens;
}

function readName(src: string, start: number): { name: string; end: number } {
  let index = start + 1;
  let name = "";
  while (index < src.length && !DELIMITER.test(src[index])) { name += src[index]; index += 1; }
  return { name, end: index };
}

function readString(src: string, start: number): { text: string; end: number } {
  let index = start + 1;
  let depth = 1;
  let raw = "";
  while (index < src.length && depth > 0) {
    const char = src[index];
    if (char === "\\") {
      raw += char;
      const next = src[index + 1];
      if (next === "\r" && src[index + 2] === "\n") { raw += "\r\n"; index += 3; continue; }
      if (next !== undefined) { raw += next; index += 2; continue; }
      index += 1;
      continue;
    }
    if (char === "(") { depth += 1; raw += char; index += 1; continue; }
    if (char === ")") { depth -= 1; if (depth > 0) raw += char; index += 1; continue; }
    raw += char;
    index += 1;
  }
  return { text: decodePdfString(raw), end: index };
}

/** Resolve PDF string escapes; octal escapes become their byte, everything else stays itself. */
function decodePdfString(raw: string): string {
  let out = "";
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (char !== "\\") { out += char; index += 1; continue; }
    const next = raw[index + 1];
    if (next === undefined) break;
    switch (next) {
      case "n": out += "\n"; index += 2; break;
      case "r": out += "\r"; index += 2; break;
      case "t": out += "\t"; index += 2; break;
      case "b": out += "\b"; index += 2; break;
      case "f": out += "\f"; index += 2; break;
      case "(":
      case ")":
      case "\\": out += next; index += 2; break;
      case "\r":
      case "\n": {
        // A backslash followed by a line ending is a line continuation, not a character.
        index += next === "\r" && raw[index + 2] === "\n" ? 3 : 2;
        break;
      }
      default: {
        if (DIGIT.test(next)) {
          let end = index + 1;
          let octal = "";
          while (end < raw.length && end < index + 4 && DIGIT.test(raw[end])) { octal += raw[end]; end += 1; }
          out += String.fromCharCode(parseInt(octal, 8) & 0xff);
          index = end;
        } else {
          // An unrecognised escape keeps the character after the backslash.
          out += next;
          index += 2;
        }
        break;
      }
    }
  }
  return out;
}

function readHex(src: string, start: number): { text: string | null; end: number } {
  let index = start + 1;
  let hex = "";
  while (index < src.length && src[index] !== ">") { hex += src[index]; index += 1; }
  const end = index < src.length ? index + 1 : index;
  return { text: decodeHex(hex), end };
}

/** Hex strings are plain ASCII or they are a CID/UTF-16 run we refuse to guess at. */
function decodeHex(hex: string): string | null {
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    const high = hexValue(hex.charCodeAt(index));
    const low = index + 1 < hex.length ? hexValue(hex.charCodeAt(index + 1)) : 0;
    bytes.push((high << 4) | low);
  }
  let out = "";
  for (const byte of bytes) {
    const printable =
      byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
    if (!printable) return null;
    out += String.fromCharCode(byte);
  }
  return out;
}

function hexValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return 0;
}

function readDict(src: string, start: number): number {
  let index = start + 2;
  let depth = 1;
  while (index < src.length && depth > 0) {
    if (src[index] === "<" && src[index + 1] === "<") { depth += 1; index += 2; continue; }
    if (src[index] === ">" && src[index + 1] === ">") { depth -= 1; index += 2; continue; }
    index += 1;
  }
  return index;
}

function readArray(src: string, start: number): { items: Token[]; end: number } {
  let index = start + 1;
  const items: Token[] = [];
  while (index < src.length && src[index] !== "]" && items.length < PDF_LIMITS.maxArrayItems) {
    const char = src[index];
    if (WS.test(char)) { index += 1; continue; }
    if (char === "(") { const r = readString(src, index); items.push({ type: "str", text: r.text }); index = r.end; continue; }
    if (char === "<" && src[index + 1] !== "<") { const r = readHex(src, index); items.push({ type: "hex", text: r.text }); index = r.end; continue; }
    if (char === "[") { const r = readArray(src, index); items.push({ type: "array", items: r.items }); index = r.end; continue; }
    if (NUM_CHAR.test(char)) { const r = readNumber(src, index); items.push({ type: "num", value: r.value }); index = r.end; continue; }
    index += 1;
  }
  return { items, end: index < src.length ? index + 1 : index };
}

function readNumber(src: string, start: number): { value: number; end: number } {
  let index = start;
  let num = "";
  while (index < src.length && NUM_CHAR.test(src[index])) { num += src[index]; index += 1; }
  const value = parseFloat(num);
  return { value: Number.isFinite(value) ? value : 0, end: index };
}

function readKeyword(src: string, start: number): { name: string; end: number } {
  let index = start;
  let keyword = "";
  while (index < src.length && KEYWORD_CHAR.test(src[index])) { keyword += src[index]; index += 1; }
  return { name: keyword, end: index };
}

/** Walk the token stream and emit words and line breaks in the order the operators appear. */
function textFromContent(content: string): string {
  const tokens = tokenize(content);
  let text = "";
  let lineHasText = false;
  let previousY: number | null = null;
  const operands: Token[] = [];

  const addSpace = (): void => {
    if (lineHasText && text && !/[\s]$/.test(text)) text += " ";
  };
  const appendWord = (word: string): void => {
    if (!word) return;
    addSpace();
    text += word;
    lineHasText = true;
  };
  const newline = (): void => {
    text = text.replace(/\s+$/, "");
    if (text) text += "\n";
    lineHasText = false;
  };

  for (const token of tokens) {
    if (token.type !== "op") { operands.push(token); continue; }
    const name = token.name;

    if (name === "Tj" || name === "'" || name === '"') {
      const arg = lastTextOperand(operands);
      if (arg) {
        if (name === "'" || name === '"') newline();
        appendWord(arg);
      }
    } else if (name === "TJ") {
      const arg = lastArrayOperand(operands);
      if (arg) {
        for (const item of arg.items) {
          if (item.type === "str") appendWord(item.text);
          else if (item.type === "hex" && item.text !== null) appendWord(item.text);
          // A large negative kerning adjustment is the PDF convention for a space.
          else if (item.type === "num" && item.value < -100) addSpace();
        }
      }
    } else if (name === "T*" || name === "TD") {
      newline();
    } else if (name === "Td") {
      const numbers = lastNumbers(operands, 2);
      if (numbers.length === 2 && numbers[1] < 0) newline();
    } else if (name === "Tm") {
      const numbers = lastNumbers(operands, 6);
      if (numbers.length === 6) {
        const y = numbers[5];
        if (previousY !== null && y < previousY) newline();
        previousY = y;
      }
    }
    operands.length = 0;
  }
  return text.trim();
}

function lastTextOperand(operands: Token[]): string | null {
  for (let index = operands.length - 1; index >= 0; index -= 1) {
    const token = operands[index];
    if (token.type === "str") return token.text;
    if (token.type === "hex") return token.text;
  }
  return null;
}

function lastArrayOperand(operands: Token[]): { items: Token[] } | null {
  for (let index = operands.length - 1; index >= 0; index -= 1) {
    const token = operands[index];
    if (token.type === "array") return { items: token.items };
  }
  return null;
}

function lastNumbers(operands: Token[], count: number): number[] {
  const numbers: number[] = [];
  for (let index = operands.length - 1; index >= 0 && numbers.length < count; index -= 1) {
    const token = operands[index];
    if (token.type === "num") numbers.push(token.value);
  }
  return numbers.reverse();
}

/** Collapse consecutive page numbers into 1-based ranges, e.g. [1,3] → [{1,1},{3,3}]. */
function buildRanges(pages: number[]): { from: number; to: number }[] {
  if (pages.length === 0) return [];
  const ranges: { from: number; to: number }[] = [];
  let start = pages[0];
  let previous = pages[0];
  for (let index = 1; index < pages.length; index += 1) {
    if (pages[index] === previous + 1) { previous = pages[index]; continue; }
    ranges.push({ from: start, to: previous });
    start = pages[index];
    previous = pages[index];
  }
  ranges.push({ from: start, to: previous });
  return ranges;
}
