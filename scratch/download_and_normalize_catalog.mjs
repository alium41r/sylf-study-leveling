import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";

// CRC32 implementation
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

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  
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
  const raw = zlib.inflateSync(idat);
  
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
  const rowStride = 1 + width * bytesPerPixel;
  const rgba = Buffer.alloc(width * height * 4);
  
  const prevRow = Buffer.alloc(width * bytesPerPixel);
  const currRow = Buffer.alloc(width * bytesPerPixel);
  
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * rowStride];
    const srcRow = raw.subarray(y * rowStride + 1, (y + 1) * rowStride);
    
    for (let x = 0; x < width * bytesPerPixel; x++) {
      const a = x >= bytesPerPixel ? currRow[x - bytesPerPixel] : 0;
      const b = prevRow[x];
      const c = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;
      
      let val = srcRow[x];
      if (filterType === 0) {
        // None
      } else if (filterType === 1) {
        val = (val + a) & 0xff;
      } else if (filterType === 2) {
        val = (val + b) & 0xff;
      } else if (filterType === 3) {
        val = (val + Math.floor((a + b) / 2)) & 0xff;
      } else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        else pr = c;
        val = (val + pr) & 0xff;
      }
      currRow[x] = val;
    }
    
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (bytesPerPixel === 4) {
        rgba[dstIdx] = currRow[x * 4];
        rgba[dstIdx + 1] = currRow[x * 4 + 1];
        rgba[dstIdx + 2] = currRow[x * 4 + 2];
        rgba[dstIdx + 3] = currRow[x * 4 + 3];
      } else {
        rgba[dstIdx] = currRow[x * 3];
        rgba[dstIdx + 1] = currRow[x * 3 + 1];
        rgba[dstIdx + 2] = currRow[x * 3 + 2];
        rgba[dstIdx + 3] = 255;
      }
    }
    currRow.copy(prevRow);
  }
  
  return { width, height, data: rgba };
}

function encodePng(width, height, rgba) {
  const rowStride = 1 + width * 4;
  const filtered = Buffer.alloc(height * rowStride);
  
  for (let y = 0; y < height; y++) {
    filtered[y * rowStride] = 0;
    rgba.copy(filtered, y * rowStride + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  const compressed = zlib.deflateSync(filtered);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    header,
    makeChunk("IHDR", ihdrData),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

function normalizePngBuffer(buf) {
  const { width, height, data } = decodePng(buf);
  const targetW = 90;
  const targetH = 90;
  const targetRgba = Buffer.alloc(targetW * targetH * 4);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < targetW && y < targetH) {
        const srcIdx = (y * width + x) * 4;
        const dstIdx = (y * targetW + x) * 4;
        targetRgba[dstIdx] = data[srcIdx];
        targetRgba[dstIdx + 1] = data[srcIdx + 1];
        targetRgba[dstIdx + 2] = data[srcIdx + 2];
        targetRgba[dstIdx + 3] = data[srcIdx + 3];
      }
    }
  }
  return encodePng(targetW, targetH, targetRgba);
}

const BASE_URL = "https://raw.githubusercontent.com/HabitRPG/habitica-images/main";
const TARGET_BASE = path.join(process.cwd(), "public", "sprites", "character");

