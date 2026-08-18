import fs from "fs";
import path from "path";
import zlib from "zlib";

// CRC32 implementation for PNG chunks
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function cropTo90x90(filePath) {
  const buf = fs.readFileSync(filePath);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  
  if (width === 90 && height === 90) return; // already 90x90
  
  console.log(`Cropping ${filePath} from ${width}x${height} to 90x90...`);
  
  // Extract IDAT
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
  const srcRowStride = 1 + width * bytesPerPixel;
  
  const targetWidth = 90;
  const targetHeight = 90;
  const targetRowStride = 1 + targetWidth * bytesPerPixel;
  const targetBuffer = Buffer.alloc(targetHeight * targetRowStride);
  
  for (let y = 0; y < targetHeight; y++) {
    const srcRowOffset = y * srcRowStride;
    const targetRowOffset = y * targetRowStride;
    
    // Filter byte = 0
    targetBuffer[targetRowOffset] = 0;
    
    // Copy first 90 pixels (360 bytes)
    const copyBytes = Math.min(width, targetWidth) * bytesPerPixel;
    decompressed.copy(targetBuffer, targetRowOffset + 1, srcRowOffset + 1, srcRowOffset + 1 + copyBytes);
  }
  
  const newCompressed = zlib.deflateSync(targetBuffer);
  
  // Create IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(targetWidth, 0);
  ihdrData.writeUInt32BE(targetHeight, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", newCompressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));
  
  const outputPng = Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(filePath, outputPng);
  console.log(`Successfully normalized ${filePath} to 90x90.`);
}

function processAll(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      processAll(fullPath);
    } else if (entry.name.endsWith(".png")) {
      cropTo90x90(fullPath);
    }
  }
}

processAll("public/sprites/character");
console.log("All sprites are now normalized to exactly 90x90 canvas!");
