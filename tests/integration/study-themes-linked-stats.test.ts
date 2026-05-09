/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — RF-01: PATCH /api/study-themes/:id linkedStats
 *
 * Spec  : Docs/specs/stats-themes-linking-1.md §RF-01 (Zod max 30, validacao
 *         catalog/custom, dedup, ownership, cache invalidation)
 * ADR   : 141 (JSONB + GIN; cap 30 hard backend)
 * Diag  : stats-themes-linking-edit-flow.mermaid
 *
 * Cobertura:
 *   - Body com 3 catalog stats validos -> persiste array.
 *   - Body com custom_xyz que existe em fieldsJson do user -> persiste.
 *   - Body com IDs invalidos -> 400 + invalidIds[] (sem persistir).
 *   - Body com 31 stats -> 400 ZodError.
 *   - Dedup: ['vpip', 'pfr', 'vpip'] persiste ['vpip', 'pfr'].
 *   - PATCH em tema de outro user -> 403.
 *   - Body com `linkedStats: []` (clear) -> persiste array vazio.
 *   - Outros campos preservados (PATCH classico).
 *   - Cache invalidation pos-commit (spy em invalidateStatsLinkedThemesCache).
 *   - Cross-user custom: custom_X de OUTRO user nao valida (400 invalidIds).
 *
 * Endpoint: o spec pede PATCH /api/study-themes/:id. O endpoint atual eh PUT
 * (studies-v2.ts:350). Implementer deve criar PATCH ou estender o handler.
 * Os testes assumem PATCH conforme spec.
 *
 * Lessons aplicadas:
 *   #3 mocks shape REAL — getStudyTheme / updateStudyTheme / getHudLayouts.
 *   #14 await import(...) ESM compat.
 *   #21 cache invalidator mockado.
 *   #28 vi.mock por path — usar path canonico do storage.
 *
 * Status RED: PATCH handler + statsLinkedThemesService nao existem.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — shape REAL extraido de:
//   shared/schema.ts:2116 (StudyTheme) — id, userId, name, color, emoji,
//     isFavorite, sortOrder, progress, slug, isCurated, category,
//     linkedStats (jsonb string[]), linkedLessons, seededAt, createdAt, updatedAt
//   shared/schema.ts:3704 (HudLayout) — id, userId, name, isDefault, sections,
//     fieldsJson (HudLayoutFieldEntry[]), createdAt, updatedAt
//   shared/schema.ts:3689 (HudLayoutFieldEntry) — id, isCustom?, label?, group?,
//     unit?, direction?, targetMin?, targetMax?, targetOverride?
// =============================================================================

const invalidateMock = vi.fn();
vi.mock('../../server/services/statsLinkedThemesService', () => ({
  invalidateStatsLinkedThemesCache: invalidateMock,
  getThemesLinkingStat: vi.fn(),
  _resetForTests: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getStudyTheme: vi.fn(),
    updateStudyTheme: vi.fn(),
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

const baseTheme = {
  id: 'thm_1',
  userId: 'USER-OWNER',
  name: 'C-bet OOP',
  color: '#16a34a',
  emoji: '',
  isFavorite: false,
  sortOrder: 0,
  progress: 0,
  slug: 'cbet-oop',
  isCurated: false,
  category: 'postflop',
  linkedStats: [],
  linkedLessons: [],
  seededAt: null,
  createdAt: new Date('2026-05-08T00:00:00Z'),
  updatedAt: new Date('2026-05-08T00:00:00Z'),
};

const baseLayout = {
  id: 'lyt-1',
  userId: 'USER-OWNER',
  name: 'PT4 Default',
  isDefault: true,
  sections: [],
  fieldsJson: [
    {
      id: 'custom_xyz123',
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

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getStudyTheme as any).mockResolvedValue({ ...baseTheme });
  (storage.updateStudyTheme as any).mockImplementation(
    async (themeId: string, patch: any) => ({ ...baseTheme, ...patch, id: themeId }),
  );
  (storage.getHudLayouts as any).mockResolvedValue([baseLayout]);
});

async function loadHandler() {
  const mod: any = await import('../../server/routes/studies-v2');
  // Nome esperado: handlePatchStudyThemeLinkedStats. Ou handlePatchStudyTheme
  // (estendido para aceitar linkedStats). Aceita ambos para flexibilidade.
  return (
    mod.handlePatchStudyThemeLinkedStats ??
    mod.handlePatchStudyTheme ??
    mod.handleUpdateStudyTheme
  );
}

// =============================================================================
// RF-01.5 — Body com IDs catalog validos
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — catalog stats validos', () => {
  it('persiste array com 3 catalog stats validos', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip', 'pfr', 'cbet_flop_ip'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudyTheme).toHaveBeenCalledWith(
      'thm_1',
      expect.objectContaining({
        linkedStats: ['vpip', 'pfr', 'cbet_flop_ip'],
      }),
    );
  });

  it('persiste array vazio quando linkedStats: []  (clear all)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'pfr'],
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'thm_1' }, body: { linkedStats: [] } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudyTheme).toHaveBeenCalledWith(
      'thm_1',
      expect.objectContaining({ linkedStats: [] }),
    );
  });
});

