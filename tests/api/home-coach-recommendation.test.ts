/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-4 / Item 4 — RF-05/RF-06/RF-07 (endpoints publicos)
 *
 * Spec : Docs/specs/home-reform-4-item-4-coach-recommendation.md §RF-05/06/07
 * ADRs : 111 (schema) + 114 (consume tracking)
 * Pad. : tests/integration/home/home-overview.test.ts (handlers exportados +
 *        mocks de storage; sem montar Express).
 *
 * Cobertura:
 *   GET /api/home/coach-recommendation
 *     - 401 sem userPlatformId
 *     - 200 + recommendation: null quando rec nao existe na semana
 *     - 200 + recommendation: null + status='dismissed' quando dismissedAt setado
 *     - 200 + recommendation: null + status='consumed' quando consumedAt setado
 *     - 200 + recommendation: null + status='lesson_unavailable' quando lesson despublicada
 *     - 200 + recommendation populada quando ativa (formato definido na spec)
 *     - hasAccess true/false reflete storage.hasLessonAccess
 *     - ctaTarget contem source=home-coach-rec + recId
 *     - Cache-Control: private, max-age=60
 *
 *   POST /api/home/coach-recommendation/:id/dismiss
 *     - 401 sem auth
 *     - 403 quando rec.userId != req.user.userPlatformId (ownership)
 *     - 404 quando id inexistente
 *     - 200 idempotente (2x dismiss = mesmo state)
 *     - storage.dismissCoachRecommendation chamado quando ativa
 *
 *   POST /api/home/coach-recommendation/:id/consume
 *     - 401 / 403 / 404 mesmas regras
 *     - 200 idempotente
 *     - Insere library_events com event_type='coach_recommend' (RF-07)
 *     - storage.consumeCoachRecommendation chamado
 *
 * Lessons aplicadas:
 *   #3  shape REAL — mocks refletem storage.ts retornos
 *   #5  vi.fn() ok aqui (sem `new` envolvido)
 *
 * Status RED: handlers `handleGetCoachRecommendation`,
 * `handleDismissCoachRecommendation`, `handleConsumeCoachRecommendation` NAO
 * existem. Modulo `server/routes/home-coach-recommendation.ts` sera criado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock storage — RF-11 methods
// =============================================================================
vi.mock('../../server/storage', () => ({
  storage: {
    getCoachRecommendationByUserAndWeek: vi.fn(),
    getCoachRecommendationById: vi.fn(),
    dismissCoachRecommendation: vi.fn(),
    consumeCoachRecommendation: vi.fn(),
    getLibraryLessonById: vi.fn(),
    hasLessonAccess: vi.fn(),
    insertLibraryEvent: vi.fn(),
  },
}));

// =============================================================================
// Mock weekHelper para deterministico
// =============================================================================
vi.mock('../../server/coach/weekHelper', () => ({
  getCurrentWeekStartBRT: vi.fn(() => new Date('2026-05-04T03:00:00.000Z')),
}));

// Lazy imports do handler em cada teste (await import) para evitar que o
// module-not-found no top-level transforme TODOS os tests em "Failed Suite"
// (red phase precisa enumerar cenarios). Padrao confirmado por
// tests/coach/nudges/b-snapshot.test.ts.
import { storage } from '../../server/storage';

async function loadHandlers() {
  return await import('../../server/routes/home-coach-recommendation');
}

// =============================================================================
// Helpers req/res (segue padrao tests/integration/home/home-overview.test.ts)
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

const lessonFixture = {
  id: 'LESS-1',
  slug: 'defesa-bb-3bet',
  lessonSlug: 'defesa-bb-3bet',
  courseSlug: 'fundamentos',
  title: 'Defesa de BB contra 3bet',
  courseTitle: 'Curso Fundamentos',
  moduleTitle: 'Modulo Preflop',
  categoryId: 'preflop',
  format: 'video' as const,
  durationSeconds: 1800,
  coverImageUrl: 'https://example.com/cover.jpg',
  isPublished: true,
};

const recFixture = {
  id: 'REC-1',
  userId: 'USER-OWNER',
  lessonId: 'LESS-1',
  weekStartDate: '2026-05-04',
  reason: 'Voce esta perdendo no BB defense — esta licao foca no caminho.',
  source: 'coach' as const,
  inputSummary: { leaks: [], analytics: {}, profile: 'A' },
  chatSessionId: null,
  createdAt: new Date('2026-05-04T09:00:00Z'),
  dismissedAt: null,
  consumedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// GET /api/home/coach-recommendation — auth
// =============================================================================
describe('GET /api/home/coach-recommendation — auth', () => {
  it('rejeita sem userPlatformId (401)', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('aceita request com userPlatformId valido (200)', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// =============================================================================
// GET — sem rec na semana -> 200 com recommendation: null (NUNCA 404)
// =============================================================================
describe('GET — sem recomendacao na semana', () => {
  it('storage retorna null -> 200 + { recommendation: null, weekStartDate }', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation).toBeNull();
    expect(res.body.weekStartDate).toBeDefined();
  });
});

// =============================================================================
// GET — rec dismissed/consumed -> 200 + status indicador
// =============================================================================
describe('GET — terminal states (dismissed/consumed)', () => {
  it('rec.dismissedAt setado -> recommendation: null + status: "dismissed"', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue({
      ...recFixture,
      dismissedAt: new Date('2026-05-05T10:00:00Z'),
    });
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation).toBeNull();
    expect(res.body.status).toBe('dismissed');
  });

  it('rec.consumedAt setado -> recommendation: null + status: "consumed"', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue({
      ...recFixture,
      consumedAt: new Date('2026-05-05T11:00:00Z'),
    });
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation).toBeNull();
    expect(res.body.status).toBe('consumed');
  });
});

