import type { ScopeNode } from "../intake/scope-node";
import { flattenScope } from "../intake/brief";

/**
 * The confirmed scope, as the rows a comparison and a preparedness matrix are about.
 *
 * One implementation, used by the server when it builds a comparison and by the
 * browser when it renders one. A unit's reference is the node id the engine will
 * eventually schedule, and its `path` is the chapter and section above it — which is
 * what lets the surface group forty rows into a handful of chapters instead of showing
 * one flat list.
 *
 * Pure and dependency-free on purpose: the client must not be able to disagree with the
 * server about which unit a row is.
 */
export interface ComparisonUnitRow {
  /** The scope node this row represents. */
  unitRef: string;
  /** What the student sees — the unit's own label, never a disambiguated engine label. */
  label: string;
  /** Ancestor labels, outermost first. Empty for a top-level unit. */
  path: string[];
}

export function unitRows(nodes: readonly ScopeNode[]): ComparisonUnitRow[] {
  const flat = flattenScope(nodes);
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  return flat.units.map((unit) => {
    const path: string[] = [];
    let cursor = byId.get(unit.nodeId)?.parentId ?? null;
    let guard = 0;
    while (cursor && path.length < 3 && guard < 8) {
      const parent = byId.get(cursor);
      if (!parent) break;
      path.unshift(parent.label);
      cursor = parent.parentId;
      guard += 1;
    }
    return { unitRef: unit.nodeId, label: unit.displayLabel, path };
  });
}

/** Rows by reference, for looking one up while rendering. */
export function unitRowMap(rows: readonly ComparisonUnitRow[]): Map<string, ComparisonUnitRow> {
  return new Map(rows.map((row) => [row.unitRef, row]));
}

/** One collapsible group of rows: a chapter (or the top level) and what is under it. */
export interface UnitGroup {
  /** A stable key: the top-level ancestor's node id, or "" for loose units. */
  key: string;
  label: string;
  rows: ComparisonUnitRow[];
}

/**
 * Group rows by their top-level ancestor, preserving order.
 *
 * Grouping is what makes a forty-unit scope reviewable: one bulk action per chapter
 * replaces forty individual clicks, and a student who knows a whole subject area can
 * answer it in one go.
 */
export function groupUnitRows(
  rows: readonly ComparisonUnitRow[],
  nodes: readonly ScopeNode[]
): UnitGroup[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const topOf = (row: ComparisonUnitRow): { key: string; label: string } => {
    if (!row.path.length) return { key: "", label: "Other units" };
    // Walk to the outermost ancestor so Section → Chapter → Topic groups by section.
    let cursor = byId.get(row.unitRef)?.parentId ?? null;
    let outermost = cursor;
    let guard = 0;
    while (cursor && guard < 8) {
      outermost = cursor;
      cursor = byId.get(cursor)?.parentId ?? null;
      guard += 1;
    }
    const node = outermost ? byId.get(outermost) : undefined;
    return node ? { key: node.nodeId, label: node.label } : { key: "", label: row.path[0] ?? "Other units" };
  };
  const groups = new Map<string, UnitGroup>();
  for (const row of rows) {
    const { key, label } = topOf(row);
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { key, label, rows: [row] });
  }
  return [...groups.values()];
}
