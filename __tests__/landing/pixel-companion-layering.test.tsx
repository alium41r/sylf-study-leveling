import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import Companion from '@/app/components/landing/companion/Companion';
import CompanionReview from '@/app/components/landing/companion/CompanionReview';
import { setPixelCompanionVariant } from './fixtures/retired-pixel-preview';
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/'); });
it.each(['pixel', 'pixel-layered'] as const)('cannot restore retired raster artwork through the %s preview flag', variant => {
  vi.stubEnv('NODE_ENV', 'development');
  window.history.replaceState(null, '', '/?companion=' + variant);
  const view = render(<Companion />);
  act(() => setPixelCompanionVariant(variant));
  expect(view.container.querySelector('[data-pixel-canvas]')).toBeNull();
  expect(view.container.querySelector('[data-pixel-layer]')).toBeNull();
  expect(view.container.querySelector('img')).toBeNull();
});
it('removes raster comparison controls and public character images', () => {
  vi.stubEnv('NODE_ENV', 'development');
  render(<CompanionReview />);
  expect(screen.queryByRole('button', { name: 'Layered pixel companion' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'New pixel companion' })).toBeNull();
  expect(existsSync('public/companions/sylf-pixel-companion.png')).toBe(false);
  expect(existsSync('public/companions/pixel/sylf')).toBe(false);
});
