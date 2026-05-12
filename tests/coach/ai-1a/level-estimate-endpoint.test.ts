import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-07 + RF-08 — GET /api/coach/level-estimate
//   handleGetLevelEstimate(req, res, injectedStorage?)
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-08, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/154-deteccao-nivel-rule-based.md (§Uso)
//
// O handler carrega: getDashboardStats(userId,'all') + getDashboardStats(userId,'90d')
//   + getAnalyticsBySite(userId,'all') + getUser(userId).createdAt/subscriptionPlan;
//   converte ABI pra USD (lesson #6); chama estimatePlayerLevel; retorna; NAO persiste.
//
// §6.1: getDashboardStats ja filtra grind_session_id IS NULL — nunca agrega session_tournaments.
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { id: 'u-1', userPlatformId: 'USER-0001', email: 'p@t.com', role: 'user', subscriptionPlan: 'pro' },
    params: {}, body: {}, query: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

function makeStorage(overrides: any = {}) {
  return {
    getDashboardStats: vi.fn(async (_uid: string, period: string) => {
      if (period === 'all') return { count: 800, totalBuyins: 44000, totalProfit: 3520 }; // ABI = 55, ROI = 8%
      return { count: 200, totalBuyins: 11000, totalProfit: -220 }; // 90d ROI ~ -2%
    }),
    getAnalyticsBySite: vi.fn(async () => [{ site: 'GGPoker' }, { site: 'PokerStars' }]),
    getUser: vi.fn(async () => ({ id: 'u-1', userPlatformId: 'USER-0001', createdAt: new Date('2024-01-01'), subscriptionPlan: 'pro' })),
    // updateAiStructuredProfile NAO deve ser chamado (idempotente / nao persiste)
    updateAiStructuredProfile: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('GET /api/coach/level-estimate — happy path', () => {
  it('200 com { nivel, confidence, humanLabel, evidence, note? }', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleGetLevelEstimate(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      nivel: expect.any(String),
      confidence: expect.stringMatching(/^(low|medium|high)$/),
      humanLabel: expect.any(String),
      evidence: expect.objectContaining({
        abiUSD: expect.anything(),
        volumeAllTime: expect.any(Number),
        volumeLast90d: expect.any(Number),
        distinctNetworks: expect.any(Number),
        accountAgeMonths: expect.any(Number),
      }),
    }));
  });

  it('com dados de mid-stakes -> nivel mid_consistente', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage(); // ABI 55, vol 800, vol90 200, roi90 -2, roiAll 8, account ~16+ meses
    const req = makeReq();
    const res = makeRes();
    await handleGetLevelEstimate(req, res, storage);
    expect(res.body.nivel).toBe('mid_consistente');
  });

  it('NAO persiste — updateAiStructuredProfile nao chamado; chamar 2x nao muda o DB', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    await handleGetLevelEstimate(makeReq(), makeRes(), storage);
    await handleGetLevelEstimate(makeReq(), makeRes(), storage);
    expect(storage.updateAiStructuredProfile).not.toHaveBeenCalled();
  });
});

describe('GET /api/coach/level-estimate — edge cases', () => {
  it('usuario sem nenhum torneio -> sem_dados, note preenchido, sem throw', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage({
      getDashboardStats: vi.fn(async () => ({ count: 0, totalBuyins: 0, totalProfit: 0 })),
      getAnalyticsBySite: vi.fn(async () => []),
    });
    const req = makeReq();
    const res = makeRes();
    await handleGetLevelEstimate(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.nivel).toBe('sem_dados');
    expect(typeof res.body.note).toBe('string');
    expect(res.body.note.length).toBeGreaterThan(0);
  });

  it('erro de DB ao carregar stats -> nao crasha; retorna 200 sem_dados OU 500 (lesson #9), nunca throw', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = makeStorage({ getDashboardStats: vi.fn(async () => { throw new Error('db_explode'); }) });
    const req = makeReq();
    const res = makeRes();
    await handleGetLevelEstimate(req, res, storage);
    expect([200, 500]).toContain(res.statusCode);
    errSpy.mockRestore();
  });

  it('401 sem auth', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleGetLevelEstimate(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/coach/level-estimate — usa as fontes corretas (§6.1 + lesson #6)', () => {
  it('chama getDashboardStats com period "all" e "90d"', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    await handleGetLevelEstimate(makeReq(), makeRes(), storage);
    const periods = storage.getDashboardStats.mock.calls.map((c: any) => c[1]);
    expect(periods).toContain('all');
    expect(periods).toContain('90d');
  });

  it('chama getAnalyticsBySite (para distinctNetworks)', async () => {
    const { handleGetLevelEstimate } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    await handleGetLevelEstimate(makeReq(), makeRes(), storage);
    expect(storage.getAnalyticsBySite).toHaveBeenCalled();
  });
});
