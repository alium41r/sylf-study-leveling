// Bakes the World lobby's art: a small voxel ray tracer with no dependencies. Nothing here ships. It runs by hand, and its PNGs
// and generated index are what the app loads. Light is baked for each sky, so a device only ever draws a few still images, and
// the lobby needs no full-window SVG, which costs about 50 MB on Android (Phase 5). Colors come from the owner's Sylf World visual
// direction (assets/design-references). Run from native/: node tooling/world-art/render.mjs [--only=<plate>] [--spp=<samples>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { GATE_POINTS, SKIES, buildPlate, cameraFor, PLATES } from "./scenes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../apps/sylf/src/spaces/world/art");

// ── Color ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const toLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const toSrgb = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
export const hex = (value) => [1, 3, 5].map((start) => toLinear(parseInt(value.slice(start, start + 2), 16) / 255));
const add = (a, b, scale = 1) => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// A soft shoulder, so bright skies do not clip lit faces to flat white.
const tone = (value) => { const x = value * 1.04; return toSrgb(Math.min(1, x < 0.7 ? x : 0.7 + 0.3 * (1 - Math.exp(-(x - 0.7) / 0.3)))); };

// ── Random ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A small seeded generator, so a bake is reproducible. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buffer) { let c = 0xffffffff; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, check]);
}

