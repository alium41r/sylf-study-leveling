// Builds geometry test PDFs and records pdf.js scale-1 viewport predictions (Sylf's canonical page units).
import fs from "node:fs";
import { PDFDocument, PDFName, PDFNumber, rgb, degrees } from "pdf-lib";
const cases = [
  { id: "a4-plain", media: [0,0,595,842] },
  { id: "letter-rot90", media: [0,0,612,792], rotate: 90 },
  { id: "crop-offset", media: [0,0,612,792], crop: [50,60,500,700] },
  { id: "crop-rot270", media: [0,0,612,792], crop: [40,30,560,740], rotate: 270 },
  { id: "media-negative-origin", media: [-100,-100,500,700] },
  { id: "rot180-crop", media: [0,0,600,800], crop: [100,100,500,700], rotate: 180 },
  { id: "userunit-2", media: [0,0,300,400], userUnit: 2 },
];
// Marker points in PDF user space (inside each crop box).
const markerFor = (c) => { const b = c.crop || c.media; return [b[0] + (b[2]-b[0])*0.25, b[1] + (b[3]-b[1])*0.7]; };
const doc = await PDFDocument.create();
for (const c of cases) {
  const [x0,y0,x1,y1] = c.media; const p = doc.addPage([x1-x0, y1-y0]);
  p.setMediaBox(x0, y0, x1-x0, y1-y0);
  if (c.crop) p.setCropBox(c.crop[0], c.crop[1], c.crop[2]-c.crop[0], c.crop[3]-c.crop[1]);
  if (c.rotate) p.setRotation(degrees(c.rotate));
  if (c.userUnit) p.node.set(PDFName.of("UserUnit"), PDFNumber.of(c.userUnit));
  const [mx,my] = markerFor(c);
  p.drawRectangle({ x: mx-3, y: my-3, width: 6, height: 6, color: rgb(1,0,0) });
}
fs.writeFileSync("geometry.pdf", await doc.save());
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync("geometry.pdf")), isEvalSupported: false }).promise;
const out = [];
for (let i = 0; i < cases.length; i++) {
  const page = await pdf.getPage(i+1); const vp = page.getViewport({ scale: 1 });
  const [mx,my] = markerFor(cases[i]); const [px,py] = vp.convertToViewportPoint(mx,my);
  out.push({ id: cases[i].id, pdfjs: { width: vp.width, height: vp.height, rotation: page.rotate, userUnit: page.userUnit, transform: vp.transform, marker: [px,py] }, markerUser: [mx,my] });
}
fs.writeFileSync("pdfjs-predictions.json", JSON.stringify(out, null, 2));
console.log(out.map(o=>`${o.id}: ${o.pdfjs.width}x${o.pdfjs.height} rot${o.pdfjs.rotation} uu${o.pdfjs.userUnit} marker=${o.pdfjs.marker.map(v=>v.toFixed(1))}`).join("\n"));
