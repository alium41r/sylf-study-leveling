import { z } from "zod";
import { DEFAULT_PAPER, paperSchema } from "./ink";
import { DEFAULT_STYLUS_MAPPING, stylusMappingSchema } from "./stylus";
export const penPresetSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(50),
  tool: z.enum(["pen", "highlighter"]),
  nib: z
    .enum(["ballpoint", "fountain", "brush", "pencil", "fineliner"])
    .default("ballpoint"),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().min(0.5).max(8),
  opacity: z.number().min(0.05).max(1),
  pressure: z.number().min(0).max(1),
  smoothing: z.number().min(0).max(1),
  lineStyle: z.enum(["solid", "dashed", "dotted"]),
  straighten: z.boolean(),
});
export type PenPreset = z.infer<typeof penPresetSchema>;
export const noteStyleSchema = z.object({
  paper: paperSchema,
  width: z.number().min(320).max(2400),
  height: z.number().min(320).max(4000),
  layout: z.enum(["paged", "continuous"]),
  adaptDark: z.boolean(),
});
export type NoteStyle = z.infer<typeof noteStyleSchema>;
export const DEFAULT_NOTE_STYLE: NoteStyle = {
  paper: { ...DEFAULT_PAPER, template: "blank" },
  width: 800,
  height: 1100,
  layout: "continuous",
  adaptDark: true,
};
export const defaultPens: PenPreset[] = [
  {
    id: "blue",
    name: "Everyday blue",
    tool: "pen",
    nib: "ballpoint",
    color: "#345bc6",
    width: 2.8,
    opacity: 1,
    pressure: 1,
    smoothing: 0.65,
    lineStyle: "solid",
    straighten: false,
  },
  {
    id: "graphite",
    name: "Graphite",
    tool: "pen",
    nib: "pencil",
    color: "#555b63",
    width: 2,
    opacity: 0.65,
    pressure: 0.65,
    smoothing: 0.5,
    lineStyle: "solid",
    straighten: false,
  },
  {
    id: "highlight",
    name: "Soft yellow",
    tool: "highlighter",
    nib: "fineliner",
    color: "#e4b930",
    width: 3.2,
    opacity: 0.28,
    pressure: 0,
    smoothing: 0.65,
    lineStyle: "solid",
    straighten: true,
  },
];
export const notesPreferencesSchema = z.object({
  style: noteStyleSchema.default(DEFAULT_NOTE_STYLE),
  pens: z.array(penPresetSchema).max(8).default(defaultPens),
  templates: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(60),
        style: noteStyleSchema,
      })
    )
    .max(24)
    .default([]),
  stylus: stylusMappingSchema.default(DEFAULT_STYLUS_MAPPING),
});
export type NotesPreferences = z.infer<typeof notesPreferencesSchema>;
export const readNoteStyle = (value: unknown): NoteStyle => {
  const parsed = noteStyleSchema.safeParse(value);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_NOTE_STYLE);
};
export const paperTemplates = [
  ["blank", "Blank", "Basic", "blank", 28],
  ["ruled", "Lined", "Basic", "ruled", 28],
  ["ruled-narrow", "Lined · narrow", "Basic", "ruled", 20],
  ["ruled-wide", "Lined · wide", "Basic", "ruled", 40],
  ["grid", "Grid", "Basic", "grid", 28],
  ["grid-narrow", "Grid · narrow", "Basic", "grid", 16],
  ["grid-wide", "Grid · wide", "Basic", "grid", 40],
  ["dotted", "Dots", "Basic", "dotted", 28],
  ["dotted-narrow", "Dots · narrow", "Basic", "dotted", 16],
  ["cornell", "Cornell notes", "Academic", "cornell", 28],
  ["music", "Music staff", "Academic", "music", 16],
  ["weekly", "Weekly planner", "Planners", "weekly", 28],
  ["daily", "Daily planner", "Planners", "daily", 28],
  ["journal", "Reflection", "Journals", "journal", 28],
].map(([id, name, category, template, spacing]) => ({
  id: String(id),
  name: String(name),
  category: String(category),
  template: template as NoteStyle["paper"]["template"],
  spacing: Number(spacing),
}));
export const paperSizes = [
  { name: "Sylf", width: 800, height: 1100 },
  {
    name: "A4",
    width: 794,
    height: 1123,
    printWidth: 595.2756,
    printHeight: 841.8898,
  },
  {
    name: "Letter",
    width: 816,
    height: 1056,
    printWidth: 612,
    printHeight: 792,
  },
  {
    name: "A5",
    width: 559,
    height: 794,
    printWidth: 419.5276,
    printHeight: 595.2756,
  },
  { name: "Square", width: 900, height: 900 },
];
/** Notebook geometry uses screen/CSS units. PDF pages use 72 points per inch. */
export function notebookPrintSize(
  width: number,
  height: number
): [number, number] {
  const portrait = width <= height;
  const standard = paperSizes.find(
    (p) =>
      p.width === Math.min(width, height) &&
      p.height === Math.max(width, height)
  );
  return standard?.printWidth && standard.printHeight
    ? portrait
      ? [standard.printWidth, standard.printHeight]
      : [standard.printHeight, standard.printWidth]
    : [width * 0.75, height * 0.75];
}
/** Reversible display adaptation only. Native paper, strokes, images and exported colors are untouched. */
export function displayInkColor(color: string, adapt: boolean) {
  if (!adapt) return color;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const luminance = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255;
  if (luminance >= 0.58) return color;
  const lift = (0.68 - luminance) * 0.72;
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(v + (255 - v) * lift)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
export function displayPaper(paper: NoteStyle["paper"], adapt: boolean) {
  return adapt ? { ...paper, color: "#23252a", rule: "#43474f" } : paper;
}
