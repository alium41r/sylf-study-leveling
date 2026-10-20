/**
 * Extract only the six Phase 2 eye pairs from the user-supplied transparent
 * sheets. Register exact RGBA crops, then nearest-sample at half scale once
 * and embed the eyes into the full canonical companion canvas. No background
 * removal, interpolation, compositing, or color operations.
 * Run: node scripts/assets/prepare-pixel-companion-eyes.mjs [--check]
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkOnly = process.argv.includes("--check");
const canvas = { width: 1254, height: 1254 };
const registeredPairCanvas = { width: 600, height: 300 };
const canonicalEyeRegion = { left: 475, top: 480, width: 300, height: 150 };
const anchors = [
  { x: 150, y: 150 },
  { x: 450, y: 150 },
];
const sources = {
  1: {
    file: "eye batch 1 (1).png",
    sha256: "9a47ca26d91b37e7811a68987fcf20608f8d0df28a223f777ff010a9c5097550",
    width: 1774,
    height: 887,
  },
  2: {
    file: "eye batch 2 (1).png",
    sha256: "32a8a1c95337ef644c0c96b6db054e46d1f671261020d98db287daedcf054300",
    width: 1536,
    height: 1024,
  },
  4: {
    file: "eye batch 4 (1).png",
    sha256: "784e8107e54edd693a7a63b02dd5348b43c7802866582148488c17216ac30707",
    width: 1536,
    height: 1024,
  },
};

// Fixed source rectangles exclude the design-sheet labels and other states.
// Coordinates are source pixels: [left, top, width, height].
const selections = [
  {
    state: "neutral",
    sheet: 1,
    label: "Neutral / Idle",
    crops: [
      [40, 120, 250, 265],
      [330, 120, 260, 265],
    ],
  },
  {
    state: "happy",
    sheet: 1,
    label: "Soft Happy",
    crops: [
      [605, 120, 265, 265],
      [895, 120, 260, 265],
    ],
  },
  {
    state: "thinking",
    sheet: 2,
    label: "Thinking",
    crops: [
      [1020, 145, 260, 255],
      [1295, 195, 235, 205],
    ],
  },
  {
    state: "focused",
    sheet: 2,
    label: "Focused",
    crops: [
      [15, 150, 235, 250],
      [260, 150, 230, 250],
    ],
  },
  {
    state: "sleepy",
    sheet: 4,
    label: "Sleepy",
    crops: [
      [10, 195, 245, 200],
      [275, 195, 245, 200],
    ],
  },
  {
    state: "blink",
    sheet: 4,
    label: "Resting / Closed eyes",
    crops: [
      [20, 600, 245, 165],
      [280, 600, 240, 165],
    ],
  },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const alphaCounts = (rgba) => {
  const counts = { transparent: 0, partial: 0, opaque: 0 };
  for (let i = 3; i < rgba.length; i += 4) {
    counts[
      rgba[i] === 0 ? "transparent" : rgba[i] === 255 ? "opaque" : "partial"
    ]++;
  }
  return counts;
};

function copyRect(source, sourceWidth, rect) {
  const [left, top, width, height] = rect;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    source.copy(
      rgba,
      y * width * 4,
      ((top + y) * sourceWidth + left) * 4,
      ((top + y) * sourceWidth + left + width) * 4
    );
  }
  return rgba;
}

function visibleBounds(rgba, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  assert(right >= left && bottom >= top, "Selected eye rectangle is empty");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Explicit nearest-neighbor at exactly 1/2 size: each destination pixel copies
// the complete RGBA tuple from source (2*x+1, 2*y+1). No color/alpha averaging.
function nearestHalf(rgba, width, height) {
  assert.equal(width % 2, 0);
  assert.equal(height % 2, 0);
  const output = Buffer.alloc((width / 2) * (height / 2) * 4);
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width / 2; x++) {
      const sourceIndex = ((2 * y + 1) * width + 2 * x + 1) * 4;
      rgba.copy(
        output,
        (y * (width / 2) + x) * 4,
        sourceIndex,
        sourceIndex + 4
      );
    }
  }
  return output;
}

function addVisiblePalette(palette, rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]) palette.add(rgba.readUInt32BE(i));
  }
}

const runtimeDir = path.join(root, "public/companions/pixel/sylf/eyes");
const evidenceDir = path.join(root, "documentation/pixel-companion/phase2");
const sourceDir = path.join(root, "assets/pixel-companion/eyes");
if (!checkOnly) {
  await mkdir(runtimeDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
}

const decodedSources = new Map();
const sourceAudit = [];
for (const [number, source] of Object.entries(sources)) {
  const bytes = await readFile(path.join(sourceDir, source.file));
  assert.equal(sha256(bytes), source.sha256, `Source changed: ${source.file}`);
  const metadata = await sharp(bytes).metadata();
  assert(
    metadata.hasAlpha && metadata.channels === 4,
    `Source must provide RGBA transparency: ${source.file}`
  );
  assert.equal(metadata.width, source.width);
  assert.equal(metadata.height, source.height);
  const { data, info } = await sharp(bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const counts = alphaCounts(data);
  assert(
    counts.transparent > 0,
    `Source has no transparent pixels: ${source.file}`
  );
  decodedSources.set(Number(number), { data, width: info.width });
  sourceAudit.push({
    ...source,
    hasAlpha: metadata.hasAlpha,
    channels: metadata.channels,
    alpha: counts,
  });
}

const assets = [];
for (const selection of selections) {
  const source = sources[selection.sheet];
  const decoded = decodedSources.get(selection.sheet);
  const registeredPair = Buffer.alloc(
    registeredPairCanvas.width * registeredPairCanvas.height * 4
  );
  const sourcePalette = new Set();
  const eyeAudit = [];
  for (let eye = 0; eye < selection.crops.length; eye++) {
    const rect = selection.crops[eye];
    const [, , width, height] = rect;
    const rgba = copyRect(decoded.data, decoded.width, rect);
    addVisiblePalette(sourcePalette, rgba);
    const bounds = visibleBounds(rgba, width, height);
    // Integer translation only. A 1-source-pixel asymmetry is expected when a
    // bounding box has even dimensions; the same floor rule is used for all.
    const center = {
      x: bounds.left + Math.floor((bounds.width - 1) / 2),
      y: bounds.top + Math.floor((bounds.height - 1) / 2),
    };
    const destination = {
      left: anchors[eye].x - center.x,
      top: anchors[eye].y - center.y,
      width,
      height,
    };
    assert(destination.left >= 0 && destination.top >= 0);
    assert(
      destination.left + width <= registeredPairCanvas.width &&
        destination.top + height <= registeredPairCanvas.height
    );
    for (let y = 0; y < height; y++) {
      rgba.copy(
        registeredPair,
        ((destination.top + y) * registeredPairCanvas.width +
          destination.left) *
          4,
        y * width * 4,
        (y + 1) * width * 4
      );
    }
    const copied = copyRect(registeredPair, registeredPairCanvas.width, [
      destination.left,
      destination.top,
      width,
      height,
    ]);
    assert(copied.equals(rgba), "RGBA changed during integer translation");
    eyeAudit.push({
      side: eye === 0 ? "left" : "right",
      sourceCrop: { left: rect[0], top: rect[1], width, height },
      visibleSourceBounds: {
        left: rect[0] + bounds.left,
        top: rect[1] + bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
      sourceAnchor: { x: rect[0] + center.x, y: rect[1] + center.y },
      registeredPairAnchor: anchors[eye],
      registeredPairCrop: destination,
      cropRgbaSha256: sha256(rgba),
      sourceRgbaEqualsRegisteredPairCrop: true,
      rgbaChangedBytes: 0,
      alpha: alphaCounts(rgba),
    });
  }
  const sampledPair = nearestHalf(
    registeredPair,
    registeredPairCanvas.width,
    registeredPairCanvas.height
  );
  const output = Buffer.alloc(canvas.width * canvas.height * 4);
  for (let y = 0; y < canonicalEyeRegion.height; y++) {
    sampledPair.copy(
      output,
      ((canonicalEyeRegion.top + y) * canvas.width + canonicalEyeRegion.left) *
        4,
      y * canonicalEyeRegion.width * 4,
      (y + 1) * canonicalEyeRegion.width * 4
    );
  }
  assert(
    copyRect(output, canvas.width, [
      canonicalEyeRegion.left,
      canonicalEyeRegion.top,
      canonicalEyeRegion.width,
      canonicalEyeRegion.height,
    ]).equals(sampledPair),
    "RGBA changed while placing the nearest-sampled pair"
  );
  const runtimePalette = new Set();
  addVisiblePalette(runtimePalette, output);
  for (const color of runtimePalette) {
    assert(
      sourcePalette.has(color),
      "Runtime palette includes a generated RGBA color"
    );
  }
  const outputPath = `public/companions/pixel/sylf/eyes/${selection.state}.png`;
  const encoded = await sharp(output, { raw: { ...canvas, channels: 4 } })
    .png()
    .toBuffer();
  if (checkOnly) {
    const current = await readFile(path.join(root, outputPath));
    const { data, info } = await sharp(current)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, canvas.width);
    assert.equal(info.height, canvas.height);
    assert.equal(info.channels, 4);
    assert(data.equals(output), `Runtime pixels changed: ${outputPath}`);
  } else {
    await writeFile(path.join(root, outputPath), encoded);
  }
  // Decode the encoded PNG to independently verify that encoding preserves RGBA.
  const encodedRgba = await sharp(encoded).raw().toBuffer();
  assert(encodedRgba.equals(output), "PNG encoding changed RGBA pixels");
  assets.push({
    state: selection.state,
    source: source.file,
    sourceLabel: selection.label,
    runtime: outputPath,
    canvas,
    pngSha256: sha256(encoded),
    rgbaSha256: sha256(output),
    alpha: alphaCounts(output),
    registeredPairRgbaSha256: sha256(registeredPair),
    nearestSampledPairRgbaSha256: sha256(sampledPair),
    sourceVisibleRgbaPaletteSize: sourcePalette.size,
    runtimeVisibleRgbaPaletteSize: runtimePalette.size,
    generatedVisibleRgbaColors: 0,
    visibleBounds: visibleBounds(output, canvas.width, canvas.height),
    layerOrigin: { x: 0, y: 0 },
    eyes: eyeAudit,
  });
}

// The source hash comparison happens again after all extraction work.
for (const source of Object.values(sources)) {
  assert.equal(
    sha256(await readFile(path.join(sourceDir, source.file))),
    source.sha256,
    `Source modified: ${source.file}`
  );
}

const audit = {
  phase: 2,
  method:
    "Copy user-supplied RGBA eye rectangles without changes into a registered 600×300 intermediate pair. Nearest-sample once at exactly 0.5 scale by copying source RGBA (2x+1,2y+1), then place the 300×150 pair at (475,480) inside a full 1254×1254 transparent canonical canvas. No interpolation, background removal, or color operations.",
  sourceArtworkModified: false,
  sources: sourceAudit,
  processedSheetNumbers: [1, 2, 4],
  processedStateCount: selections.length,
  canvas,
  alignment: {
    sourceSpace:
      "Eye-sheet pixels are preserved exactly during crop registration. Runtime layers receive one deterministic nearest-neighbor half-scale conversion to match the body-space eye size.",
    registeredPairCanvas,
    registeredPairAnchors: anchors,
    registrationRule:
      "Center each visible alpha bounding box on the shared anchor using the same integer floor convention.",
    canonicalCanvas: canvas,
    canonicalLayerOrigin: { x: 0, y: 0 },
    embeddedEyeRegion: canonicalEyeRegion,
    sourceEyeScaleRelativeToBaseSource: 0.5,
    nativeBaseEyeAnchors: [
      { x: 550, y: 555 },
      { x: 700, y: 555 },
    ],
    pixelRendering:
      "Every layer fills the same canvas at (0,0). The renderer applies identical pixelated display scaling to body and eye layers; there are no CSS offsets or per-expression scales.",
  },
  alphaModification:
    "No background removal or alpha-value interpolation. Each retained runtime alpha is copied from a selected source sample; surrounding padding is transparent. The source artwork already contains transparency.",
  nearestSampling: {
    sourceDimensions: registeredPairCanvas,
    destinationDimensions: { width: 300, height: 150 },
    formula:
      "sourceX = 2*destinationX+1; sourceY = 2*destinationY+1; copy the whole RGBA tuple",
    lossless: false,
    explanation:
      "Sampling discards source pixels rather than recovering a lossless logical grid. It preserves the selected artwork's palette and intended body-space scale, but must not be described as unresampled or pixel-for-pixel source preservation.",
  },
  rgbaChangedBytesWithinRegisteredSourceCrops: 0,
  generatedVisibleRgbaColors: 0,
  padding:
    "Full-canvas padding outside the embedded 300×150 eye region is transparent RGBA zero. Existing source transparency inside the sampled region is copied exactly.",
  assets,
};

if (!checkOnly) {
  await writeFile(
    path.join(evidenceDir, "eye-asset-audit.json"),
    `${JSON.stringify(audit, null, 2)}\n`
  );
}
console.log(
  `${checkOnly ? "Verified" : "Prepared"} ${assets.length} canonical Phase 2 eye layers. Source hashes match; exact crops and nearest samples retain source RGBA colors.`
);
