/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — RF-02: GET /api/stats/:statId/linked-themes
 *
 * Spec  : Docs/specs/stats-themes-linking-1.md §RF-02 (reverse lookup, cache 60s,
 *         response shape, cross-user isolation)
 * ADR   : 141 (JSONB + GIN; cache pattern lesson #21)
 * Diag  : stats-themes-linking-reverse-lookup.mermaid
 *
 * Cobertura:
 *   - GET valido (catalog stat com 3 themes linkados) -> 200 [3 entries]
 *   - GET valido sem nenhum theme linkando -> 200 []
 *   - GET stat invalida (nao em catalog nem custom) -> 404
 *   - GET custom_X que existe em fieldsJson do user -> 200 OK
 *   - Cache hit: segunda chamada em <60s NAO bate storage
 *   - Cache miss apos invalidate: bate storage de novo
 *   - Cross-user: user A nao ve themes de user B (filtro user_id no service)
 *   - Response shape inclui slug + category (Themes-V2 categorias)
 *   - Order: temas em ordem alfabetica (name ASC)
 *
 * Lessons aplicadas:
 *   #3 mocks shape REAL (storage.getThemesLinkingStat retorna {id, name, slug, category})
 *   #14 await import(...) ESM compat
 *   #21 cache singleton com TTL + invalidator
 *
 * Status RED: handler GET /api/stats/:statId/linked-themes nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Storage mock — getThemesLinkingStat eh o canonico que o service consome.
vi.mock('../../server/storage', () => ({
  storage: {
    getThemesLinkingStat: vi.fn(),
    getHudLayouts: vi.fn(),
  },
}));

import { storage } from '../../server/storage';

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-OWNER' },
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.send = (d: any) => { res.body = d; return res; };
  return res;
}

const baseLayout = {
  id: 'lyt-1',
  userId: 'USER-OWNER',
  name: 'PT4 Default',
  isDefault: true,
  sections: [],
  fieldsJson: [
    {
      id: 'custom_my_3bet_kpi',
      isCustom: true,
      label: 'My 3Bet KPI',
      group: 'threebet',
      unit: 'pct',
      direction: 'context',
      targetMin: 8,
      targetMax: 12,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const themeFixtures = [
  { id: 'thm_a', name: 'Aliados Multiway', slug: 'aliados-multiway', category: 'multiway' },
  { id: 'thm_b', name: 'BB Defense vs SB BW', slug: 'bb-def-sb', category: 'preflop' },
  { id: 'thm_c', name: 'C-bet OOP em 3-bet pots', slug: 'cbet-oop-3bp', category: 'postflop' },
];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useRealTimers();
  (storage.getHudLayouts as any).mockResolvedValue([baseLayout]);
  (storage.getThemesLinkingStat as any).mockResolvedValue([]);
  // Reset cache do service (lesson #21).
  try {
    const mod: any = await import('../../server/services/statsLinkedThemesService');
    if (typeof mod._resetForTests === 'function') {
      mod._resetForTests();
    }
  } catch {
    // red phase
  }
});

async function loadHandler() {
  const mod: any = await import('../../server/routes/statsAnalyzer');
  // Esperado: handleGetStatsLinkedThemes ou handleStatsLinkedThemes.
  return (
    mod.handleGetStatsLinkedThemes ??
    mod.handleStatsLinkedThemes ??
    mod.handleStatLinkedThemes
  );
}

// =============================================================================
// RF-02.6 — Catalog stat com themes linkados
// =============================================================================
describe('GET /api/stats/:statId/linked-themes — catalog stat', () => {
  it('200 retorna array com 3 entries quando 3 themes linkam', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([...themeFixtures]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'vpip' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('shape do response: { themeId, name, slug, category }', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixtures[2]]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'cbet_flop_oop' } }), res);
    expect(res.statusCode).toBe(200);
    const entry = res.body[0];
    // Aceita "themeId" ou "id" (spec usa "themeId" mas storage retorna "id")
    expect(entry.themeId ?? entry.id).toBe('thm_c');
    expect(entry).toHaveProperty('name');
    expect(entry).toHaveProperty('slug');
    expect(entry).toHaveProperty('category');
  });

  it('200 retorna [] quando nenhum theme linka a stat', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'vpip' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('order: themes em ordem alfabetica (name ASC)', async () => {
    // Storage retorna ja ordenado (DB faz o ORDER BY); service repassa.
    const ordered = [
      themeFixtures[0], // Aliados...
      themeFixtures[1], // BB Defense...
      themeFixtures[2], // C-bet...
    ];
    (storage.getThemesLinkingStat as any).mockResolvedValue(ordered);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'vpip' } }), res);
    expect(res.statusCode).toBe(200);
    const names = res.body.map((t: any) => t.name);
    expect(names).toEqual([
      'Aliados Multiway',
      'BB Defense vs SB BW',
      'C-bet OOP em 3-bet pots',
    ]);
  });
});

