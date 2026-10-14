import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { hasCreationPixels, type PixelCreation } from './pixel-display/content/asset';
import { normalizeDisplayBorder } from './pixel-display-style';

export class PixelCreationError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export const creationSelection = { id: true, slug: true, name: true, grid: true, version: true, revision: true, data: true, updatedAt: true } as const;

// All creation/equip/delete mutations serialize on the same owner row. This
// protects quota and references without coupling artwork to progression writes.
export async function lockCompanionOwner(tx: Prisma.TransactionClient, userId: number) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}
export { hasCreationPixels } from "./pixel-display/content/asset";
export async function validateCompanionSelection(tx: Prisma.TransactionClient, userId: number, config: unknown) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return;
  const { outfit, density, displayBorder, pixelGap } = config as { outfit?: unknown; density?: unknown; displayBorder?: unknown; pixelGap?: unknown };
  if (displayBorder !== undefined && displayBorder !== 'none' && normalizeDisplayBorder(displayBorder) === 'none') throw new PixelCreationError('Choose a six-digit hex display border color.', 400, 'invalid-display-border');
  if (pixelGap !== undefined && (typeof pixelGap !== 'number' || !Number.isFinite(pixelGap) || pixelGap < 0 || pixelGap > 0.3)) throw new PixelCreationError('Choose Pixel spacing between 0 and 30 percent.', 400, 'invalid-pixel-gap');
  if (density !== undefined && !['original', 'chunky', 'balanced', 'detailed', 'finest'].includes(String(density))) throw new PixelCreationError('Choose a supported Pixel Size.', 400, 'invalid-density');
  if (typeof outfit !== 'string' || !outfit.startsWith('user:')) return;
  const selected = await tx.pixelCreation.findUnique({ where: { userId_slug: { userId, slug: outfit.slice(5) } }, select: { data: true } });
  if (!selected) throw new PixelCreationError('This drawing no longer exists in your library.', 400, 'invalid-selection');
  if (!hasCreationPixels(selected.data)) throw new PixelCreationError('Draw at least one pixel before equipping this companion.', 400, 'empty-selection');
}
export async function savePixelCreation(userId: number, document: PixelCreation, expectedRevision: unknown) {
  return prisma.$transaction(async tx => {
    await lockCompanionOwner(tx, userId);
    const slug = document.id.slice(5);
    const existing = await tx.pixelCreation.findUnique({ where: { userId_slug: { userId, slug } } });
    if (existing) {
      // A lost response can be retried safely without a second revision/write.
      if (isDeepStrictEqual(existing.data, document)) return tx.pixelCreation.findUniqueOrThrow({ where: { id: existing.id }, select: creationSelection });
      if (expectedRevision !== existing.revision) throw new PixelCreationError('Another tab saved a newer version. Reopen it or save your draft as a copy.', 409, 'revision-conflict');
      if (existing.grid !== document.grid) throw new PixelCreationError('The authored grid of an existing drawing cannot change. Save a new copy.', 400, 'immutable-grid');
      const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { characterConfig: true } });
      const cfg = owner.characterConfig as { outfit?: string } | null;
      if (cfg?.outfit === document.id && !hasCreationPixels(document)) throw new PixelCreationError('An equipped companion cannot be empty. Clear your display or equip another drawing before clearing this one.', 400, 'empty-equipped');
      return tx.pixelCreation.update({ where: { id: existing.id }, data: { name: document.name, data: document as unknown as Prisma.InputJsonValue, revision: { increment: 1 } }, select: creationSelection });
    }
    if (expectedRevision !== undefined && expectedRevision !== 0) throw new PixelCreationError('This drawing was deleted. Save your draft as a copy.', 409, 'deleted-creation');
    if (await tx.pixelCreation.count({ where: { userId } }) >= 24) throw new PixelCreationError('Your library holds up to 24 drawings. Delete one to save another.', 409, 'quota');
    return tx.pixelCreation.create({ data: { userId, slug, name: document.name, grid: document.grid, version: document.version, data: document as unknown as Prisma.InputJsonValue }, select: creationSelection });
  });
}
export async function deletePixelCreation(userId: number, slug: string, expectedRevision?: number) {
  return prisma.$transaction(async tx => {
    await lockCompanionOwner(tx, userId);
    const creation = await tx.pixelCreation.findUnique({ where: { userId_slug: { userId, slug } }, select: { id: true, revision: true } });
    if (creation && (!Number.isInteger(expectedRevision) || expectedRevision! < 1)) throw new PixelCreationError('Refresh this drawing before deleting it.', 400, 'revision-required');
    if (creation && creation.revision !== expectedRevision) throw new PixelCreationError('This drawing changed in another tab. Refresh before deleting.', 409, 'revision-conflict');
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { characterConfig: true } });
    const config = (user.characterConfig ?? {}) as Record<string, Prisma.JsonValue>;
    const equipped = config.outfit === `user:${slug}`;
    if (equipped) await tx.user.update({ where: { id: userId }, data: { characterConfig: { ...config, outfit: 'none', density: 'original' } } });
    if (creation) await tx.pixelCreation.delete({ where: { id: creation.id } });
    return { ok: true, unequipped: equipped, characterConfig: equipped ? { ...config, outfit: 'none', density: 'original' } : undefined };
  });
}