// =============================================================================
// GET — lesson despublicada -> status: lesson_unavailable
// =============================================================================
describe('GET — lesson despublicada (R3)', () => {
  it('lesson nao encontrada (despublicada) -> status: "lesson_unavailable"', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(recFixture);
    (storage.getLibraryLessonById as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation).toBeNull();
    expect(res.body.status).toBe('lesson_unavailable');
  });
});

// =============================================================================
// GET — recomendacao ativa
// =============================================================================
describe('GET — recomendacao ativa (formato resposta)', () => {
  it('rec ativa + lesson + hasAccess=true -> retorna recommendation populada', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(recFixture);
    (storage.getLibraryLessonById as any).mockResolvedValue(lessonFixture);
    (storage.hasLessonAccess as any).mockResolvedValue(true);

    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation).not.toBeNull();
    expect(res.body.recommendation.id).toBe('REC-1');
    expect(res.body.recommendation.lessonId).toBe('LESS-1');
    expect(res.body.recommendation.reason).toBeTruthy();
    expect(res.body.recommendation.source).toBe('coach');
    expect(res.body.recommendation.hasAccess).toBe(true);
    // formato exigido pela spec linha 252-273: lessonTitle/courseTitle/moduleTitle/...
    expect(res.body.recommendation.lessonTitle).toBe('Defesa de BB contra 3bet');
    expect(res.body.recommendation.format).toBe('video');
    expect(res.body.recommendation.durationSeconds).toBe(1800);
    expect(res.body.recommendation.dismissedAt ?? null).toBeNull();
    expect(res.body.recommendation.consumedAt ?? null).toBeNull();
  });

  it('hasAccess=false -> CTA muda mas lesson eh a mesma (pull comercial)', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(recFixture);
    (storage.getLibraryLessonById as any).mockResolvedValue(lessonFixture);
    (storage.hasLessonAccess as any).mockResolvedValue(false);

    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendation.hasAccess).toBe(false);
    expect(res.body.recommendation.lessonId).toBe('LESS-1');
    // ctaLabel deve sinalizar compra
    expect(String(res.body.recommendation.ctaLabel ?? '')).toMatch(/comprar|detalhes/i);
  });

  it('ctaTarget contem source=home-coach-rec e recId', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(recFixture);
    (storage.getLibraryLessonById as any).mockResolvedValue(lessonFixture);
    (storage.hasLessonAccess as any).mockResolvedValue(true);

    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);

    const target = String(res.body.recommendation.ctaTarget ?? '');
    expect(target).toContain('home-coach-rec');
    expect(target).toContain('REC-1');
    expect(target).toContain('LESS-1');
  });
});

// =============================================================================
// GET — Cache-Control headers
// =============================================================================
describe('GET — cache headers', () => {
  it('seta Cache-Control: private, max-age=60', async () => {
    (storage.getCoachRecommendationByUserAndWeek as any).mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();
    const { handleGetCoachRecommendation } = await loadHandlers();
    await handleGetCoachRecommendation(req, res);
    const header = res.headers['cache-control'];
    expect(header).toBeDefined();
    expect(String(header)).toMatch(/private/i);
    expect(String(header)).toMatch(/max-age=60/);
  });
});

