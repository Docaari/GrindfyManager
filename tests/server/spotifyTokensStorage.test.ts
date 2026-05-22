/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — ADR-190 § Migration 0077
 *
 * Module: server/storage/spotifyTokensStorage.ts
 *
 * Exporta:
 *  - getSpotifyToken(userId): SpotifyTokenRow | null
 *  - upsertSpotifyToken(row): void  (ON CONFLICT user_id DO UPDATE)
 *  - markSpotifyDisconnected(userId, reason): void
 *  - incrementRefreshFailureCount(userId): void
 *  - resetRefreshFailureCount(userId): void
 *  - updateRefreshSuccess(userId, { expiresAt, accessTokenHash }): void
 *
 * Lesson #36: storage modules NAO importam @shared/schema no topo — lazy via fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// O modulo importa `db` lazy (`await import('../db')`) ou eager — em ambos os
// casos o mock do setup.ts ja faz `vi.mock('../server/db', () => ({ db: {}, pool: {} }))`.
// Aqui injetamos via 3o arg pra evitar dependencia da mecanica de mock.
vi.mock('../../server/db', () => ({ db: dbMock, pool: {} }));

beforeEach(() => {
  vi.clearAllMocks();

  // Fluente: select().from().where() retorna [] por default.
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => Promise.resolve([])),
    limit: vi.fn(() => Promise.resolve([])),
  };
  dbMock.select.mockReturnValue(selectChain);
  const insertChain = {
    values: vi.fn(() => insertChain),
    onConflictDoUpdate: vi.fn(() => Promise.resolve({ rowCount: 1 })),
    returning: vi.fn(() => Promise.resolve([])),
  };
  dbMock.insert.mockReturnValue(insertChain);
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: vi.fn(() => Promise.resolve({ rowCount: 1 })),
  };
  dbMock.update.mockReturnValue(updateChain);
});

async function loadModule() {
  return await import('../../server/storage/spotifyTokensStorage');
}

describe('spotifyTokensStorage (ADR-190 § Migration 0077)', () => {
  it('getSpotifyToken(userId) executa SELECT ... WHERE user_id=...', async () => {
    const selectChain = {
      from: vi.fn(() => selectChain),
      where: vi.fn(() => Promise.resolve([
        { userId: 'USER-0001', disconnectedAt: null, refreshFailureCount: 0 },
      ])),
      limit: vi.fn(() => Promise.resolve([
        { userId: 'USER-0001', disconnectedAt: null, refreshFailureCount: 0 },
      ])),
    };
    dbMock.select.mockReturnValue(selectChain);

    const mod = await loadModule();
    const row = await mod.getSpotifyToken('USER-0001');
    expect(row).toBeTruthy();
    expect(row!.userId).toBe('USER-0001');
    expect(dbMock.select).toHaveBeenCalled();
  });

  it('getSpotifyToken retorna null quando nao existe row', async () => {
    const mod = await loadModule();
    const row = await mod.getSpotifyToken('USER-NOPE');
    expect(row).toBeNull();
  });

  it('upsertSpotifyToken: insere com ON CONFLICT DO UPDATE', async () => {
    const mod = await loadModule();
    await mod.upsertSpotifyToken({
      userId: 'USER-0001',
      refreshTokenEncrypted: 'cipher',
      refreshTokenIv: 'iv',
      refreshTokenAuthTag: 'tag',
      spotifyUserId: 'sp_123',
      displayName: 'Test',
      displayNameHash: 'hash_abc',
      scopes: ['streaming'],
      expiresAt: new Date(),
    });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const insertChain = dbMock.insert.mock.results[0].value;
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });

  it('markSpotifyDisconnected: UPDATE disconnected_at = NOW() + razao opcional', async () => {
    const mod = await loadModule();
    await mod.markSpotifyDisconnected('USER-0001', 'user_initiated');
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it('incrementRefreshFailureCount: UPDATE refresh_failure_count = + 1', async () => {
    const mod = await loadModule();
    await mod.incrementRefreshFailureCount('USER-0001');
    expect(dbMock.update).toHaveBeenCalled();
  });

  it('resetRefreshFailureCount: UPDATE refresh_failure_count = 0', async () => {
    const mod = await loadModule();
    await mod.resetRefreshFailureCount('USER-0001');
    expect(dbMock.update).toHaveBeenCalled();
  });

  it('updateRefreshSuccess: UPDATE expires_at + last_refresh_at + reset failure_count', async () => {
    const mod = await loadModule();
    const expires = new Date(Date.now() + 3600_000);
    await mod.updateRefreshSuccess('USER-0001', {
      expiresAt: expires,
      accessTokenHash: 'sha256-abc',
    });
    expect(dbMock.update).toHaveBeenCalled();
  });
});
