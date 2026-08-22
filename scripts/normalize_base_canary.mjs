import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH_DIR = join(__dirname, "..", "scratch");
const RAW_OUTPUT_PATH = join(SCRATCH_DIR, "base_canary_raw.png");
const NORMALIZED_OUTPUT_PATH = join(__dirname, "..", "public", "sprites", "character", "body", "test_hunter_base.png");

// CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

/**
 * Decodes a simple 8-bit RGBA or RGB PNG buffer into { width, height, data: Uint8Array(w * h * 4) }
 */
export function decodePNG(buffer) {
  let offset = 8; // skip PNG signature
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error(`Unsupported bit depth: ${bitDepth}`);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = inflateSync(compressed);

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = width * bytesPerPixel;
  const rgba = new Uint8Array(width * height * 4);

  let inOffset = 0;
  let prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[inOffset++];
    const currRow = new Uint8Array(stride);

    for (let x = 0; x < stride; x++) {
      const rawByte = decompressed[inOffset++];
      const a = x >= bytesPerPixel ? currRow[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;

      let val = 0;
      if (filterType === 0) val = rawByte;
      else if (filterType === 1) val = (rawByte + a) & 0xff;
      else if (filterType === 2) val = (rawByte + b) & 0xff;
      else if (filterType === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = c;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        val = (rawByte + pr) & 0xff;
      }
      currRow[x] = val;
    }

    prevRow = currRow;

    // Convert row to RGBA
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;
      if (colorType === 6) {
        // RGBA
        const inIdx = x * 4;
        rgba[outIdx] = currRow[inIdx];
        rgba[outIdx + 1] = currRow[inIdx + 1];
        rgba[outIdx + 2] = currRow[inIdx + 2];
        rgba[outIdx + 3] = currRow[inIdx + 3];
      } else if (colorType === 2) {
        // RGB
        const inIdx = x * 3;
        rgba[outIdx] = currRow[inIdx];
        rgba[outIdx + 1] = currRow[inIdx + 1];
        rgba[outIdx + 2] = currRow[inIdx + 2];
        rgba[outIdx + 3] = 255;
      }
    }
  }

  return { width, height, data: rgba };
}

/**
 * Encodes RGBA Uint8Array into standard PNG buffer
 */
export function encodePNG(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk("IHDR", ihdr);

  // Raw scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanOffset = 0;
  let dataOffset = 0;

  for (let y = 0; y < height; y++) {
    scanlines[scanOffset++] = 0; // Filter 0
    for (let x = 0; x < width * 4; x++) {
      scanlines[scanOffset++] = rgbaData[dataOffset++];
    }
  }

  const compressed = deflateSync(scanlines, { level: 9 });
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Normalizes input raw sprite to a 90x90 canvas, centering the character body
 */
export function normalizeSpriteTo90x90(inputBuffer, targetWidth = 90, targetHeight = 90) {
  const raw = decodePNG(inputBuffer);
  console.log(`  📊 Raw sprite decoded: ${raw.width}x${raw.height}px`);

  // Find non-transparent bounding box
  let minX = raw.width, maxX = 0, minY = raw.height, maxY = 0;
  let nonTransparentPixels = 0;

  for (let y = 0; y < raw.height; y++) {
    for (let x = 0; x < raw.width; x++) {
      const idx = (y * raw.width + x) * 4;
      const alpha = raw.data[idx + 3];
      if (alpha > 10) {
        nonTransparentPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  console.log(`  📐 Bounding box: x=[${minX}..${maxX}], y=[${minY}..${maxY}] (${maxX - minX + 1}x${maxY - minY + 1}px), opaque pixels: ${nonTransparentPixels}`);

  const contentWidth = maxX >= minX ? maxX - minX + 1 : raw.width;
  const contentHeight = maxY >= minY ? maxY - minY + 1 : raw.height;

  // Target 90x90 transparent buffer
  const outData = new Uint8Array(targetWidth * targetHeight * 4);

  // In Habitica / Sylf 90x90 anatomy, head starts around y=24-30 and feet touch y=68-72.
  // Center horizontally, align vertically towards middle-bottom
  const offsetX = Math.floor((targetWidth - raw.width) / 2);
  const offsetY = Math.floor((targetHeight - raw.height) / 2);

  console.log(`  🎯 Placing sprite with canvas offset: (${offsetX}, ${offsetY})`);

  for (let y = 0; y < raw.height; y++) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= targetHeight) continue;

    for (let x = 0; x < raw.width; x++) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= targetWidth) continue;

      const srcIdx = (y * raw.width + x) * 4;
      const dstIdx = (targetY * targetWidth + targetX) * 4;

      outData[dstIdx] = raw.data[srcIdx];
      outData[dstIdx + 1] = raw.data[srcIdx + 1];
      outData[dstIdx + 2] = raw.data[srcIdx + 2];
      outData[dstIdx + 3] = raw.data[srcIdx + 3];
    }
  }

  const encoded = encodePNG(targetWidth, targetHeight, outData);
  return { encoded, contentWidth, contentHeight, rawWidth: raw.width, rawHeight: raw.height };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith("normalize_base_canary.mjs")) {
  if (!existsSync(SCRATCH_DIR)) mkdirSync(SCRATCH_DIR, { recursive: true });

  if (existsSync(RAW_OUTPUT_PATH)) {
    const inputBuf = readFileSync(RAW_OUTPUT_PATH);
    const { encoded } = normalizeSpriteTo90x90(inputBuf);
    writeFileSync(NORMALIZED_OUTPUT_PATH, encoded);
    console.log(`  ✅ Successfully normalized and saved to ${NORMALIZED_OUTPUT_PATH}`);
  } else {
    console.log(`  ℹ️ Raw file not found at ${RAW_OUTPUT_PATH}, ready for download step.`);
  }
}
