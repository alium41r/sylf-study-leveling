"use client";
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PixelDisplay, type PixelDisplayHandle } from '@/lib/pixel-display/react/PixelDisplay';
import { usePrefersReducedMotion } from '@/lib/pixel-display/react/usePixRuntime';
import { creationToAsset, createAssetLookup, REFERENCE_ASSETS, type ModularComposition, type PixelCreation } from '@/lib/pixel-display/content/asset';
import type { SylfContentOptions } from '@/lib/pixel-display/content';
import { resolveEquippedCharacter, type EquippedConfig } from '@/app/dashboard/pixel-modular-character';
import { resolutionForDensity } from '@/app/locker/components/identity/pixel-customizer-options';
import styles from '@/app/dashboard/components/PixelCompanionCard.module.css';
import { normalizeDisplayBorder, normalizePixelGap } from '@/lib/pixel-display-style';
import { PixelArtworkPlaceholder, type PixelArtworkPlaceholderProps } from './PixelArtworkPlaceholder';

const catalogue = createAssetLookup(REFERENCE_ASSETS);
/** Explicit target-owner data. This presenter never reads Auth, a library or reactions. */
export interface PixelCompanionProps {
 config?: EquippedConfig | null; creation?: PixelCreation | null; revision?: number;
 composition?: ModularComposition | null; resolution?: number; size?: number | string;
 displayBorder?: string | null;
 pixelGap?: number | null;
 emptyState?: PixelArtworkPlaceholderProps;
 frame?: number | null; autoplay?: boolean; content?: Omit<SylfContentOptions, 'composition' | 'frame'>;
 className?: string; label?: string; onReady?: (handle: PixelDisplayHandle) => void; onTeardown?: () => void;
}
export function PixelCompanion({ config, creation, revision, composition, resolution, displayBorder, pixelGap, size = '100%', frame, autoplay = true, content, className, label = 'Pixel companion', emptyState, onReady, onTeardown }: PixelCompanionProps) {
 const live = useRef<PixelDisplayHandle | null>(null);
 const reducedMotion = usePrefersReducedMotion();
 const asset = useMemo(() => creation ? creationToAsset(creation, { revision }) : null, [creation, revision]);
 const resolved = useMemo(() => composition ?? resolveEquippedCharacter(config, { lookup: catalogue, creations: asset ? [asset] : [] }).composition, [composition, config, asset]);
 const density = resolution ?? resolutionForDensity(config?.density, resolved.base.id.startsWith('user:') ? resolved.base.reference.width : undefined);
 const options = useMemo<SylfContentOptions>(() => ({ state: 'IDLE', autoBlink: false, reducedMotion, ...content, composition: resolved, frame: frame ?? (autoplay ? null : 0) }), [content, resolved, reducedMotion, frame, autoplay]);
 const ready = useCallback((handle: PixelDisplayHandle) => {
   live.current = handle;
   if (process.env.NODE_ENV === 'development') {
     const host = window as unknown as { __pixelDisplays?: Map<string, PixelDisplayHandle> };
     (host.__pixelDisplays ??= new Map()).set(label, handle);
   }
   onReady?.(handle);
 }, [onReady, label]);
 const teardown = useCallback(() => {
   live.current = null;
   if (process.env.NODE_ENV === 'development') (window as unknown as { __pixelDisplays?: Map<string, PixelDisplayHandle> }).__pixelDisplays?.delete(label);
   onTeardown?.();
 }, [onTeardown, label]);
 useEffect(() => {
   if (process.env.NODE_ENV !== 'development') return;
   const host = window as unknown as { __pixelDisplays?: Map<string, PixelDisplayHandle> };
   if (live.current) (host.__pixelDisplays ??= new Map()).set(label, live.current);
   return () => { host.__pixelDisplays?.delete(label); };
 }, [label]);
 const border = normalizeDisplayBorder(displayBorder ?? config?.displayBorder);
 const gap = normalizePixelGap(pixelGap ?? config?.pixelGap, true);
 return <div className={`${styles.slot} ${className ?? ''}`} style={{ '--pixel-card-size': typeof size === 'number' ? `${size}px` : size, outline: border === 'none' ? undefined : `2px solid ${border}` } as React.CSSProperties} data-companion="pixel-display" data-empty={resolved.base.id === 'pixel:empty'} data-density={density} data-owner-art={creation?.id ?? resolved.base.id} data-display-border={border} data-pixel-gap={gap}>
   {resolved.base.id === 'pixel:empty' ? <PixelArtworkPlaceholder {...emptyState} /> : <PixelDisplay width={density} height={density} content={options} presentation={{ backdrop: 0x000000ff, gap }} ariaLabel={label} onReady={ready} onTeardown={teardown} />}
 </div>;
}
