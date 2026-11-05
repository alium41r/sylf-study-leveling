// The command palette: one search for everything Sylf can do or open, from anywhere (⌘K or Ctrl K, or the search button). It holds
// no index of its own: each section reads what its owner already knows (the Spaces, Home, Workspace, the session, the notes library).
import { useSyncExternalStore } from "react";
import type { IconName } from "@sylf/design-system";

export type CommandGroup = "Suggested" | "Go to" | "Session" | "Create" | "Notes" | "Tools" | "Windows" | "Layouts" | "Workspace";
export const GROUP_ORDER: CommandGroup[] = ["Suggested", "Notes", "Create", "Go to", "Session", "Tools", "Windows", "Layouts", "Workspace"];

export interface Command {
  id: string;
  title: string;
  detail?: string;
  icon: IconName;
  group: CommandGroup;
  /** Other words that should find it: "calculator" for "maths", "timer" for "session". */
  keywords?: string[];
  /** Shown before searching. */
  suggested?: boolean;
  shortcut?: string;
  run(): void;
}

let open = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const commandPalette = {
  isOpen: () => open,
  open() { if (!open) { open = true; notify(); } },
  close() { if (open) { open = false; notify(); } },
  toggle() { open = !open; notify(); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export const useCommandPaletteOpen = () => useSyncExternalStore(commandPalette.subscribe, commandPalette.isOpen, commandPalette.isOpen);

/** How well a command matches: a title that starts with the words first, then a word that does, then anywhere, then its keywords,
 *  then the letters in order ("nn" finds "New note"). Zero is no match. */
export function scoreCommand(command: Pick<Command, "title" | "detail" | "keywords">, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  const title = command.title.toLowerCase();
  if (title === needle) return 100;
  if (title.startsWith(needle)) return 80;
  const words = title.split(/[\s,·–-]+/);
  if (words.some((word) => word.startsWith(needle))) return 60;
  if (title.includes(needle)) return 45;
  const terms = needle.split(/\s+/);
  const haystack = `${title} ${(command.keywords ?? []).join(" ").toLowerCase()} ${(command.detail ?? "").toLowerCase()}`;
  if (terms.every((term) => haystack.includes(term))) return 30;
  let at = 0;
  for (const char of needle.replace(/\s+/g, "")) { at = title.indexOf(char, at) + 1; if (!at) return 0; }
  return 10;
}

/** The commands to show for a query, best first, grouped in the palette's order, at most `limit` in all. */
export function rankCommands(commands: readonly Command[], query: string, limit = 40): Command[] {
  const searching = query.trim().length > 0;
  const scored = commands
    .map((command, index) => ({ command, index, score: searching ? scoreCommand(command, query) : command.suggested ? 1 : 0 }))
    .filter((item) => item.score > 0);
  if (!searching) return scored.map((item) => ({ ...item.command, group: "Suggested" as const })).slice(0, limit);
  // The best match leads, then each group keeps its own best-first order.
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = scored.slice(0, limit);
  const lead = best[0]?.command.group;
  return best.sort((a, b) => (a.command.group === lead ? 0 : 1) - (b.command.group === lead ? 0 : 1) || GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group) || b.score - a.score || a.index - b.index).map((item) => item.command);
}
