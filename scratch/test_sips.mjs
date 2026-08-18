import fs from "fs";
import zlib from "zlib";

function getPngBounds(filePath) {
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
  return { width, height, bbox: [minX, minY, maxX, maxY], centerX, centerY };
}

console.log("Original 114:", getPngBounds("/tmp/test_heroic.png"));
console.log("Cropped 90:", getPngBounds("/tmp/test_heroic_90.png"));
