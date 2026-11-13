import { describe, expect, it, vi } from "vitest";
import { clampPageScroll, pinchTarget, stackPages, type Stack, type Transform } from "./page-pinch";

vi.mock("react-native", () => ({ View: () => null }));
vi.mock("@sylf/native-platform", () => ({ nativePinchArea: () => null }));

const GAP = 20;
const VIEW = { width: 1152, height: 560 };
const A4 = { width: 794, height: 1123 };
const pages = Array.from({ length: 6 }, () => A4);
const fit = (VIEW.width - GAP * 2) / A4.width;
// As the notes lay out: the gaps between pages scale with the zoom, as the pages do.
const at = (zoom: number) => stackPages(pages, fit * zoom, VIEW.width, GAP * zoom);

/** Where a page point shows on screen: in a laid-out document scrolled to `scroll`, seen through the pinch's on-screen transform. */
const onScreen = (stack: Stack, page: number, u: number, v: number, scroll: { x: number; y: number }, t: Transform = { scale: 1, x: 0, y: 0 }) => {
  const row = stack.rows[page];
  const x = row.left + u * row.width - scroll.x, y = row.top + v * row.height - scroll.y;
  return { x: t.x + t.scale * x, y: t.y + t.scale * y };
};
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => { expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); };

describe("page pinch", () => {
  it("clamps the last page to the view even at the smallest zoom or after a resize", () => {
    const short = stackPages([A4], 0.25, VIEW.width, GAP);
    expect(clampPageScroll({ x: 200, y: 900 }, short, VIEW)).toEqual({ x: 0, y: 0 });
    const wide = at(3);
    expect(clampPageScroll({ x: 10000, y: 100000 }, wide, VIEW)).toEqual({ x: wide.width - VIEW.width, y: wide.height - VIEW.height });
    expect(clampPageScroll({ x: -70, y: -10 }, wide, VIEW)).toEqual({ x: 0, y: 0 });
  });
  it("stacks pages a gap apart, centred when narrower than the view", () => {
    const small = stackPages([A4, { width: 400, height: 300 }], 0.5, VIEW.width, GAP);
    expect(small.width).toBe(VIEW.width);
    expect(small.rows[0]).toEqual({ top: GAP, left: (VIEW.width - A4.width * 0.5) / 2, width: A4.width * 0.5, height: A4.height * 0.5 });
    expect(small.rows[1].top).toBe(GAP + A4.height * 0.5 + GAP);
    expect(small.height).toBe(small.rows[1].top + 150 + GAP);
    const wide = stackPages([A4], 3, VIEW.width, GAP);
    expect(wide.width).toBe(A4.width * 3 + GAP * 2);
    expect(wide.rows[0].left).toBe(GAP);
  });

  it("keeps the page point under the fingers on a later page", () => {
    const before = at(3), after = at(1.5);
    // The fingers land on page 4 and drift a little as they close.
    const offset = { x: 1200, y: before.rows[4].top + 200 };
    const start = { x: 500, y: 260 }, point = { x: 520, y: 250 };
    const { scroll, transform } = pinchTarget(before, after, VIEW, offset, start, point);
    const u = (offset.x + start.x - before.rows[4].left) / before.rows[4].width, v = (offset.y + start.y - before.rows[4].top) / before.rows[4].height;
    // Laid out at the new zoom, the point is under the fingers, and the preview showed it there already.
    close(onScreen(after, 4, u, v, scroll), point);
    close(onScreen(before, 4, u, v, offset, transform), point);
  });

  it("previews every page on screen exactly, not only the one under the fingers, because the gaps scale with the pages", () => {
    // In portrait, several pages show at once: with fixed gaps the pages away from the fingers moved when they lifted.
    const before = at(1), after = at(0.5);
    const offset = { x: 0, y: before.rows[1].top - 300 }, start = { x: 576, y: 420 }, point = { x: 560, y: 400 };
    const { scroll, transform } = pinchTarget(before, after, VIEW, offset, start, point);
    for (const page of [0, 1, 2, 3]) for (const [u, v] of [[0, 0], [1, 1]]) close(onScreen(before, page, u, v, offset, transform), onScreen(after, page, u, v, scroll));
    // Kept fixed, the gaps would not: the page above the one under the fingers would land elsewhere.
    const fixed = stackPages(pages, fit * 0.5, VIEW.width, GAP);
    const moved = pinchTarget(before, fixed, VIEW, offset, start, point);
    expect(Math.abs(onScreen(before, 0, 0, 0, offset, moved.transform).y - onScreen(fixed, 0, 0, 0, moved.scroll).y)).toBeGreaterThan(5);
  });

  it("shows during the pinch exactly where the page lands, so letting go moves nothing", () => {
    const before = at(1.4), after = at(0.8);
    const offset = { x: 120, y: before.rows[2].top + 400 }, start = { x: 300, y: 300 }, point = { x: 640, y: 180 };
    const { scroll, transform } = pinchTarget(before, after, VIEW, offset, start, point);
    // Every point of the page under the fingers, not only the one between them.
    for (const [u, v] of [[0, 0], [1, 1], [0.25, 0.8], [0.9, 0.1]]) close(onScreen(before, 2, u, v, offset, transform), onScreen(after, 2, u, v, scroll));
  });

  it("at the top of a note, zooming out keeps the page at the top instead of following the fingers and jumping back", () => {
    const before = at(1), after = at(0.5);
    const { scroll, transform } = pinchTarget(before, after, VIEW, { x: 0, y: 0 }, { x: 576, y: 400 }, { x: 576, y: 400 });
    expect(scroll).toEqual({ x: 0, y: 0 });
    // The first page's top-left corner, previewed and laid out, is where the layout keeps it: centred, a gap below the top.
    close(onScreen(before, 0, 0, 0, { x: 0, y: 0 }, transform), { x: (VIEW.width - A4.width * fit * 0.5) / 2, y: GAP * 0.5 });
  });

  it("lands a zoom in near the end of a note within the new, larger content, not the old one", () => {
    const before = at(1), after = at(2);
    const offset = { x: 0, y: before.height - VIEW.height }, start = { x: 900, y: 500 };
    const { scroll } = pinchTarget(before, after, VIEW, offset, start, start);
    expect(scroll.y).toBeGreaterThan(before.height - VIEW.height);
    expect(scroll.y).toBeLessThanOrEqual(after.height - VIEW.height);
    expect(scroll.x).toBeGreaterThan(0);
  });
});
