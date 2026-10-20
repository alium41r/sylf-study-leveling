#!/usr/bin/env node
/**
 * Deterministic DeepSeek model-migration check.
 *
 * DeepSeek V4 Pro is no longer an active Sylf model: the app-wide DeepSeek target is
 * the Flash line (see `DEEPSEEK_MODELS` in lib/ai/config.ts). This check walks the
 * working tree and fails if any ACTIVE runtime, configuration, test or script file
 * still names the retired model, while explicitly allowing historical records — phase
 * reports, archived evidence and migration tooling — to keep saying what was true at
 * the time.
 *
 * Usage:
 *   node scripts/security/check-model-migration.mjs            # scan and report
 *   node scripts/security/check-model-migration.mjs --json      # machine-readable summary
 *
 * Exit code 0 = no active references, 1 = active reference found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

/** Directories never scanned: dependencies, build output, version control. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "out",
  "coverage",
  "build",
  ".turbo",
  ".vercel",
]);

/** Files scanned by extension: anything that could configure a runtime model. */
const SCAN_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".example",
  ".env",
  ".prisma",
  ".sql",
];

/**
 * Historical paths. Filing a phase report, an archived measurement or the migration
 * check itself is a record of what happened, not an active model selection, so these
 * may keep naming the retired model.
 */
const HISTORICAL = [
  /^AI_PLANNER_MODES_PHASE_\d/,
  /^documentation[/\\]/,
  /^scratch[/\\]/,
  /^scripts[/\\]security[/\\]check-model-migration\.mjs$/,
  /^__tests__[/\\]ai[/\\]model-migration\.test\.ts$/,
];

/** The retired identifier and the ways it appears in prose or configuration. */
const RETIRED = [
  { pattern: /deepseek-v4-pro/g, label: "deepseek-v4-pro" },
  { pattern: /\bV4[\s.-]?Pro\b/gi, label: "V4 Pro" },
];

/**
 * Exports that exist precisely to remember a retired model — legacy pricing so old
 * usage rows still cost what they cost. They are historical records living in a
 * runtime file, so they are excluded from the active bucket by block, not by file.
 */
const HISTORICAL_BLOCKS = [/^export const HISTORICAL_[A-Z_]+/];

const isHistorical = (path) =>
  HISTORICAL.some((rule) => rule.test(path.replace(/^\.\//, "")));

/** True for a line that is only comment prose: it cannot select a model. */
const isComment = (text) => /^(\/\/|\/\*|\*|#)/.test(text.trim());

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(full, files);
    else if (SCAN_EXTENSIONS.some((extension) => entry.endsWith(extension)))
      files.push(full);
  }
  return files;
}

/**
 * Every retired-model reference in the tree, in three buckets:
 *
 * `active`       — executable code or configuration that still names the model. Any
 *                  finding here fails the check.
 * `documentation` — comment prose explaining the migration (for example "V4 Pro is no
 *                  longer an active Sylf model"). Reported so it can be reviewed, but
 *                  a comment cannot reach a provider.
 * `historical`   — phase reports, archived evidence and this check's own rules.
 */
export function scanModelReferences() {
  const active = [];
  const documentation = [];
  const historical = [];
  for (const file of walk(ROOT)) {
    const path = relative(ROOT, file).split(sep).join("/");
    const archived = isHistorical(path);
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let inHistoricalBlock = false;
    content.split("\n").forEach((line, index) => {
      const text = line.trim();
      if (HISTORICAL_BLOCKS.some((rule) => rule.test(text)))
        inHistoricalBlock = true;
      else if (inHistoricalBlock && /^\} as const;/.test(text))
        inHistoricalBlock = false;
      // One finding per line: a line naming the retired model twice is one use.
      const labels = RETIRED.filter(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(line);
      }).map(({ label }) => label);
      if (!labels.length) return;
      const finding = {
        path,
        line: index + 1,
        label: labels[0],
        text: text.slice(0, 160),
      };
      if (archived || inHistoricalBlock) historical.push(finding);
      else if (isComment(line)) documentation.push(finding);
      else active.push(finding);
    });
  }
  return { active, documentation, historical };
}

/** The active DeepSeek model registry, read from the source of truth. */
export function readActiveDeepSeekModels() {
  const source = readFileSync(join(ROOT, "lib/ai/config.ts"), "utf8");
  const block = /export const DEEPSEEK_MODELS = \{([\s\S]*?)\} as const;/.exec(source);
  if (!block) return null;
  const models = {};
  for (const match of block[1].matchAll(/(\w+):\s*(?:DEEPSEEK_FLASH|"([^"]+)")/g))
    models[match[1]] = match[2] ?? "DEEPSEEK_FLASH";
  return models;
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join("/"));

if (isMain) {
  const { active, documentation, historical } = scanModelReferences();
  const models = readActiveDeepSeekModels();
  if (process.argv.includes("--json")) {
    console.info(JSON.stringify({ active, documentation, historical, models }, null, 2));
  } else {
    console.info(
      `check-model-migration: ${active.length} active, ${documentation.length} ` +
        `documentation-only, ${historical.length} historical reference(s).`
    );
    console.info(`active DeepSeek registry: ${JSON.stringify(models)}`);
    for (const finding of documentation)
      console.info(`  NOTE ${finding.path}:${finding.line}  ${finding.text}`);
    for (const finding of active)
      console.info(`  ACTIVE ${finding.path}:${finding.line}  ${finding.text}`);
    if (!active.length)
      console.info(
        "  no active runtime, config, test or script selects the retired model."
      );
  }
  process.exit(active.length ? 1 : 0);
}
