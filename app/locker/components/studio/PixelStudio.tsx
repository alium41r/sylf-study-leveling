"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Copy, FilePlus2, FolderOpen, Eraser, Hand, PaintBucket, Pause, Pencil, Pipette, Play, Plus, Redo2, Save, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react';
import { useAuth } from '@/app/components/AuthProvider';
import { PixelCompanion } from '@/app/components/companion/PixelCompanion';
import { HexColorPicker } from '@/app/components/companion/HexColorPicker';
import { DEFAULT_DISPLAY_BORDER, normalizeDisplayBorder, normalizePixelGap } from '@/lib/pixel-display-style';
import { MOTION_DURATION, MOTION_EASE } from '@/lib/motion';
import { apiFetch } from '@/lib/api-transport';
import { getClientSessionEpoch } from '@/lib/client-data-cache';
import { invalidatePixelCreations, usePixelCreations, type StoredPixelCreation } from '@/lib/pixel-creations-client';
import { CREATION_ALLOWED_SIZES, MAX_CREATION_FRAMES, MAX_CREATION_COLORS, MIN_FRAME_MS, MAX_FRAME_MS, MAX_TOTAL_MS, validateCreation, type PixelCreation } from '@/lib/pixel-display/content/asset';
import type { CharacterConfig } from '@/lib/character-traits';
import { createDraft, creationToDraft, draftToCreation, newCreationId, STUDIO_TOOLS, ZOOM_LEVELS, addFrame, duplicateFrame, deleteFrame, moveFrame, choosePaintColor, usedColors, DEFAULT_PALETTE, paintCells, fillRegion, setFrameDuration, totalDurationMs, type Draft, type StudioTool, type CellPoint } from './pixel-studio-model';
import { studioReducer, type StudioSnapshot } from './studio-history';
import { EditorCanvas } from './EditorCanvas';
import { ImmersiveModeButton } from '@/app/components/ImmersiveModeButton';
import styles from './PixelStudio.module.css';
export interface PixelStudioProps { characterConfig: CharacterConfig; onEquip: (patch: Partial<CharacterConfig>) => void | Promise<void>; saving?: boolean; onBack: () => void; creationId?: string | null; onSaved?: (id: string) => void }
export type StoredCreation = StoredPixelCreation;
interface Recovery { document: PixelCreation; revision: number; baseline: string; selected: number; displayBorder?: string; pixelGap?: number }
const ICONS = { pencil: Pencil, eraser: Eraser, fill: PaintBucket, eyedropper: Pipette };
const TOOL_KEYS = { pencil: 'B', eraser: 'E', fill: 'G', eyedropper: 'I' };
const subscribeViewport = (update: () => void) => { window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); };
const wideViewport = () => window.innerWidth >= 1100;
const tallViewport = () => window.innerHeight >= 700;
export function PixelStudio({ characterConfig, onEquip, onBack, creationId, onSaved }: PixelStudioProps) {
 const { user, mutateUser } = useAuth(), library = usePixelCreations(user?.id);
 const [state, dispatch] = useReducer(studioReducer, undefined, () => ({ draft: { ...createDraft(48), displayBorder: normalizeDisplayBorder(characterConfig.displayBorder), pixelGap: normalizePixelGap(characterConfig.pixelGap, true) }, selected: 0, past: [], future: [], group: null }));
 const { draft, selected } = state;
 const [revision, setRevision] = useState(0), [baseline, setBaseline] = useState('');
 const [tool, setTool] = useState<StudioTool>('pencil'), [paintColor, setPaintColor] = useState('#ffffff'), [zoom, setZoom] = useState(0);
 const [panning, setPanning] = useState(false);
 const [inspectorCollapsed, setInspectorCollapsed] = useState(false), [mobilePanelOpen, setMobilePanelOpen] = useState(false);
 const [timelineView, setTimelineView] = useState<'auto' | 'open' | 'closed'>('auto');
 const isWide = useSyncExternalStore(subscribeViewport, wideViewport, () => true);
 const isTall = useSyncExternalStore(subscribeViewport, tallViewport, () => true);
 const inspectorVisible = isWide ? !inspectorCollapsed : mobilePanelOpen;
 const timelineOpen = timelineView === 'open' || (timelineView === 'auto' && isTall);
 const inspectorRef = useRef<HTMLElement>(null);
 const [recentColors, setRecentColors] = useState<string[]>([]);
 const drawingColors = useMemo(() => usedColors(draft).map(index => draft.palette[index]), [draft]);
 const colorChoices = [...new Set([...recentColors.filter(hex => drawingColors.includes(hex)), ...drawingColors])].slice(0, 16);

 const border = normalizeDisplayBorder(draft.displayBorder ?? characterConfig.displayBorder);
 const pixelGap = normalizePixelGap(draft.pixelGap ?? characterConfig.pixelGap, true);
 const gapDirty = pixelGap !== normalizePixelGap(characterConfig.pixelGap, true);
 const borderDirty = border !== normalizeDisplayBorder(characterConfig.displayBorder);
 const [mirror, setMirror] = useState(false), [onion, setOnion] = useState(false), [grid, setGrid] = useState(true), [playing, setPlaying] = useState(false);
 const [busy, setBusy] = useState<string | null>(null), lock = useRef(false);
 const [error, setError] = useState<string | null>(null), [status, setStatus] = useState('New drawing');
 const [gallery, setGallery] = useState(false), [newDialog, setNewDialog] = useState(false), [newGrid, setNewGrid] = useState(48), [context, setContext] = useState<'artwork' | 'dashboard'>('artwork');
 const [recovery, setRecovery] = useState<Recovery | null>(null), loaded = useRef(false), opened = useRef(false);
 const document = useMemo(() => draftToCreation(draft), [draft]);
 const signature = useMemo(() => JSON.stringify(document), [document]);
 const artworkDirty = baseline ? signature !== baseline : draft.frames.some(frame => frame.cells.some(row => row.some(cell => cell !== null)) || frame.durationMs !== 240) || draft.name !== 'My companion' || draft.frames.length > 1 || draft.playback !== 'loop' || JSON.stringify(draft.palette) !== JSON.stringify(DEFAULT_PALETTE);
 const dirty = artworkDirty || borderDirty || gapDirty;
 const occupied = draft.frames.some(frame => frame.cells.some(row => row.some(cell => cell !== null)));
 const recoveryKey = `pixel_studio:${user?.id}`;
 const [sessionEpoch] = useState(getClientSessionEpoch);
 const latestRecovery = useRef<{ dirty: boolean; pending: boolean; value: Recovery } | null>(null);
 useEffect(() => {
   window.document.documentElement.setAttribute('data-pixel-studio', 'true');
   return () => {
     window.document.documentElement.removeAttribute('data-pixel-studio');
   };
 }, []);
 useEffect(() => { latestRecovery.current = { dirty, pending: !!recovery, value: { document, revision, baseline, selected, displayBorder: border, pixelGap } }; }, [dirty, recovery, document, revision, baseline, selected, border, pixelGap]);
 useEffect(() => () => {
   const latest = latestRecovery.current;
   if (!user?.id || !latest?.dirty || latest.pending || sessionEpoch !== getClientSessionEpoch()) return;
   try { localStorage.setItem(recoveryKey, JSON.stringify(latest.value)); } catch { /* Save failure is already surfaced while mounted. */ }
 }, [recoveryKey, user?.id, sessionEpoch]);
 useEffect(() => {
   if (!user?.id || loaded.current) return; loaded.current = true;
   try { const value = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null');
     // Recovery synchronizes an external persisted document on mount.
     // eslint-disable-next-line react-hooks/set-state-in-effect
     if (value && validateCreation(value.document).length === 0) setRecovery(value); } catch { localStorage.removeItem(recoveryKey); }
 }, [user?.id, recoveryKey]);
 useEffect(() => {
   if (!loaded.current || recovery || !user?.id) return;
   const timer = setTimeout(() => { if (sessionEpoch !== getClientSessionEpoch()) return; try { if (dirty) localStorage.setItem(recoveryKey, JSON.stringify({ document, revision, baseline, selected, displayBorder: border, pixelGap })); else localStorage.removeItem(recoveryKey); } catch { setError('Draft recovery storage is unavailable. Save before leaving.'); } }, 300);
   return () => clearTimeout(timer);
 }, [document, revision, baseline, selected, border, pixelGap, dirty, recovery, user?.id, recoveryKey, sessionEpoch]);
 useEffect(() => {
   if (!dirty) return;
   const guard = (event: BeforeUnloadEvent) => { if (sessionEpoch !== getClientSessionEpoch()) return; event.preventDefault(); event.returnValue = ''; };
   window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
 }, [dirty, sessionEpoch]);
 const edit = useCallback((apply: (value: StudioSnapshot) => StudioSnapshot) => { if (!lock.current) { setPlaying(false); dispatch({ type: 'edit', apply }); setError(null); } }, [setPlaying]);
 const selectPaintColor = (hex: string) => {
   if (lock.current) return;
   setPaintColor(hex);
   setPanning(false);
   setError(null);
   if (tool === 'eraser' || tool === 'eyedropper') setTool('pencil');
 };
 const loadDrawing = useCallback((stored: StoredPixelCreation) => {
   if (dirty && !window.confirm('Discard unsaved changes and open this drawing? Your current recovery draft will be replaced.')) return;
   dispatch({ type: 'load', value: { draft: { ...creationToDraft(stored.data), displayBorder: normalizeDisplayBorder(characterConfig.displayBorder), pixelGap: normalizePixelGap(characterConfig.pixelGap, true) }, selected: 0 } }); setRevision(stored.revision); setBaseline(JSON.stringify(draftToCreation(creationToDraft(stored.data)))); setPlaying(false); setGallery(false); setStatus('Saved'); setError(null);
 }, [dirty, characterConfig.displayBorder, characterConfig.pixelGap, setPlaying, setGallery, setStatus]);
 useEffect(() => {
   if (opened.current || !creationId || !library.loaded || recovery) return;
   const stored = library.creations.find(item => item.data.id === creationId);
   opened.current = true;
   // The requested saved document arrives from the external owner-scoped store.
   // eslint-disable-next-line react-hooks/set-state-in-effect
   if (stored) loadDrawing(stored); else setError('This drawing is unavailable. Choose one from your library.');
 }, [creationId, library.creations, library.loaded, recovery, loadDrawing]);
 useEffect(() => {
   if (!playing) return;
   const timer = setTimeout(() => {
     if (selected >= draft.frames.length - 1 && draft.playback === 'once') { setPlaying(false); setStatus('Finished — Play to replay'); }
     else dispatch({ type: 'select', index: (selected + 1) % draft.frames.length });
   }, draft.frames[selected]?.durationMs ?? 240);
   return () => clearTimeout(timer);
 }, [playing, selected, draft.frames, draft.playback]);
 const togglePlay = useCallback(() => { if (lock.current) return; if (!playing && draft.playback === 'once' && selected === draft.frames.length - 1) dispatch({ type: 'select', index: 0 }); setPlaying(value => !value); }, [playing, selected, draft, setPlaying]);
 useEffect(() => {
   const key = (event: KeyboardEvent) => {
     if (gallery || newDialog || recovery || (!isWide && mobilePanelOpen) || lock.current || !(event.target instanceof Element && event.target.closest('[data-pixel-workspace]')) || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
     if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); setPlaying(false); dispatch({ type: event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo' }); }
     else if (event.code === 'Space' && (event.target instanceof Element && event.target.matches('[data-editor-canvas]'))) { event.preventDefault(); togglePlay(); }
     else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
       const next = ({ b: 'pencil', e: 'eraser', g: 'fill', i: 'eyedropper' } as Record<string, StudioTool>)[event.key.toLowerCase()];
       if (next) { setTool(next); setPanning(false); }
       else if (event.key.toLowerCase() === 'h') setPanning(value => !value);
     }
   };
   window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
 }, [togglePlay, gallery, newDialog, recovery, isWide, mobilePanelOpen]);
 const paint = (points: readonly CellPoint[]) => {
   if (playing || lock.current) return;
   if (tool !== 'eraser' && !choosePaintColor(draft, paintColor)) {
     setError(`This drawing already uses ${MAX_CREATION_COLORS} colors. Choose a recent color, or erase a color from every frame to make room. Existing pixels have not changed.`);
     return;
   }
   if (tool !== 'eraser') setRecentColors(colors => [paintColor, ...colors.filter(hex => hex !== paintColor)].slice(0, 16));
   edit(value => {
     const brush = tool === 'eraser' ? null : choosePaintColor(value.draft, paintColor);
     if (tool !== 'eraser' && !brush) return value;
     const next = brush?.draft ?? value.draft;
     const active = next.frames[value.selected], chosen = brush?.index ?? null;
     let frame = tool === 'fill' ? fillRegion(active, points[0], chosen, next.grid) : paintCells(active, points, chosen, next.grid, mirror);
     if (tool === 'fill' && mirror) frame = fillRegion(frame, { x: next.grid - 1 - points[0].x, y: points[0].y }, chosen, next.grid);
     if (frame === active) return value;
     return { ...value, draft: { ...next, frames: next.frames.map((item, index) => index === value.selected ? frame : item) } };
   });
 };
 const dialogRef = useRef<HTMLElement>(null);
 useEffect(() => {
   if (!gallery && !newDialog) return;
   const previous = window.document.activeElement as HTMLElement | null;
   const panel = dialogRef.current;
   const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,a[href],[tabindex="0"]') ?? []);
   focusable()[0]?.focus();
   const trap = (event: KeyboardEvent) => {
     if (event.key === 'Escape' && !lock.current) { setGallery(false); setNewDialog(false); }
     if (event.key === 'Tab') { const elements = focusable(), first = elements[0], last = elements.at(-1); if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); } }
   };
   window.addEventListener('keydown', trap); return () => { window.removeEventListener('keydown', trap); previous?.focus(); };
 }, [gallery, newDialog]);
 useEffect(() => {
   if (isWide || !mobilePanelOpen) return;
   const previous = window.document.activeElement as HTMLElement | null;
   const focusable = () => Array.from(inspectorRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary') ?? []).filter(element => element.getClientRects().length > 0);
   focusable()[0]?.focus();
   const trap = (event: KeyboardEvent) => {
     if (event.key === 'Escape') { event.preventDefault(); setMobilePanelOpen(false); }
     if (event.key === 'Tab') {
       const elements = focusable(), first = elements[0], last = elements.at(-1);
       if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus(); }
       else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus(); }
     }
   };
   window.addEventListener('keydown', trap);
   return () => { window.removeEventListener('keydown', trap); previous?.focus(); };
 }, [isWide, mobilePanelOpen]);
 const copyIdentity = useRef<string | null>(null);
 const save = async (equip = false, copy = false) => {
   if (lock.current) return;
   const next: Draft = copy ? { ...draft, id: copyIdentity.current ?? (copyIdentity.current = newCreationId()) } : draft, creation = draftToCreation(next);
   const issues = validateCreation(creation); if (issues.length) { setError(issues.map(issue => issue.message).join(' ')); return; }
   if (copy) { dispatch({ type: "load", value: { draft: next, selected } }); setRevision(0); setBaseline(""); }
   lock.current = true; setBusy(equip ? 'Saving & equipping…' : 'Saving…'); setError(null); setPlaying(false);
   let saved = false;
   try {
     const response = await apiFetch('/api/pixel-creations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creation, expectedRevision: copy ? 0 : revision }) });
     const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Could not save. Your draft is retained.');
     saved = true; opened.current = true; onSaved?.(creation.id); copyIdentity.current = null; setRevision(result.creation.revision); setBaseline(JSON.stringify(creation)); if (copy) dispatch({ type: 'load', value: { draft: next, selected } });
     invalidatePixelCreations(user?.id); setStatus('Drawing saved');
     if (equip || borderDirty || gapDirty) {
       await onEquip({ ...(equip ? { outfit: creation.id, density: characterConfig.outfit === creation.id ? characterConfig.density ?? 'original' : 'original' } : {}), displayBorder: border, pixelGap });
       setStatus(equip ? 'Saved & equipped' : 'Drawing & display saved');
     }
   } catch (failure) { setError(`${saved && (equip || borderDirty || gapDirty) ? `Drawing saved; could not ${equip ? 'equip' : 'apply display settings'}. Retry ${equip ? 'Save & equip' : 'Save'}. ` : ''}${failure instanceof Error ? failure.message : 'Could not save. Your draft is retained.'}`); }
   finally { lock.current = false; setBusy(null); }
 };
 const remove = async (stored: StoredPixelCreation) => {
   if (lock.current || !window.confirm(`Permanently delete “${stored.name}”? If equipped, your display will be cleared.`)) return;
   lock.current = true; setBusy('Deleting…'); setError(null);
   try {
     const response = await apiFetch(`/api/pixel-creations?slug=${encodeURIComponent(stored.slug)}&revision=${stored.revision}`, { method: 'DELETE', credentials: 'include' }); const result = await response.json();
     if (!response.ok) throw new Error(result.error ?? 'Could not delete.');
     if (result.characterConfig) mutateUser({ characterConfig: result.characterConfig });
     if (document.id === stored.data.id) { setRevision(0); setBaseline(''); dispatch({ type: 'load', value: { draft: { ...draft, id: newCreationId() }, selected } }); }
     invalidatePixelCreations(user?.id); setStatus('Drawing deleted');
   } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete.'); }
   finally { lock.current = false; setBusy(null); }
 };
 const previewConfig = useMemo(() => ({ ...characterConfig, outfit: document.id, density: characterConfig.outfit === document.id ? characterConfig.density ?? 'original' : 'original' }), [characterConfig, document.id]);
 const duration = totalDurationMs(draft);
 return (
  <section
   className={styles.root}
   style={{ '--studio-motion-fast': `${MOTION_DURATION.fast}s`, '--studio-motion-normal': `${MOTION_DURATION.normal}s`, '--studio-motion-ease': `cubic-bezier(${MOTION_EASE.sylf.join(',')})` } as React.CSSProperties}
   aria-label="Pixel Studio" data-pixel-workspace data-inspector-open={inspectorVisible}
  >
   <header className={styles.header} inert={!isWide && mobilePanelOpen}>
    <button className={styles.iconButton} aria-label="Back" title="Back to your Locker" onClick={() => { if (!dirty || window.confirm('Leave Studio? Your unsaved drawing is kept for recovery.')) onBack(); }} disabled={!!busy}><ArrowLeft size={18} /></button>
    <div className={styles.documentName}>
     <label htmlFor="pixel-name">Pixel Studio</label>
     <input id="pixel-name" value={draft.name} maxLength={32} disabled={!!busy} onFocus={() => dispatch({ type: 'begin' })} onBlur={() => dispatch({ type: 'end' })} onChange={event => edit(value => ({ ...value, draft: { ...value.draft, name: event.target.value } }))} />
     <span role="status" data-dirty={dirty}>{!dirty && !busy && <Check size={12} />}{busy ?? (dirty ? 'Unsaved changes · draft protected' : status)}</span>
    </div>
    <div className={styles.saveActions}>
     <button className={styles.button} aria-label="Save" title="Save drawing" disabled={!!busy} onClick={() => void save()}><Save size={16} /><span>Save</span></button>
     <button className={styles.primary} aria-label="Save & equip" title="Save and use this companion" disabled={!!busy || !occupied} onClick={() => void save(true)}><Check size={16} /><span>Save & equip</span></button>
     <ImmersiveModeButton variant="header-pill" className="hidden md:inline-flex" />
    </div>
   </header>

   <nav className={styles.documentActions} aria-label="Drawing documents" inert={!isWide && mobilePanelOpen}>
    <div className={styles.documentButtons}>
     <button className={styles.quietButton} aria-label="New drawing" title="New drawing" onClick={() => setNewDialog(true)} disabled={!!busy}><FilePlus2 size={15} /><span>New drawing</span></button>
     <button className={styles.quietButton} aria-label={`Your drawings (${library.creations.length})`} title="Open your drawings" onClick={() => setGallery(true)} disabled={!!busy}><FolderOpen size={15} /><span>Your drawings</span><small>{library.creations.length}</small></button>
     <button className={styles.quietButton} aria-label="Save as copy" title="Save a separate copy" onClick={() => void save(false, true)} disabled={!!busy}><Copy size={15} /><span>Save as copy</span></button>
    </div>
    <button className={`${styles.quietButton} ${styles.settingsButton}`} aria-label="Studio settings" title="Preview and display settings" aria-controls="pixel-inspector" aria-expanded={inspectorVisible} onClick={() => isWide ? setInspectorCollapsed(value => !value) : setMobilePanelOpen(value => !value)}><SlidersHorizontal size={16} /><span>Preview & settings</span></button>
   </nav>
   {error && <div className={styles.notice} role="alert">{error}</div>}
   {recovery && <div className={styles.notice}><strong>Resume your unsaved drawing “{recovery.document.name}”?</strong><button onClick={() => { dispatch({ type: 'load', value: { draft: { ...creationToDraft(recovery.document), displayBorder: normalizeDisplayBorder(recovery.displayBorder ?? characterConfig.displayBorder), pixelGap: normalizePixelGap(recovery.pixelGap ?? characterConfig.pixelGap, true) }, selected: Math.min(recovery.selected, recovery.document.frames.length - 1) } }); setRevision(recovery.revision); setBaseline(recovery.baseline); setStatus('Recovered draft'); setRecovery(null); opened.current = true; }}>Resume draft</button><button onClick={() => { localStorage.removeItem(recoveryKey); setRecovery(null); }}>Discard recovery</button></div>}

   {!isWide && mobilePanelOpen && <button className={styles.inspectorBackdrop} aria-hidden="true" tabIndex={-1} onClick={() => setMobilePanelOpen(false)} />}
   <div className={styles.layout}>
    <div className={styles.workbench} inert={!isWide && mobilePanelOpen}>
     <section className={styles.colorPanel} aria-label="Paint colors">
      <strong className={styles.colorHeading}>Paint</strong>
      <HexColorPicker label="Paint color" value={paintColor} disabled={!!busy} onChange={selectPaintColor} />
      <span className={styles.divider} aria-hidden="true" />
      <div className={styles.palette} role="toolbar" aria-label={colorChoices.length ? 'Recent colors' : 'Suggested colors'}>
       {(colorChoices.length ? colorChoices : DEFAULT_PALETTE).map(hex => (
        <button key={hex} title={hex} style={{ '--swatch': hex } as React.CSSProperties} aria-label={`${colorChoices.length ? 'Recent' : 'Suggested'} color ${hex}`} aria-pressed={paintColor === hex} onClick={() => selectPaintColor(hex)} disabled={!!busy}><span /></button>
       ))}
      </div>
      <span className={styles.paletteMeta} title="Colors used across this drawing">{drawingColors.length}/{MAX_CREATION_COLORS}</span>
     </section>

     <div className={styles.viewportControls}>
      <span className={styles.gridBadge}>{draft.grid} × {draft.grid}<small>pixels</small></span>
      <div className={styles.viewportOptions}>
       <label className={styles.toggle}><input type="checkbox" checked={mirror} onChange={event => setMirror(event.target.checked)} />Mirror</label>
       <label className={styles.toggle}><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />Grid</label>
       <label className={styles.zoomControl}>Zoom<select aria-label="Editor zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0}>Fit</option>{ZOOM_LEVELS.map(level => <option key={level} value={level}>{level}×</option>)}</select></label>
      </div>
     </div>

     <div className={styles.canvasArea}>
      <div className={styles.toolbar} role="toolbar" aria-label="Drawing tools">
       <div className={styles.toolSet}>
        {STUDIO_TOOLS.map(option => {
         const Icon = ICONS[option.id];
         return <button key={option.id} className={styles.toolButton} aria-label={option.label} aria-pressed={!panning && tool === option.id} title={`${option.label} (${TOOL_KEYS[option.id]}) · ${option.hint}`} disabled={!!busy || playing} onClick={() => { setTool(option.id); setPanning(false); }}><Icon size={19} /><span>{option.label}</span></button>;
        })}
        <button className={styles.toolButton} aria-label="Pan" aria-pressed={panning} title="Pan (H) · Drag the zoomed canvas" onClick={() => setPanning(value => !value)}><Hand size={19} /><span>Pan</span></button>
       </div>
       <div className={styles.historyActions}>
        <button className={styles.toolButton} aria-label="Undo" title="Undo · Ctrl/⌘ Z" disabled={!state.past.length || !!busy} onClick={() => { setPlaying(false); dispatch({ type: 'undo' }); }}><Undo2 size={19} /><span>Undo</span></button>
        <button className={styles.toolButton} aria-label="Redo" title="Redo · Ctrl/⌘ Shift Z" disabled={!state.future.length || !!busy} onClick={() => { setPlaying(false); dispatch({ type: 'redo' }); }}><Redo2 size={19} /><span>Redo</span></button>
       </div>
      </div>
      <EditorCanvas
       grid={draft.grid} frame={draft.frames[selected]} palette={draft.palette} zoom={zoom} tool={tool}
       panMode={panning} disabled={!!busy || playing} mirrored={mirror} showGrid={grid}
       onionPrevious={onion ? draft.frames[selected - 1] : null} onionNext={onion ? draft.frames[selected + 1] : null}
       onPaint={point => paint([point])} onPaintSegment={paint}
       onStrokeStart={() => { if (!busy && !playing) dispatch({ type: 'begin' }); }} onStrokeEnd={() => dispatch({ type: 'end' })}
       onPick={index => { if (index === null) setStatus('Transparent cell — choose Erase to clear pixels'); else { selectPaintColor(draft.palette[index]); setStatus(`Picked ${draft.palette[index]}`); } }}
       label={`Drawing frame ${selected + 1}`} describedBy="pixel-canvas-help"
      />
     </div>
     <div className={styles.canvasStatus} id="pixel-canvas-help">
      <span>{playing ? 'Playing animation' : panning ? 'Pan · drag to move the canvas' : `${STUDIO_TOOLS.find(option => option.id === tool)?.label} · ${tool === 'eyedropper' ? 'pick a pixel color' : tool === 'fill' ? 'tap an area to fill' : 'drag to draw'}`}</span>
      <span>Frame {selected + 1} / {draft.frames.length}<kbd>H</kbd> pan<kbd>⌘ / Ctrl Z</kbd> undo</span>
     </div>

     <section className={styles.timeline} aria-label="Animation timeline" data-collapsed={!timelineOpen}>
      <div className={styles.timelineHeader}>
       <button className={styles.timelineToggle} aria-label={timelineOpen ? 'Collapse animation timeline' : 'Expand animation timeline'} aria-expanded={timelineOpen} aria-controls="pixel-timeline-frames" onClick={() => setTimelineView(timelineOpen ? 'closed' : 'open')}>
        {timelineOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<strong>Animation</strong><small>{draft.frames.length}/{MAX_CREATION_FRAMES} · {(duration / 1000).toFixed(2)}s</small>
       </button>
       <label className={styles.toggle}><input type="checkbox" checked={onion} onChange={event => setOnion(event.target.checked)} />Onion guides</label>
       <button className={styles.playButton} onClick={togglePlay} disabled={!!busy || draft.frames.length < 2}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : selected === draft.frames.length - 1 && draft.playback === 'once' ? 'Replay' : 'Play'}</button>
      </div>
      <div className={styles.timelineBody} id="pixel-timeline-frames" hidden={!timelineOpen}>
       <div className={styles.frames}>{draft.frames.map((frame, index) => (
        <button key={index} className={styles.frame} aria-pressed={selected === index} aria-label={`Frame ${index + 1}, ${frame.durationMs} milliseconds`} onClick={() => { setPlaying(false); dispatch({ type: 'select', index }); }}>
         <PixelCompanion creation={document} config={{ outfit: document.id, density: 'original' }} frame={index} autoplay={false} size={48} label={`Timeline frame ${index + 1}`} />
         <span>{index + 1}<small>{frame.durationMs}ms</small></span>
        </button>
       ))}</div>
       <div className={styles.frameControls}>
        <button className={styles.button} disabled={!!busy || draft.frames.length >= MAX_CREATION_FRAMES} onClick={() => edit(value => ({ draft: addFrame(value.draft, value.selected), selected: value.selected + 1 }))}><Plus size={15} /><span>Add</span></button>
        <button className={styles.button} disabled={!!busy || draft.frames.length >= MAX_CREATION_FRAMES} onClick={() => edit(value => ({ draft: duplicateFrame(value.draft, value.selected), selected: value.selected + 1 }))}><Copy size={15} /><span>Copy</span></button>
        <button className={styles.iconButton} aria-label="Move frame earlier" title="Move frame earlier" disabled={!!busy || selected === 0} onClick={() => edit(value => ({ draft: moveFrame(value.draft, value.selected, -1), selected: value.selected - 1 }))}><ArrowLeft size={15} /></button>
        <button className={styles.iconButton} aria-label="Move frame later" title="Move frame later" disabled={!!busy || selected === draft.frames.length - 1} onClick={() => edit(value => ({ draft: moveFrame(value.draft, value.selected, 1), selected: value.selected + 1 }))}><ArrowRight size={15} /></button>
        <button className={styles.iconButton} aria-label="Delete frame" title="Delete frame" disabled={!!busy || draft.frames.length === 1} onClick={() => edit(value => ({ draft: deleteFrame(value.draft, value.selected), selected: Math.max(0, value.selected - 1) }))}><Trash2 size={15} /></button>
        <label>Duration<input aria-label="Frame duration" type="number" min={MIN_FRAME_MS} max={MAX_FRAME_MS} step={10} key={`${draft.id}:${selected}:${draft.frames[selected].durationMs}`} defaultValue={draft.frames[selected].durationMs} disabled={!!busy} onFocus={() => dispatch({ type: 'begin' })} onBlur={event => { const value = event.currentTarget.value; if (value.trim() !== '' && Number.isFinite(Number(value))) edit(snapshot => ({ ...snapshot, draft: setFrameDuration(snapshot.draft, snapshot.selected, Number(value)) })); else event.currentTarget.value = String(draft.frames[selected].durationMs); dispatch({ type: 'end' }); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />ms</label>
       </div>
      </div>
      {onion && timelineOpen && <p className={styles.onionHint}>Cyan: previous · Pink: next · Guides are never saved</p>}
      {duration > MAX_TOTAL_MS && <p role="alert">Animation must be 30 seconds or less before saving.</p>}
     </section>
    </div>

    <aside ref={inspectorRef} id="pixel-inspector" className={styles.inspector} data-open={inspectorVisible} role={!isWide && mobilePanelOpen ? 'dialog' : undefined} aria-modal={!isWide && mobilePanelOpen ? true : undefined} aria-label="Studio settings">
     <div className={styles.inspectorHeader}><div><span>Studio settings</span><strong>Make it yours</strong></div><button className={styles.iconButton} aria-label="Close studio settings" onClick={() => isWide ? setInspectorCollapsed(true) : setMobilePanelOpen(false)}><X size={17} /></button></div>
     <div className={styles.inspectorBody}>
      <details open className={styles.previewPanel}>
       <summary>Live preview</summary>
       <div className={styles.tabs} role="group" aria-label="Preview context"><button aria-pressed={context === 'artwork'} onClick={() => setContext('artwork')}>Artwork</button><button aria-pressed={context === 'dashboard'} onClick={() => setContext('dashboard')}>Dashboard</button></div>
       <div className={styles.preview}><PixelCompanion creation={document} displayBorder={border} pixelGap={pixelGap} config={context === 'artwork' ? { outfit: document.id, density: 'original', pedestal: 'none', aura: 'none' } : previewConfig} frame={selected} autoplay={false} label={`Studio ${context} preview`} /></div>
       <p className={styles.hint}>{context === 'artwork' ? `Frame ${selected + 1} · ${draft.grid} × ${draft.grid} pixels` : 'Your dashboard appearance · current frame'}</p>
       <label className={styles.playback}>Dashboard playback<select value={draft.playback} disabled={!!busy} onChange={event => edit(value => ({ ...value, draft: { ...value.draft, playback: event.target.value as 'loop' | 'once' } }))}><option value="loop">Repeat</option><option value="once">Once</option></select></label>
      </details>
      <section className={styles.borderPanel} aria-label="Display border">
       <h3>Display finish</h3>
       <label className={styles.borderToggle}><span>Show border</span><input type="checkbox" checked={border !== 'none'} disabled={!!busy} onChange={event => edit(value => ({ ...value, draft: { ...value.draft, displayBorder: event.target.checked ? DEFAULT_DISPLAY_BORDER : 'none' } }))} /></label>
       <HexColorPicker label="Border color" value={border === 'none' ? DEFAULT_DISPLAY_BORDER : border} disabled={!!busy || border === 'none'} onChange={displayBorder => edit(value => ({ ...value, draft: { ...value.draft, displayBorder } }))} />
       <label className={styles.spacingControl}>Pixel spacing<output>{Math.round(pixelGap * 100)}%</output><input type="range" aria-label="Pixel spacing" min={0} max={30} step={1} value={Math.round(pixelGap * 100)} disabled={!!busy} onPointerDown={() => dispatch({ type: 'begin' })} onPointerUp={() => dispatch({ type: 'end' })} onPointerCancel={() => dispatch({ type: 'end' })} onFocus={() => dispatch({ type: 'begin' })} onBlur={() => dispatch({ type: 'end' })} onChange={event => edit(value => ({ ...value, draft: { ...value.draft, pixelGap: Number(event.target.value) / 100 } }))} /></label>
       <p className={styles.hint}>0% keeps pixels joined. Your drawing stays intact; these settings change how it is displayed.</p>
      </section>
      <p className={styles.inspectorFootnote}>Save applies your artwork and display settings. Save & equip puts this companion on your dashboard.</p>
     </div>
    </aside>
   </div>
  {newDialog && <div className={styles.overlay}><section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="New drawing"><h2>Choose your drawing grid</h2><p>More pixels allow finer detail. This stays fixed while zoom and Pixel Size can change.</p><select aria-label="Authored grid" value={newGrid} onChange={event => setNewGrid(Number(event.target.value))}>{CREATION_ALLOWED_SIZES.map(size => <option key={size} value={size}>{size} × {size}</option>)}</select><div className={styles.saveActions}><button onClick={() => setNewDialog(false)}>Cancel</button><button className={styles.primary} onClick={() => { if (dirty && !window.confirm('Discard this unsaved draft and start a new drawing?')) return; dispatch({ type: 'load', value: { draft: { ...createDraft(newGrid), displayBorder: normalizeDisplayBorder(characterConfig.displayBorder), pixelGap: normalizePixelGap(characterConfig.pixelGap, true) }, selected: 0 } }); setBaseline(''); setRevision(0); setNewDialog(false); setPlaying(false); setStatus('New drawing'); }}>Create drawing</button></div></section></div>}
  {gallery && <div className={styles.overlay}><section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Your drawings"><div className={styles.timelineHeader}><h2>Your drawings</h2><button onClick={() => setGallery(false)}>Close</button></div>{library.loading && <p>Refreshing drawings…</p>}{library.error && <p role="alert">{library.error} <button onClick={library.retry}>Retry</button></p>}{library.loaded && !library.creations.length && <p>Your first companion starts on the canvas.</p>}<div className={styles.gallery}>{library.creations.map(item => <article key={item.id}><PixelCompanion creation={item.data} revision={item.revision} config={{ outfit: item.data.id, density: 'original' }} size={100} autoplay={false} label={item.name} /><strong>{item.name}</strong><small>{item.grid} × {item.grid} · {characterConfig.outfit === item.data.id ? 'Equipped' : 'Saved'}</small><button className={styles.button} onClick={() => loadDrawing(item)} disabled={!!busy}>Open</button><button className={styles.button} onClick={() => void remove(item)} disabled={!!busy}>Delete</button></article>)}</div></section></div>}
  </section>
 );
}
