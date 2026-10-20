#!/usr/bin/env node
// ============================================================================
// scan-secrets.mjs — lightweight secret scanner for the SYLF repo (S4).
// ============================================================================
// Scans git-TRACKED files (never node_modules or build output) for common
// credential patterns and prints file+type only (never values). Exits 1 when
// anything matches, so it can gate CI. Run via: npm run audit:secrets
// ============================================================================
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "../..");

// High-signal patterns — location reporting only, values are never printed.
const PATTERNS = [
  { name: "Google API key", re: /AIza[0-9A-Za-z_\-]{30,}/ },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "Groq key", re: /gsk_[A-Za-z0-9]{16,}/ },
  { name: "GitHub PAT", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Slack token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "GitLab PAT", re: /glpat-[A-Za-z0-9_\-]{10,}/ },
  { name: "Private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  // A literal user:password pair is a credential. A runtime-interpolated fixture
  // such as `postgres:${password}@127.0.0.1` is generated per test run and is not.
  { name: "Postgres URL with password", re: /postgres(ql)?:\/\/[^/\s:@]+:(?!\$\{)[^@\s]+@/ },
  { name: "Hardcoded bearer token", re: /Bearer [A-Za-z0-9._\-]{24,}/ },
];

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.error("scan-secrets: git unavailable — cannot enumerate tracked files.");
    process.exit(2);
  }
}

let hits = 0;
for (const rel of trackedFiles()) {
  if (/\.(png|jpe?g|gif|webp|ogg|wav|ico|mp3|woff2?|ttf)$/i.test(rel)) continue;
  const abs = path.join(ROOT, rel);
  let content;
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    continue; // binary or unreadable
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(content)) {
      console.log(`[${name}] ${rel}`);
      hits++;
      break; // one report per file is enough
    }
  }
}

if (hits > 0) {
  console.log(`\nscan-secrets: ${hits} file(s) matched credential patterns — investigate each (values are never printed).`);
  process.exit(1);
}
console.log("scan-secrets: no credential patterns found in tracked files.");
