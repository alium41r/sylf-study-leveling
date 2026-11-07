// A screenshot as pixels: the 8-bit RGB or RGBA PNG that `adb exec-out screencap -p` writes, decoded with zlib alone.
import zlib from "node:zlib";

/** `pixel(x, y)` is [r, g, b]. */
export function decodePng(png) {
  let at = 8, width = 0, height = 0, channels = 4;
  const parts = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8), data = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 2 ? 3 : 4; }
    if (type === "IDAT") parts.push(data);
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts)), stride = width * channels, rows = [];
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
    rows.push(line);
    previous = line;
  }
  return { width, height, pixel: (x, y) => { const row = rows[y], i = x * channels; return [row[i], row[i + 1], row[i + 2]]; } };
}

/** The middle of the pixels in `rect` that `match` accepts, and how many there are. */
export function centroid(image, rect, match) {
  let n = 0, sx = 0, sy = 0;
  for (let y = Math.max(0, rect.y1); y < Math.min(image.height, rect.y2); y += 2) for (let x = Math.max(0, rect.x1); x < Math.min(image.width, rect.x2); x += 2) {
    if (match(image.pixel(x, y))) { n++; sx += x; sy += y; }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n), n } : { x: NaN, y: NaN, n: 0 };
}

/**
 * The share of pixels in `rect` whose colour differs by more than `tolerance` between two screenshots of the same size. With `slack`,
 * a pixel counts as changed only if nothing within that many pixels of it matches either, so rounding a layout to whole pixels is not
 * a change and moving something further is.
 */
export function difference(a, b, rect, tolerance = 60, slack = 0) {
  const offsets = [[0, 0]];
  for (let dy = -slack; dy <= slack; dy++) for (let dx = -slack; dx <= slack; dx++) if (dx || dy) offsets.push([dx, dy]);
  const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= tolerance;
  let n = 0, changed = 0;
  for (let y = Math.max(slack, rect.y1); y < Math.min(a.height - slack, rect.y2); y += 2) for (let x = Math.max(slack, rect.x1); x < Math.min(a.width - slack, rect.x2); x += 2) {
    const p = a.pixel(x, y);
    n++;
    if (!offsets.some(([dx, dy]) => near(p, b.pixel(x + dx, y + dy)))) changed++;
  }
  return n ? changed / n : 0;
}
