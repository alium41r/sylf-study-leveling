import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The user supplies transparent production artwork. Read pixels for inspection
// only, then copy the original file bytes without decoding/re-encoding the asset.
const root = fileURLToPath(new URL("../../", import.meta.url));
const expectedSize = 1254;
const assets = [
  {
    role: "eyeless-base",
    sourceStems: [
      "sylf pixel companion without eyes no bg",
      "sylf pixel companion without eyes",
    ],
    output: "public/companions/pixel/sylf/base/body.png",
    characterPoints: [
      [550, 515],
      [700, 565],
    ],
    shadowPoint: [620, 1100],
    backgroundPoints: [
      [0, 0],
      [500, 210],
      [380, 855],
      [860, 850],
    ],
    faceOpeningBounds: [460, 450, 786, 662],
    centralEyePlacementBounds: [490, 470, 755, 615],
  },
  {
    role: "phase1-full-reference",
    sourceStems: ["sylf pixel companion"],
    output: "public/companions/sylf-pixel-companion.png",
    characterPoints: [
      [625, 540],
      [550, 620],
    ],
    shadowPoint: [620, 1100],
    backgroundPoints: [
      [0, 0],
      [500, 220],
      [400, 868],
      [840, 868],
    ],
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function inspectAlpha(data, width, height) {
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const values = new Set();
  for (let index = 0; index < width * height; index++) {
    const alpha = data[index * 4 + 3];
    values.add(alpha);
    if (alpha === 0) transparent++;
    else {
      if (alpha === 255) opaque++;
      else partial++;
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    transparentPixels: transparent,
    partialAlphaPixels: partial,
    opaquePixels: opaque,
    values: [...values].sort((a, b) => a - b),
    visibleBounds: [minX, minY, maxX + 1, maxY + 1],
  };
}

const sourceDir = join(root, "assets/pixel-companion/source");
const files = await readdir(sourceDir);
const audits = [];
for (const asset of assets) {
  const matches = files.filter((name) =>
    asset.sourceStems.includes(parse(name).name.trim())
  );
  assert(
    matches.length === 1,
    `Expected one transparent source with stem ${JSON.stringify(asset.sourceStems)}; found ${matches.length}.`
  );
  const source = matches[0];
  const sourcePath = join(sourceDir, source);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  const metadata = await sharp(sourceBytes).metadata();
  assert(
    metadata.format === "png",
    `${source} is not a PNG; do not rename or convert the source implicitly.`
  );
  assert(
    metadata.width === expectedSize && metadata.height === expectedSize,
    `${source} has unexpected dimensions; recheck source-space eye placement.`
  );
  assert(
    metadata.hasAlpha,
    `${source} lacks alpha transparency. Supply a transparent asset; no background extraction is performed.`
  );
  const { data, info } = await sharp(sourceBytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  assert(channels === 4, `${source} did not decode to RGBA for inspection.`);
  const alpha = inspectAlpha(data, width, height);
  assert(
    alpha.transparentPixels > 0 && alpha.opaquePixels > 0,
    `${source} lacks genuine transparent background or visible opaque artwork.`
  );
  const inspectPoint = ([x, y]) => ({
    coordinate: [x, y],
    rgba: [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)],
  });
  const characterSamples = asset.characterPoints.map(inspectPoint);
  const shadowSample = inspectPoint(asset.shadowPoint);
  const backgroundSamples = asset.backgroundPoints.map(inspectPoint);
  assert(
    characterSamples.every((sample) => sample.rgba[3] > 0),
    `${source} has an unexpectedly empty face; inspect the supplied artwork.`
  );
  assert(
    shadowSample.rgba[3] > 0,
    `${source} has an unexpectedly empty shadow; inspect the supplied artwork.`
  );
  const outputPath = join(root, asset.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, sourceBytes);
  const outputBytes = await readFile(outputPath);
  assert(
    outputBytes.equals(sourceBytes),
    `${asset.output} differs from its source bytes.`
  );
  assert(
    sha256(await readFile(sourcePath)) === sourceSha256,
    `${source} changed during copying.`
  );
  audits.push({
    role: asset.role,
    source,
    sourceSha256,
    sourceHadAlpha: metadata.hasAlpha,
    sourceChannels: "RGBA",
    sourceDimensions: { width, height },
    output: asset.output,
    outputSha256: sha256(outputBytes),
    outputChannels: "RGBA",
    outputDimensions: { width, height },
    alpha,
    suppliedFringeNote:
      alpha.partialAlphaPixels > 0
        ? "The supplied source contains partial alpha; copied without any cleanup or thresholding."
        : "The supplied source has binary alpha. Existing RGB edge colors are copied without cleanup or thresholding.",
    inspectionSamples: { characterSamples, shadowSample, backgroundSamples },
    verification: {
      sourceAndRuntimeBytesIdentical: true,
      sourceSha256Unchanged: true,
      changedRgbPixels: 0,
      changedAlphaPixels: 0,
      crop: false,
      resample: false,
      reencode: false,
      backgroundRemoval: false,
    },
    ...(asset.faceOpeningBounds
      ? {
          faceOpeningBounds: asset.faceOpeningBounds,
          centralEyePlacementBounds: asset.centralEyePlacementBounds,
        }
      : {}),
  });
  console.log(
    `${asset.output}: exact ${width}x${height} source copy; ${alpha.transparentPixels} transparent, ${alpha.partialAlphaPixels} partial-alpha pixels.`
  );
}

const auditPath = join(
  root,
  "documentation/pixel-companion/phase2/base-asset-audit.json"
);
await mkdir(dirname(auditPath), { recursive: true });
await writeFile(
  auditPath,
  `${JSON.stringify(
    {
      phase: 2,
      method: "Byte-for-byte copy of supplied transparent PNG source artwork",
      note: "The user replaced the opaque artwork with transparent source assets. No alpha removal, RGB changes, cropping, resampling, palette conversion or image reconstruction is performed. Pixel inspection only verifies the supplied alpha and records samples; no eye sheet is read or processed by this script.",
      assets: audits,
    },
    null,
    2
  )}\n`
);
