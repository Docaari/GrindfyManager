import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
// Handlers de rota (handler-direct, injectedStorage 3o arg — lesson #34)
//
// Spec : Docs/specs/premium-library.md (RF-01..RF-07 + Criterios de Aceite)
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md
//
// Handlers (NOVOS) em server/routes/premiumLibrary.ts:
//   handleListPremium(req, res, injectedStorage?)            GET  /api/library/premium
//   handlePremiumDetails(req, res, injectedStorage?)         GET  /api/library/premium/:id/details
//   handlePromotePremium(req, res, injectedStorage?)         POST /api/library/premium
//   handleRemovePremium(req, res, injectedStorage?)          DELETE /api/library/premium/:id
//   handleCuratorHighlights(req, res, injectedStorage?)      GET  /api/library/premium/curator/highlights
//   handleImportPremium(req, res, injectedStorage?)          POST /api/library/premium/import
//
// O guard requireGranularPermission e middleware (testado em isolamento no outro
// arquivo). Aqui assumimos que ele JA passou — testamos a LOGICA do handler.
// O teste anti-IDOR por rota (user comum -> 403) vive no guard test + na ordem de
// registro (premium-library-route-collision). Estes handlers NAO re-checam a
// permissao (o middleware faz isso); mas exigem req.user (401 sem auth).
//
// Lesson #3: mock segue o shape REAL — promotePremiumHighlight retorna objeto
//   DISCRIMINADO { ok, ... } (NAO throw); getFamilyDetails -> { found, metrics,
//   recentResults }; getSavedHighlightByIdAnyUser -> row | null.
// Lesson #34: injectedStorage como 3o arg.
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

// O modulo de rotas pode importar storage/auth no topo — handlers usam o
// injectedStorage como 3o arg, entao mockamos o storage real para o import nao
// explodir, mas passamos sempre o injected.
vi.mock('../../../server/storage', () => ({ storage: {} }));

// @ts-expect-error - handlers ainda nao existem (red phase)
import {
  handleListPremium,
  handlePremiumDetails,
  handlePromotePremium,
  handleRemovePremium,
  handleCuratorHighlights,
  handleImportPremium,
} from '../../../server/routes/premiumLibrary';

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: any) => { res.headers[k.toLowerCase()] = v; return res; };
  return res;
}

