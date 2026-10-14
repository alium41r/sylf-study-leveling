import { describe, expect, it } from 'vitest';
import { createDraft, cellSegment, paintCells, duplicateFrame, moveFrame, draftToCreation, choosePaintColor } from '@/app/locker/components/studio/pixel-studio-model';
import { studioReducer, type StudioHistory } from '@/app/locker/components/studio/studio-history';
const initial = (): StudioHistory => ({ draft: createDraft(48), selected: 0, past: [], future: [], group: null });
const stroke = (state: StudioHistory, value: number | null) => studioReducer(state, { type: 'edit', apply: current => ({ ...current, draft: { ...current.draft, frames: [paintCells(current.draft.frames[0], cellSegment({ x: 2, y: 3 }, { x: 20, y: 3 }), value, 48, true)] } }) });
describe('coherent editor history', () => {
 it('adds arbitrary RGB colors without recoloring painted cells and undoes palette/style edits', () => {
  let state = stroke(initial(), 1);
  const original = draftToCreation(state.draft);
  const added = choosePaintColor(state.draft, '#F04A29')!;
  expect(added.index).toBe(10);
  expect(added.draft.frames[0]).toBe(state.draft.frames[0]);
  state = studioReducer(state, { type: 'edit', apply: value => ({ ...value, draft: { ...added.draft, displayBorder: '#f04a29', pixelGap: 0.2 } }) });
  expect(draftToCreation(state.draft)).not.toHaveProperty('displayBorder');
  expect(draftToCreation(state.draft)).not.toHaveProperty('pixelGap');
  state = studioReducer(state, { type: 'undo' });
  expect(draftToCreation(state.draft)).toEqual(original);
  state = studioReducer(state, { type: 'redo' });
  expect(state.draft).toMatchObject({ displayBorder: '#f04a29', pixelGap: 0.2 });
  expect(choosePaintColor(state.draft, '#f04a29')?.draft).toBe(state.draft);
 });
 it('refuses recoloring a full used palette and recycles only unused slots across all frames', () => {
  const palette = Array.from({ length: 16 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
  const draft = { ...createDraft(32), palette };
  const frame = paintCells(draft.frames[0], Array.from({ length: 16 }, (_, x) => ({ x, y: 0 })), 0, 32, false);
  const cells = frame.cells.map((row, y) => row.map((cell, x) => y === 0 && x < 16 ? x : cell));
  const full = { ...draft, frames: [{ ...frame, cells }] };
  expect(choosePaintColor(full, '#ff7700')).toBeNull();
  expect(choosePaintColor(full, 'red')).toBeNull();
  expect(choosePaintColor(full, palette[7])?.draft).toBe(full);
  const sparse = { ...full, frames: [{ ...frame, cells: cells.map(row => row.map(cell => cell === 3 ? null : cell)) }, { ...frame, cells }] };
  expect(choosePaintColor(sparse, '#ff7700')).toBeNull();
  const unused = { ...sparse, frames: [sparse.frames[0]] };
  const added = choosePaintColor(unused, '#ff7700')!;
  expect(added.index).toBe(3);
  expect(added.draft.palette[3]).toBe('#ff7700');
  expect(added.draft.frames).toBe(unused.frames);
 });
 it('keeps sparse mirrored strokes and erasing continuous, undoing each gesture once', () => {
  let state = studioReducer(initial(), { type: 'begin' });
  state = stroke(state, 1); state = stroke(state, 1); state = studioReducer(state, { type: 'end' });
  expect(state.past).toHaveLength(1);
  expect(state.draft.frames[0].cells[3].filter(x => x !== null)).toHaveLength(38);
  state = studioReducer(state, { type: 'begin' }); state = stroke(state, null); state = studioReducer(state, { type: 'end' });
  expect(state.past).toHaveLength(2); expect(state.draft.frames[0].cells[3].every(x => x === null)).toBe(true);
  state = studioReducer(state, { type: 'undo' }); expect(state.draft.frames[0].cells[3].filter(x => x !== null)).toHaveLength(38);
  state = studioReducer(state, { type: 'redo' }); expect(state.draft.frames[0].cells[3].every(x => x === null)).toBe(true);
 });
 it('restores document metadata and selected frames together after structural edits', () => {
  let state = stroke(initial(), 1); const original = draftToCreation(state.draft);
  state = studioReducer(state, { type: 'edit', apply: current => ({ draft: { ...duplicateFrame(current.draft, 0), name: '新しい名前', playback: 'once' }, selected: 1 }) });
  expect(state.selected).toBe(1); expect(state.draft.frames).toHaveLength(2);
  state = studioReducer(state, { type: 'edit', apply: current => ({ draft: moveFrame(current.draft, 1, -1), selected: 0 }) });
  state = studioReducer(state, { type: 'undo' }); expect(state.selected).toBe(1);
  state = studioReducer(state, { type: 'undo' }); expect(draftToCreation(state.draft)).toEqual(original); expect(state.selected).toBe(0);
  state = studioReducer(state, { type: 'redo' }); expect(state.draft.name).toBe('新しい名前'); expect(state.draft.id).toBe(original.id);
 });
});
