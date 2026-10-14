import { describe, expect, it } from "vitest";
import {
  BLACK,
  TRANSPARENT,
  hexToPixColor,
  isTransparent,
  mixPixColor,
  packRgba,
  pixColorToHex,
  scaleAlpha,
  unpackRgba,
} from "@/lib/pixel-display/engine/color";

describe("pixel color", () => {
  it("packs and unpacks RGBA in byte order", () => {
    const color = packRgba(0x12, 0x34, 0x56, 0x78);
    expect(color).toBe(0x12345678);
    expect(unpackRgba(color)).toEqual({
      r: 0x12,
      g: 0x34,
      b: 0x56,
      a: 0x78,
    });
  });

  it("keeps values inside one byte", () => {
    expect(packRgba(255, 255, 255, 255)).toBe(0xffffffff);
    expect(packRgba(0, 0, 0, 0)).toBe(TRANSPARENT);
  });

  it("exposes the canonical off and backdrop colors", () => {
    expect(TRANSPARENT).toBe(0x00000000);
    expect(isTransparent(TRANSPARENT)).toBe(true);
    expect(isTransparent(BLACK)).toBe(false);
    expect(BLACK).toBe(0x000000ff);
  });

  it("parses 3, 6 and 8 digit hex literals", () => {
    expect(hexToPixColor("#abc")).toBe(hexToPixColor("#aabbcc"));
    expect(hexToPixColor("aabbcc")).toBe(packRgba(0xaa, 0xbb, 0xcc, 0xff));
    expect(hexToPixColor("#aabbcc80")).toBe(packRgba(0xaa, 0xbb, 0xcc, 0x80));
  });

  it("rejects malformed literals loudly", () => {
    expect(() => hexToPixColor("#12345")).toThrow(SyntaxError);
    expect(() => hexToPixColor("#gggggg")).toThrow(SyntaxError);
    expect(() => hexToPixColor("")).toThrow(SyntaxError);
  });

  it("round-trips through hex, including alpha", () => {
    expect(pixColorToHex(hexToPixColor("#43e1b0"))).toBe("#43e1b0");
    expect(pixColorToHex(hexToPixColor("#43e1b040"))).toBe("#43e1b040");
  });

  it("scales alpha without touching hue", () => {
    const color = packRgba(10, 20, 30, 200);
    const half = scaleAlpha(color, 0.5);
    expect(unpackRgba(half)).toEqual({ r: 10, g: 20, b: 30, a: 100 });
  });

  it("clamps alpha scaling at both ends", () => {
    const color = packRgba(10, 20, 30, 200);
    expect(unpackRgba(scaleAlpha(color, 0)).a).toBe(0);
    expect(unpackRgba(scaleAlpha(color, 5)).a).toBe(255);
    expect(unpackRgba(scaleAlpha(color, -1)).a).toBe(0);
  });

  it("mixes two colors linearly and clamps the factor", () => {
    const from = packRgba(0, 0, 0, 0);
    const to = packRgba(255, 255, 255, 255);
    expect(mixPixColor(from, to, 0)).toBe(from);
    expect(mixPixColor(from, to, 1)).toBe(to);
    expect(mixPixColor(from, to, 0.5)).toBe(packRgba(128, 128, 128, 128));
    expect(mixPixColor(from, to, 5)).toBe(to);
  });
});
