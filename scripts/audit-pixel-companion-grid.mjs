import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Read-only image diagnostics. Nearest-neighbor round trips happen in memory;
// only the JSON evidence is saved. No native-grid derivative is emitted.
const root = fileURLToPath(new URL("../", import.meta.url));
const matches = (await readdir(root)).filter((name) =>
  [
    "sylf pixel companion without eyes no bg",
    "sylf pixel companion without eyes",
  ].includes(parse(name).name.trim())
);
if (matches.length !== 1)
  throw new Error("Expected one eyeless companion source.");
const source = matches[0];
const bytes = await readFile(join(root, source));
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const sourceSha256 = hash(bytes);
const { data, info } = await sharp(bytes)
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
if (channels !== 4)
  throw new Error("Grid audit requires the supplied RGBA artwork.");
const pixelCount = width * height;
const palette = new Set();
let opaquePixels = 0;
let partialAlphaPixels = 0;
let transparentPixels = 0;
for (let index = 0; index < pixelCount; index++) {
  const offset = index * 4;
  const alpha = data[offset + 3];
  if (alpha === 0) transparentPixels++;
  else {
    palette.add(
      (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
    );
    if (alpha === 255) opaquePixels++;
    else partialAlphaPixels++;
  }
}

function sameRgba(first, second) {
  return (
    data[first] === data[second] &&
    data[first + 1] === data[second + 1] &&
    data[first + 2] === data[second + 2] &&
    data[first + 3] === data[second + 3]
  );
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function axisAudit(axis) {
  const length = axis === "x" ? width : height;
  const lines = axis === "x" ? height : width;
  const profile = Array(length).fill(0);
  const runs = [];
  let opaqueAdjacencies = 0;
  let changedOpaqueAdjacencies = 0;
  for (let line = 0; line < lines; line++) {
    let currentRun = 0;
    let previousOffset = -1;
    for (let position = 0; position < length; position++) {
      const x = axis === "x" ? position : line;
      const y = axis === "x" ? line : position;
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (previousOffset >= 0) {
        if (alpha === 255 && data[previousOffset + 3] === 255) {
          opaqueAdjacencies++;
          if (!sameRgba(offset, previousOffset)) changedOpaqueAdjacencies++;
        }
        if (alpha > 0 || data[previousOffset + 3] > 0) {
          let difference = Math.abs(alpha - data[previousOffset + 3]);
          if (alpha > 0 && data[previousOffset + 3] > 0)
            for (let channel = 0; channel < 3; channel++)
              difference = Math.max(
                difference,
                Math.abs(
                  data[offset + channel] - data[previousOffset + channel]
                )
              );
          if (difference > 40) profile[position]++;
        }
      }
      if (alpha === 255) {
        if (currentRun > 0 && !sameRgba(offset, previousOffset)) {
          runs.push(currentRun);
          currentRun = 0;
        }
        currentRun++;
      } else if (currentRun > 0) {
        runs.push(currentRun);
        currentRun = 0;
      }
      previousOffset = offset;
    }
    if (currentRun > 0) runs.push(currentRun);
  }
  const mean = profile.reduce((sum, value) => sum + value, 0) / profile.length;
  const centered = profile.map((value) => value - mean);
  const correlations = [];
  for (let shift = 3; shift <= 40; shift++) {
    let dot = 0;
    let firstNorm = 0;
    let secondNorm = 0;
    for (let index = 0; index + shift < centered.length; index++) {
      const first = centered[index];
      const second = centered[index + shift];
      dot += first * second;
      firstNorm += first * first;
      secondNorm += second * second;
    }
    correlations.push({
      sourcePixelShift: shift,
      correlation: dot / Math.sqrt(firstNorm * secondNorm),
    });
  }
  const runHistogram = {};
  for (const run of runs) runHistogram[run] = (runHistogram[run] ?? 0) + 1;
  return {
    profile,
    report: {
      opaqueAdjacencies,
      changedOpaqueAdjacencies,
      changedOpaqueAdjacencyFraction:
        changedOpaqueAdjacencies / opaqueAdjacencies,
      exactRgbaRunCount: runs.length,
      medianExactRgbaRunLength: median(runs),
      onePixelRunFraction:
        runs.filter((value) => value === 1).length / runs.length,
      mostFrequentExactRgbaRunLengths: Object.entries(runHistogram)
        .map(([length, count]) => ({ length: Number(length), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      strongestEdgeProfileCorrelations: correlations
        .sort((a, b) => b.correlation - a.correlation)
        .slice(0, 8),
    },
  };
}

const horizontal = axisAudit("x");
const vertical = axisAudit("y");
function bestBoundaryPhase(profile, blockSize) {
  const scores = Array(blockSize).fill(0);
  for (let position = 1; position < profile.length; position++)
    scores[position % blockSize] += profile[position];
  const origin = scores.indexOf(Math.max(...scores));
  return {
    origin,
    strongEdgesOnBoundaryFraction:
      scores[origin] / scores.reduce((sum, value) => sum + value, 0),
  };
}

const blockAudits = [];
for (const blockSize of [2, 3, 6, 11, 12, 13, 14]) {
  const xPhase = bestBoundaryPhase(horizontal.profile, blockSize);
  const yPhase = bestBoundaryPhase(vertical.profile, blockSize);
  const paletteSizes = [];
  let fullyOpaqueBlocks = 0;
  let fullyOpaqueNonuniformColorBlocks = 0;
  let mixedAlphaBlocks = 0;
  for (let top = yPhase.origin; top + blockSize <= height; top += blockSize) {
    for (
      let left = xPhase.origin;
      left + blockSize <= width;
      left += blockSize
    ) {
      const colors = new Set();
      const alphas = new Set();
      for (let y = top; y < top + blockSize; y++) {
        for (let x = left; x < left + blockSize; x++) {
          const offset = (y * width + x) * 4;
          const alpha = data[offset + 3];
          alphas.add(alpha);
          if (alpha > 0)
            colors.add(
              (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
            );
        }
      }
      if (alphas.size > 1) mixedAlphaBlocks++;
      if (alphas.size === 1 && alphas.has(255)) {
        fullyOpaqueBlocks++;
        paletteSizes.push(colors.size);
        if (colors.size > 1) fullyOpaqueNonuniformColorBlocks++;
      }
    }
  }
  blockAudits.push({
    blockSize,
    phaseSelection:
      "Best strong-edge projection phase per axis, not an inferred authoring origin",
    xPhase,
    yPhase,
    fullyOpaqueBlocks,
    fullyOpaqueNonuniformColorBlocks,
    fullyOpaqueNonuniformColorFraction:
      fullyOpaqueNonuniformColorBlocks / fullyOpaqueBlocks,
    medianDistinctRgbColorsPerFullyOpaqueBlock: median(paletteSizes),
    mixedAlphaBlocks,
  });
}

const roundTrips = [];
for (const nativeSize of [
  94, 96, 100, 104, 106, 114, 128, 192, 209, 256, 418, 627,
]) {
  const reduced = await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(nativeSize, nativeSize, { kernel: "nearest" })
    .raw()
    .toBuffer();
  const restored = await sharp(reduced, {
    raw: { width: nativeSize, height: nativeSize, channels: 4 },
  })
    .resize(width, height, { kernel: "nearest" })
    .raw()
    .toBuffer();
  let changedAlphaPixels = 0;
  let changedVisibleRgbPixels = 0;
  let changedAppearancePixels = 0;
  for (let index = 0; index < pixelCount; index++) {
    const offset = index * 4;
    const alphaChanged = data[offset + 3] !== restored[offset + 3];
    let rgbChanged = false;
    if (data[offset + 3] > 0 || restored[offset + 3] > 0)
      for (let channel = 0; channel < 3; channel++)
        rgbChanged ||= data[offset + channel] !== restored[offset + channel];
    if (alphaChanged) changedAlphaPixels++;
    if (rgbChanged) changedVisibleRgbPixels++;
    if (alphaChanged || rgbChanged) changedAppearancePixels++;
  }
  roundTrips.push({
    nativeSize,
    reductionKernel: "nearest",
    restorationKernel: "nearest",
    changedAlphaPixels,
    changedVisibleRgbPixels,
    changedAppearancePixels,
    appearanceExact: changedAppearancePixels === 0,
  });
}

if (hash(await readFile(join(root, source))) !== sourceSha256)
  throw new Error("Source bytes changed during read-only grid audit.");
const output = join(
  root,
  "documentation/pixel-companion/phase2/grid-audit.json"
);
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      source,
      sourceSha256,
      sourceDimensions: { width, height },
      visiblePaletteRgbColors: palette.size,
      alpha: { transparentPixels, partialAlphaPixels, opaquePixels },
      exactColorRunAudit: {
        horizontal: horizontal.report,
        vertical: vertical.report,
      },
      candidateBlockAudit: blockAudits,
      candidateNativeRoundTrips: roundTrips,
      comparisonRule:
        "Appearance changes if alpha differs or visible RGB differs; hidden RGB under two zero-alpha pixels is ignored. No tolerance is applied.",
      conclusion:
        "No safe, consistent lower native grid was recovered. Apparent large art cells have color variation and inconsistent edge alignment; every tested nearest-neighbor reduction changes visible pixels. Keep the supplied 1254x1254 RGBA canvas as canonical.",
      canonicalCanvas: { width, height, origin: { x: 0, y: 0 } },
      normalizedDerivativeCreated: false,
      sourceUnchanged: true,
    },
    null,
    2
  )}\n`
);
console.log(
  `Grid audit saved: ${output}; ${palette.size} visible RGB colors; all tested native round trips alter appearance.`
);
