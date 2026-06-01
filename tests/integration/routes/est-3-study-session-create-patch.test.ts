import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3
// POST/PATCH /api/study-sessions estendido (mode stat_analysis + campos B)
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-01/02/03/06)
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-4/D-5)
//
// Handlers em server/routes/study-sessions.ts:
//   handleCreateStudySession (estendido)
//   handleUpdateStudySession (estendido)
//
// Lesson #34: handler aceita injectedStorage como 3o arg (sem vi.mock('../storage')).
// Se o handler ainda nao aceitar 3o arg, estes testes falham (red) — o implementer
// adiciona o parametro.
// =============================================================================

// @ts-expect-error - exports/parametro injectedStorage podem nao existir ainda
import { handleCreateStudySession, handleUpdateStudySession } from '../../../server/routes/study-sessions';

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: any) => { res.headers[k] = v; return res; };
  return res;
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    getStudyThemeById: vi.fn(async () => ({ id: 'theme_1', userId: 'USER-0001' })),
    getLibraryLessonById: vi.fn(async () => ({ id: 'lesson_1', isPublished: true })),
    getTournament: vi.fn(async () => null),
    getStudySessionV2ById: vi.fn(async () => ({
      id: 'sess_1', userId: 'USER-0001', mode: 'stat_analysis', statId: 'vpip',
      createdAt: new Date().toISOString(), statAnalysisEntries: [],
    })),
    createStudySessionV2: vi.fn(async (input: any) => ({ id: 'sess_NEW', ...input })),
    updateStudySessionV2: vi.fn(async (_id: string, _u: string, patch: any) => ({ id: 'sess_1', ...patch })),
    ...overrides,
  };
}

const validEntry = { filters: 'BTN vs BB, 3bet pot', errorText: 'erro', learnedText: 'aprendi' };

beforeEach(() => { vi.clearAllMocks(); });

// =============================================================================
// RF-01 — exige themeId + statId; valida statId
// =============================================================================

describe('EST-3 POST stat_analysis — RF-01 requisitos', () => {
  it('201 com themeId + statId (catalog) + entries validas', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1',
        statId: 'vpip', durationMinutes: 30, statAnalysisEntries: [validEntry],
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
    expect(storage.createStudySessionV2).toHaveBeenCalledTimes(1);
  });

  it('400 MISSING_THEME quando stat_analysis sem themeId', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', statId: 'vpip', durationMinutes: 30,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('MISSING_THEME');
    expect(storage.createStudySessionV2).not.toHaveBeenCalled();
  });

  it('400 MISSING_STAT quando stat_analysis sem statId', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 30,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('MISSING_STAT');
  });

  it('400 INVALID_STAT_ID quando statId nao eh catalog nem custom_*', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1',
        statId: 'nope_invalid_xyz', durationMinutes: 30,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_STAT_ID');
    expect(storage.createStudySessionV2).not.toHaveBeenCalled();
  });

  it('201 aceita statId custom_* (^custom_[A-Za-z0-9_-]{1,48}$)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1',
        statId: 'custom_meu_stat-1', durationMinutes: 30, statAnalysisEntries: [validEntry],
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
  });

  it('400 INVALID_STAT_ID para custom_ vazio ou com path traversal', async () => {
    for (const bad of ['custom_', 'custom_../etc', 'custom_a/b']) {
      const storage = makeStorage();
      const res = makeRes();
      await handleCreateStudySession(
        makeReq({ body: {
          mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1',
          statId: bad, durationMinutes: 30,
        } }),
        res,
        storage,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_STAT_ID');
    }
  });
});

// =============================================================================
// RF-01 regressao — modos existentes ignoram statId
// =============================================================================

describe('EST-3 POST — regressao modos legados', () => {
  it('201 drill_gto sem statId (statId permanece null)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'drill_gto', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 20,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
    const call = storage.createStudySessionV2.mock.calls[0][0];
    expect(call.statId ?? null).toBeNull();
  });
});

// =============================================================================
// RF-02 — cap 10 + STAT_ENTRIES_WRONG_MODE
// =============================================================================

