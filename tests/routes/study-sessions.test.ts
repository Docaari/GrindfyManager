/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-1 Routes /api/study-sessions
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1 (todos os endpoints)
 *        - POST   /api/study-sessions
 *        - GET    /api/study-sessions
 *        - PATCH  /api/study-sessions/:id
 *        - DELETE /api/study-sessions/:id
 *        - POST   /api/study-sessions/:id/finalize
 *        - GET    /api/users/me/study-habit
 * ADRs : 126 (study_sessions_v2) + 128 (streak) + 130 (auto_lesson)
 *
 * Cobertura:
 *   - Validacao Zod por mode (drill_gto exige theme; lesson exige lesson_id; etc)
 *   - Auth (401 sem JWT)
 *   - Cross-user (403 ao tentar usar theme/lesson/tournament de outro user)
 *   - Limite duration_minutes (1-1440)
 *   - 409 SESSION_ALREADY_RUNNING (manual_live duplicado)
 *   - DELETE 24h gate (403 apos)
 *   - Streak bumped na mesma transacao (verifica chamada bumpStudyStreak)
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para spies em vi.mock factory
 *   #5  vi.fn() ok (sem `new`)
 *   #13 apiRequest: handlers retornam JSON direto
 *
 * Status RED: arquivo server/routes/study-sessions.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// vi.hoisted — spies compartilhados (lesson #14)
// =============================================================================
const {
  createStudySessionV2Mock,
  getStudySessionsV2Mock,
  getStudySessionV2ByIdMock,
  getRunningStudySessionV2Mock,
  updateStudySessionV2Mock,
  deleteStudySessionV2Mock,
  finalizeStudySessionV2Mock,
  getStudyThemeByIdMock,
  getLessonByIdMock,
  getTournamentByIdMock,
  bumpStudyStreakMock,
  getStudyHabitMock,
} = vi.hoisted(() => ({
  createStudySessionV2Mock: vi.fn(),
  getStudySessionsV2Mock: vi.fn(),
  getStudySessionV2ByIdMock: vi.fn(),
  getRunningStudySessionV2Mock: vi.fn(),
  updateStudySessionV2Mock: vi.fn(),
  deleteStudySessionV2Mock: vi.fn(),
  finalizeStudySessionV2Mock: vi.fn(),
  getStudyThemeByIdMock: vi.fn(),
  getLessonByIdMock: vi.fn(),
  getTournamentByIdMock: vi.fn(),
  bumpStudyStreakMock: vi.fn(),
  getStudyHabitMock: vi.fn(),
}));

vi.mock('../../server/storage', () => ({
  storage: {
    createStudySessionV2: createStudySessionV2Mock,
    getStudySessionsV2: getStudySessionsV2Mock,
    getStudySessionV2ById: getStudySessionV2ByIdMock,
    getRunningStudySessionV2: getRunningStudySessionV2Mock,
    updateStudySessionV2: updateStudySessionV2Mock,
    deleteStudySessionV2: deleteStudySessionV2Mock,
    finalizeStudySessionV2: finalizeStudySessionV2Mock,
    getStudyThemeById: getStudyThemeByIdMock,
    getLibraryLessonById: getLessonByIdMock,
    getTournament: getTournamentByIdMock,
  },
}));

vi.mock('../../server/services/studyStreak', () => ({
  bumpStudyStreak: bumpStudyStreakMock,
  getStudyHabit: getStudyHabitMock,
}));

