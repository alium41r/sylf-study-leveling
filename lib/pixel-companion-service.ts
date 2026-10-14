import { prisma } from './prisma';
import type { SelectedPixelCompanion } from './pixel-companion-contract';
import { hasCreationPixels, validateCreation, type PixelCreation } from './pixel-display/content/asset';
import { normalizeDisplayBorder, normalizePixelGap } from './pixel-display-style';

/** Call only after the existing owner authorizes the profile/friend/party scope. */
export async function selectedCompanionsForUsers(ids: readonly number[], viewerId: number | null, scope: 'public' | 'friends' | 'party', staticFrame = true): Promise<Map<number, SelectedPixelCompanion>> {
 const unique = [...new Set(ids)].filter(Number.isInteger);
 if (!unique.length) return new Map();
 const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, characterConfig: true, activeAura: true, privacy: { select: { profileVisibility: true } } } });
 // Existing party membership is an authorization scope; blocks still win.
 const blocks = viewerId === null ? [] : await prisma.$queryRaw<Array<{ userId: number; blockedId: number }>>`SELECT "userId", "blockedId" FROM "BlockedUser" WHERE "userId"=${viewerId} OR "blockedId"=${viewerId}`;
 const blocked = new Set(blocks.map(row => row.userId === viewerId ? row.blockedId : row.userId));
 const permitted = users.filter(user => user.id === viewerId || (!blocked.has(user.id) && (scope === 'party' || user.privacy?.profileVisibility !== 'PRIVATE') && (scope !== 'public' || !user.privacy || user.privacy.profileVisibility === 'PUBLIC')));
 const references = permitted.flatMap(user => { const config = user.characterConfig as Record<string, unknown> | null; return typeof config?.outfit === 'string' && config.outfit.startsWith('user:') ? [{ userId: user.id, slug: config.outfit.slice(5) }] : []; });
 const rows = references.length ? await prisma.pixelCreation.findMany({ where: { OR: references }, select: { userId: true, slug: true, revision: true, data: true } }) : [];
 const permittedIds = new Set(permitted.map(user => user.id)), art = new Map(rows.map(row => [`${row.userId}:${row.slug}`, row]));
 return new Map<number, SelectedPixelCompanion>(users.map(user => {
   if (!permittedIds.has(user.id)) return [user.id, { ownerId: user.id, config: null, creation: null, revision: null, unavailable: true }];
   const raw = user.characterConfig && typeof user.characterConfig === 'object' && !Array.isArray(user.characterConfig) ? { ...user.characterConfig as Record<string, unknown> } : {};
   const cfg: Record<string, unknown> = {};
   for (const key of ['outfit', 'pedestal', 'pedestalKey', 'aura', 'relic', 'weapon', 'accessory', 'density']) if (typeof raw[key] === 'string') cfg[key] = raw[key];
   cfg.displayBorder = normalizeDisplayBorder(raw.displayBorder);
   cfg.pixelGap = normalizePixelGap(raw.pixelGap, typeof cfg.outfit === 'string' && cfg.outfit.startsWith('user:'));
   if (cfg.aura === undefined) cfg.aura = user.activeAura;
   const selected = typeof cfg.outfit === 'string' && cfg.outfit.startsWith('user:') ? art.get(`${user.id}:${cfg.outfit.slice(5)}`) : undefined;
   const document = selected && validateCreation(selected.data).length === 0 && hasCreationPixels(selected.data) ? selected.data as unknown as PixelCreation : null;
   const creation = document && staticFrame ? { ...document, frames: [document.frames[0]], playback: 'once' as const } : document;
   return [user.id, { ownerId: user.id, config: cfg, creation, revision: selected?.revision ?? null, unavailable: typeof cfg.outfit === 'string' && cfg.outfit.startsWith('user:') && !creation }];
 }));
}
