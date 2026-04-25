import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1): PUT /api/user-settings/weekly-heuristics (RF-22)
//
// Fonte: Docs/specs/warm-up-sprint-w1-spec.md (Secao 7.4)
//
// Body: { heuristics: [string, string, string] }
//   cada string trim().min(1).max(280)
// Response 200: { heuristics: [string, string, string] }
//
// Status esperado: TODOS DEVEM FALHAR (red).
// =============================================================================

vi.mock('../../../../server/services/warmupService', () => ({
  warmupService: {
    updateWeeklyHeuristics: vi.fn(),
  },
}));

import { handleUpdateWeeklyHeuristics } from '../../../../server/routes/warmup-rituals';
import { warmupService } from '../../../../server/services/warmupService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001',
      permissions: ['mental_prep_access'],
    },
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

describe('PUT /api/user-settings/weekly-heuristics - happy path', () => {
  it('payload com 3 strings nao-vazias -> 200', async () => {
    const heuristics = [
      'BB vs BTN 25bb defender 58%',
      '3betar 11% polarizado',
      'fold abaixo de Q7o',
    ];
    (warmupService.updateWeeklyHeuristics as any).mockResolvedValue({ heuristics });

    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.heuristics).toEqual(heuristics);
    expect(warmupService.updateWeeklyHeuristics).toHaveBeenCalledWith(
      'USER-0001',
      heuristics,
    );
  });

  it('strings com 280 chars exatamente -> 200', async () => {
    const max = 'x'.repeat(280);
    (warmupService.updateWeeklyHeuristics as any).mockResolvedValue({
      heuristics: [max, max, max],
    });

    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: [max, max, max] } }) as any,
      res,
    );

    expect(res.statusCode).toBe(200);
  });
});

describe('PUT /api/user-settings/weekly-heuristics - validacoes', () => {
  it('array com 2 strings -> 400 (deve ter exatamente 3)', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: ['a', 'b'] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('array com 4 strings -> 400', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: ['a', 'b', 'c', 'd'] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('string vazia -> 400', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: ['a', '', 'c'] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('string com 281 chars -> 400 (max 280)', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: ['a', 'b', 'x'.repeat(281)] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('payload sem chave heuristics -> 400', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: {} }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('strings com whitespace puro -> 400 (trim())', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({ body: { heuristics: ['a', '   ', 'c'] } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /api/user-settings/weekly-heuristics - auth', () => {
  it('sem req.user -> 401', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({
        user: undefined,
        body: { heuristics: ['a', 'b', 'c'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(401);
  });

  it('user sem mental_prep_access -> 403', async () => {
    const res = makeRes();
    await handleUpdateWeeklyHeuristics(
      makeReq({
        user: { userPlatformId: 'USER-0001', permissions: [] },
        body: { heuristics: ['a', 'b', 'c'] },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(403);
  });
});
