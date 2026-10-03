import { BRIEF_LIMITS, scopeStructureIssue, type ScopeNode } from "../intake/brief";

/**
 * Parse a student-pasted outline into the same `ScopeNode` tree research uses.
 *
 * A pasted syllabus arrives in the shape the student happened to have — indented
 * bullets, a markdown heading list, or a bare list of topics — and this is the
 * bridge that turns any of them into the section → chapter → topic hierarchy the
 * brief stores. It is deliberately identity-preserving in the same way as
 * `scope-sync.ts`: node ids derive from the label and its occurrence, so parsing
 * the same text twice yields the same nodes, and nothing is invented or rewritten.
 *
 * It is pure and has no network, node-only or server-only imports, so a client
 * component can preview a paste before the server ever sees it.
 */

/** Deterministic node id, identical to `scope-sync.ts`: the label's slug plus its occurrence. */
const idFor = (label: string, ordinal: number): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = ordinal > 1 ? `-${ordinal}` : "";
  return `u-${slug || "unit"}${suffix}`.slice(0, 60);
};

/**
 * Bullet and numbered markers a student may paste. The multi-level numeric form
 * (`1.2`, `1.2.`) must be tried before the single-level one (`1.`), otherwise the
 * engine's leftmost-first alternation would stop at "1." and leave "2 Topic" behind.
 * A plain leading digit like "5 Ways to study" carries no dot and is wording, so it survives.
 */
const MARKER_RE =
  /^(?:[-*•+]|\([a-zA-Z0-9]+\)|\d+(?:\.\d+)+\.?|\d+\.|[ivxlcdm]+\.)\s*/i;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** A tab is measured as two columns; ranking distinct columns handles any consistent step. */
const TAB_COLS = 2;

/** Preserve wording, collapse internal whitespace, drop a trailing colon, bound to the schema. */
const cleanLabel = (raw: string): string =>
  raw.trim().replace(/\s+/g, " ").replace(/:+$/, "").trim().slice(0, 200);

interface Line {
  /** 0 when the line is not a markdown heading, else the heading level clamped to 1..3. */
  heading: number;
  /** Leading-whitespace columns, for indentation nesting. */
  indent: number;
  label: string;
}

export interface ParseOutlineResult {
  nodes: ScopeNode[];
  issue: string | null;
}

export function parseOutline(
  text: string,
  options?: { maxNodes?: number }
): ParseOutlineResult {
  const maxNodes = options?.maxNodes ?? BRIEF_LIMITS.scopeNodes;

  // Tokenise each physical line. Blank lines and lines that reduce to no label drop out here.
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;

    const heading = raw.match(HEADING_RE);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const label = cleanLabel(heading[2]);
      if (!label) continue;
      lines.push({ heading: level, indent: 0, label });
      continue;
    }

    let indent = 0;
    let index = 0;
    while (index < raw.length && (raw[index] === " " || raw[index] === "\t")) {
      indent += raw[index] === "\t" ? TAB_COLS : 1;
      index += 1;
    }
    const label = cleanLabel(raw.slice(index).trim().replace(MARKER_RE, ""));
    if (!label) continue;
    lines.push({ heading: 0, indent, label });
  }

  // Rank the distinct indentation columns, so 2 spaces, 4 spaces and tabs all nest the
  // same relative way without the parser knowing the author's chosen step in advance.
  const indents = [
    ...new Set(lines.filter((line) => !line.heading).map((line) => line.indent)),
  ].sort((a, b) => a - b);
  const rank = new Map(indents.map((value, index) => [value, index]));

  // A document is hierarchical when it has headings or more than one indentation level.
  // A bare list — one level, whether flush or uniformly indented — is a flat set of topics.
  const hasNesting = lines.some((line) => line.heading > 0) || indents.length > 1;

  // Ids are claimed once, in document order, exactly as `scope-sync.ts` does, so two
  // different labels that slug the same ("Cell biology" / "Cell biology!") stay distinct.
  const ordinals = new Map<string, number>();
  const claimed = new Set<string>();
  const uniqueId = (label: string): string => {
    const key = label.toLowerCase();
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    const base = idFor(label, ordinal);
    let candidate = base;
    for (let bump = 2; claimed.has(candidate); bump += 1) {
      candidate = `${base}-${bump}`.slice(0, 60);
    }
    claimed.add(candidate);
    return candidate;
  };

  const nodes: ScopeNode[] = [];
  const stack: { level: number; nodeId: string }[] = [];
  for (const line of lines) {
    const nodeId = uniqueId(line.label);
    if (!hasNesting) {
      nodes.push({ nodeId, label: line.label, kind: "TOPIC", parentId: null, selected: true });
      continue;
    }

    const level = line.heading > 0 ? line.heading : (rank.get(line.indent) ?? 0) + 1;
    // The engine's hierarchy is Section → Chapter → Topic, so anything indented below a
    // topic is clamped to TOPIC and attached under its chapter: a 4th level must not grow
    // the tree past depth 3, and it must not invent a kind the engine does not have.
    const effective = Math.min(level, 3);
    while (stack.length && stack[stack.length - 1].level >= effective) stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].nodeId : null;
    nodes.push({
      nodeId,
      label: line.label,
      kind: effective === 1 ? "SECTION" : effective === 2 ? "CHAPTER" : "TOPIC",
      parentId,
      selected: true,
    });
    stack.push({ level: effective, nodeId });
  }

  // A too-large outline is truncated at the front and *reported*, never silently. Because a
  // parent always precedes its children in document order, the kept prefix is still a valid tree.
  const tooLarge = nodes.length > maxNodes;
  if (tooLarge) nodes.length = maxNodes;

  // Self-check the tree with the brief's own structural gate; a malformed result (duplicate
  // ids, an orphan, a cycle) is surfaced as its code rather than handed back as-is.
  const structural = scopeStructureIssue(nodes);
  return { nodes, issue: structural ?? (tooLarge ? "OUTLINE_TOO_LARGE" : null) };
}
