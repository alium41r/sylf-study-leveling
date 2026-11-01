// What the World lobby's art is made of. Everything here is an entrance and its air: a stone dais, one roofed gate, two lanterns
// and clouds. Islands, terrain, plants, characters and the world itself belong to Phase 15, so none of them appears here. Palette
// values are read from the owner's visual direction: its timber, vermilion, teal tile, stone, and its six sky states.

/** Sky states, from the visual direction's "Sky states" sheet. Light and colors are per sky, which is why each bakes its own plates. */
export const SKIES = {
  dawn: {
    cloud: 1,
    stops: [[0, "#cfd6ec"], [0.36, "#e8ddE6"], [0.56, "#fbe2cd"], [0.72, "#f6dcd4"], [1, "#d3d9ec"]],
    glow: { x: 0.2, y: 0.56, size: 0.3, power: 0.55, band: 0.42, color: "#ffe7c4" },
    sunDirection: [-0.72, 0.36, 0.6], sunColor: "#ffdcb6", sunPower: 1.5, sunSpread: 0.1,
    ambientUp: "#dfe2f6", ambientDown: "#f4d9d0", ambientPower: 0.72, lanternPower: 0.45, haze: "#f3e2dd", hazePower: 0.26,
  },
  day: {
    cloud: 1,
    stops: [[0, "#9fc8f2"], [0.5, "#b9daf8"], [0.74, "#d8ebfb"], [1, "#e7f1fb"]],
    glow: { x: 0.74, y: 0.2, size: 0.3, power: 0.4, band: 0.1, color: "#f8fbff" },
    sunDirection: [-0.42, 0.74, 0.54], sunColor: "#fff3df", sunPower: 1.75, sunSpread: 0.08,
    ambientUp: "#cfe3fb", ambientDown: "#e9e6da", ambientPower: 0.68, lanternPower: 0.2, haze: "#d7e8f9", hazePower: 0.2,
  },
  sunset: {
    cloud: 1,
    stops: [[0, "#aaa5de"], [0.32, "#cbb0e0"], [0.52, "#f0bfd2"], [0.66, "#fbdcb4"], [0.8, "#f4c9c8"], [1, "#d6b5d9"]],
    glow: { x: 0.16, y: 0.6, size: 0.3, power: 0.72, band: 0.5, color: "#fff0b4" },
    sunDirection: [-0.82, 0.26, 0.5], sunColor: "#ffc98e", sunPower: 1.7, sunSpread: 0.11,
    ambientUp: "#c7bcEd", ambientDown: "#f2bcc0", ambientPower: 0.66, lanternPower: 0.8, haze: "#eec6cf", hazePower: 0.32,
  },
  dusk: {
    cloud: 0.6,
    stops: [[0, "#54508f"], [0.34, "#6f64a4"], [0.56, "#9a7db0"], [0.72, "#c790a6"], [1, "#7f6ca4"]],
    glow: { x: 0.74, y: 0.66, size: 0.26, power: 0.62, band: 0.24, color: "#ffc6a0" },
    shade: { color: "#4b4380", strength: 0.86, to: 0.5 },
    sunDirection: [0.5, 0.16, 0.84], sunColor: "#ff9f86", sunPower: 0.95, sunSpread: 0.14,
    ambientUp: "#9c93cf", ambientDown: "#c594b4", ambientPower: 0.62, lanternPower: 1.5, haze: "#b296c0", hazePower: 0.34,
  },
  night: {
    cloud: 0.56,
    stops: [[0, "#0d163c"], [0.46, "#16225a"], [0.74, "#22306e"], [1, "#2f3d7c"]],
    glow: { x: 0.8, y: 0.16, size: 0.22, power: 0.16, band: 0.04, color: "#7f8fd8" },
    sunDirection: [0.5, 0.62, 0.6], sunColor: "#a9baf2", sunPower: 0.5, sunSpread: 0.16,
    ambientUp: "#4757a8", ambientDown: "#2b3678", ambientPower: 0.62, lanternPower: 2.6, haze: "#1c2860", hazePower: 0.3,
  },
  mist: {
    cloud: 0.94,
    stops: [[0, "#aebccd"], [0.46, "#c2cdda"], [0.72, "#d3dbe4"], [1, "#dbe2e9"]],
    glow: { x: 0.5, y: 0.5, size: 0.5, power: 0.12, band: 0.2, color: "#eef2f6" },
    sunDirection: [-0.3, 0.8, 0.5], sunColor: "#e7ecf2", sunPower: 0.55, sunSpread: 0.6,
    ambientUp: "#dde4ec", ambientDown: "#c9d2dc", ambientPower: 0.98, lanternPower: 0.5, haze: "#cfd8e1", hazePower: 0.42,
  },
};

