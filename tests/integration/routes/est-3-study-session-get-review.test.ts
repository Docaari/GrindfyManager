import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 RF-07 / D-7
// GET /api/study-sessions/:id (NOVO) + GET /api/study-sessions/stat-analysis
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md (RF-07/RF-08 surface 3)
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md (D-1/D-7)
//
// Handlers (NOVOS):
//   handleGetStudySession(req, res, injectedStorage?)          — GET /:id
//   handleListStatAnalysisByTheme(req, res, injectedStorage?)  — GET /stat-analysis?themeId=&statId=
//
// Contratos chave:
//   - hGet monta URLs servíveis das keys (RF-05); slot sem imagem -> URL null.
//   - hList valida tema pertence ao user (404/403) antes de retornar entries.
//   - hList retorna grupos por stat com URLs (nao keys cruas) + counts.
// =============================================================================

// @ts-expect-error - handlers ainda nao existem (red phase)
import { handleGetStudySession, handleListStatAnalysisByTheme } from '../../../server/routes/study-sessions';

function makeRes() {
  const res: any = { statusCode: 200, body: null, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  res.setHeader = (k: string, v: any) => { res.headers[k] = v; return res; };
  return res;
}

function makeReq(overrides: any = {}) {
  return { user: { userPlatformId: 'USER-0001' }, params: {}, query: {}, body: {}, ...overrides };
}

// =============================================================================
// GET /api/study-sessions/:id (D-7)
// =============================================================================

describe('EST-3 GET /:id — handleGetStudySession (D-7)', () => {
  function storageWith(session: any) {
    return { getStudySessionV2ById: vi.fn(async () => session) };
  }

  const statSession = {
    id: 'sess_1', userId: 'USER-0001', mode: 'stat_analysis', statId: 'vpip',
    handsSolvedCount: 12, filtersAnalyzedCount: 3,
    statAnalysisEntries: [
      { id: 'e1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: 'USER-0001/sess_1/p.png', solutionImageKey: null, createdAt: '2026-06-01T00:00:00.000Z' },
    ],
  };

  it('200 retorna a sessao + counts', async () => {
    const storage = storageWith(statSession);
    const res = makeRes();
    await handleGetStudySession(makeReq({ params: { id: 'sess_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.handsSolvedCount).toBe(12);
    expect(res.body.filtersAnalyzedCount).toBe(3);
  });

  it('monta URL servivel para entry com playImageKey + null para slot vazio (solution)', async () => {
    const storage = storageWith(statSession);
    const res = makeRes();
    await handleGetStudySession(makeReq({ params: { id: 'sess_1' } }), res, storage);
    const entry = res.body.statAnalysisEntries[0];
    // URL servivel aponta para o endpoint de serve (.../image/play); NAO a key crua.
    expect(String(entry.playImageUrl)).toContain('/api/study-sessions/sess_1/stat-analysis/entries/e1/image/play');
    expect(String(entry.playImageUrl)).not.toContain('USER-0001/sess_1/p.png');
    // solution sem imagem -> URL null
    expect(entry.solutionImageUrl ?? null).toBeNull();
  });

  it('NAO expoe a key crua no payload do GET (RF-07 — URLs, nao keys)', async () => {
    const storage = storageWith(statSession);
    const res = makeRes();
    await handleGetStudySession(makeReq({ params: { id: 'sess_1' } }), res, storage);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('USER-0001/sess_1/p.png');
  });

  it('404 quando sessao nao pertence ao user (nao confirma existencia)', async () => {
    const storage = storageWith(null);
    const res = makeRes();
    await handleGetStudySession(makeReq({ params: { id: 'sess_X' } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(res.statusCode).not.toBe(403);
  });
});

// =============================================================================
// GET /api/study-sessions/stat-analysis (RF-07 / D-1)
// =============================================================================

describe('EST-3 GET stat-analysis — handleListStatAnalysisByTheme (RF-07)', () => {
  function makeStorage(overrides: any = {}) {
    return {
      getStudyThemeById: vi.fn(async () => ({ id: 'theme_1', userId: 'USER-0001' })),
      getStatAnalysisEntries: vi.fn(async () => ([
        {
          statId: 'vpip',
          entryCount: 2,
          sessions: [
            {
              sessionId: 'sess_A', registeredAt: '2026-06-02T00:00:00.000Z', durationMinutes: 30,
              entries: [
                { id: 'a1', filters: 'f', errorText: 'e', learnedText: 'l', playImageKey: 'USER-0001/sess_A/k1.png', solutionImageKey: null, createdAt: '2026-06-02T00:00:00.000Z' },
              ],
            },
          ],
        },
      ])),
      ...overrides,
    };
  }

  it('400 quando themeId ausente', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListStatAnalysisByTheme(makeReq({ query: {} }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.getStatAnalysisEntries).not.toHaveBeenCalled();
  });

  it('200 retorna grupos por stat com counts', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListStatAnalysisByTheme(makeReq({ query: { themeId: 'theme_1' } }), res, storage);
    expect(res.statusCode).toBe(200);
    const groups = Array.isArray(res.body) ? res.body : res.body.groups;
    expect(Array.isArray(groups)).toBe(true);
    expect(groups[0].statId).toBe('vpip');
    expect(groups[0].entryCount).toBe(2);
    expect(storage.getStatAnalysisEntries).toHaveBeenCalledWith('USER-0001', 'theme_1', undefined);
  });

  it('passa statId quando query inclui ?statId=', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListStatAnalysisByTheme(makeReq({ query: { themeId: 'theme_1', statId: 'vpip' } }), res, storage);
    expect(storage.getStatAnalysisEntries).toHaveBeenCalledWith('USER-0001', 'theme_1', 'vpip');
  });

  it('entries vem com URLs de imagem servidas, NAO keys cruas (RF-07)', async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleListStatAnalysisByTheme(makeReq({ query: { themeId: 'theme_1' } }), res, storage);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('USER-0001/sess_A/k1.png');
    const groups = Array.isArray(res.body) ? res.body : res.body.groups;
    const entry = groups[0].sessions[0].entries[0];
    expect(String(entry.playImageUrl)).toContain('/image/play');
  });

  it('404/403 quando tema pertence a outro user (nao vaza entries)', async () => {
    const storage = makeStorage({
      getStudyThemeById: vi.fn(async () => ({ id: 'theme_1', userId: 'USER-OTHER' })),
    });
    const res = makeRes();
    await handleListStatAnalysisByTheme(makeReq({ query: { themeId: 'theme_1' } }), res, storage);
    expect([403, 404]).toContain(res.statusCode);
    expect(storage.getStatAnalysisEntries).not.toHaveBeenCalled();
  });
});
