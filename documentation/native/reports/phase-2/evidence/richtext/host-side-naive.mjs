// "Native host side": pure Yjs, no DOM. Proves a Hermes-hosted Notes engine can own and edit the BlockNote fragment.
import * as Y from "yjs"; import fs from "node:fs"; import crypto from "node:crypto";
if (typeof document !== "undefined" || typeof window !== "undefined") throw new Error("DOM must be absent");
const mode = process.argv[2];
const doc = new Y.Doc();
if (mode === "edit") {
  Y.applyUpdate(doc, fs.readFileSync("u0.bin"));
  const sv = Y.encodeStateVector(doc);
  const root = doc.getXmlFragment("body").get(0); // blockgroup
  doc.transact(() => {
    // 1. Append to heading text.
    const heading = root.get(0).get(0); heading.get(0).insert(heading.get(0).length, " — native edit");
    // 2. Tick the checklist item.
    root.get(3).get(0).setAttribute("checked", "true");
    // 3. Insert a new paragraph block with an italic run, mirroring BlockNote's attribute defaults.
    const bc = new Y.XmlElement("blockcontainer"); bc.setAttribute("id", crypto.randomUUID());
    const p = new Y.XmlElement("paragraph");
    for (const [k,v] of Object.entries({ backgroundColor:"default", textAlignment:"left", textColor:"default" })) p.setAttribute(k, v);
    const t = new Y.XmlText(); t.insert(0, "Written by host "); t.insert(16, "in italics", { italic: true });
    p.insert(0, [t]); bc.insert(0, [p]); root.insert(2, [bc]);
  });
  fs.writeFileSync("u1.bin", Y.encodeStateAsUpdate(doc, sv));
  console.log("host edit update bytes", fs.statSync("u1.bin").size);
} else if (mode === "verify") {
  // Apply all updates in two different orders and confirm convergence.
  const a = new Y.Doc(), b = new Y.Doc();
  for (const f of ["u0.bin","u1.bin","u2.bin"]) Y.applyUpdate(a, fs.readFileSync(f));
  for (const f of ["u2.bin","u0.bin","u1.bin"]) Y.applyUpdate(b, fs.readFileSync(f));
  const sa = a.getXmlFragment("body").toString(), sb = b.getXmlFragment("body").toString();
  console.log("converged", sa === sb, "| blockcontainers", (sa.match(/<blockcontainer /g)||[]).length, "| contains web edit", sa.includes("Edited in BlockNote after host edit"), "| contains host edit", sa.includes("in italics"));
}