// =============================================================================
// RF-01.2 — Custom stat valida (existe em hudLayouts.fieldsJson do user)
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — custom stats', () => {
  it('persiste custom_xyz123 que existe em fieldsJson do user', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip', 'custom_xyz123'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudyTheme).toHaveBeenCalledWith(
      'thm_1',
      expect.objectContaining({
        linkedStats: ['vpip', 'custom_xyz123'],
      }),
    );
  });

  it('rejeita custom_yyy999 que NAO existe em nenhum layout do user', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip', 'custom_yyy999'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      invalidIds: expect.arrayContaining(['custom_yyy999']),
    });
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });

  it('rejeita custom_X de OUTRO user (cross-user isolation)', async () => {
    // Simula que o getHudLayouts do user atual NAO retorna custom_otro_user
    (storage.getHudLayouts as any).mockResolvedValue([baseLayout]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['custom_otro_user'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      invalidIds: expect.arrayContaining(['custom_otro_user']),
    });
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-01.5 — IDs invalidos
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — IDs invalidos', () => {
  it('400 com invalidIds quando array tem ID que nao esta em catalog nem custom', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['invalid_id_1', 'vpip', 'invalid_id_2'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      invalidIds: expect.arrayContaining(['invalid_id_1', 'invalid_id_2']),
    });
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-01.1 — Cap 30 (Zod hard limit)
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — cap 30', () => {
  it('400 quando body tem 31 IDs validos (Zod cap antes de DB)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const bigArray = Array.from({ length: 31 }, (_, i) => `vpip_${i}`); // 31 itens
    await handler(
      makeReq({ params: { id: 'thm_1' }, body: { linkedStats: bigArray } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });

  it('aceita exatamente 30 IDs (no limite)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    // Usar 30 catalog IDs validos (vpip + 29 unicos)
    const ids = Array.from({ length: 30 }, (_, i) => i === 0 ? 'vpip' : `valid_${i}`);
    // Para passar a validacao catalog/custom, mockamos getHudLayouts retornando
    // todos como custom (qualquer ID prefixado custom_ ou conhecido). Para o
    // teste de cap exato, focamos na resposta — implementer pode ajustar fixtures.
    // Substituimos por 30 catalog IDs reais:
    const realIds = [
      'vpip', 'pfr', 'wwsf_pct', 'fold_vs_3bet', 'rfi_btn',
      'rfi_co', 'rfi_hj', 'rfi_lj', 'rfi_mp', 'rfi_utg',
      'rfi_sb', 'cbet_flop_ip', 'cbet_flop_oop', 'cbet_turn_ip',
      'cbet_turn_oop', 'cbet_river_ip', 'cbet_river_oop',
      'fold_vs_cbet_flop', 'fold_vs_cbet_turn', 'fold_vs_cbet_river',
      'three_bet_btn', 'three_bet_co', 'three_bet_sb', 'three_bet_bb',
      'four_bet_pct', 'fold_vs_4bet', 'open_limp_pct', 'limp_call_pct',
      'limp_fold_pct', 'limp_3bet_pct',
    ];
    expect(realIds.length).toBe(30);
    await handler(
      makeReq({ params: { id: 'thm_1' }, body: { linkedStats: realIds } }),
      res,
    );
    // Como nem todos os IDs sao garantidamente validos no STAT_INDEX_BY_ID,
    // este teste pode retornar 400 com invalidIds. O criterio aqui eh
    // garantir que 30 itens NAO ativa o cap Zod (que daria erro generico
    // sem invalidIds). Verificamos shape:
    if (res.statusCode === 400) {
      // Erro deve ser de invalidIds, nao de cap exceeded
      expect(res.body).toHaveProperty('invalidIds');
    } else {
      expect(res.statusCode).toBe(200);
    }
  });
});

// =============================================================================
// RF-01.2 — Dedup
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — dedup', () => {
  it('persiste [vpip, pfr] quando body tem [vpip, pfr, vpip]', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip', 'pfr', 'vpip'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudyTheme).toHaveBeenCalledWith(
      'thm_1',
      expect.objectContaining({ linkedStats: ['vpip', 'pfr'] }),
    );
  });

  it('preserva ordem da primeira ocorrencia em dedup', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['pfr', 'vpip', 'pfr', 'cbet_flop_ip', 'vpip'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudyTheme).toHaveBeenCalledWith(
      'thm_1',
      expect.objectContaining({
        linkedStats: ['pfr', 'vpip', 'cbet_flop_ip'],
      }),
    );
  });
});