// req.user shape REAL (auth.ts attach): { email, userPlatformId, permissions: [] }.
function makeReq(overrides: any = {}) {
  return {
    user: { email: 'curador@example.com', userPlatformId: 'USER-CURATOR', permissions: ['premium_library_curate'] },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

const PREMIUM_ROW = {
  id: 'p_1', site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular',
  groupName: 'Bounty Hunters $22', buyInTier: '$22', type: 'mtt',
  metrics: { roi: 18.4, volume: 320 }, reasons: [{ kind: 'roi', label: 'ROI alto' }],
  source: 'library', curatedBy: 'USER-CURATOR', sourceUserId: null, sourceHighlightId: null,
  createdAt: '2026-06-02T00:00:00.000Z',
};

function makeStorage(overrides: any = {}) {
  return {
    listPremiumHighlights: vi.fn(async () => [PREMIUM_ROW]),
    getPremiumHighlight: vi.fn(async () => PREMIUM_ROW),
    promotePremiumHighlight: vi.fn(async (input: any) => ({ ok: true, row: { ...PREMIUM_ROW, ...input } })),
    removePremiumHighlight: vi.fn(async () => true),
    listAllUserHighlights: vi.fn(async () => ({
      items: [
        {
          id: 'hl_1', userId: 'USER-A', username: 'jogadorA', email: 'a@example.com',
          site: 'ggpoker', familyKey: 'A|mtt|$22|regular', groupName: 'Fam A',
          buyInTier: '$22', type: 'mtt', metrics: { roi: 10 }, reasons: [], source: 'overview',
          createdAt: '2026-06-01T00:00:00.000Z', alreadyInPremium: false,
        },
      ],
      total: 1,
    })),
    getSavedHighlightByIdAnyUser: vi.fn(async () => ({
      id: 'hl_42', userId: 'USER-OWNER', site: 'ggpoker', familyKey: 'C|mtt|$33|regular',
      groupName: 'Fam C', buyInTier: '$33', type: 'mtt', metrics: { roi: 22 }, reasons: [],
    })),
    getFamilyDetails: vi.fn(async () => ({ found: true, metrics: { roi: 15, volume: 100 }, recentResults: [] })),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// =============================================================================
// GET /api/library/premium (RF-02) — todos os autenticados
// =============================================================================

describe('GET /api/library/premium — listar (RF-02)', () => {
  it('200 com a lista para usuario autenticado (qualquer)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListPremium(makeReq({ user: { email: 'comum@x.com', userPlatformId: 'USER-9', permissions: [] } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('p_1');
  });

  it('repassa o filtro ?site= ao storage', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListPremium(makeReq({ query: { site: 'ggpoker' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.listPremiumHighlights).toHaveBeenCalledWith('ggpoker');
  });

  it('401 sem usuario autenticado', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListPremium(makeReq({ user: undefined }), res, storage);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// GET /api/library/premium/:id/details (RF-03) — drill-down do viewer
// =============================================================================

describe('GET /api/library/premium/:id/details — drill-down (RF-03)', () => {
  it('200 re-deriva do historico do VIEWER (getFamilyDetails com viewerUserId)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handlePremiumDetails(
      makeReq({ params: { id: 'p_1' }, user: { email: 'viewer@x.com', userPlatformId: 'USER-VIEWER', permissions: [] } }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.found).toBe(true);
    // viewerUserId = USER-VIEWER (NAO o curador que promoveu).
    expect(storage.getFamilyDetails).toHaveBeenCalledWith('USER-VIEWER', PREMIUM_ROW.familyKey);
  });

  it('found:false quando a familia nao esta no historico do viewer (sem erro)', async () => {
    const storage = makeStorage({
      getFamilyDetails: vi.fn(async () => ({ found: false, metrics: null, recentResults: [] })),
    });
    const res = makeRes();
    await handlePremiumDetails(makeReq({ params: { id: 'p_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.found).toBe(false);
  });

  it('404 quando o :id Premium nao existe', async () => {
    const storage = makeStorage({ getPremiumHighlight: vi.fn(async () => null) });
    const res = makeRes();
    await handlePremiumDetails(makeReq({ params: { id: 'p_missing' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(storage.getFamilyDetails).not.toHaveBeenCalled();
  });
});

// =============================================================================
// POST /api/library/premium (RF-01) — promover
// =============================================================================

describe('POST /api/library/premium — promover (RF-01)', () => {
  const validBody = {
    site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular', groupName: 'Bounty Hunters $22',
    buyInTier: '$22', type: 'mtt', metrics: { roi: 18.4 }, reasons: [{ kind: 'roi', label: 'ROI alto' }],
  };

  it('200 com curatedBy = userPlatformId do curador + source library', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handlePromotePremium(makeReq({ body: validBody }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(storage.promotePremiumHighlight).toHaveBeenCalledTimes(1);
    const arg = storage.promotePremiumHighlight.mock.calls[0][0];
    expect(arg.curatedBy).toBe('USER-CURATOR');
    expect(arg.familyKey).toBe(validBody.familyKey);
    // promocao direta => source 'library' (sem rastreabilidade de import).
    expect(arg.source ?? 'library').toBe('library');
  });

  it('400 quando familyKey ausente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    const { familyKey, ...noFamily } = validBody;
    await handlePromotePremium(makeReq({ body: noFamily }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.promotePremiumHighlight).not.toHaveBeenCalled();
  });

  it('400 quando site ausente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    const { site, ...noSite } = validBody;
    await handlePromotePremium(makeReq({ body: noSite }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.promotePremiumHighlight).not.toHaveBeenCalled();
  });

  it('409 already_in_premium quando o storage sinaliza conflito (NAO throw)', async () => {
    const storage = makeStorage({
      promotePremiumHighlight: vi.fn(async () => ({ ok: false, conflict: 'already_in_premium' })),
    });
    const res = makeRes();
    await handlePromotePremium(makeReq({ body: validBody }), res, storage);
    expect(res.statusCode).toBe(409);
  });

  it('401 sem usuario autenticado', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handlePromotePremium(makeReq({ user: undefined, body: validBody }), res, storage);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// DELETE /api/library/premium/:id (RF-04) — remover
// =============================================================================

describe('DELETE /api/library/premium/:id — remover (RF-04)', () => {
  it('200 quando remove item existente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleRemovePremium(makeReq({ params: { id: 'p_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.removePremiumHighlight).toHaveBeenCalledWith('p_1');
  });

  it('404 quando :id inexistente (storage retorna false)', async () => {
    const storage = makeStorage({ removePremiumHighlight: vi.fn(async () => false) });
    const res = makeRes();
    await handleRemovePremium(makeReq({ params: { id: 'p_missing' } }), res, storage);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// GET /api/library/premium/curator/highlights (RF-06) — painel cross-user
// =============================================================================

describe('GET /api/library/premium/curator/highlights — cross-user (RF-06)', () => {
  it('200 lista cross-user com atribuicao + alreadyInPremium + total', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCuratorHighlights(makeReq({ query: { limit: '50', offset: '0' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe('a@example.com');
    expect(res.body.items[0]).toHaveProperty('alreadyInPremium');
  });

  it('repassa filtros ?site=/?userId=/?limit=/?offset= ao storage', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCuratorHighlights(
      makeReq({ query: { site: 'ggpoker', userId: 'USER-A', limit: '10', offset: '20' } }),
      res, storage,
    );
    expect(res.statusCode).toBe(200);
    const arg = storage.listAllUserHighlights.mock.calls[0][0];
    expect(arg.site).toBe('ggpoker');
    expect(arg.userId).toBe('USER-A');
    expect(arg.limit).toBe(10);
    expect(arg.offset).toBe(20);
  });

  it('401 sem usuario autenticado', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCuratorHighlights(makeReq({ user: undefined }), res, storage);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/library/premium/import (RF-07) — importar highlight de outra conta
// =============================================================================

describe('POST /api/library/premium/import — importar (RF-07)', () => {
  it('200 importa highlight de outra conta com rastreabilidade (source=import)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleImportPremium(makeReq({ body: { sourceHighlightId: 'hl_42' } }), res, storage);
    expect([200, 201]).toContain(res.statusCode);
    expect(storage.getSavedHighlightByIdAnyUser).toHaveBeenCalledWith('hl_42');
    // promove com source='import' + sourceUserId (dono do highlight) + sourceHighlightId.
    const arg = storage.promotePremiumHighlight.mock.calls[0][0];
    expect(arg.source).toBe('import');
    expect(arg.sourceUserId).toBe('USER-OWNER');
    expect(arg.sourceHighlightId).toBe('hl_42');
    expect(arg.curatedBy).toBe('USER-CURATOR');
    // campos espelhados da fonte.
    expect(arg.familyKey).toBe('C|mtt|$33|regular');
  });

  it('404 quando sourceHighlightId nao existe', async () => {
    const storage = makeStorage({ getSavedHighlightByIdAnyUser: vi.fn(async () => null) });
    const res = makeRes();
    await handleImportPremium(makeReq({ body: { sourceHighlightId: 'hl_missing' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(storage.promotePremiumHighlight).not.toHaveBeenCalled();
  });

  it('409 already_in_premium quando a familia ja esta na Premium', async () => {
    const storage = makeStorage({
      promotePremiumHighlight: vi.fn(async () => ({ ok: false, conflict: 'already_in_premium' })),
    });
    const res = makeRes();
    await handleImportPremium(makeReq({ body: { sourceHighlightId: 'hl_42' } }), res, storage);
    expect(res.statusCode).toBe(409);
  });

  it('400 quando sourceHighlightId ausente no body', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleImportPremium(makeReq({ body: {} }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.getSavedHighlightByIdAnyUser).not.toHaveBeenCalled();
  });

  it('401 sem usuario autenticado', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleImportPremium(makeReq({ user: undefined, body: { sourceHighlightId: 'hl_42' } }), res, storage);
    expect(res.statusCode).toBe(401);
  });
});
