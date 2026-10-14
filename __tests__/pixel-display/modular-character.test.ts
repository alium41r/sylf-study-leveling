import { describe, expect, it } from 'vitest';
import { createPixDisplay } from '@/lib/pixel-display/engine';
import { DEFAULT_CHARACTER_CONFIG, getDefaultCharacterConfig, PIXEL_COMPANIONS } from '@/lib/character-traits';
import { EMPTY_CHARACTER_ASSET, REFERENCE_ASSETS, createAssetLookup, creationToAsset, paintComposition, validateAsset, type PixelCreation } from '@/lib/pixel-display/content/asset';
import { knownCosmeticKeys, registryAssetIds, resolveCosmeticKey } from '@/app/dashboard/pixel-cosmetic-registry';
import { resolveEquippedCharacter } from '@/app/dashboard/pixel-modular-character';
const lookup = createAssetLookup(REFERENCE_ASSETS);
const document: PixelCreation = { version: 1, id: 'user:artwork', name: 'My artwork', grid: 32, palette: ['#ff5555'], playback: 'loop', frames: [{ durationMs: 240, rows: Array.from({ length: 32 }, (_, y) => y === 20 ? '.'.repeat(15) + '00' + '.'.repeat(15) : '.'.repeat(32)) }] };
const drawing = creationToAsset(document)!;

describe('user artwork is the only character source', () => {
  it('starts new users with an empty selection and no built-in choices', () => {
    expect(DEFAULT_CHARACTER_CONFIG.outfit).toBe('none');
    expect(getDefaultCharacterConfig().outfit).toBe('none');
    expect(PIXEL_COMPANIONS).toEqual([]);
    expect(REFERENCE_ASSETS.filter(asset => asset.kind === 'character')).toEqual([]);
    expect(validateAsset(EMPTY_CHARACTER_ASSET)).toEqual([]);
  });
  it('resolves every retired character alias to empty without displaying its accessories', () => {
    for (const outfit of knownCosmeticKeys('form')) {
      expect(resolveCosmeticKey('form', outfit).kind, outfit).toBe('unequipped');
      const resolved = resolveEquippedCharacter({ outfit, pedestal: 'pedestal_cyber', aura: 'aura_ember' }, { lookup });
      expect(resolved.composition.base.id).toBe('pixel:empty');
      expect(resolved.composition.parts).toEqual([]);
      expect(resolved.degraded).toEqual([]);
      const display = createPixDisplay(48, 48);
      paintComposition(display, resolved.composition);
      expect(display.litCount()).toBe(0);
    }
  });
  it('handles absent, malformed and unknown selections without substituting artwork', () => {
    for (const config of [undefined, null, {}, 'invalid', { outfit: 42 }, { outfit: {} }, { outfit: 'future-character' }]) {
      const resolved = resolveEquippedCharacter(config as never, { lookup });
      expect(resolved.composition.base).toBe(EMPTY_CHARACTER_ASSET);
      expect(resolved.composition.parts).toEqual([]);
    }
  });
  it('reports unavailable drawings and leaves the display empty', () => {
    const resolved = resolveEquippedCharacter({ outfit: document.id }, { lookup });
    expect(resolved.composition.base).toBe(EMPTY_CHARACTER_ASSET);
    expect(resolved.degraded[0]).toMatchObject({ slot: 'form', reason: 'missing-asset' });
  });
  it('renders an explicitly owned drawing faithfully with compatible ground', () => {
    const resolved = resolveEquippedCharacter({ outfit: document.id, pedestal: 'pedestal_meadow' }, { lookup, creations: [drawing] });
    expect(resolved.composition.base).toBe(drawing);
    expect(resolved.composition.parts.map(part => part.slot)).toEqual(['pedestal']);
    expect(resolved.degraded).toEqual([]);
    const display = createPixDisplay(32, 32);
    paintComposition(display, { ...resolved.composition, parts: [] });
    expect(display.getPixel(15, 20)).toBe(0xff5555ff);
    expect(display.litCount()).toBe(2);
  });
  it('hides incompatible attachments while preserving arbitrary drawing geometry', () => {
    const resolved = resolveEquippedCharacter({ outfit: document.id, relic: 'relic_practice_wand', accessory: 'accessory_study_scarf' }, { lookup, creations: [drawing] });
    expect(resolved.composition.base).toBe(drawing);
    expect(resolved.composition.parts).toEqual([]);
    expect(resolved.degraded.map(item => item.reason)).toEqual(['incompatible', 'incompatible']);
  });
  it('refuses to treat a non-character accessory as selected artwork', () => {
    const accessory = { ...REFERENCE_ASSETS[0], id: document.id };
    expect(resolveEquippedCharacter({ outfit: document.id }, { lookup, creations: [accessory] }).composition.base).toBe(EMPTY_CHARACTER_ASSET);
  });
  it('keeps accessory catalog mappings valid without any built-in character dependency', () => {
    for (const id of registryAssetIds()) {
      expect(lookup(id)).toBeDefined();
      expect(validateAsset(lookup(id)!)).toEqual([]);
    }
  });
});
