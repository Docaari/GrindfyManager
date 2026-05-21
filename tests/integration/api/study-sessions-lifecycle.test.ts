/**
 * Test-Writer (Modo TDD — Red Phase)
 *
 * Sprint Estudos-Sessao-1 — RF-02, RF-03, RF-06 (GET single-session)
 *
 * Spec : Docs/specs/sprint-estudos-sessao-1.md
 * ADR  : 177
 * Diag : Docs/architecture/diagrams/estudos-sessao-1/start-session-flow.mermaid
 *
 * Cobertura:
 *   - POST /api/study-sessions retorna { id, themeId, status:'active', ... }
 *   - GET /api/study-sessions/:id retorna sessao (RF-06, novo)
 *   - GET /api/study-sessions/:id 404 quando nao existe / outro user (IDOR)
 *   - PATCH /api/study-sessions/:id com { status:'finished', duration } atualiza row
 *   - PATCH /api/study-sessions/:id 404 quando outro user (IDOR)
 *   - PATCH body invalido -> 400
 *
 * Lessons aplicadas:
 *   #3  mocks shape REAL (schema legacy study_sessions — id, userId, themeId,
 *       studyCardId, date, duration, activities, focusScore, productivityScore,
 *       insights, createdAt + status NOVO via migration 0072).
 *   #6  apiRequest retorna JSON parseado direto — backend devolve JSON.
 *   #34 handler aceita storage injetado como 3o arg (modo de teste).
 *   #36 storage module com mock parcial precisa lazy import de schema —
 *       aqui mockamos o storage por completo.
 *   #13 endpoints existem com paths novos POST /api/study-sessions/:id
 *       e PATCH /api/study-sessions/:id; handlers ainda nao implementados.
 *
 * Status RED esperado: handleGetStudySessionById e handleUpdateStudySessionById
 * (ou nomes equivalentes) nao existem. Storage helpers tambem nao existem
 * (getStudySession, updateStudySession). Os testes devem falhar com
 * "Cannot find module" ou "is not a function".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — shape REAL de studySessions (shared/schema.ts:985-1001).
// Status virá da migration 0072 — RF-01. Default 'active'.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    // Helpers ja existentes
    createStudySession: vi.fn(),
    getStudySessions: vi.fn(),
    // Helpers novos (RF-03/RF-06) — implementer cria em studyStorage.ts (lesson #36)
    getStudySession: vi.fn(),
    updateStudySession: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';

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
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  res.send = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

const baseSession = {
  id: 'sess_1',
  userId: 'USER-OWNER',
  studyCardId: null,
  themeId: 'thm_1',
  date: new Date('2026-05-21T10:00:00Z'),
  duration: 0,
  activities: ['theme'],
  focusScore: null,
  productivityScore: null,
  insights: null,
  status: 'active',
  createdAt: new Date('2026-05-21T10:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Loaders — handlers podem morar em routes/studies.ts (legacy) OU em modulo
// novo routes/study-sessions-page.ts. Aceita ambos via try/catch.
// =============================================================================

async function loadCreateHandler() {
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
    '../../../server/routes/study-sessions',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handleCreateStudySession ??
        mod.handleCreateStudySessionLegacy ??
        mod.createStudySessionHandler;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handleCreateStudySession nao encontrado em nenhum modulo.');
}

async function loadGetByIdHandler() {
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
    '../../../server/routes/study-sessions',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handleGetStudySessionById ??
        mod.handleGetStudySession ??
        mod.getStudySessionByIdHandler;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handleGetStudySessionById nao encontrado.');
}

async function loadPatchHandler() {
  // IMPORTANTE: NAO usamos handleUpdateStudySession do study-sessions.ts (V2)
  // porque esse rejeita {status, duration} como IMMUTABLE_FIELD (V2 usa
  // mode/source/durationMinutes diferentes). Precisamos de handler NOVO
  // dedicado a sessao legacy (study_sessions, schema 0072 com status).
  const mods = [
    '../../../server/routes/studies',
    '../../../server/routes/study-sessions-page',
  ];
  for (const p of mods) {
    try {
      const mod: any = await import(p);
      const h =
        mod.handlePatchStudySessionLegacy ??
        mod.handleUpdateStudySessionLegacy ??
        mod.handlePatchStudySession;
      if (h) return h;
    } catch {
      // try next
    }
  }
  throw new Error('handlePatchStudySession nao encontrado.');
}

// =============================================================================
// RF-02 — POST /api/study-sessions retorna sessao completa com status='active'
// =============================================================================
describe('POST /api/study-sessions — retorna sessao com status=active (RF-02)', () => {
  it('cria sessao e retorna {id, themeId, status:"active", date, ...}', async () => {
    (storage.createStudySession as any).mockResolvedValue({
      ...baseSession,
      id: 'sess_new',
    });
    const handler = await loadCreateHandler();
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          themeId: 'thm_1',
          date: new Date('2026-05-21T10:00:00Z').toISOString(),
          duration: 0,
          activities: ['theme'],
        },
      }),
      res,
    );
    // Aceita 200 (legacy comportamento) ou 201
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body).toMatchObject({
      id: 'sess_new',
      themeId: 'thm_1',
      status: 'active',
    });
    expect(res.body).toHaveProperty('date');
  });

  it('default status="active" injetado pelo handler quando body nao traz status', async () => {
    (storage.createStudySession as any).mockImplementation(async (data: any) => ({
      ...baseSession,
      ...data,
      id: 'sess_x',
    }));
    const handler = await loadCreateHandler();
    const res = makeRes();
    await handler(
      makeReq({
        body: {
          themeId: 'thm_1',
          date: new Date().toISOString(),
          duration: 0,
          activities: ['theme'],
        },
      }),
      res,
    );
    expect([200, 201]).toContain(res.statusCode);
    // Garante que status foi definido ou no payload do storage ou no body retornado.
    const callPayload = (storage.createStudySession as any).mock.calls[0]?.[0];
    expect(
      callPayload?.status === 'active' || res.body?.status === 'active',
    ).toBe(true);
  });
});

// =============================================================================
// RF-06 (GET single-session implicito) — GET /api/study-sessions/:id
// =============================================================================
describe('GET /api/study-sessions/:id — busca sessao single (RF-06)', () => {
  it('200 com sessao completa quando user dono', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    const handler = await loadGetByIdHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'sess_1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'sess_1',
      themeId: 'thm_1',
      status: 'active',
    });
    expect(res.body).toHaveProperty('date');
    expect(res.body).toHaveProperty('duration');
  });

  it('404 quando sessao nao existe', async () => {
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadGetByIdHandler();
    const res = makeRes();
    await handler(makeReq({ params: { id: 'sess_inexistente' } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('404 quando sessao pertence a outro user (IDOR guard)', async () => {
    // Storage helper recebe (id, userId) e retorna null para cross-user.
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadGetByIdHandler();
    const res = makeRes();
    await handler(
      makeReq({
        user: { userPlatformId: 'USER-OWNER' },
        params: { id: 'sess_de_outro_user' },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    // Garante que o handler passou userId pra storage (ownership scope).
    const callArgs = (storage.getStudySession as any).mock.calls[0];
    expect(callArgs?.[0]).toBe('sess_de_outro_user');
    // userId esta em algum dos args (depende da assinatura: (id, userId) ou
    // (id, { userId })).
    const joinedArgs = JSON.stringify(callArgs);
    expect(joinedArgs).toContain('USER-OWNER');
  });
});

// =============================================================================
// RF-03 — PATCH /api/study-sessions/:id { status:'finished', duration }
// =============================================================================
describe('PATCH /api/study-sessions/:id — finalizar sessao (RF-03)', () => {
  it('atualiza row com status=finished + duration, retorna 200 com row atualizada', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.updateStudySession as any).mockResolvedValue({
      ...baseSession,
      status: 'finished',
      duration: 35,
    });
    const handler = await loadPatchHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: { status: 'finished', duration: 35 },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: 'sess_1',
      status: 'finished',
      duration: 35,
    });
    expect(storage.updateStudySession).toHaveBeenCalled();
    // Patch deve conter status + duration.
    const calls = (storage.updateStudySession as any).mock.calls[0];
    const patchPayload = calls.find(
      (a: any) => a && typeof a === 'object' && ('status' in a || 'duration' in a),
    );
    expect(patchPayload).toMatchObject({ status: 'finished', duration: 35 });
  });

  it('404 quando sessao pertence a outro user (IDOR guard)', async () => {
    // Quando storage.getStudySession retorna null pro userId atual -> 404.
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadPatchHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_de_outro_user' },
        body: { status: 'finished', duration: 10 },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(storage.updateStudySession).not.toHaveBeenCalled();
  });

  it('404 quando sessao nao existe', async () => {
    (storage.getStudySession as any).mockResolvedValue(null);
    const handler = await loadPatchHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_inexistente' },
        body: { status: 'finished', duration: 10 },
      }),
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('400 quando body tem status invalido', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    const handler = await loadPatchHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: { status: 'foobar', duration: 10 },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(storage.updateStudySession).not.toHaveBeenCalled();
  });

  it('aceita PATCH com somente duration (sem status)', async () => {
    (storage.getStudySession as any).mockResolvedValue({ ...baseSession });
    (storage.updateStudySession as any).mockResolvedValue({
      ...baseSession,
      duration: 12,
    });
    const handler = await loadPatchHandler();
    const res = makeRes();
    await handler(
      makeReq({
        params: { id: 'sess_1' },
        body: { duration: 12 },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ duration: 12 });
  });
});
