import fs from "fs";
import path from "path";
import zlib from "zlib";

function checkDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      checkDir(fullPath);
    } else if (entry.name.endsWith(".png")) {
      const buf = fs.readFileSync(fullPath);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width !== 90 || height !== 90) {
        console.log(`NON-90x90: ${fullPath} -> ${width}x${height}`);
      }
    }
  }
}

checkDir("public/sprites/character");
