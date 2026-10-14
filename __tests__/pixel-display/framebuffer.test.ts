import { describe, expect, it } from "vitest";
import { createFramebuffer } from "@/lib/pixel-display/engine/framebuffer";
import { packRgba, TRANSPARENT } from "@/lib/pixel-display/engine/color";

const GREEN = packRgba(0x43, 0xe1, 0xb0, 0xff);
const WHITE = packRgba(0xdc, 0xeb, 0xfd, 0xff);

describe("framebuffer", () => {
  it("starts fully transparent with the right byte size", () => {
    const framebuffer = createFramebuffer(8, 8);
    expect(framebuffer.data.length).toBe(8 * 8 * 4);
    expect(framebuffer.isEmpty()).toBe(true);
    expect(framebuffer.litCount()).toBe(0);
  });

  it("writes and reads a cell through its byte index", () => {
    const framebuffer = createFramebuffer(4, 4);
    const index = framebuffer.geometry.indexOf(2, 1);
    framebuffer.writeIndex(index, GREEN);
    expect(framebuffer.readIndex(index)).toBe(GREEN);
    expect(framebuffer.litCount()).toBe(1);
  });

  it("stores RGBA bytes in the documented order", () => {
    const framebuffer = createFramebuffer(2, 2);
    const index = framebuffer.geometry.indexOf(1, 1);
    framebuffer.writeIndex(index, packRgba(0x11, 0x22, 0x33, 0x44));
    expect(Array.from(framebuffer.data.slice(index, index + 4))).toEqual([
      0x11, 0x22, 0x33, 0x44,
    ]);
  });

  it("clears back to empty", () => {
    const framebuffer = createFramebuffer(4, 4);
    framebuffer.fill(GREEN);
    expect(framebuffer.isEmpty()).toBe(false);
    framebuffer.clear();
    expect(framebuffer.isEmpty()).toBe(true);
    expect(framebuffer.litCount()).toBe(0);
  });

  it("fills every cell with one color", () => {
    const framebuffer = createFramebuffer(3, 2);
    framebuffer.fill(WHITE);
    expect(framebuffer.litCount()).toBe(6);
    for (const color of framebuffer.toColors()) expect(color).toBe(WHITE);
  });

  it("advances the revision on every mutation", () => {
    const framebuffer = createFramebuffer(4, 4);
    const first = framebuffer.getRevision();
    framebuffer.writeIndex(0, GREEN);
    const second = framebuffer.getRevision();
    framebuffer.markDirty();
    const third = framebuffer.getRevision();
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("returns detached snapshots", () => {
    const framebuffer = createFramebuffer(2, 2);
    framebuffer.fill(GREEN);
    const bytes = framebuffer.toBytes();
    const colors = framebuffer.toColors();
    framebuffer.clear();
    expect(bytes[3]).toBe(0xff);
    expect(colors[0]).toBe(GREEN);
    expect(framebuffer.isEmpty()).toBe(true);
  });

  it("copies into a caller-provided buffer without sharing storage", () => {
    const framebuffer = createFramebuffer(2, 2);
    framebuffer.fill(GREEN);
    const target = new Uint8ClampedArray(framebuffer.data.length);
    framebuffer.copyInto(target);
    target[0] = 0;
    expect(framebuffer.data[0]).toBe(0x43);
  });

  describe("blit", () => {
    it("copies a source at a logical origin, skipping transparent cells", () => {
      const target = createFramebuffer(4, 4);
      const source = createFramebuffer(2, 2);
      source.writeIndex(source.geometry.indexOf(1, 0), GREEN);

      target.blit(source, 1, 1);

      const read = (x: number, y: number) =>
        target.readIndex(target.geometry.indexOf(x, y));
      expect(read(2, 1)).toBe(GREEN);
      expect(read(1, 1)).toBe(TRANSPARENT);
      expect(target.litCount()).toBe(1);
    });

    it("copies transparent cells when asked to", () => {
      const target = createFramebuffer(2, 2);
      target.fill(GREEN);
      const source = createFramebuffer(2, 2);
      target.blit(source, 0, 0, false);
      expect(target.isEmpty()).toBe(true);
    });

    it("skips source cells that fall outside the target", () => {
      const target = createFramebuffer(3, 3);
      const source = createFramebuffer(3, 3);
      source.fill(GREEN);

      target.blit(source, -1, -1);

      const read = (x: number, y: number) =>
        target.readIndex(target.geometry.indexOf(x, y));
      // Only the 2x2 overlap at the target's bottom-right is written.
      expect(read(0, 0)).toBe(GREEN);
      expect(read(1, 1)).toBe(GREEN);
      expect(read(2, 2)).toBe(TRANSPARENT);
      expect(target.litCount()).toBe(4);
    });

    it("is a no-op when the source is entirely outside", () => {
      const target = createFramebuffer(2, 2);
      const source = createFramebuffer(2, 2);
      source.fill(GREEN);
      target.blit(source, 10, 10);
      expect(target.isEmpty()).toBe(true);
    });
  });
});