export const PLATES = {
  sky: { width: 320, height: 180 },
  glow: { width: 256, height: 256, shared: true },
  gate: { width: 780, height: 830, render: { seed: 7 } },
  "cloud-a": { width: 480, height: 240, render: { seed: 3, occlusion: 12, fill: 0.95, smooth: 3, translucent: 0.55 } },
  "cloud-b": { width: 340, height: 170, render: { seed: 5, occlusion: 12, fill: 0.95, smooth: 3, translucent: 0.55 } },
  sea: { width: 1500, height: 350, render: { seed: 9, occlusion: 12, fill: 0.95, smooth: 3, translucent: 0.55 } },
};

// ── Grid ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function createGrid(nx, ny, nz) {
  const cells = new Uint8Array(nx * ny * nz);
  return {
    nx, ny, nz, cells, lights: [],
    set(x, y, z, value) { if (x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz) cells[x + nx * (y + ny * z)] = value; },
    get(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz ? cells[x + nx * (y + ny * z)] : 0; },
    box(x0, y0, z0, x1, y1, z1, value) { for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, typeof value === "function" ? value(x, y, z) : value); },
  };
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const GATE_COLORS = {
  // Stone blocks, each course a few tones apart, as in the visual direction's cobble and stair sheets.
  stoneA: "#a79a8c", stoneB: "#b9ab9b", stoneC: "#958b82", stoneD: "#c6b8a4", mortar: "#74685f",
  path: "#d6c5ab", pathDark: "#c4b095", foot: "#46403d",
  red: "#dc5a39", redDark: "#b8432c", redLight: "#ec7a54",
  wood: "#a8683d", woodDark: "#7c4a2d",
  tile: "#5f9193", tileDark: "#477578", tileLight: "#79abab",
  ridge: "#b06f43", lanternStone: "#9d9389",
  lamp: "#ffd98c", gold: "#f2c464", iron: "#3c3a3e",
};

const LANTERN = { reach: 62, power: 1, color: "#ffc477" };

