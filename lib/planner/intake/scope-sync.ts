import type { ScopeNode } from "./brief";

/**
 * Keep the scope tree in step with a plain text list of units.
 *
 * Phase 1's manual entry is one unit per line, but the brief stores a hierarchy, so
 * this is the bridge — and it is deliberately *identity-preserving*: a unit the
 * student has not renamed keeps its `nodeId`, which is what their stated preparedness
 * is keyed by. Re-creating nodes on every edit would silently drop every rating the
 * student had given, so matching happens by label (case-insensitively) and in order.
 *
 * Everything here is pure and deterministic, and `sync(sync(x)) === sync(x)`: ids are
 * derived from the label and its occurrence, so re-running the same text changes
 * nothing.
 */

export interface ScopeSync {
  /** Units that did not exist before, in list order. */
  add: ScopeNode[];
  /** Node ids that are no longer in the list. */
  remove: string[];
  /** Nodes whose label changed but kept their identity. */
  rename: { nodeId: string; label: string }[];
  /** The resulting list, in list order, for previewing before sending. */
  nodes: ScopeNode[];
  /** False when the list already matches the tree, so no action needs sending. */
  changed: boolean;
}

/** A stable, deterministic node id: the label's slug plus its occurrence when repeated. */
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
 * A range of numbered items at the END of a line, with whatever names them in front.
 *
 * Anchored to the end on purpose. "Chapter 1-10" is a range; "Chapters 1-10 review" is a
 * unit *called* that, and expanding it would invent nine units the student never asked
 * for. Requiring the line to finish on the range is what tells the two apart without a
 * rule about English.
 *
 * The two numbers are capped at three digits, which is the guard that keeps years out:
 * "2020-2024" cannot match, so a date is never silently turned into five units.
 */
const TRAILING_RANGE = /^(.*?)(\d{1,3})\s*(?:-|–|—|to|through)\s*(\d{1,3})$/i;

/**
 * The most units one typed range may become.
 *
 * A student who writes "chapters 1-150" has almost certainly mistyped or means something
 * other than 150 separate units, and materialising them would be worse than passing the
 * line through unchanged — they would get a 150-unit scope they never looked at. Past this
 * the line is left exactly as typed, so what they see is what they wrote, and they can
 * split it themselves. It sits well above any real chapter range and well below the
 * brief's own 200-node ceiling, so the two limits never contradict each other.
 */
const MAX_RANGE_SPAN = 60;

/**
 * Plural nouns this expands, and what one of them is called.
 *
 * A closed list rather than "strip a trailing s": `Physics 1-10` would become `Physic 1`,
 * and a rule that mangles the student's own words is worse than no expansion. Anything not
 * on this list keeps its prefix untouched — `a level physics p2 chapter 1-10` expands to
 * `a level physics p2 chapter 1` and so on, which is wordier than `Chapter 1` but never
 * loses the part that says which paper the chapters belong to.
 */
const PLURAL_NOUNS: Record<string, string> = {
  chapters: "Chapter",
  units: "Unit",
  topics: "Topic",
  sections: "Section",
  papers: "Paper",
  modules: "Module",
  parts: "Part",
  weeks: "Week",
  days: "Day",
  lessons: "Lesson",
  questions: "Question",
  exercises: "Exercise",
};

/**
 * Expand one line into the units it names, or null when it names just one.
 *
 * This exists because of how a student actually writes a scope. Nobody types ten chapter
 * names from memory; they type the range they were told to cover — "A-Level Physics P2,
 * chapters 1-10" — and expect Sylf to do the rest. Before this, that line became a single
 * unit called "chapters 1-10", the plan had one item on it, and the only way to get ten was
 * to look all ten up and type them out. The range is the input; the units are the output.
 *
 * It is deliberately deterministic and local. Nothing here guesses what a chapter is
 * *called* — that is research's job, against the real specification — so a student who
 * wants the official names still runs research on the qualification and confirms what it
 * finds. This just makes the manual path usable when research has nothing to offer, which
 * is the common case for a single paper.
 */
export function expandSequence(label: string): string[] | null {
  const match = TRAILING_RANGE.exec(label);
  if (!match) return null;
  const [, rawPrefix, rawFrom, rawTo] = match;
  const from = Number.parseInt(rawFrom, 10);
  const to = Number.parseInt(rawTo, 10);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // A range has to run forwards and cover more than one item.
  if (to <= from) return null;
  if (to - from + 1 > MAX_RANGE_SPAN) return null;

  /**
   * The tail of the prefix is the noun the numbers count. `Chapters 1-10` names them
   * "Chapter"; `Chapter 1-10` already agrees with one of them and is left alone.
   */
  const prefix = rawPrefix.replace(/\s+$/, "");
  const words = prefix.split(" ");
  const last = words[words.length - 1] ?? "";
  const singular = PLURAL_NOUNS[last.toLowerCase()];
  const head = singular ? [...words.slice(0, -1), singular].join(" ") : prefix;
  // A range with no noun at all — a bare "1-10" — is expanded as the numbers themselves,
  // which is the only faithful reading of it.
  const stem = head ? `${head} ` : "";
  return Array.from({ length: to - from + 1 }, (_, index) => `${stem}${from + index}`.slice(0, 200));
}

