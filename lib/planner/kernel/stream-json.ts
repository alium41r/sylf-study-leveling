// Incremental JSON for streamed tool arguments. The model writes `{"items":[{…},{…},…]}` a few characters at a time; this parser hands each array
// element over the moment its closing brace arrives, so the solver can start on item one while item six is still being written. It tracks strings and
// escapes, never evaluates anything, and leaves validation to the schema.

export class StreamingArrayParser<T = unknown> {
  private buffer = "";
  private scanned = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private arrayDepth = -1;
  private elementStart = -1;
  private keyCandidate = "";
  private lastKey = "";
  private readonly field: string;
  private readonly emit: (value: T, index: number) => void;
  private count = 0;
  private readonly errors: string[] = [];

  /** `field` names the top-level array to stream, e.g. `items` or `ops`. */
  constructor(field: string, emit: (value: T, index: number) => void) {
    this.field = field;
    this.emit = emit;
  }

  get emitted(): number { return this.count; }
  get problems(): readonly string[] { return this.errors; }
  get text(): string { return this.buffer; }

  push(chunk: string): void {
    this.buffer += chunk;
    for (let i = this.scanned; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (this.inString) {
        if (this.escaped) { this.escaped = false; if (this.depth === 1 && this.arrayDepth < 0) this.keyCandidate += ch; continue; }
        if (ch === "\\") { this.escaped = true; continue; }
        if (ch === "\"") { this.inString = false; if (this.depth === 1 && this.arrayDepth < 0) this.lastKey = this.keyCandidate; continue; }
        if (this.depth === 1 && this.arrayDepth < 0) this.keyCandidate += ch;
        continue;
      }
      if (ch === "\"") { this.inString = true; if (this.depth === 1 && this.arrayDepth < 0) this.keyCandidate = ""; continue; }
      if (ch === "{" || ch === "[") {
        this.depth++;
        if (ch === "[" && this.depth === 2 && this.arrayDepth < 0 && this.lastKey === this.field) this.arrayDepth = this.depth;
        else if (this.arrayDepth > 0 && this.depth === this.arrayDepth + 1 && this.elementStart < 0) this.elementStart = i;
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (this.arrayDepth > 0 && this.depth === this.arrayDepth + 1 && this.elementStart >= 0) {
          const raw = this.buffer.slice(this.elementStart, i + 1);
          this.elementStart = -1;
          try { this.emit(JSON.parse(raw) as T, this.count++); } catch { this.errors.push(raw.slice(0, 200)); }
        }
        if (this.arrayDepth > 0 && this.depth === this.arrayDepth && ch === "]") this.arrayDepth = -2;
        this.depth--;
      }
    }
    this.scanned = this.buffer.length;
  }

  /** The whole document once the stream has ended, or null when it is not valid JSON. */
  finish(): unknown {
    try { return JSON.parse(this.buffer); } catch { return null; }
  }
}