// =============================================================================
// POST /:id/dismiss
// =============================================================================
describe('POST /:id/dismiss', () => {
  it('401 sem userPlatformId', async () => {
    const req = makeReq({ user: undefined, params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleDismissCoachRecommendation } = await loadHandlers();
    await handleDismissCoachRecommendation(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('404 quando id nao existe', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'REC-NONE' } });
    const res = makeRes();
    const { handleDismissCoachRecommendation } = await loadHandlers();
    await handleDismissCoachRecommendation(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('403 quando rec.userId != req.user.userPlatformId', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue({
      ...recFixture,
      userId: 'USER-OUTRO',
    });
    const req = makeReq({ params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleDismissCoachRecommendation } = await loadHandlers();
    await handleDismissCoachRecommendation(req, res);
    expect(res.statusCode).toBe(403);
    expect(storage.dismissCoachRecommendation).not.toHaveBeenCalled();
  });

  it('200 + dismissedAt setado quando rec ativa', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue(recFixture);
    (storage.dismissCoachRecommendation as any).mockResolvedValue(undefined);
    const req = makeReq({ params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleDismissCoachRecommendation } = await loadHandlers();
    await handleDismissCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(storage.dismissCoachRecommendation).toHaveBeenCalledWith('REC-1');
    expect(res.body.dismissedAt ?? res.body.ok).toBeTruthy();
  });

  it('idempotente: 2x dismiss = 200 com mesmo state', async () => {
    // Primeira chamada: rec ativa
    (storage.getCoachRecommendationById as any)
      .mockResolvedValueOnce(recFixture)
      // Segunda: ja dismissed
      .mockResolvedValueOnce({
        ...recFixture,
        dismissedAt: new Date('2026-05-05T10:00:00Z'),
      });
    (storage.dismissCoachRecommendation as any).mockResolvedValue(undefined);
    const { handleDismissCoachRecommendation } = await loadHandlers();

    const req1 = makeReq({ params: { id: 'REC-1' } });
    const res1 = makeRes();
    await handleDismissCoachRecommendation(req1, res1);
    expect(res1.statusCode).toBe(200);

    const req2 = makeReq({ params: { id: 'REC-1' } });
    const res2 = makeRes();
    await handleDismissCoachRecommendation(req2, res2);
    expect(res2.statusCode).toBe(200);
    // Segunda chamada NAO deve disparar update (idempotente)
    expect(storage.dismissCoachRecommendation).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// POST /:id/consume
// =============================================================================
describe('POST /:id/consume', () => {
  it('401 sem userPlatformId', async () => {
    const req = makeReq({ user: undefined, params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleConsumeCoachRecommendation } = await loadHandlers();
    await handleConsumeCoachRecommendation(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('404 quando id nao existe', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'REC-NONE' } });
    const res = makeRes();
    const { handleConsumeCoachRecommendation } = await loadHandlers();
    await handleConsumeCoachRecommendation(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('403 quando rec.userId != req.user.userPlatformId', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue({
      ...recFixture,
      userId: 'USER-OUTRO',
    });
    const req = makeReq({ params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleConsumeCoachRecommendation } = await loadHandlers();
    await handleConsumeCoachRecommendation(req, res);
    expect(res.statusCode).toBe(403);
    expect(storage.consumeCoachRecommendation).not.toHaveBeenCalled();
  });

  it('200 + consumedAt setado quando rec ativa', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue(recFixture);
    (storage.consumeCoachRecommendation as any).mockResolvedValue(undefined);
    (storage.insertLibraryEvent as any).mockResolvedValue(undefined);
    const req = makeReq({ params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleConsumeCoachRecommendation } = await loadHandlers();
    await handleConsumeCoachRecommendation(req, res);
    expect(res.statusCode).toBe(200);
    expect(storage.consumeCoachRecommendation).toHaveBeenCalledWith('REC-1');
  });

  it('insere library_events com event_type="coach_recommend" no consume', async () => {
    (storage.getCoachRecommendationById as any).mockResolvedValue(recFixture);
    (storage.consumeCoachRecommendation as any).mockResolvedValue(undefined);
    (storage.insertLibraryEvent as any).mockResolvedValue(undefined);
    const req = makeReq({ params: { id: 'REC-1' } });
    const res = makeRes();
    const { handleConsumeCoachRecommendation } = await loadHandlers();
    await handleConsumeCoachRecommendation(req, res);

    expect(storage.insertLibraryEvent).toHaveBeenCalled();
    const call = (storage.insertLibraryEvent as any).mock.calls[0][0];
    expect(call.eventType).toBe('coach_recommend');
    expect(call.userId).toBe('USER-OWNER');
    expect(call.lessonId).toBe('LESS-1');
    expect(call.metadata?.recId).toBe('REC-1');
    expect(call.metadata?.source).toBe('coach');
    expect(call.metadata?.weekStartDate).toBeDefined();
  });

  it('idempotente: 2x consume = 200; segunda nao re-update + nao re-insert event', async () => {
    (storage.getCoachRecommendationById as any)
      .mockResolvedValueOnce(recFixture)
      .mockResolvedValueOnce({
        ...recFixture,
        consumedAt: new Date('2026-05-05T11:00:00Z'),
      });
    (storage.consumeCoachRecommendation as any).mockResolvedValue(undefined);
    (storage.insertLibraryEvent as any).mockResolvedValue(undefined);
    const { handleConsumeCoachRecommendation } = await loadHandlers();

    const req1 = makeReq({ params: { id: 'REC-1' } });
    const res1 = makeRes();
    await handleConsumeCoachRecommendation(req1, res1);
    expect(res1.statusCode).toBe(200);

    const req2 = makeReq({ params: { id: 'REC-1' } });
    const res2 = makeRes();
    await handleConsumeCoachRecommendation(req2, res2);
    expect(res2.statusCode).toBe(200);

    expect(storage.consumeCoachRecommendation).toHaveBeenCalledTimes(1);
    expect(storage.insertLibraryEvent).toHaveBeenCalledTimes(1);
  });
});