describe('EST-3 POST — RF-02 entries', () => {
  it('400 TOO_MANY_ENTRIES quando 11 entries na criacao', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1', statId: 'vpip',
        durationMinutes: 30,
        statAnalysisEntries: Array.from({ length: 11 }, () => validEntry),
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('TOO_MANY_ENTRIES');
    expect(storage.createStudySessionV2).not.toHaveBeenCalled();
  });

  it('400 STAT_ENTRIES_WRONG_MODE quando statAnalysisEntries em mode != stat_analysis', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'drill_gto', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 20,
        statAnalysisEntries: [validEntry],
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('STAT_ENTRIES_WRONG_MODE');
  });

  it('400 quando errorText > 1000 (INVALID_BODY)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'stat_analysis', source: 'manual_post_hoc', themeId: 'theme_1', statId: 'vpip',
        durationMinutes: 30,
        statAnalysisEntries: [{ ...validEntry, errorText: 'x'.repeat(1001) }],
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// RF-03 — campos B em qualquer modo + validacao
// =============================================================================

describe('EST-3 POST — RF-03 campos B', () => {
  it('201 drill_gto com handsSolvedCount + filtersAnalyzedCount (Parte B em qualquer modo)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'drill_gto', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 20,
        handsSolvedCount: 30, filtersAnalyzedCount: 4,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
    const call = storage.createStudySessionV2.mock.calls[0][0];
    expect(call.handsSolvedCount).toBe(30);
    expect(call.filtersAnalyzedCount).toBe(4);
  });

  it('400 quando handsSolvedCount negativo', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'drill_gto', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 20,
        handsSolvedCount: -1,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 sessao sem nenhum campo B (back-compat lesson #7)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleCreateStudySession(
      makeReq({ body: {
        mode: 'other', source: 'manual_post_hoc', themeId: 'theme_1', durationMinutes: 10,
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
  });
});

// =============================================================================
// RF-06 — PATCH: statId imutavel + campos editaveis + regressao
// =============================================================================

describe('EST-3 PATCH — RF-06', () => {
  it('400 IMMUTABLE_FIELD quando tenta editar statId', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUpdateStudySession(
      makeReq({ params: { id: 'sess_1' }, body: { statId: 'pfr' } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('IMMUTABLE_FIELD');
    expect(storage.updateStudySessionV2).not.toHaveBeenCalled();
  });

  it('400 IMMUTABLE_FIELD para mode/durationMinutes (regressao)', async () => {
    for (const body of [{ mode: 'lesson' }, { durationMinutes: 99 }]) {
      const storage = makeStorage();
      const res = makeRes();
      await handleUpdateStudySession(
        makeReq({ params: { id: 'sess_1' }, body }),
        res,
        storage,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('IMMUTABLE_FIELD');
    }
  });

  it('200 PATCH com handsSolvedCount/filtersAnalyzedCount/lessonInsights persiste', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUpdateStudySession(
      makeReq({ params: { id: 'sess_1' }, body: {
        handsSolvedCount: 12, filtersAnalyzedCount: 3, lessonInsights: 'novo insight',
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(200);
    expect(storage.updateStudySessionV2).toHaveBeenCalledTimes(1);
    const patch = storage.updateStudySessionV2.mock.calls[0][2];
    expect(patch.handsSolvedCount).toBe(12);
    expect(patch.lessonInsights).toBe('novo insight');
  });

  it('400 TOO_MANY_ENTRIES quando PATCH ultrapassa 10 entries', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleUpdateStudySession(
      makeReq({ params: { id: 'sess_1' }, body: {
        statAnalysisEntries: Array.from({ length: 11 }, () => validEntry),
      } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('TOO_MANY_ENTRIES');
  });

  it('400 STAT_ENTRIES_WRONG_MODE quando edita entries em sessao mode != stat_analysis', async () => {
    const storage = makeStorage({
      getStudySessionV2ById: vi.fn(async () => ({
        id: 'sess_1', userId: 'USER-0001', mode: 'drill_gto',
        createdAt: new Date().toISOString(),
      })),
    });
    const res = makeRes();
    await handleUpdateStudySession(
      makeReq({ params: { id: 'sess_1' }, body: { statAnalysisEntries: [validEntry] } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('STAT_ENTRIES_WRONG_MODE');
  });

  it('404 quando sessao nao pertence ao user', async () => {
    const storage = makeStorage({ getStudySessionV2ById: vi.fn(async () => null) });
    const res = makeRes();
    await handleUpdateStudySession(
      makeReq({ params: { id: 'sess_X' }, body: { notes: 'x' } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(404);
  });
});
