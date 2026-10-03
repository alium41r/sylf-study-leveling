#!/usr/bin/env node
// ============================================================================
// verify-mobile-bundle.mjs — Forensic Security and Integrity Guard
// ============================================================================
// Scans mobile/dist/ output to verify:
//  1. index.html and essential asset files exist
//  2. Zero server-only module names or Prisma client references are bundled
//  3. Zero private server secrets or env variable tokens are bundled
//  4. Records bundle file metrics and sizes
// ============================================================================

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const DIST_DIR = path.join(ROOT, "mobile", "dist");

if (!fs.existsSync(DIST_DIR)) {
  console.error("verify-mobile-bundle: mobile/dist directory does not exist. Run 'npx vite build mobile' first.");
  process.exit(1);
}

const indexHtmlPath = path.join(DIST_DIR, "index.html");
if (!fs.existsSync(indexHtmlPath)) {
  console.error("verify-mobile-bundle: index.html is missing in mobile/dist.");
  process.exit(1);
}

// Banned server symbols and secrets (never allowed in client assets)
const FORBIDDEN_STRINGS = [
  "@prisma/client",
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CRON_SECRET",
  "TOOL_CONFIRMATION_SECRET",
];

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allFiles = getAllFiles(DIST_DIR);
let totalJsBytes = 0;
let totalCssBytes = 0;
let violations = [];
const fileStats = [];

for (const file of allFiles) {
  const rel = path.relative(DIST_DIR, file);
  const size = fs.statSync(file).size;
  const ext = path.extname(file).toLowerCase();

  if (ext === ".js") totalJsBytes += size;
  if (ext === ".css") totalCssBytes += size;

  fileStats.push({ file: rel, size, ext });

  // Only scan text assets
  if (ext === ".js" || ext === ".html" || ext === ".css") {
    const content = fs.readFileSync(file, "utf8");
    for (const forbidden of FORBIDDEN_STRINGS) {
      if (content.includes(forbidden)) {
        violations.push({ file: rel, symbol: forbidden });
      }
    }
  }
}

console.log("\n==================================================");
console.log("MOBILE BUNDLE AUDIT & INTEGRITY VERIFICATION");
console.log("==================================================");
console.log(`Total Bundled Files: ${allFiles.length}`);
console.log(`Total JavaScript Size: ${(totalJsBytes / 1024).toFixed(2)} KB`);
console.log(`Total CSS Size: ${(totalCssBytes / 1024).toFixed(2)} KB`);
console.log("Key Chunks:");

fileStats
  .sort((a, b) => b.size - a.size)
  .slice(0, 8)
  .forEach((f) => {
    console.log(`  • ${f.file.padEnd(45)} ${(f.size / 1024).toFixed(2).padStart(8)} KB`);
  });

if (violations.length > 0) {
  console.error("\n[CRITICAL ERROR] Server-only symbols or secrets discovered in mobile bundle:");
  for (const v of violations) {
    console.error(`  - In ${v.file}: matched forbidden symbol '${v.symbol}'`);
  }
  process.exit(1);
}

// ============================================================================
// Mock Mode Verification Guard (Fail-Closed Architecture)
// ============================================================================
const isMockRequested = process.argv.includes("--mock") || process.env.VITE_ENABLE_MOCK_API === "true";
const manifestPath = path.join(DIST_DIR, ".mock-manifest.json");
let mockManifest = null;

if (fs.existsSync(manifestPath)) {
  try {
    mockManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error("verify-mobile-bundle: Failed to parse .mock-manifest.json:", err.message);
  }
}

if (isMockRequested) {
  if (!mockManifest || mockManifest.mockEnabled !== true) {
    console.error("\n[VERIFICATION ERROR] Expected DEVELOPMENT MOCK BUILD (--mock), but mobile/dist was built without mock mode enabled.");
    console.error("Build with 'npm run mobile:build:mock' first.");
    process.exit(1);
  }
  console.log("\n==================================================");
  console.log("DEVELOPMENT MOCK BUILD — NOT FOR RELEASE");
  console.log("==================================================");
  console.log("NOTICE: Active mock API interception is enabled in this bundle.");
  console.log("This build is strictly intended for local offline development verification.");
  console.log("==================================================");
} else {
  if (mockManifest && mockManifest.mockEnabled === true) {
    console.error("\n[CRITICAL SECURITY VIOLATION] Active mock API interception is ENABLED in mobile/dist, but this is a NORMAL build verification!");
    console.error("Normal builds must be FAIL-CLOSED with mock mode OFF.");
    console.error("Rebuild with 'npm run mobile:build' for normal builds, or use 'npm run mobile:verify:mock' for development device builds.");
    process.exit(1);
  }
  console.log("\nMock Mode Status: FAIL-CLOSED (Mocks Disabled, Production-Ready)");
}

console.log("\nverify-mobile-bundle: PASSED. Zero server-only symbols or secrets found in mobile/dist.");
console.log("==================================================\n");

