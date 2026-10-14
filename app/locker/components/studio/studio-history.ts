import { HISTORY_LIMIT, type Draft } from './pixel-studio-model';
export interface StudioSnapshot { draft: Draft; selected: number }
export interface StudioHistory extends StudioSnapshot { past: StudioSnapshot[]; future: StudioSnapshot[]; group: StudioSnapshot | null }
export type StudioAction = { type: 'edit'; apply: (value: StudioSnapshot) => StudioSnapshot } | { type: 'load'; value: StudioSnapshot } | { type: 'select'; index: number } | { type: 'begin' | 'end' | 'undo' | 'redo' };
const snapshot = ({ draft, selected }: StudioSnapshot): StudioSnapshot => ({ draft, selected });
const differs = (a: StudioSnapshot, b: StudioSnapshot) => a.draft !== b.draft && JSON.stringify(a.draft) !== JSON.stringify(b.draft);
export function studioReducer(state: StudioHistory, action: StudioAction): StudioHistory {
 switch (action.type) {
  case 'load': return { ...action.value, past: [], future: [], group: null };
  case 'select': return { ...state, selected: Math.max(0, Math.min(state.draft.frames.length - 1, action.index)) };
  case 'begin': return state.group ? state : { ...state, group: snapshot(state) };
  case 'end': return { ...state, group: null, ...(state.group && differs(state.group, state) ? { past: [...state.past, state.group].slice(-HISTORY_LIMIT), future: [] } : {}) };
  case 'edit': {
    const next = action.apply(snapshot(state));
    // Commands retain the document reference for no-ops; don't serialize the
    // whole animation on each pointer sample. Group equality is checked at end.
    if (state.draft === next.draft) return state;
    return { ...state, ...next, ...(state.group ? {} : { past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: [] }) };
  }
  case 'undo': { const previous = state.past.at(-1); return previous ? { ...state, ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT), group: null } : state; }
  case 'redo': { const next = state.future[0]; return next ? { ...state, ...next, past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT), future: state.future.slice(1), group: null } : state; }
 }
}
