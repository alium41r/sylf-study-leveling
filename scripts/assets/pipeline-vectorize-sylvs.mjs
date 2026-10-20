import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import vtracer from "@visioncortex/vtracer";
import { optimize } from "svgo";
import svgoConfig from "../../config/svgo.config.mjs";

const REFERENCE_IMAGE = path.resolve(process.cwd(), "sylvs/source/base-reference.png");

if (!fs.existsSync(REFERENCE_IMAGE)) {
  console.error("Reference image not found at:", REFERENCE_IMAGE);
  process.exit(1);
}

console.log("🚀 Starting High-Fidelity Sylv Vectorization Pipeline...");

// Crop coordinates for 1536 x 1024 base-reference.png
const CROPS = {
  male: { left: 180, top: 20, width: 540, height: 920 },
  female: { left: 813, top: 20, width: 540, height: 920 },
};

// Canonical 400x600 transform constants
const SCALE = 0.5798;
const TX = +(200 - 270 * SCALE).toFixed(3); // 43.454
const TY = +(52 - 28 * SCALE).toFixed(3);   // 35.766

async function prepareTransparentCrop(gender) {
  const crop = CROPS[gender];
  const { data, info } = await sharp(REFERENCE_IMAGE)
    .extract(crop)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Flood fill background from (0,0) to mask out paper texture
  const visited = new Uint8Array(w * h);
  const queue = [0];
  visited[0] = 1;

  function isBg(x, y) {
    const idx = (y * w + x) * 3;
    return data[idx] >= 250 && data[idx + 1] >= 248 && data[idx + 2] >= 248;
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = Math.floor(curr / w);
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!visited[nidx] && isBg(nx, ny)) {
          visited[nidx] = 1;
          queue.push(nidx);
        }
      }
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = visited[i] ? 0 : 255;
  }

  const outPath = path.resolve(process.cwd(), `sylvs/source/${gender}-clean-crop.png`);
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outPath);

  return outPath;
}

function isEyeFill(hex) {
  const f = hex.replace("#", "");
  if (f.length < 6) return false;
  const r = parseInt(f.substring(0, 2), 16);
  const g = parseInt(f.substring(2, 4), 16);
  const b = parseInt(f.substring(4, 6), 16);
  return r < 120 && g < 110 && b < 110;
}

function classifySubpath(d, fill) {
  // Extract start coordinate (allow negative numbers)
  const sm = d.match(/^[Mm]\s*(-?[0-9.]+)[,\s]+(-?[0-9.]+)/);
  if (!sm) return "noise";
  const sx = parseFloat(sm[1]);
  const sy = parseFloat(sm[2]);

  // Filter out stray external speckles or out-of-bounds coordinates
  if (sx < 10 || sx > 530 || sy < 10 || sy > 910) {
    return "noise";
  }
  if (sy < 120 && (sx < 130 || sx > 410)) {
    return "noise";
  }

  // 1. Eye detection (dark pill in facial region)
  const isEye = isEyeFill(fill);
  const inLeftEyeBox = sx >= 130 && sx <= 230 && sy >= 220 && sy <= 360;
  const inRightEyeBox = sx >= 310 && sx <= 410 && sy >= 220 && sy <= 360;

  if (isEye && inLeftEyeBox) return "eye-left";
  if (isEye && inRightEyeBox) return "eye-right";

  // 2. Base silhouette (starts at head or upper torso and has massive length)
  if (d.length > 1200) {
    return "base-silhouette";
  }

  // 3. Ears (lateral upper fins)
  if (sy < 380 && sx < 125) return "ear-left";
  if (sy < 380 && sx > 415) return "ear-right";

  // 4. Arms (lateral mid flippers)
  if (sy >= 380 && sy < 640 && sx < 185) return "arm-left";
  if (sy >= 380 && sy < 640 && sx > 355) return "arm-right";

  // 5. Tail (lower body)
  if (sy >= 560) return "tail";

  // 6. Torso (center body)
  if (sy >= 360 && sy < 560) return "torso";

  // 7. Head
  return "head";
}