/** RGBA or RGB with a Paeth or Sub filter per row, which is what keeps soft gradients small without a palette. */
function encodePng(width, height, rgba, opaque) {
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const row = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) row[x * channels + c] = rgba[(y * width + x) * 4 + c];
    const offset = y * (stride + 1);
    raw[offset] = 4;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      raw[offset + 1 + i] = (row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    row.copy(previous);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ── Tracing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Amanatides and Woo through the grid. `hit` is filled with the cell, the face and the distance. */
function trace(grid, origin, direction, maximum, hit) {
  const { nx, ny, nz, cells } = grid;
  let t = 0;
  // Enter the box first, because a camera ray starts well outside it.
  let tMin = 0, tMax = maximum;
  const bounds = [nx, ny, nz];
  for (let axis = 0; axis < 3; axis++) {
    const d = direction[axis];
    if (Math.abs(d) < 1e-9) { if (origin[axis] < 0 || origin[axis] >= bounds[axis]) return false; continue; }
    let a = (0 - origin[axis]) / d, b = (bounds[axis] - origin[axis]) / d;
    if (a > b) { const swap = a; a = b; b = swap; }
    tMin = Math.max(tMin, a); tMax = Math.min(tMax, b);
    if (tMin > tMax) return false;
  }
  t = tMin + 1e-5;
  let x = Math.floor(origin[0] + direction[0] * t), y = Math.floor(origin[1] + direction[1] * t), z = Math.floor(origin[2] + direction[2] * t);
  x = Math.min(nx - 1, Math.max(0, x)); y = Math.min(ny - 1, Math.max(0, y)); z = Math.min(nz - 1, Math.max(0, z));
  const stepX = direction[0] > 0 ? 1 : -1, stepY = direction[1] > 0 ? 1 : -1, stepZ = direction[2] > 0 ? 1 : -1;
  const deltaX = Math.abs(1 / direction[0]), deltaY = Math.abs(1 / direction[1]), deltaZ = Math.abs(1 / direction[2]);
  let nextX = ((stepX > 0 ? x + 1 : x) - origin[0]) / direction[0];
  let nextY = ((stepY > 0 ? y + 1 : y) - origin[1]) / direction[1];
  let nextZ = ((stepZ > 0 ? z + 1 : z) - origin[2]) / direction[2];
  if (!Number.isFinite(nextX)) nextX = Infinity;
  if (!Number.isFinite(nextY)) nextY = Infinity;
  if (!Number.isFinite(nextZ)) nextZ = Infinity;
  let axis = -1;
  for (;;) {
    const cell = cells[x + nx * (y + ny * z)];
    if (cell !== 0) {
      hit.cell = cell; hit.x = x; hit.y = y; hit.z = z; hit.axis = axis; hit.t = t;
      hit.sign = axis === 0 ? -stepX : axis === 1 ? -stepY : -stepZ;
      return true;
    }
    if (nextX < nextY && nextX < nextZ) { x += stepX; t = nextX; nextX += deltaX; axis = 0; if (x < 0 || x >= nx) return false; }
    else if (nextY < nextZ) { y += stepY; t = nextY; nextY += deltaY; axis = 1; if (y < 0 || y >= ny) return false; }
    else { z += stepZ; t = nextZ; nextZ += deltaZ; axis = 2; if (z < 0 || z >= nz) return false; }
    if (t > maximum) return false;
  }
}

function occupied(grid, x, y, z) {
  const { nx, ny, nz, cells } = grid;
  return x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && cells[x + nx * (y + ny * z)] !== 0;
}

/** Where a grid point lands on a plate, as fractions of its width and height. */
function project(camera, point, width, height) {
  const forward = normalize([camera.target[0] - camera.position[0], camera.target[1] - camera.position[1], camera.target[2] - camera.position[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const offset = [point[0] - camera.position[0], point[1] - camera.position[1], point[2] - camera.position[2]];
  const depth = dot(offset, forward);
  const halfHeight = Math.tan((camera.fov * Math.PI) / 360);
  const x = dot(offset, right) / depth / (halfHeight * (width / height));
  const y = dot(offset, up) / depth / halfHeight;
  return { x: +((x + 1) / 2).toFixed(4), y: +((1 - y) / 2).toFixed(4) };
}

/** The app reaches the plates through one generated file, so a bake cannot leave a stale path or anchor behind. */
function writeIndex(out, skies) {
  const { width, height } = PLATES.gate;
  const points = { threshold: project(cameraFor("gate"), GATE_POINTS.threshold, width, height), lanterns: GATE_POINTS.lanterns.map((point) => project(cameraFor("gate"), point, width, height)) };
  const plate = (name, sky) => `require("./${name}-${sky}.png")`;
  const entry = (sky) => `  ${sky}: { sky: ${plate("sky", sky)}, gate: ${plate("gate", sky)}, cloudA: ${plate("cloud-a", sky)}, cloudB: ${plate("cloud-b", sky)}, sea: ${plate("sea", sky)} },`;
  fs.writeFileSync(path.join(out, "plates.generated.ts"), `// Generated by tooling/world-art/render.mjs. Do not edit.
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from "react-native";
import type { WorldSky } from "@sylf/spaces";

export interface SkyPlates { sky: ImageSourcePropType; gate: ImageSourcePropType; cloudA: ImageSourcePropType; cloudB: ImageSourcePropType; sea: ImageSourcePropType }

export const SKY_PLATES: Record<WorldSky, SkyPlates> = {
${skies.map(entry).join("\n")}
};

export const GLOW_PLATE: ImageSourcePropType = require("./glow.png");

/** Plate sizes in pixels, so the app can keep each one's proportions. */
export const PLATE_SIZES = ${JSON.stringify(Object.fromEntries(Object.entries(PLATES).map(([name, spec]) => [name.replace("-a", "A").replace("-b", "B"), { width: spec.width, height: spec.height }])))} as const;

/** Fractions of the gate plate. */
export const GATE_ANCHORS = ${JSON.stringify(points)} as const;
`);
}

function renderModel(grid, palette, sky, camera, width, height, samples, options = {}) {
  const random = seeded(options.seed ?? 7);
  const pixels = new Uint8Array(width * height * 4);
  const forward = normalize([camera.target[0] - camera.position[0], camera.target[1] - camera.position[1], camera.target[2] - camera.position[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const aspect = width / height;
  const halfHeight = Math.tan((camera.fov * Math.PI) / 360);
  const sun = normalize(sky.sunDirection);
  const sunColor = hex(sky.sunColor).map((value) => value * sky.sunPower);
  const ambientUp = hex(sky.ambientUp).map((value) => value * sky.ambientPower);
  const ambientDown = hex(sky.ambientDown).map((value) => value * sky.ambientPower);
  const hit = {}, probe = {};
  const lights = (grid.lights ?? []).map((light) => ({ ...light, color: hex(light.color).map((value) => value * sky.lanternPower * light.power) }));
  const fill = options.fill ?? 0;
  const smooth = options.smooth ?? 0;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sample = 0; sample < samples; sample++) {
        const u = ((px + random()) / width) * 2 - 1, v = 1 - ((py + random()) / height) * 2;
        const direction = normalize(add(add(forward, right, u * halfHeight * aspect), up, v * halfHeight));
        if (!trace(grid, camera.position, direction, 1e5, hit)) continue;
        covered++;
        const entry = palette[hit.cell];
        const face = [0, 0, 0];
        if (hit.axis >= 0) face[hit.axis] = hit.sign; else face[1] = 1;
        const point = [camera.position[0] + direction[0] * hit.t, camera.position[1] + direction[1] * hit.t, camera.position[2] + direction[2] * hit.t];
        const start = add(point, face, 0.02);
        // Clouds take their normal from the shape around the hit and not from one small face, so a rounded block shades as a rounded
        // block. The silhouette stays blocky, which is the visual direction's look.
        let normal = face;
        if (smooth) {
          let gx = 0, gy = 0, gz = 0;
          for (let dz = -smooth; dz <= smooth; dz++) for (let dy = -smooth; dy <= smooth; dy++) for (let dx = -smooth; dx <= smooth; dx++) {
            if (occupied(grid, hit.x + dx, hit.y + dy, hit.z + dz)) { gx -= dx; gy -= dy; gz -= dz; }
          }
          normal = normalize([gx + face[0] * 2, gy + face[1] * 2, gz + face[2] * 2]);
        }
        let shade = entry.color;
        // Convex edges catch light. This is what gives a voxel a soft, chiselled edge instead of a hard one.
        const axisA = (hit.axis + 1) % 3, axisB = (hit.axis + 2) % 3;
        const local = [point[0] - hit.x, point[1] - hit.y, point[2] - hit.z];
        const cell = [hit.x, hit.y, hit.z];
        let edge = 0;
        for (const axis of smooth ? [] : [axisA, axisB]) {
          if (axis < 0) continue;
          for (const side of [-1, 1]) {
            const near = side < 0 ? local[axis] : 1 - local[axis];
            if (near > 0.3) continue;
            const neighbour = [...cell]; neighbour[axis] += side;
            const above = [...cell]; if (hit.axis >= 0) above[hit.axis] += hit.sign;
            const across = [...above]; across[axis] += side;
            if (!occupied(grid, neighbour[0], neighbour[1], neighbour[2]) && !occupied(grid, across[0], across[1], across[2])) edge = Math.max(edge, 1 - near / 0.3);
          }
        }
        let light = [0, 0, 0];
        const facing = dot(normal, sun);
        if (facing > 0) {
          const spread = sky.sunSpread;
          const jitter = normalize([sun[0] + (random() - 0.5) * spread, sun[1] + (random() - 0.5) * spread, sun[2] + (random() - 0.5) * spread]);
          // Clouds let light through, so a shadow across one is only ever a tint.
          light = add(light, sunColor, facing * (trace(grid, start, jitter, 400, probe) ? options.translucent ?? 0 : 1));
        }
        // Two sky samples per camera sample: enough with this many camera samples, and far cheaper than a real bounce.
        for (let bounce = 0; bounce < 2; bounce++) {
          const a = 2 * Math.PI * random(), z = Math.sqrt(random()), radial = Math.sqrt(1 - z * z);
          const tangent = Math.abs(normal[1]) < 0.9 ? normalize(cross(normal, [0, 1, 0])) : normalize(cross(normal, [1, 0, 0]));
          const bitangent = cross(normal, tangent);
          const ray = normalize(add(add(add([0, 0, 0], normal, z), tangent, radial * Math.cos(a)), bitangent, radial * Math.sin(a)));
          const blocked = trace(grid, start, ray, options.occlusion ?? 26, probe);
          const sky_ = mix(ambientDown, ambientUp, ray[1] * 0.5 + 0.5);
          if (!blocked) light = add(light, sky_, 0.5);
          else light = add(light, mul(sky_, palette[probe.cell].color), 0.5 * (0.5 + fill));
        }
        for (const lamp of lights) {
          const offset = [lamp.at[0] - start[0], lamp.at[1] - start[1], lamp.at[2] - start[2]];
          const distance = Math.hypot(offset[0], offset[1], offset[2]);
          if (distance > lamp.reach) continue;
          const toward = [offset[0] / distance, offset[1] / distance, offset[2] / distance];
          const lit = dot(normal, toward);
          if (lit <= 0) continue;
          if (!trace(grid, start, toward, distance - 2.5, probe)) light = add(light, lamp.color, (lit * (1 - distance / lamp.reach) ** 2 * 26) / (distance + 6));
        }
        shade = mix(shade, [1, 1, 1], edge * 0.1);
        let color = mul(shade, light);
        if (entry.emissive) color = add(color, entry.color, entry.emissive * sky.lanternPower);
        // Distance softens the model into the air around it.
        color = mix(color, hex(sky.haze), Math.min(0.6, Math.max(0, (hit.t - camera.near) / camera.far) * sky.hazePower));
        r += color[0]; g += color[1]; b += color[2];
      }
      const offset = (py * width + px) * 4;
      if (covered) {
        pixels[offset] = Math.round(tone(r / covered) * 255);
        pixels[offset + 1] = Math.round(tone(g / covered) * 255);
        pixels[offset + 2] = Math.round(tone(b / covered) * 255);
        pixels[offset + 3] = Math.round((covered / samples) * 255);
      }
    }
  }
  return pixels;
}

/** The sky is a soft plate, stretched on screen. A small size is enough, and a little noise hides banding after stretching. */
function renderSky(sky, width, height) {
  const random = seeded(11);
  const pixels = new Uint8Array(width * height * 4);
  const stops = sky.stops.map(([at, value]) => [at, hex(value)]);
  const glow = hex(sky.glow.color);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    let index = 0;
    while (index < stops.length - 2 && t > stops[index + 1][0]) index++;
    const [a, colorA] = stops[index], [b, colorB] = stops[index + 1];
    const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
    const base = mix(colorA, colorB, k * k * (3 - 2 * k));
    for (let x = 0; x < width; x++) {
      const dx = (x / width - sky.glow.x) * (width / height), dy = (t - sky.glow.y) * 2.6;
      const core = Math.exp(-(dx * dx + dy * dy) / (2 * sky.glow.size * sky.glow.size));
      // A haze of long horizontal bands near the horizon, as the visual direction's skies have.
      const band = Math.exp(-((t - sky.glow.y) ** 2) / 0.012) * sky.glow.band;
      let color = mix(base, glow, Math.min(1, core * sky.glow.power + band * 0.5));
      // A sky too varied for one polarity of text leans toward the interface's ground, on the side where the text sits.
      if (sky.shade) { const fall = Math.max(0, 1 - x / (width * sky.shade.to)); color = mix(color, hex(sky.shade.color), sky.shade.strength * Math.min(1, fall * 1.6)); }
      const offset = (y * width + x) * 4;
      const noise = (random() - 0.5) * 0.9;
      pixels[offset] = Math.round(toSrgb(color[0]) * 255 + noise);
      pixels[offset + 1] = Math.round(toSrgb(color[1]) * 255 + noise);
      pixels[offset + 2] = Math.round(toSrgb(color[2]) * 255 + noise);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** The warm light in the gate and the lanterns. One plate serves every sky, and each sky sets how strongly it shows. */
function renderGlow(size) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size - 0.5, dy = (y + 0.5) / size - 0.5;
    const distance = Math.min(1, Math.hypot(dx, dy) * 2);
    const offset = (y * size + x) * 4;
    pixels[offset] = 255; pixels[offset + 1] = 236; pixels[offset + 2] = 196;
    pixels[offset + 3] = Math.round((1 - distance) ** 1.7 * (1 - distance * 0.4) * 190);
  }
  return pixels;
}

// ── Baking ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function bake({ plate, skyId, spp }) {
  const spec = PLATES[plate];
  const sky = SKIES[skyId];
  if (plate === "sky") return { width: spec.width, height: spec.height, opaque: true, pixels: renderSky(sky, spec.width, spec.height) };
  if (plate === "glow") return { width: spec.width, height: spec.height, opaque: false, pixels: renderGlow(spec.width) };
  const { grid, palette } = buildPlate(plate, hex);
  const shaded = plate === "gate" ? palette : palette.map((entry) => entry && { ...entry, color: entry.color.map((value) => value * sky.cloud) });
  const pixels = renderModel(grid, shaded, sky, cameraFor(plate), spec.width, spec.height, spp, spec.render);
  // The lowest bit of each channel is invisible here and costs a third of the file, because it is what the filters cannot predict.
  for (let i = 0; i < pixels.length; i++) pixels[i] &= i % 4 === 3 ? 0xff : 0xfe;
  return { width: spec.width, height: spec.height, opaque: false, pixels };
}

if (!isMainThread) {
  const { job, out } = workerData;
  const image = bake(job);
  const file = path.join(out, job.file);
  fs.writeFileSync(file, encodePng(image.width, image.height, image.pixels, image.opaque));
  parentPort.postMessage({ file: job.file, bytes: fs.statSync(file).size, width: image.width, height: image.height });
} else {
  const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
  const only = argument("only");
  const out = argument("out") ?? OUT;
  const spp = Number(argument("spp") ?? 24);
  const skies = (argument("skies") ?? Object.keys(SKIES).join(",")).split(",");
  fs.mkdirSync(out, { recursive: true });
  const jobs = [];
  for (const [plate, spec] of Object.entries(PLATES)) {
    if (only && !only.split(",").includes(plate)) continue;
    if (spec.shared) jobs.push({ plate, skyId: skies[0], spp, file: `${plate}.png` });
    else for (const skyId of skies) jobs.push({ plate, skyId, spp, file: `${plate}-${skyId}.png` });
  }
  const concurrency = Math.max(2, Math.min(6, os.cpus().length - 2));
  let next = 0;
  const started = Date.now();
  const finished = [];
  await new Promise((resolve, reject) => {
    const launch = () => {
      if (next >= jobs.length) { if (finished.length === jobs.length) resolve(); return; }
      const job = jobs[next++];
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { job, out } });
      worker.on("message", (message) => { finished.push(message); console.log(`${message.file} ${message.width}x${message.height} ${(message.bytes / 1024).toFixed(0)} KB`); launch(); });
      worker.on("error", reject);
    };
    for (let i = 0; i < concurrency; i++) launch();
  });
  if (!only) writeIndex(out, skies);
  const total = finished.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${finished.length} plates, ${(total / 1048576).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
