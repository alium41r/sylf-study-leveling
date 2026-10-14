import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterConfig } from '@/lib/character-traits';
import { EditorCanvas } from '@/app/locker/components/studio/EditorCanvas';
import { PixelStudio } from '@/app/locker/components/studio/PixelStudio';
import { createDraft } from '@/app/locker/components/studio/pixel-studio-model';

vi.mock('@/app/components/AuthProvider', () => ({ useAuth: () => ({ user: null, mutateUser: vi.fn() }) }));
vi.mock('@/lib/pixel-creations-client', () => ({
 usePixelCreations: () => ({ creations: [], loaded: true, loading: false, error: null, retry: vi.fn() }),
 invalidatePixelCreations: vi.fn(),
}));
vi.mock('@/app/components/companion/PixelCompanion', () => ({
 PixelCompanion: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

const config = { outfit: 'sylf', displayBorder: 'none', pixelGap: 0 } as CharacterConfig;
let measure: () => void;
let viewportWidth = 520, viewportHeight = 280;
const originalViewport = { width: window.innerWidth, height: window.innerHeight };

function resize(width: number, height: number) {
 Object.defineProperties(window, { innerWidth: { value: width, configurable: true }, innerHeight: { value: height, configurable: true } });
 fireEvent(window, new Event('resize'));
}
function pointer(element: Element, type: string, x: number, y: number) {
 const event = new Event(type, { bubbles: true, cancelable: true });
 Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y });
 fireEvent(element, event);
}
function canvasProps() {
 const draft = createDraft(48);
 return { grid: draft.grid, frame: draft.frames[0], palette: draft.palette, zoom: 0, tool: 'pencil' as const, mirrored: false, onPaint: vi.fn(), onStrokeStart: vi.fn(), onStrokeEnd: vi.fn(), onPick: vi.fn(), label: 'Test drawing' };
}

beforeEach(() => {
 viewportWidth = 520; viewportHeight = 280;
 resize(1440, 900);
 vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { measure = callback; } observe() {} disconnect() {} });
 vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => viewportWidth);
 vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewportHeight);
 vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 480, height: 480, bottom: 480, right: 480, toJSON: () => ({}) });
 Object.defineProperties(HTMLCanvasElement.prototype, {
  setPointerCapture: { configurable: true, value: vi.fn() },
  hasPointerCapture: { configurable: true, value: () => true },
  releasePointerCapture: { configurable: true, value: vi.fn() },
 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resize(originalViewport.width, originalViewport.height); });

describe('bounded Studio canvas', () => {
 it('fits the shorter viewport dimension and subtracts its actual padding', () => {
  const view = render(<EditorCanvas {...canvasProps()} />);
  const canvas = view.getByRole('img', { name: 'Test drawing' });
  const wrap = canvas.parentElement!.parentElement!;
  wrap.style.padding = '12px 18px';
  act(() => measure());
  expect(canvas.parentElement!.style.width).toBe('256px');
  expect(canvas.parentElement!.style.height).toBe('256px');
  viewportWidth = 160; viewportHeight = 500;
  act(() => measure());
  expect(canvas.parentElement!.style.width).toBe('124px');
 });
 it('pans zoomed artwork without painting or opening an undo group', () => {
  const props = canvasProps();
  const view = render(<EditorCanvas {...props} zoom={12} panMode />);
  const canvas = view.getByRole('img', { name: 'Test drawing' });
  const wrap = canvas.parentElement!.parentElement!;
  wrap.scrollLeft = 40; wrap.scrollTop = 60;
  pointer(canvas, 'pointerdown', 150, 160);
  pointer(canvas, 'pointermove', 100, 120);
  pointer(canvas, 'pointerup', 100, 120);
  expect(wrap.scrollLeft).toBe(90); expect(wrap.scrollTop).toBe(100);
  expect(props.onPaint).not.toHaveBeenCalled();
  expect(props.onStrokeStart).not.toHaveBeenCalled();
  expect(props.onStrokeEnd).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(canvas);
 });
 it('blocks drawing during playback or saving', () => {
  const props = canvasProps();
  const view = render(<EditorCanvas {...props} disabled />);
  pointer(view.getByRole('img', { name: 'Test drawing' }), 'pointerdown', 10, 10);
  expect(props.onStrokeStart).not.toHaveBeenCalled();
  expect(props.onPaint).not.toHaveBeenCalled();
 });
});

describe('Studio controls while drawing', () => {
 it('focuses the canvas on a stroke so keyboard undo/redo restores the same stroke', () => {
  const view = render(<PixelStudio characterConfig={config} onEquip={vi.fn()} onBack={vi.fn()} />);
  const canvas = view.getByRole('img', { name: 'Drawing frame 1' });
  const undo = view.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
  const redo = view.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
  pointer(canvas, 'pointerdown', 105, 105);
  pointer(canvas, 'pointermove', 155, 105);
  pointer(canvas, 'pointerup', 155, 105);
  expect(document.activeElement).toBe(canvas); expect(undo.disabled).toBe(false);
  fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
  expect(undo.disabled).toBe(true); expect(redo.disabled).toBe(false);
  fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true, shiftKey: true });
  expect(undo.disabled).toBe(false); expect(redo.disabled).toBe(true);
 });
 it('switches tools with shortcuts while keeping text entry independent', () => {
  const view = render(<PixelStudio characterConfig={config} onEquip={vi.fn()} onBack={vi.fn()} />);
  const canvas = view.getByRole('img', { name: 'Drawing frame 1' });
  fireEvent.keyDown(canvas, { key: 'h' });
  expect(view.getByRole('button', { name: 'Pan' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(canvas, { key: 'e' });
  expect(view.getByRole('button', { name: 'Erase' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(view.getByRole('textbox', { name: 'Pixel Studio' }), { key: 'b' });
  expect(view.getByRole('button', { name: 'Erase' }).getAttribute('aria-pressed')).toBe('true');
  expect((view.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
 });
 it('opens settings on demand in compact viewports and closes with Escape', () => {
  resize(390, 844);
  const view = render(<PixelStudio characterConfig={config} onEquip={vi.fn()} onBack={vi.fn()} />);
  const toggle = view.getByRole('button', { name: 'Studio settings' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(view.getByRole('dialog', { name: 'Studio settings' }).getAttribute('aria-modal')).toBe('true');
  fireEvent.keyDown(view.getByRole('button', { name: 'Close studio settings' }), { key: 'Escape' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
 });
 it('collapses frames automatically on short screens and keeps explicit expansion', () => {
  resize(320, 568);
  const view = render(<PixelStudio characterConfig={config} onEquip={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(view.getByRole('button', { name: 'Expand animation timeline' }));
  expect(view.getByRole('button', { name: 'Collapse animation timeline' }).getAttribute('aria-expanded')).toBe('true');
  act(() => resize(844, 390));
  expect(view.getByRole('button', { name: 'Collapse animation timeline' }).getAttribute('aria-expanded')).toBe('true');
 });
});
