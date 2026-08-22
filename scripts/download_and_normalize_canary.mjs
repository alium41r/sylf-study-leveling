import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSpriteTo90x90 } from "./normalize_base_canary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRATCH_DIR = join(__dirname, "..", "scratch");
const RAW_OUTPUT_PATH = join(SCRATCH_DIR, "base_canary_raw.png");
const NORMALIZED_OUTPUT_PATH = join(__dirname, "..", "public", "sprites", "character", "body", "test_hunter_base.png");

const SOUTH_URL = "https://backblaze.pixellab.ai/file/pixellab-characters/15d0c340-5eb7-4d49-82ee-dd09ac37c7ac/9d1f4f7f-324d-4f58-8920-22728b72b462/rotations/south.png?t=1787352158";

async function main() {
  if (!existsSync(SCRATCH_DIR)) mkdirSync(SCRATCH_DIR, { recursive: true });

  console.log(`Downloading south rotation from ${SOUTH_URL}...`);
  const res = await fetch(SOUTH_URL);
  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(RAW_OUTPUT_PATH, buffer);
  console.log(`Saved raw sprite to ${RAW_OUTPUT_PATH} (${buffer.length} bytes)`);

  const { encoded, contentWidth, contentHeight, rawWidth, rawHeight } = normalizeSpriteTo90x90(buffer, 90, 90);
  writeFileSync(NORMALIZED_OUTPUT_PATH, encoded);
  console.log(`Successfully normalized to 90x90px canvas: ${NORMALIZED_OUTPUT_PATH} (${encoded.length} bytes)`);
}

main().catch(console.error);
