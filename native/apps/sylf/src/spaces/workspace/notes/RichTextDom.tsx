"use dom";
// The typed-note editor: BlockNote 0.56 in an Expo DOM component (ADR 0001). On desktop it renders inline; on Android it runs in a
// WebView. Its Y.Doc is a replica: every local change goes to the host, which owns the document and saves it, and changes from another
// window arrive through `apply`. BlockNote writes every node itself, including templates, so the stream stays valid for the web.
import { useEffect, useRef, useState, type Ref } from "react";
import * as Y from "yjs";
import { BlockNoteEditor, filterSuggestionItems, getDefaultSlashMenuItems } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { SuggestionMenu, type DefaultSuggestionItem } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import "@blocknote/core/style.css";

/** `apply(update)` takes a base64 Yjs update from the host; `command(json)` runs a format command. */
export type RichTextHandle = DOMImperativeFactory;
export interface RichTextLook { ink: string; soft: string; faint: string; accent: string; wash: string; paper: string; line: string; font: string; menu: string; menuInk: string }
export interface RichTextProps {
  ref?: Ref<RichTextHandle>;
  initial: string;
  /** Template blocks (JSON), inserted once into an empty note. */
  template: string;
  look: RichTextLook;
  editable: boolean;
  onUpdate(update: string): Promise<void>;
  onText(text: string): Promise<void>;
  onFormat(state: string): Promise<void>;
  dom?: DOMProps;
}

const SLASH_KEYS = new Set(["paragraph", "heading", "heading_2", "heading_3", "quote", "bullet_list", "numbered_list", "check_list", "toggle_list", "code_block", "table", "divider"]);
const toBase64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const REMOTE = "host";

type Editor = ReturnType<typeof BlockNoteEditor.create>;
interface Slash { query: string; left: number; top: number; items: DefaultSuggestionItem[]; index: number }

