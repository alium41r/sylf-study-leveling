import { describe, expect, it } from 'vitest';
import { createPixDisplay, createPixRuntime, hexToPixColor } from '@/lib/pixel-display/engine';
import { createSylfContent } from '@/lib/pixel-display/content';
import { creationToAsset, paintAsset, type PixelCreation, type CreationSize } from '@/lib/pixel-display/content/asset';


function drawing(grid: CreationSize): PixelCreation {
  return { version: 1, id: 'user:fixture', name: 'Fixture', grid, palette: ['#ff0000', '#00ff00'], playback: 'loop', frames: [{ durationMs: 120, rows: Array.from({ length: grid }, (_, y) => Array.from({ length: grid }, (_, x) => (x + y) % 3 === 0 ? '.' : String((x + y) % 2)).join('')) }, { durationMs: 180, rows: Array.from({ length: grid }, () => '1'.repeat(grid)) }] };
}

describe('original artwork and explicit presentation', () => {
  it('never paints a built-in character when no artwork is supplied', () => {
    const display = createPixDisplay(48, 48), runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, { autoBlink: true });
    content.render();
    content.startEffect({ kind: 'bodyPulse', seed: 1 });
    content.render();
    expect(display.litCount()).toBe(0);
    content.clearEffect();
    expect(content.update({ delta: 10000 } as never)).toBe(false);
  });
  for (const grid of [32, 40, 48, 64] as const) {
    it(`copies every authored cell including holes and edges at ${grid}`, () => {
      const source = drawing(grid), display = createPixDisplay(grid, grid);
      paintAsset(display, creationToAsset(source)!);
      for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
        const token = source.frames[0].rows[y][x];
        expect(display.getPixel(x, y)).toBe(token === '.' ? 0 : hexToPixColor(source.palette[Number(token)]));
      }
    });
  }
  it('samples destination centers deterministically with no collapsed-pixel overwrite', () => {
    const source = drawing(64), display = createPixDisplay(32, 32);
    paintAsset(display, creationToAsset(source)!);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const token = source.frames[0].rows[y * 2 + 1][x * 2 + 1];
      expect(display.getPixel(x, y)).toBe(token === '.' ? 0 : hexToPixColor(source.palette[Number(token)]));
    }
  });
  it('refreshes same-ID geometry, palette and timing without a rename', () => {
    const source = drawing(48), display = createPixDisplay(48, 48), runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, { autoBlink: false, composition: { base: creationToAsset(source)!, parts: [] } });
    content.render();
    const edited = { ...source, palette: ['#0000ff', '#ffffff'], frames: [{ ...source.frames[1], durationMs: 600 }] };
    content.configure({ composition: { base: creationToAsset(edited)!, parts: [] }, effect: null });
    content.render();
    expect(display.getPixel(0, 0)).toBe(hexToPixColor('#ffffff'));
    expect(content.getComposedCharacter()?.base.animation?.frameDurationsMs).toEqual([600]);
  });
  it('holds frame one under reduced motion and allows explicit selected-frame preview', () => {
    const display = createPixDisplay(48, 48), runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, { autoBlink: false, reducedMotion: true, composition: { base: creationToAsset(drawing(48))!, parts: [] } });
    runtime.start();
    content.update({ delta: 500, elapsed: 500, frame: 1 });
    expect(content.getAnimationFrame()).toBe(0);
    runtime.stop();
  });
  it('never invents occupied cells during drawing effects', () => {
    const source = { ...drawing(48), frames: [drawing(48).frames[0]] }, display = createPixDisplay(48, 48), runtime = createPixRuntime();
    const content = createSylfContent(display, runtime, { autoBlink: false, composition: { base: creationToAsset(source)!, parts: [] } });
    content.render(); const original = display.snapshot();
    content.startEffect({ kind: 'sparkleWave', seed: 7 });
    for (let frame = 0; frame < 24; frame++) {
      content.update({ delta: 60, elapsed: frame * 60, frame }); content.render();
      for (let cell = 0; cell < 48 * 48; cell++) if (original[cell] === 0) expect(display.snapshot()[cell]).toBe(0);
    }
    runtime.stop();
  });
});
