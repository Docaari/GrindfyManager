/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 7 — RF-02 (GET /api/home/focus-stats)
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-02
 * ADRs : 116 (schema) + 117 (theme_id) + 118 (zona Estudos)
 * Pad. : tests/api/home-coach-recommendation.test.ts (handlers exportados +
 *        mocks de storage; sem montar Express).
 *
 * Cobertura:
 *   - 401 sem userPlatformId
 *   - 200 com mes corrente (default = month UTC YYYY-MM) + items: []
 *     quando user sem marcacoes
 *   - 200 com items populadas quando service retorna 3 entries
 *   - 400 quando query.month tem formato invalido
 *   - 200 com previousMonth derivado (incluindo virada de ano)
 *   - inclui meta.generatedAt + meta.limitReached (true se 3, false caso
 *     contrario)
 *
 * Lessons aplicadas:
 *   #3 mock storage shape REAL
 *   #5 vi.fn() ok aqui
 *
 * Status RED: handler `handleGetFocusStats` NAO existe. Modulo
 * `server/routes/home-focus-stats.ts` (ou similar) sera criado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock service focusStats
//
// IMPORTANTE: usamos vi.hoisted para criar a referencia ao mock fn ANTES de
// vi.mock ser hoisted, e mantemos um getter `getFocusStatsForHome` lazy via
// `await import` em cada teste — assim, se o modulo `focusStats` real ainda
// nao existe (red phase), os testes do handler ainda enumeram (o mock cobre)
// e cada teste falha individualmente em "Cannot find module" do handler, em
// vez de explodir o test file na fase de imports.
// =============================================================================
const { getFocusStatsForHomeMock } = vi.hoisted(() => ({
  getFocusStatsForHomeMock: vi.fn(),
}));

vi.mock('../../server/services/focusStats', () => ({
  getFocusStatsForHome: getFocusStatsForHomeMock,
}));

async function loadHandlers() {
  return await import('../../server/routes/home-focus-stats');
}

// Alias para uso nos testes (mantem nome curto)
const getFocusStatsForHome = getFocusStatsForHomeMock;

// =============================================================================
// Helpers req/res — padrao home-coach-recommendation.test.ts
// =============================================================================
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
  const res: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers[key.toLowerCase()] = value;
    return res;
  };
  res.set = res.setHeader;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Freeze: 2026-05-21 03:14 UTC -> mes corrente '2026-05'
  vi.setSystemTime(new Date('2026-05-21T03:14:01Z'));
});

// =============================================================================
// Auth
// =============================================================================
describe('GET /api/home/focus-stats — auth', () => {
  it('rejeita sem userPlatformId (401)', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('aceita request com userPlatformId valido (200)', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// Default month = mes corrente UTC
// =============================================================================
describe('GET /api/home/focus-stats — default month', () => {
  it('sem query.month -> usa mes corrente UTC (2026-05)', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.month).toBe('2026-05');
    expect(getFocusStatsForHome).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-05', userId: 'USER-OWNER' }),
    );
  });

  it('com query.month=2026-04 (mes anterior) -> aceita e usa', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq({ query: { month: '2026-04' } });
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.month).toBe('2026-04');
  });
});