export default function RichTextDom({ ref, initial, template, look, editable, onUpdate, onText, onFormat }: RichTextProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  slashRef.current = slash;

  useDOMImperativeHandle(ref ?? null, () => ({
    apply: (...args) => { if (docRef.current && typeof args[0] === "string") Y.applyUpdate(docRef.current, fromBase64(args[0]), REMOTE); },
    command: (...args) => { const editor = editorRef.current; if (editor && typeof args[0] === "string") run(editor, JSON.parse(args[0]) as Command); },
  }), []);

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;
    if (initial) Y.applyUpdate(doc, fromBase64(initial), REMOTE);
    const fragment = doc.getXmlFragment("body");
    const empty = fragment.length === 0;
    // Batch keystrokes into one bridge message per frame: a keystroke is about 20 bytes (Phase 2 §5.2).
    let queued: Uint8Array[] = [], timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => { timer = undefined; if (!queued.length) return; const merged = queued.length === 1 ? queued[0] : Y.mergeUpdates(queued); queued = []; void onUpdate(toBase64(merged)); };
    doc.on("update", (update: Uint8Array, origin: unknown) => { if (origin === REMOTE) return; queued.push(update); timer ??= setTimeout(send, 16); });
    const editor = BlockNoteEditor.create(withCollaboration({
      dictionary: { ...en, placeholders: { ...en.placeholders, default: "Write, or type / for blocks", emptyDocument: "Start writing…", heading: "Heading" } },
      collaboration: { fragment, user: { name: "", color: "#666666" } },
    }));
    editorRef.current = editor;
    if (__DEV__) (globalThis as { __sylfEditor?: unknown }).__sylfEditor = editor;
    editor.mount(host.current!);
    editor.isEditable = editable;
    if (empty) {
      const blocks = (template ? JSON.parse(template) : []) as unknown[];
      if (blocks.length) editor.replaceBlocks(editor.document, blocks as never);
    }
    const menu = editor.getExtension(SuggestionMenu);
    menu?.addSuggestionMenu({ triggerCharacter: "/" });
    const all = getDefaultSlashMenuItems(editor).filter((item) => SLASH_KEYS.has(item.key));
    const unsubscribeMenu = menu?.store.subscribe(({ currentVal: state }) => {
      if (!state?.show) { setSlash(null); return; }
      const box = host.current!.getBoundingClientRect();
      const items = filterSuggestionItems(all, state.query).slice(0, 9);
      setSlash({ query: state.query, left: state.referencePos.left - box.left, top: state.referencePos.bottom - box.top + host.current!.scrollTop + 6, items, index: 0 });
    });
    let textTimer: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      const styles = editor.getActiveStyles() as Record<string, unknown>;
      const block = editor.getTextCursorPosition().block as { type: string; props: { level?: number } };
      void onFormat(JSON.stringify({ bold: !!styles.bold, italic: !!styles.italic, underline: !!styles.underline, strike: !!styles.strike, code: !!styles.code, highlight: !!styles.backgroundColor, block: block.type === "heading" ? `heading-${block.props.level ?? 1}` : block.type, canIndent: editor.canNestBlock(), canOutdent: editor.canUnnestBlock() }));
    };
    const offSelection = editor.onSelectionChange(report);
    const offChange = editor.onChange(() => {
      report();
      if (textTimer) clearTimeout(textTimer);
      textTimer = setTimeout(() => void onText(editor._tiptapEditor.getText({ blockSeparator: "\n" })), 600);
    });
    void onText(editor._tiptapEditor.getText({ blockSeparator: "\n" }));
    const keys = (event: KeyboardEvent) => {
      const open = slashRef.current;
      if (!open || !open.items.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); event.stopPropagation();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlash({ ...open, index: (open.index + step + open.items.length) % open.items.length });
      } else if (event.key === "Enter") {
        event.preventDefault(); event.stopPropagation();
        choose(editor, open.items[open.index]);
      } else if (event.key === "Escape") { menu?.closeMenu(); }
    };
    host.current!.addEventListener("keydown", keys, true);
    return () => {
      host.current?.removeEventListener("keydown", keys, true);
      unsubscribeMenu?.(); offSelection(); offChange();
      if (timer) { clearTimeout(timer); send(); }
      if (textTimer) clearTimeout(textTimer);
      editor._tiptapEditor.destroy();
      doc.destroy();
      editorRef.current = null; docRef.current = null;
    };
  }, []);
  useEffect(() => { const editor = editorRef.current; if (editor && editor.isEditable !== editable) editor.isEditable = editable; });

  const choose = (editor: Editor, item: DefaultSuggestionItem) => {
    const menu = editor.getExtension(SuggestionMenu);
    menu?.closeMenu(); menu?.clearQuery();
    item.onItemClick();
    editor.focus();
  };

  return (
    <div data-editable={String(editable)} style={{ position: "relative", height: "100%", overflow: "auto", background: look.paper, WebkitOverflowScrolling: "touch" }}>
      <style>{css(look)}</style>
      <div ref={host} className="sylf-note" style={{ minHeight: "100%", paddingBottom: 120 }} />
      {slash && slash.items.length ? (
        <div role="listbox" aria-label="Blocks" style={{ position: "absolute", left: Math.max(8, slash.left), top: slash.top, width: 236, maxHeight: 320, overflow: "auto", background: look.menu, color: look.menuInk, borderRadius: 12, boxShadow: "0 10px 30px rgba(20,24,40,0.18), 0 0 0 1px rgba(20,24,40,0.08)", padding: 6, zIndex: 10, fontFamily: look.font }}>
          {slash.items.map((item, index) => (
            <div key={item.key} role="option" aria-selected={index === slash.index} onMouseDown={(event) => { event.preventDefault(); if (editorRef.current) choose(editorRef.current, item); }} onMouseEnter={() => setSlash({ ...slash, index })}
              style={{ padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: index === slash.index ? look.wash : "transparent", display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</span>
              {item.subtext ? <span style={{ fontSize: 12, opacity: 0.6 }}>{item.subtext}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Command =
  | { type: "mark"; mark: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "highlight"; color: string | null }
  | { type: "block"; block: "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "checkListItem" | "quote" | "codeBlock"; level?: number }
  | { type: "undo" } | { type: "redo" } | { type: "indent" } | { type: "outdent" } | { type: "focus" } | { type: "insert"; text: string };

function run(editor: Editor, command: Command) {
  switch (command.type) {
    case "mark": editor.toggleStyles({ [command.mark]: true } as Parameters<Editor["toggleStyles"]>[0]); break;
    case "highlight": {
      const active = (editor.getActiveStyles() as Record<string, unknown>).backgroundColor;
      if (active || !command.color) editor.removeStyles({ backgroundColor: active ?? "yellow" } as Parameters<Editor["removeStyles"]>[0]);
      else editor.addStyles({ backgroundColor: command.color } as Parameters<Editor["addStyles"]>[0]);
      break;
    }
    case "block": {
      const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
      const props = command.block === "heading" ? { level: command.level ?? 1 } : {};
      editor.transact(() => { for (const block of blocks) editor.updateBlock(block, { type: command.block, props } as Parameters<Editor["updateBlock"]>[1]); });
      break;
    }
    case "undo": editor.undo(); break;
    case "redo": editor.redo(); break;
    case "indent": if (editor.canNestBlock()) editor.nestBlock(); break;
    case "outdent": if (editor.canUnnestBlock()) editor.unnestBlock(); break;
    case "insert": editor.insertInlineContent(command.text); break;
    case "focus": break;
  }
  editor.focus();
}

const css = (look: RichTextLook) => `
.sylf-note .bn-editor { background: transparent; color: ${look.ink}; font-family: ${look.font}; font-size: 16px; line-height: 1.6; padding: 28px 40px 0 40px; outline: none; }
@media (max-width: 520px) { .sylf-note .bn-editor { padding: 20px 18px 0 18px; } }
.sylf-note [data-content-type="heading"] { font-weight: 640; letter-spacing: -0.01em; }
.sylf-note [data-content-type="heading"][data-level="1"] { --level: 1.7em; }
.sylf-note [data-content-type="heading"][data-level="2"] { --level: 1.32em; }
.sylf-note [data-content-type="heading"][data-level="3"] { --level: 1.12em; }
.sylf-note [data-content-type="heading"] { padding-top: 14px; }
.sylf-note .bn-inline-content { color: ${look.ink}; }
.sylf-note [data-placeholder]::before, .sylf-note .bn-inline-content:has(> .ProseMirror-trailingBreak:only-child)::before { color: ${look.faint} !important; font-style: normal !important; }
.sylf-note [data-content-type="quote"] blockquote { border-left: 3px solid ${look.line}; color: ${look.soft}; }
.sylf-note code, .sylf-note pre { background: ${look.wash}; border-radius: 6px; }
.sylf-note a { color: ${look.accent}; }
.sylf-note ::selection { background: ${look.wash}; }
.sylf-note .bn-block-outer { margin: 1px 0; }
.sylf-note [data-content-type="checkListItem"] input { accent-color: ${look.accent}; width: 16px; height: 16px; }
`;
