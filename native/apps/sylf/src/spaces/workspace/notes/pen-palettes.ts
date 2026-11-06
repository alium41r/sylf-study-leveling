// The colours a pen and a highlighter offer, in sets of eight, and the set of colours you mixed yourself. The first set of each is
// what the toolbar shows.
export const INKS = ["#1f2a44", "#345bc6", "#c8423b", "#2f8f5b", "#7a4fd0", "#555b63"];
export const HIGHLIGHTS = ["#e4b930", "#7ed3a3", "#f29bc1", "#8ec5ff"];

export interface InkPage { label: string; inks: string[] }
const PEN_PAGES: InkPage[] = [
  { label: "Ink", inks: [...INKS, "#111318", "#8a5a2b"] },
  { label: "Bright", inks: ["#e53935", "#f4801f", "#e8b400", "#3a9d3a", "#0097a7", "#1e63d6", "#8e3ad1", "#d6337a"] },
  { label: "Soft", inks: ["#e88a8a", "#f2b07a", "#d9c46a", "#8fc79a", "#7cc4cc", "#8fa8e8", "#b79ae0", "#e39ac0"] },
];
const HIGHLIGHT_PAGES: InkPage[] = [
  { label: "Highlight", inks: [...HIGHLIGHTS, "#f6a04d", "#c3a2f0", "#b5e36b", "#f37a7a"] },
];

/** The sets for a tool, with yours last when you have mixed any. */
export function inkPages(tool: "pen" | "highlighter", custom: readonly string[]): InkPage[] {
  const pages = tool === "pen" ? PEN_PAGES : HIGHLIGHT_PAGES;
  return custom.length ? [...pages, { label: "Yours", inks: [...custom] }] : pages;
}

/** Keeps a mixed colour with yours, unless a set already has it. */
export function addPaletteInk(hex: string, pages: readonly InkPage[], add: (hex: string) => void) {
  if (!pages.some((page) => page.label !== "Yours" && page.inks.includes(hex.toLowerCase()))) add(hex);
}
