import fs from "node:fs";
import path from "node:path";
import { optimize } from "svgo";
import svgoConfig from "../../config/svgo.config.mjs";

const SYLVS_DIR = path.resolve(process.cwd(), "sylvs");

function findSvgFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSvgFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".svg")) {
      files.push(fullPath);
    }
  }
  return files;
}

function analyzeSvg(svgContent) {
  const pathMatches = svgContent.match(/<path\b/gi) || [];
  const ellipseMatches = svgContent.match(/<ellipse\b/gi) || [];
  const circleMatches = svgContent.match(/<circle\b/gi) || [];
  const groupMatches = svgContent.match(/<g\b/gi) || [];
  return {
    paths: pathMatches.length,
    ellipses: ellipseMatches.length,
    circles: circleMatches.length,
    groups: groupMatches.length,
    totalShapes: pathMatches.length + ellipseMatches.length + circleMatches.length,
  };
}

console.log("🔍 Scanning for Sylv SVG assets in", SYLVS_DIR);
const svgFiles = findSvgFiles(SYLVS_DIR);

if (svgFiles.length === 0) {
  console.log("No SVG files found.");
  process.exit(0);
}

let totalOriginalBytes = 0;
let totalOptimizedBytes = 0;

console.log("\n📊 Sylv SVG Asset Optimization & Complexity Report:");
console.log("--------------------------------------------------");

for (const filePath of svgFiles) {
  const relativePath = path.relative(process.cwd(), filePath);
  const originalContent = fs.readFileSync(filePath, "utf-8");
  const originalSize = Buffer.byteLength(originalContent, "utf-8");
  totalOriginalBytes += originalSize;

  const preStats = analyzeSvg(originalContent);

  const result = optimize(originalContent, {
    path: filePath,
    ...svgoConfig,
  });

  const optimizedContent = result.data;
  const optimizedSize = Buffer.byteLength(optimizedContent, "utf-8");
  totalOptimizedBytes += optimizedSize;
  const savings = (((originalSize - optimizedSize) / originalSize) * 100).toFixed(1);

  // Write back optimized SVG
  fs.writeFileSync(filePath, optimizedContent, "utf-8");

  const postStats = analyzeSvg(optimizedContent);

  console.log(`\n📄 Asset: ${relativePath}`);
  console.log(`   Size: ${originalSize} B → ${optimizedSize} B (-${savings}%)`);
  console.log(`   Geometry Complexity:`);
  console.log(`     • Paths: ${postStats.paths}`);
  console.log(`     • Ellipses/Circles: ${postStats.ellipses + postStats.circles}`);
  console.log(`     • Groups: ${postStats.groups}`);
  console.log(`     • Total Shapes: ${postStats.totalShapes}`);
}

const totalSavings = (((totalOriginalBytes - totalOptimizedBytes) / totalOriginalBytes) * 100).toFixed(1);
console.log("\n--------------------------------------------------");
console.log(`Total: ${totalOriginalBytes} B → ${totalOptimizedBytes} B (-${totalSavings}%)`);
console.log("✅ SVGO optimization complete.\n");