// =============================================================================
// Validacao formato month
// =============================================================================
describe('GET /api/home/focus-stats — validacao month', () => {
  it('query.month=invalid -> 400', async () => {
    const req = makeReq({ query: { month: 'invalid' } });
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('query.month=2026-13 (mes invalido) -> 400', async () => {
    const req = makeReq({ query: { month: '2026-13' } });
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('query.month=20260-5 (formato invalido) -> 400', async () => {
    const req = makeReq({ query: { month: '20260-5' } });
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// Empty: items: []
// =============================================================================
describe('GET /api/home/focus-stats — sem marcacoes', () => {
  it('service retorna items vazio -> 200 + items: []', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

// =============================================================================
// Populated: 3 items
// =============================================================================
describe('GET /api/home/focus-stats — populated', () => {
  it('service retorna 3 items -> 200 + items array shape correto', async () => {
    const items = [
      {
        id: 'ufs-1',
        statId: 'cbet_flop_ip',
        statLabel: 'C-Bet Flop IP',
        statUnit: 'pct',
        currentValue: 62.4,
        previousValue: 58.1,
        delta: 4.3,
        deltaDirection: 'improving',
        theme: { id: 'th-1', name: 'C-Bet Heads-Up', color: '#16a34a', emoji: 'C', progress: 35 },
        studyMinutesMonth: 78,
      },
      {
        id: 'ufs-2',
        statId: 'vpip',
        statLabel: 'VPIP',
        statUnit: 'pct',
        currentValue: 22.5,
        previousValue: 24.0,
        delta: -1.5,
        deltaDirection: 'improving',
        theme: { id: 'th-2', name: 'Tighten up', color: '#dc2626', emoji: 'V', progress: 10 },
        studyMinutesMonth: 30,
      },
      {
        id: 'ufs-3',
        statId: 'pfr',
        statLabel: 'PFR',
        statUnit: 'pct',
        currentValue: 18.0,
        previousValue: null,
        delta: null,
        deltaDirection: null,
        theme: { id: 'th-3', name: 'PFR', color: '#0ea5e9', emoji: 'P', progress: 0 },
        studyMinutesMonth: 0,
      },
    ];
    (getFocusStatsForHome as any).mockResolvedValue({ items });

    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].statId).toBe('cbet_flop_ip');
    expect(res.body.items[1].statId).toBe('vpip');
    expect(res.body.items[2].statId).toBe('pfr');
  });
});

// =============================================================================
// previousMonth derivacao (inclusive virada de ano)
// =============================================================================
describe('GET /api/home/focus-stats — previousMonth', () => {
  it('mes 2026-05 -> previousMonth = 2026-04', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.body.previousMonth).toBe('2026-04');
  });

  it('mes 2026-01 -> previousMonth = 2025-12 (virada de ano)', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    vi.setSystemTime(new Date('2026-01-15T03:00:00Z'));
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.body.month).toBe('2026-01');
    expect(res.body.previousMonth).toBe('2025-12');
  });
});

// =============================================================================
// meta: limitReached
// =============================================================================
describe('GET /api/home/focus-stats — meta.limitReached', () => {
  it('items.length === 3 -> meta.limitReached: true', async () => {
    const items = [
      { id: 'a', statId: 'a', statLabel: 'A', statUnit: 'pct', currentValue: 1, previousValue: 1, delta: 0, deltaDirection: 'neutral', theme: null, studyMinutesMonth: 0 },
      { id: 'b', statId: 'b', statLabel: 'B', statUnit: 'pct', currentValue: 1, previousValue: 1, delta: 0, deltaDirection: 'neutral', theme: null, studyMinutesMonth: 0 },
      { id: 'c', statId: 'c', statLabel: 'C', statUnit: 'pct', currentValue: 1, previousValue: 1, delta: 0, deltaDirection: 'neutral', theme: null, studyMinutesMonth: 0 },
    ];
    (getFocusStatsForHome as any).mockResolvedValue({ items });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.body.meta?.limitReached).toBe(true);
  });

  it('items.length < 3 -> meta.limitReached: false', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({
      items: [
        { id: 'a', statId: 'a', statLabel: 'A', statUnit: 'pct', currentValue: 1, previousValue: 1, delta: 0, deltaDirection: 'neutral', theme: null, studyMinutesMonth: 0 },
      ],
    });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(res.body.meta?.limitReached).toBe(false);
  });

  it('inclui meta.generatedAt em ISO string', async () => {
    (getFocusStatsForHome as any).mockResolvedValue({ items: [] });
    const req = makeReq();
    const res = makeRes();
    const { handleGetFocusStats } = await loadHandlers();
    await handleGetFocusStats(req, res);
    expect(typeof res.body.meta?.generatedAt).toBe('string');
    expect(res.body.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