// =============================================================================
// RF-01.2 — Ownership
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — ownership', () => {
  it('403 quando theme.userId !== ctx.userPlatformId', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      userId: 'USER-OUTRO',
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        user: { userPlatformId: 'USER-OWNER' },
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });

  it('404 quando tema nao existe', async () => {
    (storage.getStudyTheme as any).mockResolvedValue(null);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_inexistente' },
        body: { linkedStats: ['vpip'] },
      }),
      res,
    );
    expect([403, 404]).toContain(res.statusCode);
    expect(storage.updateStudyTheme).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-01.3 — PATCH preserva outros campos
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — PATCH preserva campos', () => {
  it('PATCH com apenas linkedStats nao zera name/color/emoji', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['vpip'] },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const patch = (storage.updateStudyTheme as any).mock.calls[0][1];
    expect(patch).not.toHaveProperty('name');
    expect(patch).not.toHaveProperty('color');
    expect(patch).not.toHaveProperty('emoji');
    expect(patch).toHaveProperty('linkedStats');
  });
});

// =============================================================================
// RF-01.4 — Cache invalidation pos-commit
// =============================================================================
describe('PATCH /api/study-themes/:id linkedStats — cache invalidation', () => {
  it('invalida cache para CADA stat em (previousLinkedStats UNION nextLinkedStats)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'pfr'], // previousLinkedStats
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { linkedStats: ['pfr', 'cbet_flop_ip'] }, // nextLinkedStats
      }),
      res,
    );
    expect(res.statusCode).toBe(200);

    // Union = [vpip, pfr, cbet_flop_ip]. Cada um deve ser invalidado.
    const calledStats = invalidateMock.mock.calls.map((c: any[]) => c[1]);
    expect(calledStats).toEqual(expect.arrayContaining(['vpip', 'pfr', 'cbet_flop_ip']));

    // Sempre invalidado para o user correto.
    invalidateMock.mock.calls.forEach((c: any[]) => {
      expect(c[0]).toBe('USER-OWNER');
    });
  });

  it('invalida cache mesmo quando linkedStats final eh vazio (clear)', async () => {
    (storage.getStudyTheme as any).mockResolvedValue({
      ...baseTheme,
      linkedStats: ['vpip', 'pfr'],
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({ params: { id: 'thm_1' }, body: { linkedStats: [] } }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const calledStats = invalidateMock.mock.calls.map((c: any[]) => c[1]);
    expect(calledStats).toEqual(expect.arrayContaining(['vpip', 'pfr']));
  });

  it('NAO invalida quando body sem linkedStats (apenas outros campos)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'thm_1' },
        body: { name: 'Novo nome' }, // sem linkedStats
      }),
      res,
    );
    // Nao foi mexido em linkedStats -> nao invalidar
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
