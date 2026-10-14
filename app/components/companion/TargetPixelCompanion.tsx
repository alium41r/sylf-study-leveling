"use client";
import type { SelectedPixelCompanion } from '@/lib/pixel-companion-contract';
import type { EquippedConfig } from '@/app/dashboard/pixel-modular-character';
import { PixelCompanion } from './PixelCompanion';
/** Intentionally accepts no viewer library, config fallback or reaction props. */
export function TargetPixelCompanion({ companion, size, label, autoplay = false }: { companion?: SelectedPixelCompanion | null; size: number | string; label: string; autoplay?: boolean }) {
 return <div data-companion-owner={companion?.ownerId ?? "unavailable"}><PixelCompanion emptyState={{ status: companion?.unavailable ? "Artwork unavailable" : undefined }} config={companion?.config as EquippedConfig | null} creation={companion?.creation} revision={companion?.revision ?? undefined} size={size} label={label} autoplay={autoplay} />{companion?.unavailable && <span className="text-xs text-text-secondary">Companion unavailable</span>}</div>;
}
