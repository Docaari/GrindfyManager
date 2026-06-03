import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Biblioteca Premium curada (ADR-240)
// Guard de colisao de rota (espelha est-3 / mda-route-collision).
//
// Spec : Docs/specs/premium-library.md ("Ordem de registro")
// ADR  : Docs/architecture/decisions/240-premium-library-curated.md (Decisao 6)
//
// A convencao do projeto testa handlers direto (sem montar Express), o que torna
// INVISIVEL o shadowing do Express 4 (ordem-pura). Este teste MONTA o app com
// registerPremiumLibraryRoutes e prova que os sub-paths estaticos / de 2 segmentos
// alcancam seus handlers dedicados, NAO o `/:id`:
//   - GET  /api/library/premium/curator/highlights  (sub-path estatico)
//   - POST /api/library/premium/import              (sub-path estatico)
//   - GET  /api/library/premium/:id/details         (2 segmentos)
//   - DELETE /api/library/premium/:id               (`:id` puro, por ultimo)
//
// NAO repetimos a assertion logicamente impossivel da lesson #25 (nao inventamos
// um legado `/:id` GET conflitante — nao existe GET /api/library/premium/:id puro,
// so /:id/details). Testamos APENAS a ordem REAL registrada por
// registerPremiumLibraryRoutes.
//
// Tambem cobre o next-leak (lesson #34): com wrapper (req,res)=>handler(req,res),
// o `next` do Express NAO vaza como 3o arg injectedStorage.
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

// Auth mockado: requireAuth injeta um curador; requireGranularPermission deixa
// passar (curador). Testamos ORDEM de rota aqui, nao a logica do guard (que vive
// em requireGranularPermission.test.ts).
vi.mock('../../../server/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { email: 'curador@example.com', userPlatformId: 'USER-CURATOR', permissions: ['premium_library_curate'] };
    next();
  },
  requireGranularPermission: () => (_req: any, _res: any, next: any) => next(),
}));

// Storage mockado com shape REAL minimo para os handlers nao 500.
vi.mock('../../../server/storage', () => ({
  storage: {
    listPremiumHighlights: vi.fn(async () => [{ id: 'p_1', site: 'ggpoker', familyKey: 'ggpoker|mtt|$22|regular' }]),
    getPremiumHighlight: vi.fn(async () => ({ id: 'p_1', familyKey: 'ggpoker|mtt|$22|regular' })),
    getFamilyDetails: vi.fn(async () => ({ found: true, metrics: {}, recentResults: [] })),
    promotePremiumHighlight: vi.fn(async (input: any) => ({ ok: true, row: { id: 'p_NEW', ...input } })),
    removePremiumHighlight: vi.fn(async () => true),
    // by-theme cross-user: o handler dedicado devolve { items, total } (objeto com
    // total) — distinto do GET /:id/details (que tem { highlight, found, ... }).
    listAllUserHighlights: vi.fn(async () => ({ items: [], total: 0 })),
    getSavedHighlightByIdAnyUser: vi.fn(async () => ({
      id: 'hl_42', userId: 'USER-OWNER', site: 'ggpoker', familyKey: 'C|mtt|$33|regular',
    })),
  },
}));

async function buildApp() {
  const app = express();
  app.use(express.json());
  const { registerPremiumLibraryRoutes } = await import('../../../server/routes/premiumLibrary');
  // Assinatura esperada: registerPremiumLibraryRoutes(app) OU (app, requireAuth).
  // Chamamos com app apenas; o modulo importa requireAuth/requireGranularPermission
  // do server/auth (mockado acima).
  registerPremiumLibraryRoutes(app);
  return app;
}

describe('Premium Library — ordem de registro (sub-paths antes do :id)', () => {
  let app: express.Express;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('GET /api/library/premium/curator/highlights alcanca o handler cross-user (objeto com total, NAO :id/details)', async () => {
    const res = await request(app).get('/api/library/premium/curator/highlights');
    expect(res.status).toBe(200);
    // O handler cross-user retorna { items, total }. Se 'curator/highlights'
    // tivesse sido shadowado por /:id/details (param id='curator'), o body seria
    // { highlight, found, ... } e NAO teria 'total'.
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('items');
  });

  it('POST /api/library/premium/import alcanca o handler de import (NAO o POST de promover)', async () => {
    const res = await request(app)
      .post('/api/library/premium/import')
      .send({ sourceHighlightId: 'hl_42' });
    // Import bem-sucedido => 200/201. Se 'import' caisse no POST de promocao direta
    // (que exige site+familyKey), receberiamos 400 (faltam campos).
    expect([200, 201]).toContain(res.status);
  });

  it('GET /api/library/premium/:id/details alcanca o drill-down (2 segmentos)', async () => {
    const res = await request(app).get('/api/library/premium/p_1/details');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('found');
  });

  it('DELETE /api/library/premium/:id alcanca o handler de remover (sem next-leak no injectedStorage)', async () => {
    const res = await request(app).delete('/api/library/premium/p_1');
    expect(res.status).toBe(200);
  });

  it('GET /api/library/premium (raiz) lista a premium', async () => {
    const res = await request(app).get('/api/library/premium');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
