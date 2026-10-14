"use client";
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchCachedJSON, invalidateClientCache } from './client-data-cache';
import { creationToAsset, hasCreationPixels, validateCreation, type PixelAsset, type PixelCreation } from './pixel-display/content/asset';

export interface StoredPixelCreation { id: string; slug: string; name: string; grid: number; revision: number; data: PixelCreation; updatedAt?: string }
interface Snapshot { creations: readonly StoredPixelCreation[]; assets: readonly PixelAsset[]; loading: boolean; loaded: boolean; error: string | null }
const EMPTY: Snapshot = { creations: [], assets: [], loading: false, loaded: false, error: null };
interface Entry { snapshot: Snapshot; listeners: Set<() => void>; epoch: number; pending: Promise<void> | null }
const owners = new Map<number, Entry>();
function entry(owner: number) { let value = owners.get(owner); if (!value) { value = { snapshot: EMPTY, listeners: new Set(), epoch: 0, pending: null }; owners.set(owner, value); } return value; }
function emit(value: Entry, patch: Partial<Snapshot>) { value.snapshot = { ...value.snapshot, ...patch }; value.listeners.forEach(fn => fn()); }
const key = (owner: number) => `pixel-creations:${owner}`;
async function load(owner: number): Promise<void> {
  const value = entry(owner);
  if (value.pending) return value.pending;
  const epoch = value.epoch;
  emit(value, { loading: true, error: null });
  value.pending = (async () => {
    const result = await fetchCachedJSON<{ creations: StoredPixelCreation[] }>('/api/pixel-creations', { credentials: 'include' }, { storageKey: key(owner), ttlMs: 30000, staleMs: 30000 });
    if (value.epoch !== epoch) return;
    if (!result) { emit(value, { loading: false, error: 'Could not refresh your drawings. Your last loaded artwork is kept. Retry when connected.' }); return; }
    const creations = result.creations.filter(item => validateCreation(item.data).length === 0);
    // Keep blank documents in the editor library, but never resolve them as an
    // equipped companion (including selections saved by pre-consolidation builds).
    const assets = creations.flatMap(item => { if (!hasCreationPixels(item.data)) return []; const asset = creationToAsset(item.data, { name: item.name, revision: item.revision }); return asset ? [asset] : []; });
    emit(value, { creations, assets, loading: false, loaded: true, error: null });
  })().finally(() => { if (value.epoch === epoch) value.pending = null; });
  return value.pending;
}
let channel: BroadcastChannel | null = null;
let listening = false;
function ensureChannel() {
  if (typeof window !== "undefined" && !listening) {
    listening = true;
    const refresh = () => { if (!document.hidden) for (const [owner, value] of owners) if (value.listeners.size) invalidatePixelCreations(owner, false); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
  }
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('sylf-pixel-creations');
    channel.onmessage = event => { const owner = event.data?.owner; if (Number.isInteger(owner) && owners.has(owner)) invalidatePixelCreations(owner, false); };
  }
}
export function invalidatePixelCreations(owner?: number, broadcast = true) {
  for (const id of owner === undefined ? owners.keys() : [owner]) {
    const value = entry(id); value.epoch++; value.pending = null;
    invalidateClientCache(key(id));
    if (value.listeners.size) void load(id);
    if (broadcast) { ensureChannel(); channel?.postMessage({ owner: id }); }
  }
}
export function usePixelCreations(owner?: number | null) {
  const subscribe = useCallback((listener: () => void) => { if (!owner) return () => {}; const value = entry(owner); value.listeners.add(listener); return () => value.listeners.delete(listener); }, [owner]);
  const snapshot = useCallback(() => owner ? entry(owner).snapshot : EMPTY, [owner]);
  const result = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => {
    if (!owner) return;
    ensureChannel(); void load(owner);

  }, [owner]);
  return { ...result, retry: () => owner && invalidatePixelCreations(owner, false) };
}

/** Logout clears in-memory artwork and invalidates in-flight results. */
export function clearPixelCreations() {
  for (const value of owners.values()) { value.epoch++; value.pending = null; value.snapshot = EMPTY; value.listeners.forEach(fn => fn()); }
  owners.clear();
}
