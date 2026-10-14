"use client";
import { useMemo } from 'react';
import { useAuth } from '@/app/components/AuthProvider';
import { usePixelCreations } from '@/lib/pixel-creations-client';
import { createAssetLookup, REFERENCE_ASSETS } from '@/lib/pixel-display/content/asset';
import { resolveEquippedCharacter, type EquippedConfig } from '@/app/dashboard/pixel-modular-character';
import { resolutionForDensity } from '@/app/locker/components/identity/pixel-customizer-options';
import { PixelCompanion } from './PixelCompanion';
const lookup = createAssetLookup(REFERENCE_ASSETS);
export function OwnCompanionPreview({ config, size, label = 'Your companion preview', showCompatibility = false }: { config?: EquippedConfig; size: number | string; label?: string; showCompatibility?: boolean }) {
 const { user } = useAuth(), library = usePixelCreations(user?.id);
 const selected = config ?? user?.characterConfig;
 const resolved = useMemo(() => {
   const candidate = resolveEquippedCharacter(selected, { lookup, creations: library.assets });
   if (config && selected?.outfit !== user?.characterConfig?.outfit && candidate.degraded.some(item => item.slot === 'form')) {
     const current = resolveEquippedCharacter({ ...selected, outfit: user?.characterConfig?.outfit }, { lookup, creations: library.assets });
     return { ...current, degraded: [...current.degraded, ...candidate.degraded] };
   }
   return candidate;
 }, [config, selected, user?.characterConfig?.outfit, library.assets]);
 const density = resolutionForDensity(selected?.density, resolved.composition.base.id.startsWith('user:') ? resolved.composition.base.reference.width : undefined);
 const awaitingArtwork = typeof selected?.outfit === 'string' && selected.outfit.startsWith('user:') && !library.loaded;
 return <div style={{ maxWidth: '100%' }}><PixelCompanion emptyState={{ status: awaitingArtwork ? (library.error ? 'Artwork unavailable' : 'Loading artwork…') : undefined }} composition={resolved.composition} displayBorder={selected?.displayBorder} pixelGap={selected?.pixelGap} resolution={density} size={size} autoplay={false} label={label} />{awaitingArtwork && <p role="status">{library.error ?? 'Loading your equipped drawing…'}{library.error && <button onClick={library.retry}>Retry</button>}</p>}{showCompatibility && resolved.degraded.length > 0 && <p className="text-xs text-text-secondary mt-3">This equipment has no compatible Pixel appearance. Ownership and stat bonuses remain active.</p>}</div>;
}
