import fs from "fs";
import zlib from "zlib";

function getPngBounds(filePath) {
  const buf = fs.readFileSync(filePath);
  // Simple PNG chunk parser
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  
  // Find IDAT chunks
  let pos = 8;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") {
      idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }
  
  const idat = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(idat);
  
  // Assuming RGBA (4 bytes per pixel) and 1 filter byte per row
  const bytesPerPixel = 4;
  const rowStride = 1 + width * bytesPerPixel;
  
  let minX = width, maxX = 0, minY = height, maxY = 0;
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride + 1; // skip filter byte
    for (let x = 0; x < width; x++) {
      const alpha = decompressed[rowOffset + x * bytesPerPixel + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return { width, height, bbox: [minX, minY, maxX, maxY], centerX, centerY, shiftX: width / 2 - centerX };
}

const skin = getPngBounds("public/sprites/character/body/skin_fair.png");
console.log("Skin Fair:", skin);

const robe = getPngBounds("public/sprites/character/outfits/armor_flame_robes.png");
console.log("Flame Robes:", robe);

const hair = getPngBounds("public/sprites/character/hair/hair_bangs_1_black.png");
console.log("Hair Bangs 1:", hair);
