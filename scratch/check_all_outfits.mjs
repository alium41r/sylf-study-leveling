import fs from "fs";
import path from "path";
import zlib from "zlib";

function getPngBounds(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    
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
    
    const bytesPerPixel = 4;
    const rowStride = 1 + width * bytesPerPixel;
    
    let minX = width, maxX = 0, minY = height, maxY = 0;
    
    for (let y = 0; y < height; y++) {
      const rowOffset = y * rowStride + 1;
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
    return { file: path.basename(filePath), width, height, bbox: [minX, minY, maxX, maxY], centerX, centerY };
  } catch (e) {
    return { file: path.basename(filePath), error: e.message };
  }
}

const dir = "public/sprites/character/outfits";
const files = fs.readdirSync(dir);
for (const file of files) {
  if (file.endsWith(".png")) {
    const info = getPngBounds(path.join(dir, file));
    console.log(info);
  }
}
