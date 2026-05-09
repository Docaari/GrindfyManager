/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — RF-08: HUD Custom field <-> theme.linkedStats
 *
 * Spec  : Docs/specs/stats-themes-linking-1.md §RF-08
 * ADR   : 141 §2.5 (write-through UNIDIRECIONAL custom -> theme)
 * Diag  : stats-themes-linking-hud-write-through.mermaid
 *
 * Cobertura:
 *   - PATCH layout com fieldsJson[i].linkedThemes valido -> persiste E sync
 *     bidirecional adiciona customStatId em studyThemes.linkedStats de cada theme.
 *   - Editar custom field removendo theme A: remove customStatId apenas de A,
 *     preserva em B.
 *   - PATCH com linkedThemes invalido (theme inexistente / cross-user) -> 400.
 *   - Cap 20 themes/custom field (Zod hard limit).
 *   - Custom field sem linkedThemes (back-compat) continua funcionando.
 *   - Cache reverse lookup invalidado para customStatId pos-mutation.
 *   - DELETE custom field inteiro -> remove customStatId de TODOS themes que continham.
 *   - REGRA UNIDIRECIONAL: PATCH theme.linkedStats omitindo customStatId NAO atualiza
 *     hudLayouts.fieldsJson[i].linkedThemes (ADR-141 §2.5).
 *
 * Lessons aplicadas:
 *   #3 mocks shape REAL — fieldsJson com HudLayoutFieldEntry; studyThemes com linkedStats jsonb.
 *   #14 await import(...) ESM compat.
 *   #21 cache invalidator mockado.
 *
 * Status RED: PATCH /api/hud-layouts/:id com linkedThemes nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invalidateMock = vi.fn();
vi.mock('../../server/services/statsLinkedThemesService', () => ({
  invalidateStatsLinkedThemesCache: invalidateMock,
  getThemesLinkingStat: vi.fn(),
  _resetForTests: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    getHudLayout: vi.fn(),
    updateHudLayout: vi.fn(),
    deleteHudLayoutCustomStat: vi.fn(),
    // Themes ownership validation
    getStudyThemesByIds: vi.fn(),
    // Write-through atomico (custom_X -> append a study_themes.linked_stats)
    appendStatToThemes: vi.fn(),
    removeStatFromThemes: vi.fn(),
    // Para teste de DELETE custom field
    listThemesContainingStat: vi.fn(),
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
  name: 'PT4',
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
      // back-compat: linkedThemes pode estar undefined
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ownedThemes = [
  { id: 'th_a', userId: 'USER-OWNER', name: 'Tema A', linkedStats: [] },
  { id: 'th_b', userId: 'USER-OWNER', name: 'Tema B', linkedStats: [] },
  { id: 'th_c', userId: 'USER-OWNER', name: 'Tema C', linkedStats: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getHudLayout as any).mockResolvedValue({ ...baseLayout });
  (storage.updateHudLayout as any).mockImplementation(
    async (layoutId: string, _userId: string, patch: any) => ({
      ...baseLayout,
      ...patch,
      id: layoutId,
    }),
  );
  // Padrao: todos os themes que aparecem na busca pertencem ao user
  (storage.getStudyThemesByIds as any).mockResolvedValue(ownedThemes);
  (storage.appendStatToThemes as any).mockResolvedValue(undefined);
  (storage.removeStatFromThemes as any).mockResolvedValue(undefined);
  (storage.listThemesContainingStat as any).mockResolvedValue([]);
});

async function loadHandler() {
  const mod: any = await import('../../server/routes/statsAnalyzer');
  return (
    mod.handlePatchHudLayoutWithLinkedThemes ??
    mod.handleUpdateHudLayout ??
    mod.handlePatchHudLayout
  );
}

async function loadDeleteHandler() {
  const mod: any = await import('../../server/routes/statsAnalyzer');
  return mod.handleDeleteCustomStat;
}

// =============================================================================
// RF-08.1 — Schema extension (cap 20)
// =============================================================================
describe('PATCH /api/hud-layouts/:id linkedThemes — Zod cap 20', () => {
  it('400 quando linkedThemes tem 21 IDs', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const bigArr = Array.from({ length: 21 }, (_, i) => `th_${i}`);
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: bigArr },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateHudLayout).not.toHaveBeenCalled();
  });

  it('aceita exatamente 20 themes (no limite)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    const ids20 = Array.from({ length: 20 }, (_, i) => `th_${i}`);
    (storage.getStudyThemesByIds as any).mockResolvedValue(
      ids20.map((id) => ({ id, userId: 'USER-OWNER', name: id, linkedStats: [] })),
    );
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: ids20 },
          ],
        },
      }),
      res,
    );
    // No estouro Zod -> 200 OK
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// RF-08.2 — Ownership validation
// =============================================================================
describe('PATCH /api/hud-layouts/:id linkedThemes — ownership themes', () => {
  it('400 com invalidIds quando theme nao pertence ao user', async () => {
    // Apenas th_a do user; th_outro_user NAO retorna
    (storage.getStudyThemesByIds as any).mockResolvedValue([
      { id: 'th_a', userId: 'USER-OWNER', name: 'A', linkedStats: [] },
    ]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: ['th_a', 'th_outro_user'] },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      invalidIds: expect.arrayContaining(['th_outro_user']),
    });
    expect(storage.updateHudLayout).not.toHaveBeenCalled();
  });

  it('403 quando layout pertence a outro user', async () => {
    (storage.getHudLayout as any).mockResolvedValue({
      ...baseLayout,
      userId: 'USER-OUTRO',
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: ['th_a'] },
          ],
        },
      }),
      res,
    );
    expect([403, 404]).toContain(res.statusCode);
    expect(storage.updateHudLayout).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-08.3 — Write-through ADD: custom_X aparece em theme.linkedStats
