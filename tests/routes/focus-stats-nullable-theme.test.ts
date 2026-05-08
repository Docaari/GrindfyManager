/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-3.1 POST /api/focus-stats aceita studyThemeId=null
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-3.1
 * Migration: 0053_user_focus_stats_nullable_theme.sql
 *
 * Cobertura:
 *   - 201 cria focus stat sem studyThemeId (theme=null)
 *   - Skip da validacao "ownership do tema" quando studyThemeId=null
 *   - 400 mantido para outras invalidades (statId invalido, etc)
 *
 * Lessons:
 *   #14 vi.hoisted
 *
 * Status RED: server/routes/focus-stats.ts JA EXISTE mas precisa atualizar
 *             schema Zod para aceitar null + skip ownership check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  countUserFocusStatsMock,
  createUserFocusStatMock,
  getStudyThemeByIdMock,
  invalidateMock,
} = vi.hoisted(() => ({
  countUserFocusStatsMock: vi.fn(),
  createUserFocusStatMock: vi.fn(),
  getStudyThemeByIdMock: vi.fn(),
  invalidateMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    countUserFocusStats: countUserFocusStatsMock,
    createUserFocusStat: createUserFocusStatMock,
    getStudyThemeById: getStudyThemeByIdMock,
    deleteUserFocusStat: vi.fn(),
  },
}));

vi.mock('../../server/services/focusStats', () => ({
  invalidateFocusStatsCache: invalidateMock,
}));

// Mock catalog: aceitar 'cbet_flop_oop' como stat valida
vi.mock('@shared/hud-stat-catalog', () => ({
  getStatById: (id: string) => {
    if (id === 'cbet_flop_oop' || id === 'threebet_pct') {
      return { id, label: id, unit: '%', direction: 'higher_better' };
    }
    return undefined;
  },
}));

function makeReqRes(opts: { userId?: string | null; body?: any; params?: any }) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
    params: opts.params ?? {},
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/focus-stats — RF-3.1 aceita studyThemeId=null', () => {
  it('201 cria focus stat com studyThemeId=null', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    createUserFocusStatMock.mockResolvedValue({
      id: 'ufs-no-theme',
      userId: 'USER-0001',
      statId: 'cbet_flop_oop',
      studyThemeId: null,
      month: '2026-05',
    });

    const route: any = await import('../../server/routes/focus-stats');
    const handler = route.handleCreateFocusStat;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { statId: 'cbet_flop_oop', studyThemeId: null },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body?.studyThemeId).toBeNull();
  });

  it('NAO chama getStudyThemeById quando studyThemeId=null (skip ownership check)', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    createUserFocusStatMock.mockResolvedValue({
      id: 'ufs-no-theme',
      userId: 'USER-0001',
      statId: 'cbet_flop_oop',
      studyThemeId: null,
      month: '2026-05',
    });

    const route: any = await import('../../server/routes/focus-stats');
    const handler = route.handleCreateFocusStat;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { statId: 'cbet_flop_oop', studyThemeId: null },
    });
    await handler(req, res);

    expect(getStudyThemeByIdMock).not.toHaveBeenCalled();
  });

  it('400 quando statId nao existe no catalog (mesmo com theme=null)', async () => {
    const route: any = await import('../../server/routes/focus-stats');
    const handler = route.handleCreateFocusStat;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { statId: 'fake_stat_xyz', studyThemeId: null },
    });
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('REGRESSAO: ainda valida ownership quando studyThemeId presente', async () => {
    countUserFocusStatsMock.mockResolvedValue(0);
    getStudyThemeByIdMock.mockResolvedValue({
      id: 'th-other',
      userId: 'USER-OTHER',
    });

    const route: any = await import('../../server/routes/focus-stats');
    const handler = route.handleCreateFocusStat;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { statId: 'cbet_flop_oop', studyThemeId: 'th-other' },
    });
    await handler(req, res);

    expect([403, 404]).toContain(res.statusCode);
    expect(getStudyThemeByIdMock).toHaveBeenCalled();
  });
});
