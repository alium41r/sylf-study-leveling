// Starting points. Typed templates are BlockNote block JSON that the editor itself inserts, so BlockNote's own schema writes every node
// (Phase 2 §5.2: a hand-written Yjs element that misses the schema is deleted). Paper templates are the web's paper schema, unchanged.
import { ink, type InkPaper } from "@sylf/shared";

export interface TemplateBlock { type: "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "checkListItem" | "quote"; props?: Record<string, string | number | boolean>; content?: string }
export interface TypedTemplate { id: string; label: string; detail: string; blocks: TemplateBlock[] }

const h = (content: string, level = 2): TemplateBlock => ({ type: "heading", props: { level }, content });
const p = (content = ""): TemplateBlock => ({ type: "paragraph", content });
const li = (content = ""): TemplateBlock => ({ type: "bulletListItem", content });
const n = (content = ""): TemplateBlock => ({ type: "numberedListItem", content });
const todo = (content = ""): TemplateBlock => ({ type: "checkListItem", content });

export const TYPED_TEMPLATES: TypedTemplate[] = [
  { id: "blank", label: "Blank", detail: "An empty page", blocks: [] },
  { id: "lecture", label: "Lecture", detail: "Key ideas, details, questions", blocks: [h("Key ideas"), li(), h("Details"), p(), h("Questions"), todo(), h("Summary"), p()] },
  { id: "cornell", label: "Cornell", detail: "Cues, notes, summary", blocks: [h("Cues"), li(), h("Notes"), p(), h("Summary"), p()] },
  { id: "revision", label: "Revision", detail: "What to remember and practise", blocks: [h("In one sentence"), { type: "quote", content: "" }, h("Must remember"), li(), h("Examples"), p(), h("Practise"), todo()] },
  { id: "problems", label: "Problem set", detail: "Given, find, working, answer", blocks: [h("Problem 1"), n("Given"), n("Find"), n("Working"), n("Answer")] },
  { id: "plan", label: "Study plan", detail: "Goals and steps for a session", blocks: [h("Goal"), p(), h("Steps"), todo(), todo(), h("Done when"), p()] },
];

export const typedTemplate = (id: string | null | undefined) => TYPED_TEMPLATES.find((t) => t.id === id) ?? TYPED_TEMPLATES[0];

export type PaperTemplate = InkPaper["template"];
export interface PaperChoice { id: PaperTemplate; label: string }
export const PAPER_TEMPLATES: PaperChoice[] = [
  { id: "ruled", label: "Ruled" }, { id: "grid", label: "Grid" }, { id: "dotted", label: "Dotted" }, { id: "blank", label: "Blank" },
  { id: "cornell", label: "Cornell" }, { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "journal", label: "Journal" }, { id: "music", label: "Music" },
];
export const BOARD_TEMPLATES: PaperChoice[] = [{ id: "dotted", label: "Dotted" }, { id: "grid", label: "Grid" }, { id: "blank", label: "Blank" }];

/** The web's default paper, with a quieter spacing for grids and dots. */
export const paperFor = (template: PaperTemplate): InkPaper => ({ ...ink.DEFAULT_PAPER, template, spacing: template === "grid" || template === "dotted" ? 24 : ink.DEFAULT_PAPER.spacing });
export const boardPaper = (template: PaperTemplate): InkPaper => ({ template, color: "#fbfbf8", rule: "#d6d9e0", spacing: 32 });