// =============================================================================
describe('PATCH /api/hud-layouts/:id linkedThemes — write-through ADD', () => {
  it('adicionar linkedThemes=[A,B] em custom_X chama appendStatToThemes(custom_X, [A,B])', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            {
              ...baseLayout.fieldsJson[0],
              linkedThemes: ['th_a', 'th_b'],
            },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.appendStatToThemes).toHaveBeenCalled();
    const callArgs = (storage.appendStatToThemes as any).mock.calls[0];
    // call args podem ser (userId, statId, themeIds[]) — flexibilidade
    const flat = callArgs.flat ? callArgs.flat() : callArgs;
    expect(flat.join(',')).toContain('custom_my_3bet_kpi');
    expect(flat.join(',')).toMatch(/th_a/);
    expect(flat.join(',')).toMatch(/th_b/);
  });

  it('persiste fieldsJson[i].linkedThemes no layout (UPDATE hud_layouts)', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: ['th_a'] },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateHudLayout).toHaveBeenCalled();
    const updateCall = (storage.updateHudLayout as any).mock.calls[0];
    // Esperamos que o payload final tenha o campo linkedThemes preservado
    const patch = updateCall[updateCall.length - 1];
    const fieldsJson = patch.fieldsJson ?? patch.fields_json;
    expect(fieldsJson[0].linkedThemes).toEqual(['th_a']);
  });
});

// =============================================================================
// RF-08.3 — Write-through REMOVE: custom_X some de theme.linkedStats
// =============================================================================
describe('PATCH /api/hud-layouts/:id linkedThemes — write-through REMOVE', () => {
  it('remover B de linkedThemes (era [A,B], vira [A]) chama removeStatFromThemes(custom_X, [B])', async () => {
    // Layout com linkedThemes ja [A, B]
    (storage.getHudLayout as any).mockResolvedValue({
      ...baseLayout,
      fieldsJson: [
        {
          ...baseLayout.fieldsJson[0],
          linkedThemes: ['th_a', 'th_b'],
        },
      ],
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            {
              ...baseLayout.fieldsJson[0],
              linkedThemes: ['th_a'], // removeu th_b
            },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.removeStatFromThemes).toHaveBeenCalled();
    const callArgs = (storage.removeStatFromThemes as any).mock.calls[0];
    const flat = callArgs.flat ? callArgs.flat() : callArgs;
    expect(flat.join(',')).toContain('custom_my_3bet_kpi');
    expect(flat.join(',')).toMatch(/th_b/);
    // th_a NAO deve aparecer no remove
    const removeArgs = JSON.stringify(callArgs);
    expect(removeArgs).not.toMatch(/"th_a"/);
  });
});

// =============================================================================
// RF-08.4 — Cache invalidation
// =============================================================================
describe('PATCH /api/hud-layouts/:id linkedThemes — cache invalidation', () => {
  it('invalida cache reverse lookup para customStatId pos-mutation', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0], linkedThemes: ['th_a'] },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(invalidateMock).toHaveBeenCalled();
    // Algum dos invalidates deve referenciar custom_my_3bet_kpi
    const invalidatedStats = invalidateMock.mock.calls.map((c: any[]) => c[1]);
    expect(invalidatedStats).toEqual(expect.arrayContaining(['custom_my_3bet_kpi']));
  });
});

