import { getStroke } from "perfect-freehand";
import { isDarkColor } from "../color-utils";
import { inkStrokeSegments } from "./ink-geometry";
import type { InkBrush, InkPaper, InkSample, InkStroke } from "./ink";

/** Portable stroke and paper geometry: the one source for the web canvas, PDF export and Sylf Native's renderers. */
interface PaperRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** How much pressure narrows a stroke (perfect-freehand's thinning). Native's live stroke uses the same value, so pen-up keeps its width. */
export function inkThinning(style: InkBrush) {
  return style.tool === "highlighter" || style.nib === "fineliner"
    ? 0
    : (style.pressure ?? 1) *
        ({ ballpoint: 0.45, fountain: 0.8, brush: 1, pencil: 0.35 }[
          style.nib as "ballpoint"
        ] ?? 0.55);
}
export function inkOutline(
  points: readonly InkSample[],
  style: InkBrush,
  last = true,
  tiltOverride?: number
) {
  // Retained stylus tilt shades with the side of a pencil; zero-tilt and legacy
  // brushes keep their original geometry. Input samples themselves never change.
  const pencil = style.input === "pen" && style.nib === "pencil";
  const tilt =
    tiltOverride ??
    (pencil && points.length
      ? points.reduce(
          (n, p) => n + Math.min(1, Math.hypot(p[4], p[5]) / 80),
          0
        ) / points.length
      : 0);
  const smoothing = style.smoothing ?? 0.65;
  // A shape is a few corner points. Smoothed and streamlined like handwriting they become a leaf, so a shape is drawn as an even
  // line: points every unit or so along each edge, and no thinning, smoothing or streamline.
  if (style.shape) {
    const dense: number[][] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[i + 1];
      dense.push([a[0], a[1], 0.5]);
      if (!b) break;
      const steps = Math.min(400, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let k = 1; k < steps; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps, 0.5]);
    }
    return getStroke(dense, { size: style.width, thinning: 0, smoothing: 0.2, streamline: 0, simulatePressure: false, last, start: { cap: true }, end: { cap: true } });
  }
  return getStroke(
    points.map((p) => [
      p[0],
      p[1],
      pencil
        ? Math.min(
            1,
            p[2] * 0.75 + Math.min(1, Math.hypot(p[4], p[5]) / 80) * 0.4
          )
        : style.nib === "brush" && style.input === "pen"
          ? Math.pow(p[2], 0.75)
          : p[2],
    ]),
    {
      size: style.width * (1 + tilt * 1.8),
      thinning: inkThinning(style),
      smoothing,
      streamline: Math.min(0.42, Math.max(0.08, smoothing * 0.34)),
      simulatePressure: style.input !== "pen",
      last,
      start: { cap: true },
      end: { cap: true },
    }
  );
}
export function paperGeometry(
  paper: InkPaper,
  width: number,
  height: number,
  visible?: PaperRect
) {
  const lines: number[][] = [],
    dots: number[][] = [],
    labels: [string, number, number][] = [];
  const gap = paper.spacing;
  const left = Math.max(0, (visible?.x || 0) - 2),
    top = Math.max(0, (visible?.y || 0) - 2);
  const right = Math.min(
      width,
      visible ? visible.x + visible.width + 2 : width
    ),
    bottom = Math.min(
      height,
      visible ? visible.y + visible.height + 2 : height
    );
  const startAt = (start: number, step: number) =>
    start + Math.max(0, Math.ceil((top - start) / step)) * step;
  if (
    paper.template === "blank" ||
    ((right - left) * (bottom - top)) / (gap * gap) > 100000
  )
    return { lines, dots, labels };
  const line = (x: number, y: number, x2: number, y2: number) => {
    if (
      Math.max(x, x2) >= left &&
      Math.min(x, x2) <= right &&
      Math.max(y, y2) >= top &&
      Math.min(y, y2) <= bottom
    )
      lines.push([x, y, x2, y2]);
  };
  if (paper.template === "dotted") {
    for (let y = startAt(gap, gap); y < bottom; y += gap)
      for (
        let x = Math.max(gap, Math.ceil(left / gap) * gap);
        x < right;
        x += gap
      )
        dots.push([x, y]);
  } else if (paper.template === "music") {
    for (let y = gap * 4; y + gap * 4 < height; y += gap * 8)
      for (let i = 0; i < 5; i++)
        line(40, y + i * gap, width - 40, y + i * gap);
  } else if (paper.template === "weekly") {
    const cell = (height - 140) / 4;
    for (let i = 0; i <= 4; i++)
      line(40, 80 + i * cell, width - 40, 80 + i * cell);
    line(width / 2, 80, width / 2, height - 60);
    [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
      "Notes",
    ].forEach((text, i) =>
      labels.push([
        text,
        52 + (i % 2) * (width / 2 - 40),
        104 + Math.floor(i / 2) * cell,
      ])
    );
  } else if (paper.template === "daily") {
    labels.push(["TODAY", 40, 45], ["PRIORITIES", width * 0.67, 90]);
    line(width * 0.64, 70, width * 0.64, height - 60);
    for (let y = 100, h = 6; y < height - 60; y += gap * 2, h++) {
      line(70, y, width * 0.61, y);
      labels.push([String(h).padStart(2, "0") + ":00", 30, y]);
    }
    for (let y = 120; y < height - 60; y += gap)
      line(width * 0.67, y, width - 35, y);
  } else {
    let start = gap * 2,
      end = height;
    if (paper.template === "cornell") {
      line(width * 0.27, 60, width * 0.27, height - 180);
      line(35, height - 180, width - 35, height - 180);
      labels.push(
        ["CUES", 42, 43],
        ["NOTES", width * 0.3, 43],
        ["SUMMARY", 42, height - 155]
      );
      start = 80;
      end = height - 180;
    }
    if (paper.template === "journal") {
      labels.push(
        ["DATE  __________________", 45, 48],
        ["WHAT I AM THINKING ABOUT", 45, 100],
        ["ONE THING TO REMEMBER", 45, height - 150]
      );
      start = 130;
      end = height - 180;
    }
    for (let y = startAt(start, gap); y < Math.min(end, bottom); y += gap)
      line(
        paper.template === "cornell"
          ? width * 0.3
          : paper.template === "journal"
            ? 40
            : 0,
        y,
        paper.template === "journal" ? width - 40 : width,
        y
      );
    if (paper.template === "grid")
      for (let x = gap; x < width; x += gap) line(x, 0, x, height);
  }
  return {
    lines,
    dots,
    labels: visible
      ? labels.filter(
          ([, x, y]) => x <= right && y >= top - 20 && y <= bottom + 20
        )
      : labels,
  };
}
export const paperLabelColor = (paper: InkPaper) =>
  isDarkColor(paper.color) ? "#a6afbf" : "#687386";
export function outlineSvg(points: number[][]) {
  if (!points.length) return "";
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i],
      n = points[(i + 1) % points.length];
    path += ` Q ${p[0]} ${p[1]} ${(p[0] + n[0]) / 2} ${(p[1] + n[1]) / 2}`;
  }
  return path + " Z";
}
/** A finished stroke as one SVG path, drawn exactly as the web canvas draws it. */
export function strokeSvgPath(stroke: InkStroke) {
  return inkStrokeSegments(stroke)
    .map((segment) => outlineSvg(inkOutline(segment, stroke.style)))
    .filter(Boolean)
    .join(" ");
}
