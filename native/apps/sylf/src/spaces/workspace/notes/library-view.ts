import { inLibraryOrder, type LibrarySnapshot, type Notebook } from "@sylf/notes";

export type LibraryPlace = { all: true } | { folder: string | null } | { trash: true } | { imported: true };
export type LibrarySort = "folder" | "recent" | "name";
export interface LibraryLocation {
  place: LibraryPlace;
  query: string;
  view?: "grid" | "list";
  sort?: LibrarySort;
  expanded?: readonly string[];
}
export const ROOT_LIBRARY: LibraryLocation = { place: { all: true }, query: "" };
export const folderKey = (id: string | null | undefined) => id ?? "";

export function folderIndex(folders: Notebook[], order: LibrarySnapshot["order"], sort: LibrarySort) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map<string, Notebook[]>();
  for (const folder of folders) {
    const parent = folder.parentId && byId.has(folder.parentId) ? folder.parentId : "";
    const siblings = children.get(parent) ?? [];
    siblings.push(folder);
    children.set(parent, siblings);
  }
  for (const [parent, siblings] of children) {
    siblings.sort((a, b) => (sort === "recent" ? b.created - a.created : 0) || a.title.localeCompare(b.title));
    if (sort === "folder") children.set(parent, inLibraryOrder(siblings, order?.[parent]));
  }
  return { byId, children };
}

/** Iterative traversal so arbitrary nesting and old, malformed parent links never trap the browser. */
export function folderRows(children: ReadonlyMap<string, Notebook[]>, expanded?: ReadonlySet<string>, exclude?: string) {
  const result: { folder: Notebook; depth: number; hasChildren: boolean }[] = [];
  const queue = (children.get("") ?? []).map((folder) => ({ folder, depth: 0 })).reverse();
  const seen = new Set<string>();
  while (queue.length) {
    const item = queue.pop()!;
    const id = item.folder.id;
    if (id === exclude || seen.has(id)) continue;
    seen.add(id);
    const below = children.get(id) ?? [];
    result.push({ ...item, hasChildren: below.length > 0 });
    if (!expanded || expanded.has(id)) {
      for (let i = below.length - 1; i >= 0; i--) queue.push({ folder: below[i], depth: item.depth + 1 });
    }
  }
  return result;
}

export function folderPath(folder: Notebook | null, byId: ReadonlyMap<string, Notebook>): Notebook[] {
  const path: Notebook[] = [];
  const seen = new Set<string>();
  for (let next = folder; next && !seen.has(next.id); next = byId.get(next.parentId ?? "") ?? null) {
    seen.add(next.id);
    path.unshift(next);
  }
  return path;
}