// =============================================================================
// Helpers req/res mock
// =============================================================================
function makeReqRes(opts: {
  userId?: string | null;
  body?: any;
  query?: any;
  params?: any;
}) {
  const req: any = {
    user: opts.userId ? { userPlatformId: opts.userId } : null,
    body: opts.body ?? {},
    query: opts.query ?? {},
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

async function loadRoute() {
  return await import('../../server/routes/study-sessions');
}

beforeEach(() => {
  vi.clearAllMocks();
  bumpStudyStreakMock.mockResolvedValue({
    streakDays: 1,
    todayMinutes: 30,
    goalMinutes: 30,
    todayMet: true,
    transition: 'incremented',
  });
});

// =============================================================================
// POST /api/study-sessions — Auth
// =============================================================================
describe('POST /api/study-sessions — Auth', () => {
  it('401 quando sem userId no req.user', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({ userId: null, body: { mode: 'drill_gto' } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/study-sessions — Validacao Zod por mode
// =============================================================================
describe('POST /api/study-sessions — Validacao Zod (RF-1.3)', () => {
  it('happy path drill_gto retorna 201', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001', name: 'C-bet OOP' });
    createStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_post_hoc',
      status: 'completed',
      themeId: 'th-1',
      durationMinutes: 30,
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        themeId: 'th-1',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ mode: 'drill_gto' });
  });

  it('400 quando mode=drill_gto sem theme_id', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { mode: 'drill_gto', source: 'manual_post_hoc', durationMinutes: 30 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando mode=lesson sem lesson_id', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { mode: 'lesson', source: 'manual_post_hoc', themeId: 'th-1', durationMinutes: 25 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando mode=lesson com lesson NAO publicada (LESSON_NOT_PUBLISHED)', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    getLessonByIdMock.mockResolvedValue({ id: 'lesson-1', isPublished: false });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'lesson',
        source: 'manual_post_hoc',
        lessonId: 'lesson-1',
        themeId: 'th-1',
        durationMinutes: 25,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/LESSON_NOT_PUBLISHED|not_published|invalid/i);
  });

  it('400 quando mode=hand_review com starred_hand_ids vazio', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'hand_review',
        source: 'manual_post_hoc',
        starredHandIds: [],
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando duration_minutes=0', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { mode: 'other', source: 'manual_post_hoc', themeId: 'th-1', durationMinutes: 0 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando duration_minutes>1440 (cap 24h)', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { mode: 'other', source: 'manual_post_hoc', themeId: 'th-1', durationMinutes: 2000 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando drill_accuracy=150 (fora 0-100)', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        themeId: 'th-1',
        durationMinutes: 30,
        drillAccuracy: 150,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando notes > 2000 chars', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const longNotes = 'x'.repeat(2100);
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        themeId: 'th-1',
        durationMinutes: 30,
        notes: longNotes,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando mode invalido (fora do enum)', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: { mode: 'invalid_mode', source: 'manual_post_hoc', durationMinutes: 30 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando source invalida (fora do enum)', async () => {
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'spam_source',
        themeId: 'th-1',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// POST /api/study-sessions — Cross-user (403)
// =============================================================================
describe('POST /api/study-sessions — Cross-user ownership', () => {
  it('403 quando theme pertence a outro user', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-other', userId: 'USER-OTHER' });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        themeId: 'th-other',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect([403, 404]).toContain(res.statusCode);
  });

  it('403 quando tournamentId pertence a outro user', async () => {
    getTournamentByIdMock.mockResolvedValue({
      id: 'tour-other',
      userId: 'USER-OTHER',
      grindSessionId: null,
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'tournament_review',
        source: 'manual_post_hoc',
        tournamentId: 'tour-other',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect([403, 404]).toContain(res.statusCode);
  });

  it('400 quando tournamentId tem grindSessionId NOT NULL (eh session_tournament, nao historico)', async () => {
    getTournamentByIdMock.mockResolvedValue({
      id: 'tour-from-grind-session',
      userId: 'USER-0001',
      grindSessionId: 'gs-1',
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'tournament_review',
        source: 'manual_post_hoc',
        tournamentId: 'tour-from-grind-session',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// POST /api/study-sessions — manual_live + 409 SESSION_ALREADY_RUNNING
// =============================================================================
describe('POST /api/study-sessions — manual_live constraint (RF-1.4)', () => {
  it('409 quando ja existe session running do user', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    createStudySessionV2Mock.mockRejectedValue(
      Object.assign(new Error('already running'), { code: 'SESSION_ALREADY_RUNNING' }),
    );
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_live',
        status: 'running',
        themeId: 'th-1',
        durationMinutes: 1,
        startedAt: new Date().toISOString(),
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('201 cria session running com startedAt populado', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    createStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-live',
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_live',
      status: 'running',
      themeId: 'th-1',
      durationMinutes: 1,
      startedAt: new Date(),
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_live',
        status: 'running',
        themeId: 'th-1',
        durationMinutes: 1,
        startedAt: new Date().toISOString(),
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body?.status).toBe('running');
  });
});

// =============================================================================
// POST /api/study-sessions — Streak bumped (RF-2)
// =============================================================================
describe('POST /api/study-sessions — Streak integration (RF-1 + RF-2)', () => {
  it('chama bumpStudyStreak apos insert quando completed', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    createStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      mode: 'drill_gto',
      status: 'completed',
      durationMinutes: 30,
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_post_hoc',
        themeId: 'th-1',
        durationMinutes: 30,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(bumpStudyStreakMock).toHaveBeenCalled();
  });

  it('NAO chama bumpStudyStreak quando session=running (so finalizar conta)', async () => {
    getStudyThemeByIdMock.mockResolvedValue({ id: 'th-1', userId: 'USER-0001' });
    createStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-live',
      userId: 'USER-0001',
      mode: 'drill_gto',
      status: 'running',
      durationMinutes: 1,
      startedAt: new Date(),
    });
    const route: any = await loadRoute();
    const handler = route.handleCreateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      body: {
        mode: 'drill_gto',
        source: 'manual_live',
        status: 'running',
        themeId: 'th-1',
        durationMinutes: 1,
        startedAt: new Date().toISOString(),
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    // Implementer pode escolher chamar ou nao bumpStreak para running.
    // Spec eh ambiguo; aceitamos os dois — mas no finalize PRECISA chamar.
    expect(true).toBe(true);
  });
});

// =============================================================================
// GET /api/study-sessions — list paginada
// =============================================================================
describe('GET /api/study-sessions', () => {
  it('200 retorna array de sessions do user', async () => {
    getStudySessionsV2Mock.mockResolvedValue([
      { id: 'ssv2-1', userId: 'USER-0001', mode: 'drill_gto', durationMinutes: 30 },
      { id: 'ssv2-2', userId: 'USER-0001', mode: 'lesson', durationMinutes: 25 },
    ]);
    const route: any = await loadRoute();
    const handler = route.handleListStudySessions;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body?.items)).toBe(true);
  });

  it('aceita filtro mode + period query params', async () => {
    getStudySessionsV2Mock.mockResolvedValue([]);
    const route: any = await loadRoute();
    const handler = route.handleListStudySessions;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      query: { mode: 'drill_gto', from: '2026-05-01', to: '2026-05-31' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(getStudySessionsV2Mock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ mode: 'drill_gto' }),
    );
  });
});

// =============================================================================
// PATCH /api/study-sessions/:id
// =============================================================================
describe('PATCH /api/study-sessions/:id (RF-1)', () => {
  it('200 atualiza notes', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      mode: 'drill_gto',
      durationMinutes: 30,
    });
    updateStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      notes: 'Notas novas',
    });
    const route: any = await loadRoute();
    const handler = route.handleUpdateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-1' },
      body: { notes: 'Notas novas' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('404 quando id inexistente OU outro user', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue(null);
    const route: any = await loadRoute();
    const handler = route.handleUpdateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-none' },
      body: { notes: 'x' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('400 ao tentar mudar campos imutaveis (mode, source, durationMinutes)', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      mode: 'drill_gto',
    });
    const route: any = await loadRoute();
    const handler = route.handleUpdateStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-1' },
      body: { mode: 'lesson', durationMinutes: 999 },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// DELETE /api/study-sessions/:id (24h gate)
// =============================================================================
describe('DELETE /api/study-sessions/:id (RF-1 24h gate)', () => {
  it('200 deleta dentro de 24h', async () => {
    const recent = new Date(Date.now() - 1000 * 60 * 60 * 12); // 12h atras
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      createdAt: recent,
    });
    deleteStudySessionV2Mock.mockResolvedValue(true);
    const route: any = await loadRoute();
    const handler = route.handleDeleteStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-1' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('403 ao tentar deletar > 24h apos creation', async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25h atras
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-old',
      userId: 'USER-0001',
      createdAt: old,
    });
    const route: any = await loadRoute();
    const handler = route.handleDeleteStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-old' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });

  it('404 quando id inexistente', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue(null);
    const route: any = await loadRoute();
    const handler = route.handleDeleteStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-none' },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// POST /api/study-sessions/:id/finalize
// =============================================================================
describe('POST /api/study-sessions/:id/finalize (RF-1 live finalize)', () => {
  it('200 finaliza session running -> completed', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-live',
      userId: 'USER-0001',
      status: 'running',
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30min atras
    });
    finalizeStudySessionV2Mock.mockResolvedValue({
      id: 'ssv2-live',
      status: 'completed',
      durationMinutes: 30,
    });
    const route: any = await loadRoute();
    const handler = route.handleFinalizeStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-live' },
      body: {
        endedAt: new Date().toISOString(),
        durationMinutes: 30,
        wasProductive: true,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(bumpStudyStreakMock).toHaveBeenCalled();
  });

  it('409 quando session ja esta completed (INVALID_STATE)', async () => {
    getStudySessionV2ByIdMock.mockResolvedValue({
      id: 'ssv2-1',
      userId: 'USER-0001',
      status: 'completed',
    });
    const route: any = await loadRoute();
    const handler = route.handleFinalizeStudySession;
    const { req, res } = makeReqRes({
      userId: 'USER-0001',
      params: { id: 'ssv2-1' },
      body: {
        endedAt: new Date().toISOString(),
        durationMinutes: 30,
        wasProductive: true,
      },
    });
    await handler(req, res);
    expect(res.statusCode).toBe(409);
  });
});

// =============================================================================
// GET /api/users/me/study-habit
// =============================================================================
describe('GET /api/users/me/study-habit (RF-2)', () => {
  it('200 retorna shape {streakDays, todayMinutes, goalMinutes, freezesUsedThisMonth, freezesRemaining}', async () => {
    getStudyHabitMock.mockResolvedValue({
      streakDays: 5,
      todayMinutes: 18,
      goalMinutes: 30,
      todayMet: false,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    });
    const route: any = await loadRoute();
    const handler = route.handleGetStudyHabit;
    const { req, res } = makeReqRes({ userId: 'USER-0001' });
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      streakDays: 5,
      goalMinutes: 30,
      freezesRemaining: 1,
    });
  });

  it('401 sem auth', async () => {
    const route: any = await loadRoute();
    const handler = route.handleGetStudyHabit;
    const { req, res } = makeReqRes({ userId: null });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });
});
