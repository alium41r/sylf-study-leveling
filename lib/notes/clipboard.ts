import { z } from "zod";
import { inkSampleSchema, type InkBrush } from "./ink";
export const NOTES_CLIPBOARD_TYPE = "application/x-sylf-notes+json";
const payloadSchema = z.object({
  version: z.literal(1),
  strokes: z
    .array(
      z.object({
        style: z.record(z.string(), z.unknown()),
        points: z.array(inkSampleSchema).min(1).max(100000),
      })
    )
    .max(2000),
});
export type NotesClipboard = {
  version: 1;
  strokes: { style: InkBrush; points: z.infer<typeof inkSampleSchema>[] }[];
};
let memory: NotesClipboard | undefined;
/** The last in-app copy, used by the Paste button where reading the system clipboard is not permitted. */
export const lastNotesCopy = () => memory;
/** Puts handwriting on the clipboard in Sylf's lossless format; other apps receive the plain text, if any. */
export function writeNotesClipboard(
  data: DataTransfer | null,
  strokes: NotesClipboard["strokes"],
  text = ""
) {
  memory = { version: 1, strokes };
  if (!data) return;
  data.setData(NOTES_CLIPBOARD_TYPE, JSON.stringify(memory));
  data.setData("text/plain", text);
}
export type PastedContent = {
  notes?: NotesClipboard;
  images: File[];
  text: string;
};
/** Classifies what a paste/drop carries; malformed Sylf payloads are ignored rather than trusted. */
export function readNotesClipboard(data: DataTransfer | null): PastedContent {
  const content: PastedContent = { images: [], text: "" };
  if (!data) return content;
  const raw = data.getData(NOTES_CLIPBOARD_TYPE);
  if (raw) {
    try {
      const parsed = payloadSchema.safeParse(JSON.parse(raw));
      if (parsed.success) content.notes = parsed.data as NotesClipboard;
    } catch {
      /* Not Sylf data. */
    }
  }
  for (const file of Array.from(data.files || []))
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.type))
      content.images.push(file);
  content.text = data.getData("text/plain") || "";
  return content;
}