const ASSETS = [
  // ─── 1. Skin & Body (8 Palettes) ───────────────────────────
  { src: "customize/skin/skin_ddc994.png", dest: "body/skin_fair.png" },
  { src: "customize/skin/skin_f5a76e.png", dest: "body/skin_peach.png" },
  { src: "customize/skin/skin_ea8349.png", dest: "body/skin_olive.png" },
  { src: "customize/skin/skin_c06534.png", dest: "body/skin_bronze.png" },
  { src: "customize/skin/skin_98461a.png", dest: "body/skin_caramel.png" },
  { src: "customize/skin/skin_915533.png", dest: "body/skin_espresso.png" },
  { src: "customize/skin/skin_shadow.png", dest: "body/skin_shadow.png" },
  { src: "customize/skin/skin_pastelBlue.png", dest: "body/skin_cyber.png" },

  // ─── 2. Base Shirts & Outfits ──────────────────────────────
  { src: "customize/shirts/broad_shirt_black.png", dest: "outfits/shirt_black.png" },
  { src: "customize/shirts/broad_shirt_blue.png", dest: "outfits/shirt_blue.png" },
  { src: "customize/shirts/broad_shirt_purple.png", dest: "outfits/shirt_purple.png" },
  { src: "customize/shirts/broad_shirt_white.png", dest: "outfits/shirt_white.png" },
  { src: "customize/shirts/broad_shirt_green.png", dest: "outfits/shirt_green.png" },
  { src: "customize/shirts/broad_shirt_fire.png", dest: "outfits/shirt_crimson.png" },

  // ─── 3. Class Armor & Robes (12 Outfits) ───────────────────
  { src: "gear/armor/broad_armor_wizard_1.png", dest: "outfits/armor_scholar_robes.png" },
  { src: "gear/armor/broad_armor_wizard_4.png", dest: "outfits/armor_archmage.png" },
  { src: "gear/armor/broad_armor_warrior_1.png", dest: "outfits/armor_warrior_tunic.png" },
  { src: "gear/armor/broad_armor_warrior_4.png", dest: "outfits/armor_paladin_plate.png" },
  { src: "gear/armor/broad_armor_rogue_1.png", dest: "outfits/armor_techwear_stealth.png" },
  { src: "gear/armor/broad_armor_rogue_4.png", dest: "outfits/armor_shadow_assassin.png" },
  { src: "gear/armor/broad_armor_healer_1.png", dest: "outfits/armor_alchemist_vest.png" },
  { src: "gear/armor/broad_armor_healer_4.png", dest: "outfits/armor_grand_scholar.png" },
  { src: "gear/armor/broad_armor_special_bardRobes.png", dest: "outfits/armor_academy_blazer.png" },
  { src: "gear/armor/broad_armor_special_dandySuit.png", dest: "outfits/armor_formal_suit.png" },
  { src: "gear/armor/broad_armor_special_heroicTunic.png", dest: "outfits/armor_heroic_tunic.png" },
  { src: "gear/armor/broad_armor_special_pyromancersRobes.png", dest: "outfits/armor_flame_robes.png" },

  // ─── 4. Eyewear & Optics (7 Options) ───────────────────────
  { src: "gear/eyewear/eyewear_special_blackTopFrame.png", dest: "face/eyewear_black_top.png" },
  { src: "gear/eyewear/eyewear_special_blueTopFrame.png", dest: "face/eyewear_blue_top.png" },
  { src: "gear/eyewear/eyewear_special_redTopFrame.png", dest: "face/eyewear_red_top.png" },
  { src: "gear/eyewear/eyewear_special_whiteTopFrame.png", dest: "face/eyewear_white_top.png" },
  { src: "gear/eyewear/eyewear_special_blackHalfMoon.png", dest: "face/eyewear_black_half.png" },
  { src: "gear/eyewear/eyewear_special_blueHalfMoon.png", dest: "face/eyewear_blue_half.png" },
  { src: "gear/eyewear/eyewear_special_aetherMask.png", dest: "face/eyewear_cyber_visor.png" },

  // ─── 5. Headgear & Accessories (7 Options) ─────────────────
  { src: "gear/head/head_special_bardHat.png", dest: "accessories/headgear_bard_beret.png" },
  { src: "gear/head/head_special_clandestineCowl.png", dest: "accessories/headgear_shadow_cowl.png" },
  { src: "gear/head/head_special_dandyHat.png", dest: "accessories/headgear_dandy_tophat.png" },
  { src: "gear/headAccessory/headAccessory_special_blackHeadband.png", dest: "accessories/headband_black.png" },
  { src: "gear/headAccessory/headAccessory_special_blueHeadband.png", dest: "accessories/headband_blue.png" },
  { src: "gear/headAccessory/headAccessory_special_redHeadband.png", dest: "accessories/headband_red.png" },
  { src: "gear/headAccessory/headAccessory_special_heroicCirclet.png", dest: "accessories/circlet_heroic.png" },
];

// Hair matrix across bangs 1-4 and bases 1-8 in 8 color palettes
const HAIR_COLORS = ["black", "brown", "blond", "TRUred", "ghostwhite", "blue", "ppurple", "green"];

for (const c of HAIR_COLORS) {
  for (let s = 1; s <= 4; s++) {
    ASSETS.push({
      src: `customize/hair/hair_bangs_${s}_${c}.png`,
      dest: `hair/hair_bangs_${s}_${c}.png`,
    });
  }
  for (let b = 1; b <= 8; b++) {
    ASSETS.push({
      src: `customize/hair/hair_base_${b}_${c}.png`,
      dest: `hair/hair_base_${b}_${c}.png`,
    });
  }
}

function downloadAndNormalize(url, destPath) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const rawBuf = Buffer.concat(chunks);
            const normalized = normalizePngBuffer(rawBuf);
            fs.writeFileSync(destPath, normalized);
            resolve(true);
          } catch (e) {
            console.warn(`Normalize error on ${destPath}: ${e.message}`);
            resolve(false);
          }
        });
      } else {
        resolve(false);
      }
    }).on("error", () => resolve(false));
  });
}

async function main() {
  console.log(`Downloading and normalizing ${ASSETS.length} layered character sprite assets...`);
  let downloaded = 0;
  for (const asset of ASSETS) {
    const fullUrl = `${BASE_URL}/${asset.src}`;
    const dest = path.join(TARGET_BASE, asset.dest);
    const ok = await downloadAndNormalize(fullUrl, dest);
    if (ok) downloaded++;
  }
  console.log(`Successfully normalized ${downloaded}/${ASSETS.length} sprite assets to ${TARGET_BASE}`);
}

main();
