/** Synthetic, owned qualification PDFs; no third-party learning material. */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFNumber,
} from "pdf-lib";
import sharp from "sharp";
import fs from "node:fs";
const root = new URL("./fixtures/", import.meta.url);
fs.mkdirSync(root, { recursive: true });
const doc = await PDFDocument.create(),
  font = await doc.embedFont(StandardFonts.Helvetica);
let page = doc.addPage([600, 800]);
page.drawText("Sylf PDF Qualification", { x: 50, y: 745, size: 24, font });
page.drawText("Vector fields and photosynthesis: searchable lecture text.", {
  x: 50,
  y: 700,
  size: 15,
  font,
});
page.drawRectangle({
  x: 95,
  y: 675,
  width: 10,
  height: 10,
  color: rgb(1, 0, 0),
});
page.drawText("A stable reference point", { x: 115, y: 675, size: 12, font });
page = doc.addPage([500, 700]);
page.setCropBox(40, 60, 320, 480);
page.setRotation(degrees(90));
page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
page.drawText("Rotated crop and scaled units", {
  x: 70,
  y: 480,
  size: 18,
  font,
});
page.drawRectangle({
  x: 100,
  y: 100,
  width: 45,
  height: 30,
  color: rgb(0, 0.3, 1),
});
page = doc.addPage([800, 400]);
page.drawText("Landscape worksheet", { x: 50, y: 340, size: 24, font });
for (let i = 0; i < 10; i++)
  page.drawLine({
    start: { x: 40, y: 40 + i * 25 },
    end: { x: 750, y: 40 + i * 25 },
    color: rgb(0.75, 0.8, 0.85),
    thickness: 0.5,
  });
page.drawText("Integration by parts: u dv = uv - v du", {
  x: 50,
  y: 280,
  size: 16,
  font,
});
fs.writeFileSync(new URL("lecture.pdf", root), await doc.save());
const pixels = Buffer.alloc(3000 * 2000 * 3);
let seed = 0x12345678;
for (let i = 0; i < pixels.length; i++) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  pixels[i] = seed & 255;
}
const jpeg = await sharp(pixels, {
  raw: { width: 3000, height: 2000, channels: 3 },
})
  .jpeg({ quality: 82 })
  .toBuffer();
const large = await PDFDocument.create(),
  body = await large.embedFont(StandardFonts.Helvetica),
  image = await large.embedJpg(jpeg);
for (let i = 0; i < 300; i++) {
  const p = large.addPage(i % 3 === 0 ? [800, 500] : [600, 800]);
  p.drawText(
    "Lecture page " +
      (i + 1) +
      (i === 199 ? " photosynthesis final match" : ""),
    { x: 40, y: p.getHeight() - 60, size: 18, font: body }
  );
  if (i % 20 === 0)
    p.drawImage(image, { x: 30, y: 50, width: 480, height: 320 });
  else
    for (let j = 0; j < 80; j++)
      p.drawLine({
        start: { x: 30 + j * 3, y: 30 },
        end: { x: 50 + j * 3, y: 300 },
        color: rgb(j / 100, 0.4, 0.7),
        thickness: 0.5,
      });
}
const bytes = await large.save();
fs.writeFileSync(new URL("large-300.pdf", root), bytes);
console.log(
  JSON.stringify({
    pages: 300,
    bytes: bytes.length,
    imagePixels: 6000000,
    repeatedImagePages: 15,
    licensed: "Original synthetic qualification content",
  })
);