function mapColorToken(fill, category, gender) {
  if (category === "eye-left" || category === "eye-right") {
    return `var(--sylv-eye, ${gender === "female" ? "#3E292B" : "#2D3342"})`;
  }

  const f = fill.toUpperCase();

  // Primary body porcelain (light tones)
  if (
    category === "base-silhouette" ||
    f.startsWith("#F") ||
    f === "#E9E1DF" ||
    f === "#E8E0DE" ||
    f === "#E6D7D2" ||
    f === "#F4E2DC" ||
    f === "#F5E3DD" ||
    f === "#F0DDD7"
  ) {
    return `var(--sylv-primary, ${gender === "female" ? "#FAF5F3" : "#F6F5F2"})`;
  }

  // Secondary shading (soft shadows & volume undertones)
  if (
    f === "#ABADB9" ||
    f === "#BEB2B4" ||
    f === "#D1CFD4" ||
    f === "#BCBCC6" ||
    f === "#EAD1CE" ||
    f === "#EAD2CE" ||
    f === "#C9A8A5" ||
    f === "#D3B2AB" ||
    f === "#D9BBB7" ||
    f === "#D5B8B4" ||
    f === "#C8A8A3" ||
    f === "#CDADA8" ||
    f === "#C3A39F"
  ) {
    return `var(--sylv-secondary, ${gender === "female" ? "#EAD3D3" : "#CAD5E2"})`;
  }

  // Accent / fine contour edges
  return `var(--sylv-accent, ${gender === "female" ? "#DBBEBE" : "#B8C7D8"})`;
}

