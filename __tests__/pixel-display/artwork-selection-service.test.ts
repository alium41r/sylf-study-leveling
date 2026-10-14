import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), owner: vi.fn(), update: vi.fn(), creation: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: database.transaction } }));
import { deletePixelCreation } from '@/lib/pixel-creation-service';

beforeEach(() => {
  vi.clearAllMocks();
  database.owner.mockResolvedValue({ characterConfig: { outfit: 'user:moon', pedestal: 'pedestal_meadow', displayBorder: '#ff00ff' } });
  database.creation.mockResolvedValue({ id: 'saved-moon', revision: 4 });
  database.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $queryRaw: database.lock,
    user: { findUniqueOrThrow: database.owner, update: database.update },
    pixelCreation: { findUnique: database.creation, delete: database.remove },
  }));
});

describe('deleting artwork clears the selected display atomically', () => {
  it('clears an equipped drawing without restoring a built-in character', async () => {
    const result = await deletePixelCreation(12, 'moon', 4);
    expect(database.lock).toHaveBeenCalledOnce();
    expect(database.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { characterConfig: { outfit: 'none', density: 'original', pedestal: 'pedestal_meadow', displayBorder: '#ff00ff' } } });
    expect(database.remove).toHaveBeenCalledWith({ where: { id: 'saved-moon' } });
    expect(result).toMatchObject({ unequipped: true, characterConfig: { outfit: 'none', density: 'original' } });
  });

  it('does not change the equipped artwork when another drawing is deleted', async () => {
    database.owner.mockResolvedValue({ characterConfig: { outfit: 'user:star' } });
    expect(await deletePixelCreation(12, 'moon', 4)).toMatchObject({ unequipped: false });
    expect(database.update).not.toHaveBeenCalled();
    expect(database.remove).toHaveBeenCalledOnce();
  });

  it('retains artwork and selection when another tab has saved a newer revision', async () => {
    await expect(deletePixelCreation(12, 'moon', 3)).rejects.toMatchObject({ code: 'revision-conflict' });
    expect(database.update).not.toHaveBeenCalled();
    expect(database.remove).not.toHaveBeenCalled();
  });
});
