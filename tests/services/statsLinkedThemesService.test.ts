/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — Service statsLinkedThemesService (cache singleton)
 *
 * Spec : Docs/specs/stats-themes-linking-1.md §RF-02 + §RF-01.4 + §RF-08.4
 * ADR  : 141 (JSONB + GIN), §2.4 (cache pattern lesson #21)
 *
 * Cobertura:
 *   - getThemesLinkingStat: cache miss bate storage, hit retorna cached
 *   - TTL 60s expira -> bate storage de novo
 *   - invalidateStatsLinkedThemesCache(userId, statId) deleta entry especifica
 *   - invalidateStatsLinkedThemesCache(userId) deleta TODAS entries do user
 *   - keys cross-user nao colidem
 *   - _resetForTests() limpa cache inteiro
 *   - empty array eh cacheado normalmente
 *
 * Lessons aplicadas:
 *   #3 shape REAL — mocks refletem retorno do storage
 *   #14 await import(...) — ESM compat
 *   #21 cache singleton com _resetForTests + invalidator publico
 *
 * Status RED: modulo `server/services/statsLinkedThemesService.ts` NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/storage', () => ({
  storage: {
    getThemesLinkingStat: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

async function loadService() {
  return await import('../../server/services/statsLinkedThemesService');
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  try {
    const mod = await import('../../server/services/statsLinkedThemesService');
    if (typeof (mod as any)._resetForTests === 'function') {
      (mod as any)._resetForTests();
    }
  } catch {
    // red phase — ok
  }
});

const themeFixture = (id: string, name: string) => ({
  id,
  name,
  slug: `${id}-slug`,
  category: 'postflop',
});

describe('statsLinkedThemesService — getThemesLinkingStat (cache miss)', () => {
  it('cache miss bate storage e retorna o resultado', async () => {
    const themes = [themeFixture('th-1', 'Tema A'), themeFixture('th-2', 'Tema B')];
    (storage.getThemesLinkingStat as any).mockResolvedValue(themes);
    const svc = await loadService();
    const result = await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(result).toEqual(themes);
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);
    expect(storage.getThemesLinkingStat).toHaveBeenCalledWith('USER-1', 'vpip');
  });

  it('empty array eh retornado e cacheado normalmente', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([]);
    const svc = await loadService();
    const result = await svc.getThemesLinkingStat('USER-1', 'pfr');
    expect(result).toEqual([]);
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);
  });
});

describe('statsLinkedThemesService — getThemesLinkingStat (cache hit)', () => {
  it('segunda chamada (mesma key) NAO bate storage', async () => {
    const themes = [themeFixture('th-1', 'Tema A')];
    (storage.getThemesLinkingStat as any).mockResolvedValue(themes);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-1', 'vpip');

    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);
  });

  it('keys (userId, statId) diferentes nao compartilham cache', async () => {
    (storage.getThemesLinkingStat as any).mockImplementation(
      async (userId: string, statId: string) => [{
        id: `theme-${userId}-${statId}`,
        name: 'X',
        slug: 'x',
        category: 'preflop',
      }],
    );
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-2', 'vpip'); // user diferente
    await svc.getThemesLinkingStat('USER-1', 'pfr');  // stat diferente

    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(3);
  });

  it('TTL 60s expira -> proxima chamada bate storage de novo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixture('th-1', 'A')]);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);

    // dentro do TTL (59s) — cache hit
    vi.setSystemTime(new Date('2026-05-08T10:00:59Z'));
    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);

    // depois do TTL (61s) — cache miss
    vi.setSystemTime(new Date('2026-05-08T10:01:01Z'));
    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe('statsLinkedThemesService — invalidateStatsLinkedThemesCache', () => {
  it('invalidate(userId, statId) remove entry especifica', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixture('th-1', 'A')]);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);

    svc.invalidateStatsLinkedThemesCache('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);
  });

  it('invalidate(userId, statId) NAO remove entry de outro statId', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixture('th-1', 'A')]);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-1', 'pfr');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);

    svc.invalidateStatsLinkedThemesCache('USER-1', 'vpip');

    // pfr ainda esta cacheado
    await svc.getThemesLinkingStat('USER-1', 'pfr');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);

    // vpip foi invalidado -> bate storage
    await svc.getThemesLinkingStat('USER-1', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(3);
  });

  it('invalidate(userId) sem statId remove TODAS entries do user', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixture('th-1', 'A')]);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-1', 'pfr');
    await svc.getThemesLinkingStat('USER-2', 'vpip'); // outro user — preservar
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(3);

    svc.invalidateStatsLinkedThemesCache('USER-1');

    // ambas entries USER-1 invalidadas
    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-1', 'pfr');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(5);

    // USER-2 cache preservado
    await svc.getThemesLinkingStat('USER-2', 'vpip');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(5);
  });
});

describe('statsLinkedThemesService — _resetForTests', () => {
  it('limpa cache inteiro (todos os users)', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixture('th-1', 'A')]);
    const svc = await loadService();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-2', 'pfr');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);

    svc._resetForTests();

    await svc.getThemesLinkingStat('USER-1', 'vpip');
    await svc.getThemesLinkingStat('USER-2', 'pfr');
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(4);
  });
});