function buildGate(hex) {
  const names = Object.keys(GATE_COLORS);
  const palette = [null, ...names.map((name) => ({ color: hex(GATE_COLORS[name]), emissive: name === "lamp" ? 1.25 : name === "gold" ? 0.12 : 0 }))];
  const id = Object.fromEntries(names.map((name, index) => [name, index + 1]));
  const grid = createGrid(150, 132, 140);
  const random = seeded(21);
  const cx = 75;

  // Each stone is one tone, so a course reads as laid blocks and not as noise.
  const stoneTone = new Map();
  const stone = (x, y, z, courseHeight, seedX, seedZ) => {
    const course = Math.floor(y / courseHeight);
    const offset = course % 2 ? 5 : 0;
    const cellX = Math.floor((x + offset) / 11), cellZ = Math.floor((z + offset) / 11);
    const key = `${course}:${cellX}:${cellZ}`;
    if (!stoneTone.has(key)) { const pick = random(); stoneTone.set(key, pick < 0.3 ? id.stoneA : pick < 0.62 ? id.stoneB : pick < 0.84 ? id.stoneC : id.stoneD); }
    const onSeamX = (x + offset) % 11 === 0, onSeamZ = (z + offset) % 11 === 0;
    return (onSeamX || onSeamZ) && (seedX || seedZ) ? id.mortar : stoneTone.get(key);
  };
  const tier = (half, z0, z1, y0, y1) => grid.box(cx - half, y0, z0, cx + half, y1, z1, (x, y, z) => stone(x, y, z, 6, true, true));

  // Three tiers, widest at the bottom, sinking into the cloud sea.
  tier(66, 8, 132, 0, 11);
  tier(54, 18, 118, 12, 19);
  tier(44, 28, 104, 20, 26);

  // Worn corners, because a perfectly square dais reads as a menu plate and not as something that was built.
  for (let i = 0; i < 40; i++) {
    const level = [11, 19, 26][Math.floor(random() * 3)];
    const half = level === 11 ? 66 : level === 19 ? 54 : 44;
    const z0 = level === 11 ? 8 : level === 19 ? 18 : 28, z1 = level === 11 ? 132 : level === 19 ? 118 : 104;
    const side = random() < 0.5;
    const x = side ? (random() < 0.5 ? cx - half : cx + half) : cx - half + Math.floor(random() * half * 2);
    const z = side ? z0 + Math.floor(random() * (z1 - z0)) : random() < 0.5 ? z0 : z1;
    grid.box(x - 2, level - 1, z - 2, x + 2, level, z + 2, 0);
  }

  // Stairs up the front, and a pale path through the gate.
  for (let step = 0; step < 9; step++) grid.box(cx - 18, 0, 104 + step * 4, cx + 18, 26 - step * 3, 107 + step * 4, (x, y) => (x === cx - 18 || x === cx + 18 ? id.stoneC : (y >= 24 - step * 3 ? id.path : id.stoneB)));
  grid.box(cx - 18, 26, 28, cx + 18, 26, 104, (x, y, z) => (Math.floor(x / 9) + Math.floor(z / 9)) % 2 ? id.path : id.pathDark);

  // The gate: two posts on dark feet, a tie beam, a head beam, a timber frame and a teal tile roof.
  const front = 58, depth = 7, span = 27;
  const postZ0 = front, postZ1 = front + depth - 1;
  for (const side of [-1, 1]) {
    const x0 = cx + side * span - 3, x1 = cx + side * span + 3;
    grid.box(x0 - 2, 27, postZ0 - 2, x1 + 2, 33, postZ1 + 2, id.foot);
    grid.box(x0, 34, postZ0, x1, 88, postZ1, (x) => (x === (side < 0 ? x0 : x1) ? id.redLight : x === (side < 0 ? x1 : x0) ? id.redDark : id.red));
  }
  grid.box(cx - span - 7, 70, front + 1, cx + span + 7, 74, postZ1 - 1, (x, y) => (y === 70 ? id.redDark : id.red));
  grid.box(cx - span - 11, 84, front, cx + span + 11, 89, postZ1, (x, y) => (y === 84 ? id.redDark : y === 89 ? id.redLight : id.red));

  // The name plate, with the sprout from Sylf's mark in gold.
  grid.box(cx - 6, 75, postZ1, cx + 6, 83, postZ1 + 1, id.woodDark);
  for (const [x, y] of [[0, 77], [0, 78], [0, 79], [0, 80], [-1, 81], [-2, 81], [-3, 80], [1, 80], [2, 81], [3, 82]]) grid.set(cx + x, y, postZ1 + 2, id.gold);

  // Rafters out to the eaves.
  grid.box(cx - span - 16, 90, front - 7, cx + span + 16, 91, postZ1 + 7, id.wood);
  for (let x = cx - span - 14; x <= cx + span + 14; x += 7) grid.box(x, 90, front - 11, x + 1, 90, postZ1 + 11, id.woodDark);

  // Tile courses step in toward the ridge, and the eaves lift at the corners.
  const courses = 9;
  for (let course = 0; course < courses; course++) {
    const y = 92 + Math.floor(course * 2.6);
    const reach = span + 19 - course * 1.7;
    const deep = 11 + depth / 2 + 5 - course * 2.1;
    const zMid = front + (depth - 1) / 2;
    for (let thick = 0; thick < 3; thick++) {
      grid.box(Math.round(cx - reach), y + thick, Math.round(zMid - deep), Math.round(cx + reach), y + thick, Math.round(zMid + deep), (x, _, z) => {
        const rib = (x + course) % 5 === 0;
        return rib ? id.tileLight : (Math.floor(Math.abs(z - zMid)) % 3 === 0 ? id.tileDark : id.tile);
      });
    }
    if (course < 2) for (const side of [-1, 1]) for (const end of [-1, 1]) grid.box(Math.round(cx + side * reach) - (side > 0 ? 3 : 0), y + 2, Math.round(zMid + end * deep) - (end > 0 ? 3 : 0), Math.round(cx + side * reach) + (side < 0 ? 3 : 0), y + 2, Math.round(zMid + end * deep) + (end < 0 ? 3 : 0), id.tileLight);
  }
  const ridgeY = 92 + Math.floor((courses - 1) * 2.6) + 3;
  grid.box(cx - span + 2, ridgeY, front + 1, cx + span - 2, ridgeY + 3, postZ1 - 1, id.ridge);
  for (const side of [-1, 1]) grid.box(cx + side * (span - 2) - 2, ridgeY, front, cx + side * (span - 2) + 2, ridgeY + 5, postZ1, id.woodDark);

  // Two stone lanterns lighting the path.
  for (const side of [-1, 1]) {
    const x = cx + side * 33, z = 88;
    grid.box(x - 4, 27, z - 4, x + 4, 28, z + 4, id.lanternStone);
    grid.box(x - 2, 29, z - 2, x + 2, 37, z + 2, id.stoneA);
    grid.box(x - 4, 38, z - 4, x + 4, 39, z + 4, id.lanternStone);
    grid.box(x - 3, 40, z - 3, x + 3, 45, z + 3, id.lamp);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) grid.box(x + dx, 40, z + dz, x + dx, 45, z + dz, id.iron);
    grid.box(x - 5, 46, z - 5, x + 5, 47, z + 5, id.tileDark);
    grid.box(x - 3, 48, z - 3, x + 3, 49, z + 3, id.tile);
    grid.box(x - 1, 50, z - 1, x + 1, 51, z + 1, id.iron);
    grid.lights.push({ ...LANTERN, at: [x + 0.5, 43, z + 7] });
  }
  return { grid, palette };
}

