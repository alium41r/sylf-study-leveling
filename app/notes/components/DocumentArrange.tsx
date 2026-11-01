"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Group, Ungroup, Check } from "lucide-react";
import CreativePanel from "./CreativePanel";
import type { NotesLibrary, NoteSummary } from "@/lib/notes/library";
import { PageBoxes } from "@/lib/notes/text-boxes";
import { InkModel } from "@/lib/notes/ink";
import {
  contentBounds,
  contentGroups,
  type ContentSelection,
} from "@/lib/notes/content-layout";
import type { ContentEdit } from "@/lib/notes/content-edit";
import type { InkRect } from "@/lib/notes/ink-renderer";
import s from "../Creative.module.css";
type Item = {
  id: string;
  kind: "box" | "stroke";
  label: string;
  bounds: InkRect;
};
export default function DocumentArrange({
  library,
  note,
  pageId,
  selectedBox,
  selectedStrokes,
  onClose,
  onError,
  onComplete,
}: {
  library: NotesLibrary;
  note: NoteSummary;
  pageId: string;
  selectedBox: string;
  selectedStrokes: string[];
  onClose: () => void;
  onError: (message: string) => void;
  onComplete: () => void;
}) {
  const pages = note.view.descriptor.pages.filter(
    (p) => !p.extensions.archived
  );
  const [page, setPage] = useState(pageId);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [selected, setSelected] = useState<ContentSelection[]>([
    {
      pageId,
      boxes: selectedStrokes.length ? [] : [selectedBox],
      strokes: selectedStrokes,
    },
  ]);
  const [target, setTarget] = useState(
    pages.find((p) => p.pageId !== pageId)?.pageId || ""
  );
  const [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [done, setDone] = useState("");
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [groups, setGroups] = useState<ReturnType<typeof contentGroups>>([]);
  useEffect(() => {
    let stopped = false;
    void (async () => {
      const layers = await library.ensurePageLayers(note.id, page);
      const text = await library.open(note.id, page, "text");
      let ink: Awaited<ReturnType<NotesLibrary["open"]>> | undefined;
      let regions: PageBoxes | undefined, model: InkModel | undefined;
      try {
        ink = await library.open(note.id, page, "ink");
        regions = new PageBoxes(text.stream.doc, layers.page, () => false);
        model = new InkModel(ink.stream.doc, () => false);
        const value: Item[] = [
          ...regions.boxes().map((b, i) => ({
            id: b.id,
            kind: "box" as const,
            label:
              b.id === "body"
                ? "Page text"
                : `${b.kind === "image" ? "Image" : "Text box"} ${i + 1}`,
            bounds: b,
          })),
          ...model.strokes().map((stroke, i) => ({
            id: stroke.id,
            kind: "stroke" as const,
            label: `${stroke.style.shape || (stroke.style.tool === "highlighter" ? "Highlight" : "Ink")} ${i + 1}`,
            bounds: stroke.bounds,
          })),
        ];
        if (!stopped) {
          setItems((old) => ({ ...old, [page]: value }));
          setGroups(contentGroups(text.stream.doc));
        }
      } finally {
        regions?.close();
        model?.close();
        ink?.release();
        text.release();
      }
    })().catch((error) => {
      if (!stopped) onError(error.message);
    });
    return () => {
      stopped = true;
    };
  }, [library, note.id, page, onError, version]);
  const current = selected.find((s) => s.pageId === page) || {
    pageId: page,
    boxes: [],
    strokes: [],
  };
  const count = selected.reduce(
    (n, s) => n + s.boxes.length + s.strokes.length,
    0
  );
  const selectedPages = selected.filter(
    (s) => s.boxes.length || s.strokes.length
  );
  const bounds = contentBounds(
    (items[page] || [])
      .filter((item) =>
        current[item.kind === "box" ? "boxes" : "strokes"].includes(item.id)
      )
      .map((item) => item.bounds)
  );
  const toggle = (item: Item) => {
    const group = groups.find((g) =>
      (item.kind === "box" ? g.boxes : g.strokes).includes(item.id)
    );
    const boxes = group?.boxes || (item.kind === "box" ? [item.id] : []),
      strokes = group?.strokes || (item.kind === "stroke" ? [item.id] : []);
    const remove = current[item.kind === "box" ? "boxes" : "strokes"].includes(
      item.id
    );
    const next = {
      pageId: page,
      boxes: remove
        ? current.boxes.filter((id) => !boxes.includes(id))
        : [...new Set([...current.boxes, ...boxes])],
      strokes: remove
        ? current.strokes.filter((id) => !strokes.includes(id))
        : [...new Set([...current.strokes, ...strokes])],
    };
    setSelected([...selected.filter((s) => s.pageId !== page), next]);
    setDone("");
  };
  const act = async (edit: ContentEdit) => {
    setBusy(true);
    setDone("");
    try {
      await library.editContent(note.id, selectedPages, edit);
      onComplete();
      setVersion((n) => n + 1);
      if (edit.type === "move" || edit.type === "copy") {
        setSelected([]);
        setDone(
          `${edit.type === "move" ? "Moved" : "Copied"} to page ${pages.findIndex((p) => p.pageId === edit.targetPageId) + 1}.`
        );
      } else
        setDone(
          edit.type === "group"
            ? "Grouped. Select a member to arrange the group."
            : edit.type === "ungroup"
              ? "Ungrouped."
              : edit.type === "order"
                ? "Layer order updated."
                : "Position updated."
        );
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CreativePanel title="Arrange content" onClose={onClose} wide>
      <fieldset
        disabled={busy}
        className={`${s.panelFields} ${s.arrangeFields}`}
      >
        <div className={s.fields}>
          <label>
            Page
            <select
              aria-label="Selection page"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            >
              {pages.map((p, i) => (
                <option key={p.pageId} value={p.pageId}>
                  Page {i + 1}
                </option>
              ))}
            </select>
          </label>
          <span>
            {count} selected · {selectedPages.length} pages
          </span>
          <button
            onClick={() =>
              setSelected([
                ...selected.filter((s) => s.pageId !== page),
                {
                  pageId: page,
                  boxes: (items[page] || [])
                    .filter((i) => i.kind === "box")
                    .map((i) => i.id),
                  strokes: (items[page] || [])
                    .filter((i) => i.kind === "stroke")
                    .map((i) => i.id),
                },
              ])
            }
          >
            Select page content
          </button>
          <button onClick={() => setSelected([])}>Clear selection</button>
        </div>
        <div className={s.contentInventory}>
          {!items[page] && <p role="status">Reading page content…</p>}
          {(items[page] || []).slice(0, 200).map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={current[
                  item.kind === "box" ? "boxes" : "strokes"
                ].includes(item.id)}
                onChange={() => toggle(item)}
              />
              <span>{item.label}</span>
              <small>
                {Math.round(item.bounds.x)}, {Math.round(item.bounds.y)}
              </small>
            </label>
          ))}
          {(items[page]?.length || 0) > 200 && (
            <p>
              Showing the first 200 objects. “Select page content” includes all.
            </p>
          )}
        </div>
        <div className={s.fields}>
          <button
            disabled={!current.boxes.length}
            aria-label={`Bring ${current.boxes.length === 1 && items[page]?.find((item) => item.id === current.boxes[0])?.label.startsWith("Image") ? "image box" : "selection"} to front`}
            onClick={() => void act({ type: "order", where: "front" })}
          >
            Bring forward
          </button>
          <button
            disabled={!current.boxes.length}
            aria-label={`Send ${current.boxes.length === 1 && items[page]?.find((item) => item.id === current.boxes[0])?.label.startsWith("Image") ? "image box" : "selection"} to back`}
            onClick={() => void act({ type: "order", where: "back" })}
          >
            Send back
          </button>
          <button
            disabled={!count || selectedPages.length !== 1}
            onClick={() => void act({ type: "group" })}
          >
            <Group size={16} /> Group
          </button>
          <button
            disabled={!count || selectedPages.length !== 1}
            onClick={() => void act({ type: "ungroup" })}
          >
            <Ungroup size={16} /> Ungroup
          </button>
        </div>
        <div className={s.fields}>
          <label>
            X
            <input
              aria-label="Selection X"
              type="number"
              min="0"
              max="100000"
              value={position.x}
              onChange={(e) =>
                setPosition({ ...position, x: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Y
            <input
              aria-label="Selection Y"
              type="number"
              min="0"
              max="100000"
              value={position.y}
              onChange={(e) =>
                setPosition({ ...position, y: Number(e.target.value) })
              }
            />
          </label>
          <button
            disabled={!count || selectedPages.length !== 1}
            onClick={() => void act({ type: "position", ...position })}
          >
            Set position
          </button>
          <button
            disabled={!bounds || selectedPages.length !== 1}
            onClick={() =>
              void act({
                type: "position",
                x: Math.max(
                  0,
                  (pages.find((p) => p.pageId === page)!.width -
                    bounds!.width) /
                    2
                ),
                y: bounds!.y,
              })
            }
          >
            Center on page
          </button>
        </div>
        {pages.length > 1 && (
          <div className={s.fields}>
            <label>
              Destination
              <select
                aria-label="Destination page"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {pages.map((p, i) => (
                  <option key={p.pageId} value={p.pageId}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={
                !count || selectedPages.some((s) => s.pageId === target)
              }
              onClick={() => void act({ type: "move", targetPageId: target })}
            >
              <ArrowRight size={16} /> Move
            </button>
            <button
              disabled={
                !count || selectedPages.some((s) => s.pageId === target)
              }
              onClick={() => void act({ type: "copy", targetPageId: target })}
            >
              Copy
            </button>
          </div>
        )}
        {done && (
          <p role="status">
            <Check size={14} /> {done}
          </p>
        )}
        <p>
          Selections stay selected when you switch pages. Moves preserve
          editable originals and can be recovered through document history.
        </p>
      </fieldset>
    </CreativePanel>
  );
}