async function vectorizeGender(gender) {
  console.log(`\n🎨 Vectorizing ${gender} Sylv base from reference crop...`);
  const pngPath = await prepareTransparentCrop(gender);
  const buf = fs.readFileSync(pngPath);

  // High-fidelity spline conversion
  const rawSvg = vtracer.convertBuffer(buf, {
    mode: "spline",
    hierarchical: "stacked",
    colorPrecision: 6,
    filterSpeckle: 8,
    simplify: 1.0,
  });

  const pathMatches = [...rawSvg.matchAll(/<path\s+d=\"([^\"]+)\"\s+fill=\"([^\"]+)\"/g)];
  console.log(`  VTracer produced ${pathMatches.length} raw compound paths for ${gender}.`);

  const groups = {
    "sylv-base-silhouette": [],
    "sylv-ear-left": [],
    "sylv-ear-right": [],
    "sylv-tail": [],
    "sylv-body": [],
    "sylv-arm-left": [],
    "sylv-arm-right": [],
    "sylv-head": [],
    "sylv-eye-left": [],
    "sylv-eye-right": [],
  };

  let subpathCount = 0;
  for (const m of pathMatches) {
    const fullD = m[1];
    const fill = m[2];

    // Split compound path into atomic subpaths
    const subpaths = fullD.split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean);

    for (const d of subpaths) {
      if (d.length < 24) continue;

      const cleanD = d.endsWith("Z") || d.endsWith("z") ? d : d + "Z";
      const category = classifySubpath(cleanD, fill);

      // Skip noise
      if (category === "noise") continue;
      subpathCount++;

      const colorToken = mapColorToken(fill, category, gender);
      const tag = `<path d="${cleanD}" fill="${colorToken}" />`;

      switch (category) {
        case "eye-left":
          groups["sylv-eye-left"].push(tag);
          break;
        case "eye-right":
          groups["sylv-eye-right"].push(tag);
          break;
        case "ear-left":
          groups["sylv-ear-left"].push(tag);
          break;
        case "ear-right":
          groups["sylv-ear-right"].push(tag);
          break;
        case "arm-left":
          groups["sylv-arm-left"].push(tag);
          break;
        case "arm-right":
          groups["sylv-arm-right"].push(tag);
          break;
        case "tail":
          groups["sylv-tail"].push(tag);
          break;
        case "torso":
          groups["sylv-body"].push(tag);
          break;
        case "base-silhouette":
          groups["sylv-base-silhouette"].push(tag);
          break;
        default:
          groups["sylv-head"].push(tag);
          break;
      }
    }
  }

  console.log(`  Split and classified ${subpathCount} atomic vector paths:`);
  console.log(`    • Base silhouette: ${groups["sylv-base-silhouette"].length}`);
  console.log(`    • Head: ${groups["sylv-head"].length}`);
  console.log(`    • Eyes: Left=${groups["sylv-eye-left"].length}, Right=${groups["sylv-eye-right"].length}`);
  console.log(`    • Ears: Left=${groups["sylv-ear-left"].length}, Right=${groups["sylv-ear-right"].length}`);
  console.log(`    • Arms: Left=${groups["sylv-arm-left"].length}, Right=${groups["sylv-arm-right"].length}`);
  console.log(`    • Torso: ${groups["sylv-body"].length}`);
  console.log(`    • Tail: ${groups["sylv-tail"].length}`);

  // Build canonical SVG with 400x600 viewBox and precise transformation
  const structuredSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%">
  <g id="sylv-character-root" data-gender="${gender}">
    <g transform="translate(${TX}, ${TY}) scale(${SCALE})">
      <g id="sylv-base-silhouette">
        ${groups["sylv-base-silhouette"].join("\n        ")}
      </g>
      <g id="sylv-tail">
        ${groups["sylv-tail"].join("\n        ")}
      </g>
      <g id="sylv-ears">
        <g id="sylv-ear-left">
          ${groups["sylv-ear-left"].join("\n          ")}
        </g>
        <g id="sylv-ear-right">
          ${groups["sylv-ear-right"].join("\n          ")}
        </g>
      </g>
      <g id="sylv-body">
        ${groups["sylv-body"].join("\n        ")}
      </g>
      <g id="sylv-arms">
        <g id="sylv-arm-left">
          ${groups["sylv-arm-left"].join("\n          ")}
        </g>
        <g id="sylv-arm-right">
          ${groups["sylv-arm-right"].join("\n          ")}
        </g>
      </g>
      <g id="sylv-head">
        ${groups["sylv-head"].join("\n        ")}
      </g>
      <g id="sylv-eyes">
        <g id="sylv-eye-left">
          ${groups["sylv-eye-left"].join("\n          ")}
        </g>
        <g id="sylv-eye-right">
          ${groups["sylv-eye-right"].join("\n          ")}
        </g>
      </g>
    </g>
  </g>
</svg>`;

  // Run SVGO with our config
  const optimized = optimize(structuredSvg, {
    path: `sylvs/base/${gender}/base-${gender}.svg`,
    ...svgoConfig,
  });

  const svgDest = path.resolve(process.cwd(), `sylvs/base/${gender}/base-${gender}.svg`);
  fs.writeFileSync(svgDest, optimized.data, "utf-8");

  const totalPaths = (optimized.data.match(/<path\b/g) || []).length;
  console.log(`  ✅ base-${gender}.svg written: ${Buffer.byteLength(optimized.data)} B, ${totalPaths} paths.`);

  return { gender, optimizedSvg: optimized.data, totalPaths };
}

async function runPipeline() {
  const maleResult = await vectorizeGender("male");
  const femaleResult = await vectorizeGender("female");

  function generateReactComponent(gender, content) {
    const compName = gender === "male" ? "MaleBase" : "FemaleBase";
    const inner = content
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>/, "")
      .trim();

    return `import React from "react";

export interface ${compName}Props {
  className?: string;
}

/**
 * High-Fidelity Canonical ${compName} Geometry.
 * Traced with VTracer from reference artwork and mapped to Sylv CSS custom properties.
 */
export const ${compName}: React.FC<${compName}Props> = ({ className }) => {
  return (
    <g id="sylv-base-${gender}" className={className} data-gender="${gender}">
      ${inner}
    </g>
  );
};
`;
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), "lib/sylvs/renderer/MaleBase.tsx"),
    generateReactComponent("male", maleResult.optimizedSvg),
    "utf-8"
  );
  console.log("✅ lib/sylvs/renderer/MaleBase.tsx updated.");

  fs.writeFileSync(
    path.resolve(process.cwd(), "lib/sylvs/renderer/FemaleBase.tsx"),
    generateReactComponent("female", femaleResult.optimizedSvg),
    "utf-8"
  );
  console.log("✅ lib/sylvs/renderer/FemaleBase.tsx updated.");

  console.log("\n🎉 High-Fidelity Vectorization Pipeline Complete!");
}

runPipeline().catch(console.error);
