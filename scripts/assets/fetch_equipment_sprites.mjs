#!/usr/bin/env node
/**
 * Fetch Equipment Sprites from Habitica's Open-Source Asset CDN
 * 
 * Downloads 90×90 transparent PNG sprites for all equipment items in the
 * Sylf catalog and saves them to /public/sprites/character/equipment/.
 * 
 * Habitica CDN: https://habitica-assets.s3.amazonaws.com/mobileApp/images/
 * License: Habitica sprites are CC-BY-SA 3.0 / GPL v3 (open-source game)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT_DIR = join(__dirname, "../..", "public", "sprites", "character", "equipment");
const CDN_BASE = "https://habitica-assets.s3.amazonaws.com/mobileApp/images";

// ─── Sprite Layer → Habitica Asset Mapping ───────────────────────
// Maps our catalog spriteLayer IDs to Habitica's open-source sprite filenames.
// Habitica uses: head_{class}_{tier}, armor_{class}_{tier}, weapon_{class}_{tier}, shield_{class}_{tier}

const SPRITE_MAP = {
  // ─── Rookie Explorer Set (Common) → Special tier 0 ─────────
  "helm_rookie_explorer":     "head_special_0",
  "chest_rookie_explorer":    "armor_special_0",
  "pants_rookie_explorer":    "armor_special_0",      // Habitica armor covers full body
  "boots_rookie_explorer":    "armor_special_0",

  // ─── Trainee Chainmail Set (Common) → Warrior tier 1 ───────
  "helm_trainee_chainmail":   "head_warrior_1",
  "chest_trainee_chainmail":  "armor_warrior_1",
  "pants_trainee_chainmail":  "armor_warrior_1",
  "boots_trainee_chainmail":  "armor_warrior_1",

  // ─── Vanguard Plate Set (Rare) → Warrior tier 2 ────────────
  "helm_vanguard_plate":      "head_warrior_2",
  "chest_vanguard_plate":     "armor_warrior_2",
  "pants_vanguard_plate":     "armor_warrior_2",
  "boots_vanguard_plate":     "armor_warrior_2",

  // ─── Shadow Mail Set (Rare) → Rogue tier 1 ─────────────────
  "helm_shadow_mail":         "head_rogue_1",
  "chest_shadow_mail":        "armor_rogue_1",
  "pants_shadow_mail":        "armor_rogue_1",
  "boots_shadow_mail":        "armor_rogue_1",

  // ─── Chrono Threads Set (Epic) → Wizard/Mage tier 1 ────────
  "helm_chrono_threads":      "head_wizard_1",
  "chest_chrono_threads":     "armor_wizard_1",
  "pants_chrono_threads":     "armor_wizard_1",
  "boots_chrono_threads":     "armor_wizard_1",

  // ─── Frost Armour Set (Epic) → Healer tier 1 ───────────────
  "helm_frost_armour":        "head_healer_1",
  "chest_frost_armour":       "armor_healer_1",
  "pants_frost_armour":       "armor_healer_1",
  "boots_frost_armour":       "armor_healer_1",

  // ─── Dragon Scale Set (Legendary) → Warrior tier 3 ─────────
  "helm_dragon_scale":        "head_warrior_3",
  "chest_dragon_scale":       "armor_warrior_3",
  "pants_dragon_scale":       "armor_warrior_3",
  "boots_dragon_scale":       "armor_warrior_3",

  // ─── Asura Aegis Set (Legendary) → Warrior tier 4 ──────────
  "helm_asura_aegis":         "head_warrior_4",
  "chest_asura_aegis":        "armor_warrior_4",
  "pants_asura_aegis":        "armor_warrior_4",
  "boots_asura_aegis":        "armor_warrior_4",

  // ─── Monarch's Regalia Set (Mythic) → Wizard tier 4 ────────
  "helm_monarchs_regalia":    "head_wizard_4",
  "chest_monarchs_regalia":   "armor_wizard_4",
  "pants_monarchs_regalia":   "armor_wizard_4",
  "boots_monarchs_regalia":   "armor_wizard_4",

  // ─── Eternity Suit Set (Mythic) → Warrior tier 5 ───────────
  "helm_eternity_suit":       "head_warrior_5",
  "chest_eternity_suit":      "armor_warrior_5",
  "pants_eternity_suit":      "armor_warrior_5",
  "boots_eternity_suit":      "armor_warrior_5",

  // ─── Weapons ───────────────────────────────────────────────
  "weapon_recruit_dagger":    "weapon_rogue_0",
  "weapon_novice_staff":      "weapon_wizard_0",
  "weapon_obsidian_edge":     "weapon_rogue_1",
  "weapon_hunter_bow":        "weapon_rogue_2",
  "weapon_crimson_scythe":    "weapon_warrior_3",
  "weapon_asura_greatsword":  "weapon_warrior_4",
  "weapon_sovereign_scepter": "weapon_wizard_4",
  "weapon_monarch_dagger":    "weapon_rogue_4",

  // ─── Relics ────────────────────────────────────────────────
  "relic_chrono_hourglass":   "shield_healer_1",
  "relic_eternity_core":      "shield_special_0",
};

// Fallback sources: if the primary CDN path fails, try these alternative patterns
const FALLBACK_PATTERNS = [
  (name) => `${CDN_BASE}/shop_${name}.png`,
  (name) => `${CDN_BASE}/${name}.png`,
  (name) => `${CDN_BASE}/slim_${name}.png`,
  (name) => `${CDN_BASE}/broad_${name}.png`,
];

async function downloadSprite(habiticaName, localName) {
  for (const getUrl of FALLBACK_PATTERNS) {
    const url = getUrl(habiticaName);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        // Validate it's actually a PNG (starts with PNG magic bytes)
        if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) {
          const outPath = join(EQUIPMENT_DIR, `${localName}.png`);
          await writeFile(outPath, buffer);
          console.log(`  ✅ ${localName}.png ← ${url} (${buffer.length} bytes)`);
          return true;
        }
      }
    } catch {
      // Try next fallback
    }
  }
  console.log(`  ⚠️  ${localName}.png — all sources failed, skipping`);
  return false;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Sylf Equipment Sprite Fetcher — Habitica Open Assets  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  if (!existsSync(EQUIPMENT_DIR)) {
    await mkdir(EQUIPMENT_DIR, { recursive: true });
  }

  const entries = Object.entries(SPRITE_MAP);
  // Deduplicate: multiple local names may map to the same Habitica source
  // but each local file needs its own copy
  const uniqueDownloads = new Map();
  for (const [localName, habiticaName] of entries) {
    if (!uniqueDownloads.has(localName)) {
      uniqueDownloads.set(localName, habiticaName);
    }
  }

  let success = 0;
  let failed = 0;

  console.log(`Downloading ${uniqueDownloads.size} equipment sprites...\n`);

  for (const [localName, habiticaName] of uniqueDownloads) {
    // Check if already exists
    const outPath = join(EQUIPMENT_DIR, `${localName}.png`);
    if (existsSync(outPath)) {
      console.log(`  ⏭️  ${localName}.png — already exists, skipping`);
      success++;
      continue;
    }
    
    const ok = await downloadSprite(habiticaName, localName);
    if (ok) success++;
    else failed++;
    
    // Throttle to avoid hammering CDN
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log();
  console.log("═══════════════════════════════════════════");
  console.log(`Results: ${success} downloaded, ${failed} failed`);
  console.log(`Directory: ${EQUIPMENT_DIR}`);
  console.log("═══════════════════════════════════════════");
}

main().catch(console.error);
