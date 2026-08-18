import fs from "fs";
import path from "path";
import https from "https";

const BASE_URL = "https://raw.githubusercontent.com/HabitRPG/habitica-images/main";
const TARGET_BASE = path.join(process.cwd(), "public", "sprites", "character");

const ASSETS = [
  // ─── 1. Skin & Body ──────────────────────────────────────────
  { src: "customize/skin/skin_ddc994.png", dest: "body/skin_fair.png" },
  { src: "customize/skin/skin_f5a76e.png", dest: "body/skin_peach.png" },
  { src: "customize/skin/skin_ea8349.png", dest: "body/skin_olive.png" },
  { src: "customize/skin/skin_c06534.png", dest: "body/skin_bronze.png" },
  { src: "customize/skin/skin_98461a.png", dest: "body/skin_caramel.png" },
  { src: "customize/skin/skin_915533.png", dest: "body/skin_espresso.png" },
  { src: "customize/skin/skin_shadow.png", dest: "body/skin_shadow.png" },
  { src: "customize/skin/skin_pastelBlue.png", dest: "body/skin_cyber.png" },

  // ─── 2. Base Shirts & Outfits ────────────────────────────────
  { src: "customize/shirts/broad_shirt_black.png", dest: "outfits/shirt_black.png" },
  { src: "customize/shirts/broad_shirt_blue.png", dest: "outfits/shirt_blue.png" },
  { src: "customize/shirts/broad_shirt_purple.png", dest: "outfits/shirt_purple.png" },
  { src: "customize/shirts/broad_shirt_white.png", dest: "outfits/shirt_white.png" },
  { src: "customize/shirts/broad_shirt_green.png", dest: "outfits/shirt_green.png" },
  { src: "customize/shirts/broad_shirt_fire.png", dest: "outfits/shirt_crimson.png" },

  // ─── 3. Class Armor & Robes ──────────────────────────────────
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

  // ─── 4. Eyewear ──────────────────────────────────────────────
  { src: "gear/eyewear/eyewear_special_blackTopFrame.png", dest: "face/eyewear_black_top.png" },
  { src: "gear/eyewear/eyewear_special_blueTopFrame.png", dest: "face/eyewear_blue_top.png" },
  { src: "gear/eyewear/eyewear_special_blackHalfMoon.png", dest: "face/eyewear_black_half.png" },
  { src: "gear/eyewear/eyewear_special_blueHalfMoon.png", dest: "face/eyewear_blue_half.png" },
  { src: "gear/eyewear/eyewear_special_aetherMask.png", dest: "face/eyewear_cyber_visor.png" },
  { src: "gear/eyewear/eyewear_special_redTopFrame.png", dest: "face/eyewear_red_top.png" },
  { src: "gear/eyewear/eyewear_special_whiteTopFrame.png", dest: "face/eyewear_white_top.png" },

  // ─── 5. Headgear & Accessories ───────────────────────────────
  { src: "gear/headAccessory/headAccessory_special_blackHeadband.png", dest: "accessories/headband_black.png" },
  { src: "gear/headAccessory/headAccessory_special_blueHeadband.png", dest: "accessories/headband_blue.png" },
  { src: "gear/headAccessory/headAccessory_special_heroicCirclet.png", dest: "accessories/circlet_heroic.png" },
  { src: "gear/headAccessory/headAccessory_special_redHeadband.png", dest: "accessories/headband_red.png" },
];

// Generate hair assets across styles 1-3 in all colors
const HAIR_COLORS = ["black", "blond", "brown", "TRUred", "blue", "ppurple", "ghostwhite"];
for (const s of ["1", "2", "3"]) {
  for (const c of HAIR_COLORS) {
    ASSETS.push({
      src: `customize/hair/hair_bangs_${s}_${c}.png`,
      dest: `hair/hair_bangs_${s}_${c}.png`,
    });
    ASSETS.push({
      src: `customize/hair/hair_base_${s}_${c}.png`,
      dest: `hair/hair_base_${s}_${c}.png`,
    });
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      } else {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        resolve(false);
      }
    }).on("error", (err) => {
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(err);
    });
  });
}

async function main() {
  console.log(`Downloading ${ASSETS.length} layered character sprite assets...`);
  let downloaded = 0;
  for (const asset of ASSETS) {
    const fullUrl = `${BASE_URL}/${asset.src}`;
    const dest = path.join(TARGET_BASE, asset.dest);
    try {
      const ok = await downloadFile(fullUrl, dest);
      if (ok) {
        downloaded++;
      }
    } catch (e) {
      console.warn(`Failed ${asset.src}`);
    }
  }
  console.log(`Successfully downloaded ${downloaded}/${ASSETS.length} sprite assets to ${TARGET_BASE}`);
}

main();