// =============================================================================
// RF-02.1 — Custom stat valida
// =============================================================================
describe('GET /api/stats/:statId/linked-themes — custom stat', () => {
  it('200 quando custom_X existe em fieldsJson do user', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixtures[0]]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'custom_my_3bet_kpi' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('404 quando custom_X NAO existe em nenhum layout do user', async () => {
    (storage.getHudLayouts as any).mockResolvedValue([baseLayout]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(makeReq({ params: { statId: 'custom_inexistente' } }), res);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// RF-02.1 — Stat invalida
// =============================================================================
describe('GET /api/stats/:statId/linked-themes — invalida', () => {
  it('404 com mensagem "Stat nao encontrada"', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({ params: { statId: 'invalid_xyz_999' } }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      message: expect.stringMatching(/[Ss]tat n[ãa]o encontrada/i),
    });
  });
});

// =============================================================================
// RF-02.3 — Cache (60s TTL)
// =============================================================================
describe('GET /api/stats/:statId/linked-themes — cache TTL 60s', () => {
  it('segunda chamada em <60s NAO bate storage', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixtures[0]]);
    const handler = await loadHandler();
    const res1 = makeRes();
    await handler(makeReq({ params: { statId: 'vpip' } }), res1);
    expect(res1.statusCode).toBe(200);
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);

    const res2 = makeRes();
    await handler(makeReq({ params: { statId: 'vpip' } }), res2);
    expect(res2.statusCode).toBe(200);
    // Cache hit -> NAO bate storage de novo
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);
  });

  it('cache miss apos TTL 60s expirar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T10:00:00Z'));
    (storage.getThemesLinkingStat as any).mockResolvedValue([themeFixtures[0]]);
    const handler = await loadHandler();

    await handler(makeReq({ params: { statId: 'vpip' } }), makeRes());
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(1);

    // 61 segundos depois — TTL expirou
    vi.setSystemTime(new Date('2026-05-08T10:01:01Z'));
    await handler(makeReq({ params: { statId: 'vpip' } }), makeRes());
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// =============================================================================
// RF-02.6 — Cross-user
// =============================================================================
describe('GET /api/stats/:statId/linked-themes — cross-user', () => {
  it('cache key inclui userId — users diferentes nao compartilham', async () => {
    (storage.getThemesLinkingStat as any).mockImplementation(
      async (userId: string, statId: string) => {
        if (userId === 'USER-A') return [{ id: 'thm_a1', name: 'Tema A1', slug: 'a1', category: 'preflop' }];
        if (userId === 'USER-B') return [{ id: 'thm_b1', name: 'Tema B1', slug: 'b1', category: 'preflop' }];
        return [];
      },
    );
    const handler = await loadHandler();

    const resA = makeRes();
    await handler(
      makeReq({ user: { userPlatformId: 'USER-A' }, params: { statId: 'vpip' } }),
      resA,
    );
    expect(resA.body[0].name).toBe('Tema A1');

    const resB = makeRes();
    await handler(
      makeReq({ user: { userPlatformId: 'USER-B' }, params: { statId: 'vpip' } }),
      resB,
    );
    expect(resB.body[0].name).toBe('Tema B1');

    // Storage chamado uma vez por user (cache separado)
    expect(storage.getThemesLinkingStat).toHaveBeenCalledTimes(2);
  });

  it('storage SEMPRE chamado com userId correto (filtro de ownership)', async () => {
    (storage.getThemesLinkingStat as any).mockResolvedValue([]);
    const handler = await loadHandler();
    await handler(
      makeReq({ user: { userPlatformId: 'USER-X' }, params: { statId: 'vpip' } }),
      makeRes(),
    );
    expect(storage.getThemesLinkingStat).toHaveBeenCalledWith('USER-X', 'vpip');
  });
});
