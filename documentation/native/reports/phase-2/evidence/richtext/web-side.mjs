// "Web/WebView side": real BlockNote 0.56 under jsdom. Modes: create | read <file>
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","navigator","HTMLElement","Node","DOMParser","MutationObserver","getComputedStyle","Element","DocumentFragment","Range","Selection","KeyboardEvent","InputEvent"]) { try { globalThis[k] = dom.window[k]; } catch {} }
globalThis.requestAnimationFrame = (cb)=>setTimeout(()=>cb(performance.now()),0);
const fs = await import("node:fs");
const Y = await import("yjs");
const { BlockNoteEditor } = await import("@blocknote/core");
const { blocksToYDoc, yXmlFragmentToBlocks } = await import("@blocknote/core/yjs");
const [mode, file] = process.argv.slice(2);
const editor = BlockNoteEditor.create();
const strip = (b) => b.map(x => ({ type:x.type, props: Object.fromEntries(Object.entries(x.props||{}).filter(([k,v])=>!["textColor","backgroundColor","textAlignment"].includes(k)||v!=="default"&&v!=="left")), content: Array.isArray(x.content)? x.content.map(c=>c.type==="text"?{text:c.text, styles:c.styles}:c) : x.content?.type ? "table" : undefined, children: x.children?.length? strip(x.children):undefined }));
if (mode === "create") {
  const doc = blocksToYDoc(editor, [
    { type: "heading", props: { level: 2 }, content: "Complex numbers" },
    { type: "paragraph", content: [{ type:"text", text:"Euler: ", styles:{bold:true} }, { type:"text", text:"e^{iπ} + 1 = 0", styles:{} }] },
    { type: "bulletListItem", content: "Modulus", children: [{ type: "bulletListItem", content: "|z| = √(a²+b²)" }] },
    { type: "checkListItem", props: { checked: false }, content: "Past paper Q3" },
    { type: "table", content: { type: "tableContent", rows: [{ cells: ["a","b"] }, { cells: ["1","2"] }] } },
  ], "body");
  fs.writeFileSync("u0.bin", Y.encodeStateAsUpdate(doc));
  // Print the XML structure the native side must respect.
  console.log(doc.getXmlFragment("body").toString().slice(0, 1200));
  console.log("u0 bytes", fs.statSync("u0.bin").size);
} else {
  const doc = new Y.Doc();
  for (const f of file.split(",")) Y.applyUpdate(doc, fs.readFileSync(f));
  const blocks = yXmlFragmentToBlocks(editor, doc.getXmlFragment("body"));
  console.log(JSON.stringify(strip(blocks), null, 1));
  // Also mount a collaborative editor on the fragment and make an edit, proving ProseMirror accepts the host-written XML.
  const { withCollaboration } = await import("@blocknote/core/yjs");
  const host = document.createElement("div"); document.body.appendChild(host);
  const live = BlockNoteEditor.create(withCollaboration({ collaboration: { fragment: doc.getXmlFragment("body"), user: { name: "t", color: "#000" } } }));
  live.mount(host);
  await new Promise(r=>setTimeout(r,50));
  const before = Y.encodeStateVector(doc);
  live.insertBlocks([{ type: "paragraph", content: "Edited in BlockNote after host edit" }], live.document[live.document.length-1], "after");
  await new Promise(r=>setTimeout(r,50));
  fs.writeFileSync("u2.bin", Y.encodeStateAsUpdate(doc, before));
  console.log("live editor blocks:", live.document.length, "| u2 bytes", fs.statSync("u2.bin").size);
  process.exit(0);
}
