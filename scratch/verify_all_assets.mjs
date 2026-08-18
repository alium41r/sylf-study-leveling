import fs from "fs";
import path from "path";
import { decodePng } from "./sprite_composer.mjs";

let total = 0;
let errors = 0;

function checkFolder(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      checkFolder(fullPath);
    } else if (e.name.endsWith(".png")) {
      total++;
      try {
        const buf = fs.readFileSync(fullPath);
        const { width, height, data } = decodePng(buf);
        if (width !== 90 || height !== 90) {
          console.error(`Invalid dimensions: ${fullPath} (${width}x${height})`);
          errors++;
        }
        // Check if there are non-transparent pixels
        let nonTransparent = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 10) nonTransparent++;
        }
        if (nonTransparent === 0) {
          console.error(`Empty transparent image: ${fullPath}`);
          errors++;
        }
      } catch (err) {
        console.error(`Decode error in ${fullPath}: ${err.message}`);
        errors++;
      }
    }
  }
}

checkFolder("public/sprites/character");
console.log(`Verified ${total} PNG assets. Errors: ${errors}`);
