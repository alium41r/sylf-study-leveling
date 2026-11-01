import * as Y from "yjs";
import type { DocumentDescriptor } from "./contracts";
import { PageBoxes } from "./text-boxes";
import { InkModel, inkRecordSchema } from "./ink";
import {
  contentBounds,
  contentGroups,
  type ContentSelection,
} from "./content-layout";
import { NotesError } from "./errors";
export type ContentEdit =
  | { type: "order"; where: "front" | "back" }
  | { type: "move" | "copy"; targetPageId: string }
  | { type: "position"; x: number; y: number }
  | { type: "group" }
  | { type: "ungroup" };
export type ContentPage = {
  page: DocumentDescriptor["pages"][number];
  text: Y.Doc;
  ink: Y.Doc;
};
/** Work on detached native documents; the library publishes all deltas in one revision. */
export function editPageContent(
  pages: Map<string, ContentPage>,
  selections: ContentSelection[],
  edit: ContentEdit
) {
  for (const selection of selections) {
    const source = pages.get(selection.pageId);
    if (!source)
      throw new NotesError("NOT_FOUND", "The selected page is unavailable.");
    const regions = new PageBoxes(source.text, source.page, () => true),
      ink = new InkModel(source.ink);
    try {
      const boxes = regions
        .boxes()
        .filter((b) => selection.boxes.includes(b.id));
      const strokes = ink
        .strokes()
        .filter((s) => selection.strokes.includes(s.id));
      if (!boxes.length && !strokes.length) continue;
      if (edit.type === "order") {
        const orders = regions.boxes().map((b) => b.order || 0);
        let order =
          edit.where === "front"
            ? Math.max(0, ...orders)
            : Math.min(0, ...orders) - boxes.length - 1;
        for (const box of boxes) regions.set({ ...box, order: ++order });
      } else if (edit.type === "group" || edit.type === "ungroup") {
        const groups = source.text.getMap("content-groups");
        for (const g of contentGroups(source.text))
          if (
            g.boxes.some((id) => selection.boxes.includes(id)) ||
            g.strokes.some((id) => selection.strokes.includes(id))
          )
            groups.delete(g.id);
        if (edit.type === "group")
          groups.set(crypto.randomUUID(), {
            boxes: boxes.map((b) => b.id),
            strokes: strokes.map((s) => s.id),
          });
      } else if (edit.type === "position") {
        const bounds = contentBounds([
          ...boxes,
          ...strokes.map((s) => s.bounds),
        ])!;
        const dx = edit.x - bounds.x,
          dy = edit.y - bounds.y;
        if (
          !Number.isFinite(dx) ||
          !Number.isFinite(dy) ||
          edit.x < 0 ||
          edit.y < 0 ||
          edit.x + bounds.width > source.page.width ||
          edit.y + bounds.height > 100000
        )
          throw new NotesError(
            "LIMIT",
            "Keep the selection within the page width and supported height."
          );
        for (const box of boxes)
          regions.set({ ...box, x: box.x + dx, y: box.y + dy });
        if (strokes.length)
          ink.edit({
            targets: strokes.map((s) => s.id),
            transform: { dx, dy, scale: 1, cx: 0, cy: 0 },
          });
        source.page.height = Math.max(
          source.page.height,
          edit.y + bounds.height + 40
        );
      } else {
        const target = pages.get(edit.targetPageId);
        if (!target || target === source)
          throw new NotesError(
            "CONFLICT",
            "Choose another page for this selection."
          );
        const targetBoxes = new PageBoxes(target.text, target.page, () => true),
          targetInk = new InkModel(target.ink);
        try {
          const bounds = contentBounds([
            ...boxes,
            ...strokes.map((s) => s.bounds),
          ])!;
          if (bounds.width > target.page.width - 40)
            throw new NotesError(
              "LIMIT",
              "The selection needs a wider destination page."
            );
          const dx =
            Math.max(
              20,
              Math.min(bounds.x, target.page.width - bounds.width - 20)
            ) - bounds.x;
          const boxIds = new Map<string, string>();
          for (const box of boxes) {
            const id = "box-" + crypto.randomUUID();
            boxIds.set(box.id, id);
            if (box.kind === "text") {
              const fragment = target.text.getXmlFragment(id);
              fragment.insert(
                0,
                source.text
                  .getXmlFragment(box.id)
                  .toArray()
                  .map((item) => {
                    if (item instanceof Y.XmlHook)
                      throw new NotesError(
                        "UNSUPPORTED",
                        "This text object requires its original reader."
                      );
                    return item.clone();
                  })
              );
            }
            targetBoxes.set({
              ...box,
              id,
              x: box.x + dx,
              order:
                Math.max(0, ...targetBoxes.boxes().map((b) => b.order || 0)) +
                1,
            });
            if (edit.type === "move") {
              if (box.id === "body") {
                const body = source.text.getXmlFragment("body");
                body.delete(0, body.length);
              } else regions.set({ ...box, removed: true });
            }
          }
          // Copy native chunks and edits, including original samples, cut masks and transforms.
          const ids = new Map(strokes.map((s) => [s.id, crypto.randomUUID()]));
          const records = [...ink.records.values()].map((r) =>
            inkRecordSchema.parse(r)
          );
          let clock = Math.max(
            0,
            ...[...targetInk.records.values()].map(
              (r) => inkRecordSchema.parse(r).clock
            )
          );
          const clocks = new Map<string, number>();
          target.ink.transact(() => {
            for (const record of records.sort((a, b) => {
              if (a.clock !== b.clock) return a.clock - b.clock;
              // Projection orders concurrent strokes by stroke ID, not chunk ID.
              if (a.kind === "part" && b.kind === "part")
                return a.stroke.localeCompare(b.stroke) || a.part - b.part;
              if (a.kind === "part") return -1;
              if (b.kind === "part") return 1;
              return a.id.localeCompare(b.id);
            })) {
              if (
                record.kind === "paper" ||
                (record.kind === "edit"
                  ? !record.targets.some((id) => ids.has(id))
                  : !ids.has(record.stroke))
              )
                continue;
              const id = crypto.randomUUID();
              const key = record.kind === "part" ? record.stroke : record.id;
              if (!clocks.has(key)) clocks.set(key, ++clock);
              const next =
                record.kind !== "edit"
                  ? {
                      ...record,
                      id,
                      clock: clocks.get(key)!,
                      stroke: ids.get(record.stroke)!,
                    }
                  : {
                      ...record,
                      id,
                      clock: clocks.get(key)!,
                      targets: record.targets
                        .filter((t) => ids.has(t))
                        .map((t) => ids.get(t)!),
                    };
              targetInk.records.set(id, next);
            }
          });
          if (strokes.length && dx)
            targetInk.edit({
              targets: [...ids.values()],
              transform: { dx, dy: 0, scale: 1, cx: 0, cy: 0 },
            });
          targetInk.assertHealthy();
          for (const group of contentGroups(source.text)) {
            const members = {
              boxes: group.boxes
                .filter((id) => boxIds.has(id))
                .map((id) => boxIds.get(id)!),
              strokes: group.strokes
                .filter((id) => ids.has(id))
                .map((id) => ids.get(id)!),
            };
            if (members.boxes.length + members.strokes.length > 1)
              target.text
                .getMap("content-groups")
                .set(crypto.randomUUID(), members);
          }
          if (edit.type === "move" && strokes.length)
            ink.edit({ targets: strokes.map((s) => s.id), erase: true });
          target.page.height = Math.max(
            target.page.height,
            bounds.y + bounds.height + 40
          );
        } finally {
          targetBoxes.close();
          targetInk.close();
        }
      }
    } finally {
      regions.close();
      ink.close();
    }
  }
}