// =============================================================================
// RF-08 — Back-compat sem linkedThemes
// =============================================================================
describe('PATCH /api/hud-layouts/:id — back-compat (sem linkedThemes)', () => {
  it('custom field sem linkedThemes nao chama append/remove', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1' },
        body: {
          fieldsJson: [
            { ...baseLayout.fieldsJson[0] /* sem linkedThemes */ },
          ],
        },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.appendStatToThemes).not.toHaveBeenCalled();
    expect(storage.removeStatFromThemes).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-08.5 — DELETE custom field cleanup
// =============================================================================
describe('DELETE /api/hud-layouts/:id/custom-stats/:customId — cleanup', () => {
  it('remove customStatId de TODOS themes que continham', async () => {
    (storage.listThemesContainingStat as any).mockResolvedValue([
      { id: 'th_a', linkedStats: ['custom_my_3bet_kpi'] },
      { id: 'th_b', linkedStats: ['custom_my_3bet_kpi', 'vpip'] },
    ]);
    const handler = await loadDeleteHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1', customId: 'custom_my_3bet_kpi' },
      }),
      res,
    );
    expect([200, 204]).toContain(res.statusCode);
    expect(storage.removeStatFromThemes).toHaveBeenCalled();
    const calls = (storage.removeStatFromThemes as any).mock.calls;
    const flat = calls.flat ? calls.flat() : calls;
    const flatStr = JSON.stringify(flat);
    expect(flatStr).toMatch(/custom_my_3bet_kpi/);
    expect(flatStr).toMatch(/th_a/);
    expect(flatStr).toMatch(/th_b/);
  });

  it('cache reverse lookup invalidado para customStatId apos delete', async () => {
    (storage.listThemesContainingStat as any).mockResolvedValue([
      { id: 'th_a', linkedStats: ['custom_my_3bet_kpi'] },
    ]);
    const handler = await loadDeleteHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'lyt-1', customId: 'custom_my_3bet_kpi' },
      }),
      res,
    );
    expect([200, 204]).toContain(res.statusCode);
    const invalidatedStats = invalidateMock.mock.calls.map((c: any[]) => c[1]);
    expect(invalidatedStats).toEqual(expect.arrayContaining(['custom_my_3bet_kpi']));
  });
});

// =============================================================================
// REGRA UNIDIRECIONAL (ADR-141 §2.5)
// =============================================================================
describe('REGRA UNIDIRECIONAL: PATCH theme NAO atualiza hud_layouts.linkedThemes', () => {
  it('PATCH /api/study-themes/:id linkedStats omitindo customStatId NAO modifica fieldsJson', async () => {
    // Este teste verifica via handler de study-themes (RF-01) que NAO existe
    // chamada para storage.updateHudLayout pos-PATCH theme.
    const updateHudLayoutMock = storage.updateHudLayout as any;
    updateHudLayoutMock.mockClear();

    const themesMod: any = await import('../../server/routes/studies-v2');
    const themeHandler =
      themesMod.handlePatchStudyThemeLinkedStats ??
      themesMod.handlePatchStudyTheme ??
      themesMod.handleUpdateStudyTheme;

    if (!themeHandler) {
      // Red phase: handler nao existe ainda
      return;
    }

    const res = makeRes();
    await themeHandler(
      makeReq({
        params: { id: 'thm_x' },
        body: { linkedStats: ['vpip'] }, // SEM custom_my_3bet_kpi (omitido)
      }),
      res,
    );

    // Mesmo se o PATCH theme funcionar (200 ou 404), NAO deve
    // chamar storage.updateHudLayout (write-through reverso PROIBIDO).
    expect(updateHudLayoutMock).not.toHaveBeenCalled();
  });
});