export function parseScopeLines(text: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const push = (label: string) => {
    const key = label.toLowerCase();
    // A repeated line is the same unit, not a second one: the engine requires unique
    // labels, and merging them keeps the student's list exactly as they typed it.
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  };
  for (const raw of text.split("\n")) {
    const label = raw.trim().replace(/\s+/g, " ").slice(0, 200);
    if (!label) continue;
    const expanded = expandSequence(label);
    // A range that overlaps one already listed — "Chapters 1-10" then "Chapter 4" — is
    // deduplicated by the same rule as everything else, so the second mention is dropped
    // rather than adding the same unit twice.
    if (expanded) for (const unit of expanded) push(unit);
    else push(label);
  }
  return labels;
}

export function syncScopeNodes(
  existing: readonly ScopeNode[],
  labels: readonly string[],
  kind: ScopeNode["kind"] = "TOPIC"
): ScopeSync {
  const ordinals = new Map<string, number>();
  // Two different labels can slug to the same id ("Cell biology!" and "Cell biology"),
  // and a duplicate id is rejected outright as `DUPLICATE_SCOPE_NODE`. Every id is
  // therefore claimed once, deterministically, in list order.
  const claimed = new Set(existing.map((node) => node.nodeId));
  const uniqueId = (label: string, ordinal: number): string => {
    const base = idFor(label, ordinal);
    let candidate = base;
    for (let bump = 2; claimed.has(candidate); bump += 1)
      candidate = `${base}-${bump}`.slice(0, 60);
    claimed.add(candidate);
    return candidate;
  };
  const takenIds = new Set<string>();
  const nodes: ScopeNode[] = labels.map((label) => {
    const key = label.toLowerCase();
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    const previous = existing.find(
      (node) =>
        !takenIds.has(node.nodeId) && node.label.toLowerCase() === key && node.kind === kind
    );
    if (previous) takenIds.add(previous.nodeId);
    return {
      nodeId: previous?.nodeId ?? uniqueId(label, ordinal),
      label,
      kind,
      parentId: previous?.parentId ?? null,
      selected: previous?.selected ?? true,
    };
  });

  // Editing a unit's wording in place is a rename, not a deletion plus an addition, so
  // the unit keeps its id — and with it the preparedness the student stated for it.
  // Positional pairing only applies when the list still has exactly as many units as it
  // had, which is what makes it safe: adding or removing a line changes the length and
  // switches the pairing off, so an inserted unit cannot silently rename the one below it.
  const ofKind = existing.filter((node) => node.kind === kind);
  if (labels.length === ofKind.length && labels.length > 0) {
    const free = ofKind.filter((node) => !takenIds.has(node.nodeId));
    nodes.forEach((node, index) => {
      if (takenIds.has(node.nodeId)) return;
      const replacement = free[index];
      if (!replacement || takenIds.has(replacement.nodeId)) return;
      takenIds.add(replacement.nodeId);
      claimed.add(replacement.nodeId);
      nodes[index] = {
        ...node,
        nodeId: replacement.nodeId,
        parentId: replacement.parentId,
        selected: replacement.selected,
      };
    });
  }
  const usedIds = new Set(nodes.map((node) => node.nodeId));
  // Anything the caller did not put in the list is removed, including containers:
  // this editor owns nothing but the units it shows.
  const remove = existing.filter((node) => !usedIds.has(node.nodeId)).map((node) => node.nodeId);
  const rename = nodes
    .filter((node) => {
      const previous = existing.find((candidate) => candidate.nodeId === node.nodeId);
      return previous ? previous.label !== node.label : false;
    })
    .map((node) => ({ nodeId: node.nodeId, label: node.label }));
  // The service applies additions by appending and skips ids it already has, so only
  // genuinely new units are sent: an unchanged unit is never re-sent, and a retry of
  // the same action cannot duplicate the scope.
  const known = new Set(existing.map((node) => node.nodeId));
  const add = nodes.filter((node) => !known.has(node.nodeId));
  return {
    add,
    remove,
    rename,
    nodes,
    changed: add.length > 0 || remove.length > 0 || rename.length > 0,
  };
}

/**
 * The text a scope tree shows as.
 *
 * Every node appears, including one the student had deselected: this editor's list is
 * the whole scope, so showing a subset would make "save" mean "delete what you could
 * not see".
 *
 * Order is the *stored* order, not the typed order. The service applies additions by
 * appending and renames in place, so a line typed into the middle of the list is
 * appended rather than inserted; showing the stored order means the editor never
 * claims an order the plan does not have. Reordering belongs with the research and
 * import work, where a scope arrives with a real structure to preserve.
 */
export const scopeText = (nodes: readonly ScopeNode[]): string =>
  nodes.map((node) => node.label).join("\n");
