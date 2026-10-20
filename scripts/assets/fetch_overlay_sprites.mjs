#!/usr/bin/env node
/**
 * Fetch Character Overlay Equipment Sprites from Habitica's CDN
 * 
 * These are the actual character overlay sprites (not shop icons) that render
 * on top of the pixel character body. Retained inventory product art; companions use authored Pixel assets.
 * 
 * Downloads slim_ variant sprites which are the character-overlay versions.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT_DIR = join(__dirname, "../..", "public", "sprites", "character", "equipment");
const CDN_BASE = "https://habitica-assets.s3.amazonaws.com/mobileApp/images";

// Character overlay sprites use slim_ or broad_ prefix, or no prefix
// Try each variant in order of priority for character overlays
const SPRITE_MAP = {
  // ─── Helmets → head_ sprites (character overlay) ────────────
  "helm_rookie_explorer":     "head_special_0",
  "helm_trainee_chainmail":   "head_warrior_1",
  "helm_vanguard_plate":      "head_warrior_2",
  "helm_shadow_mail":         "head_rogue_1",
  "helm_chrono_threads":      "head_wizard_1",
  "helm_frost_armour":        "head_healer_1",
  "helm_dragon_scale":        "head_warrior_3",
  "helm_asura_aegis":         "head_warrior_4",
  "helm_monarchs_regalia":    "head_wizard_4",
  "helm_eternity_suit":       "head_warrior_5",

  // ─── Chestplates → slim_armor_ sprites (character overlay) ──
  "chest_rookie_explorer":    "armor_special_0",
  "chest_trainee_chainmail":  "armor_warrior_1",
  "chest_vanguard_plate":     "armor_warrior_2",
  "chest_shadow_mail":        "armor_rogue_1",
  "chest_chrono_threads":     "armor_wizard_1",
  "chest_frost_armour":       "armor_healer_1",
  "chest_dragon_scale":       "armor_warrior_3",
  "chest_asura_aegis":        "armor_warrior_4",
  "chest_monarchs_regalia":   "armor_wizard_4",
  "chest_eternity_suit":      "armor_warrior_5",

  // ─── Weapons → weapon_ sprites (character overlay) ──────────
  "weapon_recruit_dagger":    "weapon_rogue_0",
  "weapon_novice_staff":      "weapon_wizard_0",
  "weapon_obsidian_edge":     "weapon_rogue_1",
  "weapon_hunter_bow":        "weapon_rogue_2",
  "weapon_crimson_scythe":    "weapon_warrior_3",
  "weapon_asura_greatsword":  "weapon_warrior_4",
  "weapon_sovereign_scepter": "weapon_wizard_4",
  "weapon_monarch_dagger":    "weapon_rogue_4",

  // ─── Relics → shield_ sprites (character overlay) ───────────
  "relic_chrono_hourglass":   "shield_healer_1",
  "relic_eternity_core":      "shield_special_0",
};

// Overlay sprite URL patterns — try slim_ first (character overlay), then bare, then broad_
const OVERLAY_PATTERNS = [
  (name) => `${CDN_BASE}/slim_${name}.png`,
  (name) => `${CDN_BASE}/${name}.png`,
  (name) => `${CDN_BASE}/broad_${name}.png`,
];

async function downloadSprite(habiticaName, localName) {
  for (const getUrl of OVERLAY_PATTERNS) {
    const url = getUrl(habiticaName);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) {
          const outPath = join(EQUIPMENT_DIR, `${localName}.png`);
          await writeFile(outPath, buffer);
          console.log(`  ✅ ${localName}.png ← ${url} (${buffer.length} bytes)`);
          return true;
        }
      }
    } catch {
      // Try next
    }
  }
  return false;
}

async function main() {
  console.log("Fetching character overlay sprites (slim_ variants)...\n");

  if (!existsSync(EQUIPMENT_DIR)) {
    await mkdir(EQUIPMENT_DIR, { recursive: true });
  }

  let success = 0;
  let kept = 0;
  let failed = 0;

  for (const [localName, habiticaName] of Object.entries(SPRITE_MAP)) {
    const ok = await downloadSprite(habiticaName, localName);
    if (ok) success++;
    else {
      console.log(`  ⏭️  ${localName}.png — overlay variant not found, keeping shop icon`);
      kept++;
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\nResults: ${success} overlays downloaded, ${kept} kept shop icons, ${failed} failed`);
}

main().catch(console.error);
