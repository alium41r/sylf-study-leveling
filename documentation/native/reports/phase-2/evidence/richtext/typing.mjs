import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const k of ["window","document","navigator","HTMLElement","Node","DOMParser","MutationObserver","getComputedStyle","Element","DocumentFragment","Range","Selection"]) { try { globalThis[k] = dom.window[k]; } catch {} }
globalThis.requestAnimationFrame = (cb)=>setTimeout(()=>cb(performance.now()),0);
const Y = await import("yjs"); const fs = await import("node:fs");
const { BlockNoteEditor } = await import("@blocknote/core"); const { withCollaboration } = await import("@blocknote/core/yjs");
const doc = new Y.Doc(); Y.applyUpdate(doc, fs.readFileSync("u0.bin"));
const sizes = []; doc.on("update", (u) => sizes.push(u.length));
const host = document.createElement("div"); document.body.appendChild(host);
const ed = BlockNoteEditor.create(withCollaboration({ collaboration: { fragment: doc.getXmlFragment("body"), user: { name: "t", color: "#000" } } }));
ed.mount(host); await new Promise(r=>setTimeout(r,30)); sizes.length = 0;
ed.setTextCursorPosition(ed.document[1], "end");
const text = "The modulus-argument form z = r(cos θ + i sin θ) is useful. ".repeat(5);
for (const ch of text) ed._tiptapEditor.commands.insertContent(ch);
await new Promise(r=>setTimeout(r,30));
sizes.sort((a,b)=>a-b);
const sum = sizes.reduce((a,b)=>a+b,0);
console.log(JSON.stringify({ keystrokes: text.length, updates: sizes.length, medianBytes: sizes[sizes.length>>1], p95Bytes: sizes[Math.floor(sizes.length*0.95)], maxBytes: sizes.at(-1), totalBytes: sum, stateBytesAfter: Y.encodeStateAsUpdate(doc).length }));
// Large-document host cost (V8 on M1, NOT Hermes): build ~100k chars across 400 blocks, then time decode/apply.
const big = new Y.Doc(); const g = new Y.XmlElement("blockGroup"); big.getXmlFragment("body").insert(0,[g]);
big.transact(()=>{ for (let i=0;i<400;i++){ const bc=new Y.XmlElement("blockContainer"); bc.setAttribute("id","b"+i); const p=new Y.XmlElement("paragraph"); const t=new Y.XmlText(); t.insert(0,"x".repeat(250)); p.insert(0,[t]); bc.insert(0,[p]); g.insert(i,[bc]); } });
const bu = Y.encodeStateAsUpdate(big); const t0 = performance.now(); const c = new Y.Doc(); Y.applyUpdate(c, bu); const t1 = performance.now();
console.log(JSON.stringify({ bigDocChars: 100000, bigUpdateBytes: bu.length, applyMsV8: +(t1-t0).toFixed(2) }));
process.exit(0);
