import type { Revision } from "./contracts";
import { NotesError } from "./errors";

export function orderedRevisions(revisions: Revision[]): Revision[] {
  const map = new Map(revisions.map((r) => [r.id, r])),
    children = new Map<string, string[]>(),
    counts = new Map<string, number>();
  for (const revision of revisions) {
    counts.set(revision.id, revision.commit.parents.length);
    for (const parent of revision.commit.parents) {
      const prior = map.get(parent);
      if (
        !prior ||
        prior.commit.documentId !== revision.commit.documentId ||
        prior.commit.sequence >= revision.commit.sequence
      )
        throw new NotesError(
          "CORRUPT",
          "Revision ancestry is incomplete or invalid."
        );
      children.set(parent, [...(children.get(parent) ?? []), revision.id]);
    }
  }
  const ready = revisions
      .filter((r) => !r.commit.parents.length)
      .map((r) => r.id)
      .sort(),
    result: Revision[] = [];
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i];
    result.push(map.get(id)!);
    for (const child of children.get(id) ?? []) {
      const count = counts.get(child)! - 1;
      counts.set(child, count);
      if (!count) ready.push(child);
    }
  }
  if (result.length !== map.size || map.size !== revisions.length)
    throw new NotesError("CORRUPT", "Cyclic or duplicate revision graph.");
  return result;
}
export function ancestors(
  ids: readonly string[],
  map: ReadonlyMap<string, Revision>
): Set<string> {
  const visited = new Set<string>(),
    pending = [...ids];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    const revision = map.get(id);
    if (!revision)
      throw new NotesError("CORRUPT", "Missing revision ancestor.");
    visited.add(id);
    pending.push(...revision.commit.parents);
  }
  return visited;
}
export function frontier(revisions: Revision[]): string[] {
  const heads = new Set(revisions.map((r) => r.id));
  for (const r of revisions)
    for (const parent of r.commit.parents) heads.delete(parent);
  return [...heads].sort();
}
export function hasUnrestoredDeletion(
  ids: string[],
  map: ReadonlyMap<string, Revision>
): boolean {
  const reachable = ancestors(ids, map),
    deletions = new Set(
      [...reachable].filter((id) => map.get(id)!.commit.kind === "tombstone")
    );
  for (const id of reachable)
    if (map.get(id)!.commit.kind === "restore")
      for (const previous of ancestors([id], map)) deletions.delete(previous);
  return deletions.size > 0;
}

export interface FolderMove {
  folderId: string;
  parentId: string | null;
  sequence: number;
  writerId: string;
  operationId: string;
}
export function projectFolderMoves(moves: readonly FolderMove[]): {
  parents: Record<string, string | null>;
  recovered: string[];
} {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const chosen = new Map<string, string | null>();
  for (const move of [...moves].sort(
    (a, b) =>
      a.sequence - b.sequence ||
      compare(a.writerId, b.writerId) ||
      compare(a.operationId, b.operationId)
  ))
    chosen.set(move.folderId, move.parentId);
  const recovered: string[] = [];
  for (const id of [...chosen.keys()].sort()) {
    const seen = new Set([id]);
    let parent = chosen.get(id);
    while (parent) {
      if (seen.has(parent) || !chosen.has(parent)) {
        chosen.set(id, null);
        recovered.push(id);
        break;
      }
      seen.add(parent);
      parent = chosen.get(parent);
    }
  }
  return { parents: Object.fromEntries(chosen), recovered };
}
