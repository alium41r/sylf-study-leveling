import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { PixelCreation } from '@/lib/pixel-display/content/asset';

const url = process.env.PIXEL_TEST_DATABASE_URL;
describe.runIf(Boolean(url))('real PostgreSQL companion persistence', () => {
  let service: typeof import('@/lib/pixel-creation-service');
  let prisma: typeof import('@/lib/prisma')['prisma'];
  let first: number, second: number;
  const drawing = (slug: string, name = '同じ名前'): PixelCreation => ({ version: 1, id: `user:${slug}`, name, grid: 32, palette: ['#ffffff'], playback: 'once', frames: [{ durationMs: 240, rows: ['0' + '.'.repeat(31), ...Array(31).fill('.'.repeat(32))] }] });
  beforeAll(async () => {
    if (new URL(url!).hostname !== '127.0.0.1') throw new Error('Disposable database required');
    service = await import('@/lib/pixel-creation-service'); ({ prisma } = await import('@/lib/prisma'));
    first = (await prisma.user.create({ data: { email: 'pixel1@test.invalid', username: 'pixel1', password: 'fixture' } })).id;
    second = (await prisma.user.create({ data: { email: 'pixel2@test.invalid', username: 'pixel2', password: 'fixture' } })).id;
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  it('keeps stable IDs through rename and makes lost-response retries idempotent', async () => {
    const one = await service.savePixelCreation(first, drawing('stable'), 0);
    const again = await service.savePixelCreation(first, drawing('stable'), 0);
    expect(again.revision).toBe(1); expect(again.id).toBe(one.id);
    const renamed = await service.savePixelCreation(first, drawing('stable', 'Renamed'), 1);
    expect(renamed.id).toBe(one.id); expect(renamed.revision).toBe(2);
    await expect(service.savePixelCreation(first, drawing('stable', 'Stale'), 1)).rejects.toMatchObject({ status: 409 });
  });
  it('does not confuse identical owner-scoped legacy slugs and rejects unowned equip', async () => {
    await service.savePixelCreation(second, drawing('stable', 'Other owner'), 0);
    await prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { outfit: 'user:stable' }));
    await expect(prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { outfit: 'user:not-mine' }))).rejects.toMatchObject({ code: 'invalid-selection' });
    await prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { displayBorder: '#D74398', pixelGap: 0.3 }));
    await expect(prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { displayBorder: 'url(unsafe)' }))).rejects.toMatchObject({ code: 'invalid-display-border' });
    await expect(prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { pixelGap: '0.2' }))).rejects.toMatchObject({ code: 'invalid-pixel-gap' });
    await expect(prisma.$transaction(tx => service.validateCompanionSelection(tx, first, { pixelGap: 0.31 }))).rejects.toMatchObject({ code: 'invalid-pixel-gap' });
  });
  it('atomically repairs an equipped reference when deleting', async () => {
    await prisma.user.update({ where: { id: second }, data: { characterConfig: { outfit: 'user:stable', density: 'original' } } });
    await expect(service.deletePixelCreation(second, 'stable')).rejects.toMatchObject({ status: 400, code: 'revision-required' });
    await expect(service.deletePixelCreation(second, 'stable', 2)).rejects.toMatchObject({ status: 409 });
    const result = await service.deletePixelCreation(second, 'stable', 1);
    expect(result.unequipped).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: second } })).characterConfig).toMatchObject({ outfit: 'none' });
  });
  it('serializes concurrent quota checks and revision writers', async () => {
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, n) => service.savePixelCreation(second, drawing(`quota-${n}`), 0)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(24);
    expect(await prisma.pixelCreation.count({ where: { userId: second } })).toBe(24);
    const writes = await Promise.allSettled([service.savePixelCreation(first, drawing('stable', 'Tab A'), 2), service.savePixelCreation(first, drawing('stable', 'Tab B'), 2)]);
    expect(writes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('enforces RLS even if an external grant is reintroduced, and denies anonymous access', async () => {
    const pool = new pg.Pool({ connectionString: url }), client = await pool.connect();
    try {
      expect((await client.query(`SELECT relrowsecurity FROM pg_class WHERE relname='PixelCreation'`)).rows[0].relrowsecurity).toBe(true);
      expect((await client.query(`SELECT has_table_privilege('authenticated', '"PixelCreation"', 'SELECT') AS allowed`)).rows[0].allowed).toBe(false);
      await client.query('BEGIN'); await client.query('GRANT SELECT, UPDATE ON "PixelCreation" TO authenticated');
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ userId: first })]);
      await client.query('SET LOCAL ROLE authenticated');
      const rows = (await client.query('SELECT "userId" FROM "PixelCreation"')).rows;
      expect(rows.length).toBe(1); expect(rows.every(row => row.userId === first)).toBe(true);
      await expect(client.query('UPDATE "PixelCreation" SET "userId"=$1 WHERE "userId"=$2', [second, first])).rejects.toThrow(/row-level security/);
      await client.query('ROLLBACK');
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE anon');
      await expect(client.query('SELECT * FROM "PixelCreation"')).rejects.toThrow(/permission denied/);
      await client.query('ROLLBACK');
    } finally { client.release(); await pool.end(); }
  });
  it('resolves selected target-owner art, privacy and blocks without exposing libraries', async () => {
    const { selectedCompanionsForUsers } = await import('@/lib/pixel-companion-service');
    const white = drawing('quota-0', 'Viewer artwork'), green = { ...drawing('quota-0', 'Target artwork'), palette: ['#00ff00'] };
    await service.savePixelCreation(first, white, 0);
    await service.savePixelCreation(second, green, 1);
    await prisma.user.update({ where: { id: first }, data: { characterConfig: { outfit: white.id, density: 'original' } } });
    await prisma.user.update({ where: { id: second }, data: { characterConfig: { outfit: green.id, density: 'chunky', displayBorder: '#d74398', pixelGap: 0.18, seed: 'private-metadata' } } });
    await prisma.userPrivacy.create({ data: { userId: second, profileVisibility: 'PUBLIC' } });
    const target = (await selectedCompanionsForUsers([first, second, second], first, 'public')).get(second)!;
    expect(target.ownerId).toBe(second); expect(target.creation?.palette).toEqual(['#00ff00']);
    expect(target.creation?.name).toBe('Target artwork'); expect(target.creation?.frames).toHaveLength(1);
    expect(target.config).toEqual({ outfit: green.id, density: 'chunky', aura: 'none', displayBorder: '#d74398', pixelGap: 0.18 });
    await prisma.userPrivacy.update({ where: { userId: second }, data: { profileVisibility: 'FRIENDS' } });
    expect((await selectedCompanionsForUsers([second], first, 'public')).get(second)?.creation).toBeNull();
    expect((await selectedCompanionsForUsers([second], first, 'friends')).get(second)?.creation?.name).toBe('Target artwork');
    await prisma.userPrivacy.update({ where: { userId: second }, data: { profileVisibility: 'PRIVATE' } });
    expect((await selectedCompanionsForUsers([second], first, 'friends')).get(second)?.creation).toBeNull();
    expect((await selectedCompanionsForUsers([second], first, 'party')).get(second)?.creation?.name).toBe('Target artwork');
    await prisma.blockedUser.create({ data: { userId: second, blockedId: first } });
    expect((await selectedCompanionsForUsers([second], first, 'party')).get(second)).toMatchObject({ unavailable: true, creation: null, config: null });
    expect((await selectedCompanionsForUsers([second], second, 'public')).get(second)?.creation?.name).toBe('Target artwork');
  });
  it('rejects legacy blank selections while retaining the document for editing', async () => {
    const owner = (await prisma.user.create({ data: { email: 'pixelblank@test.invalid', username: 'pixelblank', password: 'fixture' } })).id;
    const blank = { ...drawing('legacy-blank'), frames: [{ durationMs: 240, rows: Array(32).fill('.'.repeat(32)) }] };
    await service.savePixelCreation(owner, blank, 0);
    await prisma.user.update({ where: { id: owner }, data: { characterConfig: { outfit: blank.id } } });
    const { selectedCompanionsForUsers } = await import('@/lib/pixel-companion-service');
    expect((await selectedCompanionsForUsers([owner], owner, 'public')).get(owner)).toMatchObject({ creation: null, unavailable: true });
    await expect(prisma.$transaction(tx => service.validateCompanionSelection(tx, owner, { outfit: blank.id }))).rejects.toMatchObject({ code: 'empty-selection' });
    expect(await prisma.pixelCreation.count({ where: { userId: owner } })).toBe(1);
  });
  it('saves and equips a drawing painted entirely with the sixteenth swatch', async () => {
    const owner = (await prisma.user.create({ data: { email: 'pixelcolor@test.invalid', username: 'pixelcolor', password: 'fixture' } })).id;
    const document = { ...drawing('sixteenth'), palette: Array.from({ length: 16 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`), frames: [{ durationMs: 240, rows: Array(32).fill('f'.repeat(32)) }] };
    const stored = await service.savePixelCreation(owner, document, 0);
    await prisma.$transaction(tx => service.validateCompanionSelection(tx, owner, { outfit: document.id, pixelGap: 0, displayBorder: '#d74398' }));
    expect(stored.data).toEqual(document);
  });
});
