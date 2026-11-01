"use dom";
// BlockNote 0.56 running in an Expo DOM component (WebView on Android). The Y.Doc replica here streams
// every update to the native host, which owns the authoritative replica in Hermes.
import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { BlockNoteEditor } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import "@blocknote/core/style.css";

const b64 = { enc: (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }, dec: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) };

export default function RichTextDom({ seed, onUpdate, onReport }: { seed: string; onUpdate: (b64: string) => Promise<void>; onReport: (json: string) => Promise<void>; dom?: import("expo/dom").DOMProps }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tStart = performance.now();
    const doc = new Y.Doc(); Y.applyUpdate(doc, b64.dec(seed), "seed");
    doc.on("update", (u: Uint8Array, origin: unknown) => { if (origin !== "seed") onUpdate(b64.enc(u)); });
    const editor = BlockNoteEditor.create(withCollaboration({ collaboration: { fragment: doc.getXmlFragment("body"), user: { name: "spike", color: "#555" } } }));
    editor.mount(host.current!);
    const tReady = performance.now();
    // Scripted typing burst: 300 characters, then report timing. Manual typing afterwards also streams updates.
    setTimeout(() => {
      editor.setTextCursorPosition(editor.document[1], "end");
      const t0 = performance.now(); const text = " The modulus-argument form is useful.".repeat(8);
      for (const ch of text) editor._tiptapEditor.commands.insertContent(ch);
      const t1 = performance.now();
      onReport(JSON.stringify({ editorMountMs: +(tReady - tStart).toFixed(1), scriptedChars: text.length, scriptedTypingMs: +(t1 - t0).toFixed(1), perCharMs: +((t1 - t0) / text.length).toFixed(3), userAgent: navigator.userAgent }));
    }, 500);
    return () => editor._tiptapEditor.destroy();
  }, []);
  return <div ref={host} style={{ minHeight: "100%", padding: 16, background: "#fff", fontFamily: "system-ui" }} />;
}