// ── Clouds ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const CLOUD_COLORS = { a: "#f6f4f8", b: "#ffffff", c: "#ece8f2" };

function cloudPalette(hex) {
  return [null, ...Object.values(CLOUD_COLORS).map((color) => ({ color: hex(color), emissive: 0 }))];
}

/** One rounded block. The visual direction's clouds are chunky stacked pillows, never wisps. */
function pillow(grid, x0, y0, z0, width, height, depth, radius, value) {
  const hx = width / 2, hy = height / 2, hz = depth / 2;
  const cx = x0 + hx, cy = y0 + hy, cz = z0 + hz;
  for (let z = z0; z < z0 + depth; z++) for (let y = y0; y < y0 + height; y++) for (let x = x0; x < x0 + width; x++) {
    const dx = Math.max(0, Math.abs(x + 0.5 - cx) - hx + radius), dy = Math.max(0, Math.abs(y + 0.5 - cy) - hy + radius), dz = Math.max(0, Math.abs(z + 0.5 - cz) - hz + radius);
    if (dx * dx + dy * dy + dz * dz <= radius * radius) grid.set(x, y, z, value);
  }
}

function buildCloud(width, height, depth, blocks) {
  const grid = createGrid(width, height, depth);
  blocks.forEach(([x, y, z, w, h, d], index) => pillow(grid, x, y, z, w, h, d, Math.min(6, Math.floor(h / 2) - 1), 1 + (index % 3)));
  return grid;
}

function buildSea() {
  const random = seeded(31);
  const grid = createGrid(440, 72, 70);
  // Three passes of soft blocks, tallest at the back. The near bank runs off the bottom of the plate, so the sea has no lower edge.
  const bank = (z, ground, low, high, depth) => {
    for (let x = -30; x < 460;) {
      const width = 22 + Math.floor(random() * 38);
      const height = low + Math.floor(random() * (high - low));
      pillow(grid, x, ground - 4, z + Math.floor(random() * 6), width, height, depth, 7, 1 + Math.floor(random() * 3));
      if (random() < 0.7) pillow(grid, x + 4 + Math.floor(random() * 12), ground + height - 11, z + 3, Math.round(width * (0.45 + random() * 0.3)), 11 + Math.floor(random() * 10), depth - 6, 6, 1 + Math.floor(random() * 3));
      x += width - 6 - Math.floor(random() * 12);
    }
  };
  bank(6, 20, 14, 34, 22);
  bank(26, 12, 12, 30, 22);
  bank(46, 2, 12, 24, 20);
  grid.box(0, 0, 40, 439, 8, 69, 1);
  return grid;
}

export function buildPlate(plate, hex) {
  if (plate === "gate") return buildGate(hex);
  const palette = cloudPalette(hex);
  if (plate === "cloud-a") return { palette, grid: buildCloud(150, 74, 60, [[10, 8, 16, 42, 14, 28], [40, 6, 10, 58, 20, 38], [94, 8, 16, 46, 14, 26], [34, 24, 16, 30, 16, 26], [60, 24, 12, 38, 26, 34], [96, 20, 18, 24, 12, 22], [70, 48, 18, 24, 14, 22]]) };
  if (plate === "cloud-b") return { palette, grid: buildCloud(110, 54, 44, [[6, 6, 12, 34, 12, 22], [32, 4, 8, 46, 18, 30], [72, 8, 12, 30, 10, 20], [36, 20, 12, 30, 16, 22], [62, 20, 14, 14, 9, 16]]) };
  return { palette, grid: buildSea() };
}

/** Points the app must find on the gate plate: the middle of the opening, for the walk through it, and the lit lanterns. */
export const GATE_POINTS = { threshold: [75, 56, 61], lanterns: [[42, 43, 88], [108, 43, 88]] };

export function cameraFor(plate) {
  if (plate === "gate") return { position: [206, 70, 372], target: [76, 74, 62], fov: 24, near: 300, far: 300 };
  if (plate === "cloud-a") return { position: [100, 84, 380], target: [75, 34, 30], fov: 13, near: 330, far: 120 };
  if (plate === "cloud-b") return { position: [70, 66, 290], target: [55, 26, 22], fov: 13, near: 250, far: 120 };
  return { position: [220, 44, 330], target: [220, 30, 40], fov: 19.5, near: 240, far: 300 };
}
