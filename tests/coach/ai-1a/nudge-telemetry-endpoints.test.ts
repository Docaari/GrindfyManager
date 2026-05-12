import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-10 — Endpoints de telemetria/snooze de nudge in-app
//   GET   /api/coach/nudges                  -> handleGetNudges
//   POST  /api/coach/nudges/:id/dismiss      -> handleNudgeDismiss
//   POST  /api/coach/nudges/:id/snooze       -> handleNudgeSnooze
//   POST  /api/coach/nudges/:id/engage       -> handleNudgeEngage
//   POST  /api/coach/nudges/:id/unsubscribe  -> handleNudgeUnsubscribe
//   POST  /api/coach/preferences/unfreeze    -> handleUnfreezeCategory
//
// Handlers em server/routes/coach.ts (NAO existem ainda); lesson #34: injectedStorage?
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-10, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§8)
//
// Ownership: getNudgeLogById(id).userId === req.user.userPlatformId senao 404.
// Idempotencia: re-dismiss = no-op 200.
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { id: 'u-1', userPlatformId: 'USER-0001', email: 'p@t.com', role: 'user', subscriptionPlan: 'pro' },
    params: { id: 'nl-1' }, body: {}, query: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

function nudgeRow(overrides: any = {}) {
  return {
    id: 'nl-1', userId: 'USER-0001', category: 'B-STUDY', cycleKey: '2026-05', status: 'sent',
    titleI18n: 'Estude defesa de 3bet', bodyPreview: 'Voce nao estuda ha 10 dias...', channel: 'in_app',
    chatSessionId: 'cs-1', triggeredByEvent: null,
    sentAt: new Date(), engagedAt: null, dismissedAt: null, snoozeUntil: null, createdAt: new Date(),
    ...overrides,
  };
}

function makeStorage(overrides: any = {}) {
  return {
    listNudgeLog: vi.fn(async () => [nudgeRow(), nudgeRow({ id: 'nl-2', category: 'B-LEAK', status: 'dismissed' })]),
    getNudgeLogById: vi.fn(async (id: string) => (id === 'nl-1' ? nudgeRow() : id === 'nl-other' ? nudgeRow({ id: 'nl-other', userId: 'USER-9999' }) : undefined)),
    updateNudgeLogStatus: vi.fn(async () => undefined),
    checkAndFreezeCategory: vi.fn(async () => ({ frozen: false })),
    upsertCoachPreferences: vi.fn(async (_uid: string, delta: any) => ({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced', frozenCategories: {}, ...delta,
    })),
    getCoachPreferences: vi.fn(async () => ({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate', dismissRate: 0.8, windowDays: 7 } },
    })),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// ---------------------------------------------------------------------------
// GET /api/coach/nudges
// ---------------------------------------------------------------------------
describe('GET /api/coach/nudges', () => {
  it('200 com { nudges: CoachNudgeLog[] } so do usuario logado', async () => {
    const { handleGetNudges } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleGetNudges(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.nudges)).toBe(true);
    expect(storage.listNudgeLog).toHaveBeenCalledWith('USER-0001', expect.anything());
  });

  it('aplica filtros ?status=&category=&limit=', async () => {
    const { handleGetNudges } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ query: { status: 'snoozed', category: 'B-LEAK', limit: '20' } });
    const res = makeRes();
    await handleGetNudges(req, res, storage);
    expect(res.statusCode).toBe(200);
    const opts = storage.listNudgeLog.mock.calls[0][1];
    expect(opts).toEqual(expect.objectContaining({ status: 'snoozed', category: 'B-LEAK' }));
  });

  it('401 sem auth', async () => {
    const { handleGetNudges } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleGetNudges(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/nudges/:id/dismiss
// ---------------------------------------------------------------------------
describe('POST /api/coach/nudges/:id/dismiss', () => {
  it('200 — status=dismissed, dismissedAt setado + checkAndFreezeCategory(userId, category)', async () => {
    const { handleNudgeDismiss } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleNudgeDismiss(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateNudgeLogStatus).toHaveBeenCalledWith('nl-1', 'dismissed', expect.objectContaining({ dismissedAt: expect.anything() }));
    expect(storage.checkAndFreezeCategory).toHaveBeenCalledWith('USER-0001', 'B-STUDY');
    expect(res.body).toHaveProperty('nudge');
  });

  it('idempotente — re-dismiss (nudge ja dismissed) = no-op 200', async () => {
    const { handleNudgeDismiss } = await import('../../../server/routes/coach');
    const storage = makeStorage({ getNudgeLogById: vi.fn(async () => nudgeRow({ status: 'dismissed', dismissedAt: new Date() })) });
    const req = makeReq();
    const res = makeRes();
    await handleNudgeDismiss(req, res, storage);
    expect(res.statusCode).toBe(200);
  });

  it('404 — nudge de outro usuario', async () => {
    const { handleNudgeDismiss } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ params: { id: 'nl-other' } });
    const res = makeRes();
    await handleNudgeDismiss(req, res, storage);
    expect(res.statusCode).toBe(404);
  });

  it('404 — nudge inexistente', async () => {
    const { handleNudgeDismiss } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ params: { id: 'nl-ghost' } });
    const res = makeRes();
    await handleNudgeDismiss(req, res, storage);
    expect(res.statusCode).toBe(404);
  });

  it('401 sem auth', async () => {
    const { handleNudgeDismiss } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleNudgeDismiss(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/nudges/:id/snooze
// ---------------------------------------------------------------------------
describe('POST /api/coach/nudges/:id/snooze', () => {
  it('200 — { duration: "short" } -> status=snoozed, snoozeUntil ~ now + 1 dia', async () => {
    const { handleNudgeSnooze } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { duration: 'short' } });
    const res = makeRes();
    const before = Date.now();
    await handleNudgeSnooze(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateNudgeLogStatus).toHaveBeenCalledWith('nl-1', 'snoozed', expect.objectContaining({ snoozeUntil: expect.anything() }));
    const extra = storage.updateNudgeLogStatus.mock.calls[0][2];
    const su = extra.snoozeUntil instanceof Date ? extra.snoozeUntil.getTime() : new Date(extra.snoozeUntil).getTime();
    expect(su).toBeGreaterThan(before + 12 * 3600 * 1000);
    expect(su).toBeLessThan(before + 2 * 24 * 3600 * 1000);
  });

  it('200 — { duration: "long" } -> snoozeUntil ~ now + 30 dias', async () => {
    const { handleNudgeSnooze } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { duration: 'long' } });
    const res = makeRes();
    const before = Date.now();
    await handleNudgeSnooze(req, res, storage);
    expect(res.statusCode).toBe(200);
    const extra = storage.updateNudgeLogStatus.mock.calls[0][2];
    const su = extra.snoozeUntil instanceof Date ? extra.snoozeUntil.getTime() : new Date(extra.snoozeUntil).getTime();
    expect(su).toBeGreaterThan(before + 25 * 24 * 3600 * 1000);
    expect(su).toBeLessThan(before + 35 * 24 * 3600 * 1000);
  });

  it('400 — { duration: "forever" } (fora do enum)', async () => {
    const { handleNudgeSnooze } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { duration: 'forever' } });
    const res = makeRes();
    await handleNudgeSnooze(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — body sem duration', async () => {
    const { handleNudgeSnooze } = await import('../../../server/routes/coach');
    const req = makeReq({ body: {} });
    const res = makeRes();
    await handleNudgeSnooze(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('404 — nudge de outro usuario', async () => {
    const { handleNudgeSnooze } = await import('../../../server/routes/coach');
    const req = makeReq({ params: { id: 'nl-other' }, body: { duration: 'short' } });
    const res = makeRes();
    await handleNudgeSnooze(req, res, makeStorage());
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/nudges/:id/engage
// ---------------------------------------------------------------------------
describe('POST /api/coach/nudges/:id/engage', () => {
  it('200 — status=engaged, engagedAt setado', async () => {
    const { handleNudgeEngage } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleNudgeEngage(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateNudgeLogStatus).toHaveBeenCalledWith('nl-1', 'engaged', expect.objectContaining({ engagedAt: expect.anything() }));
  });

  it('idempotente — re-engage = 200', async () => {
    const { handleNudgeEngage } = await import('../../../server/routes/coach');
    const storage = makeStorage({ getNudgeLogById: vi.fn(async () => nudgeRow({ status: 'engaged', engagedAt: new Date() })) });
    const req = makeReq();
    const res = makeRes();
    await handleNudgeEngage(req, res, storage);
    expect(res.statusCode).toBe(200);
  });

  it('404 — nudge de outro usuario', async () => {
    const { handleNudgeEngage } = await import('../../../server/routes/coach');
    const req = makeReq({ params: { id: 'nl-other' } });
    const res = makeRes();
    await handleNudgeEngage(req, res, makeStorage());
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/nudges/:id/unsubscribe
// ---------------------------------------------------------------------------
describe('POST /api/coach/nudges/:id/unsubscribe', () => {
  it('200 — status=unsubscribed + desliga o toggle da categoria (nudgeBStudy: false) + checkAndFreezeCategory', async () => {
    const { handleNudgeUnsubscribe } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleNudgeUnsubscribe(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateNudgeLogStatus).toHaveBeenCalledWith('nl-1', 'unsubscribed', expect.anything());
    // categoria B-STUDY -> toggle nudgeBStudy: false
    const prefsCalls = storage.upsertCoachPreferences.mock.calls.map((c: any) => c[1]);
    expect(prefsCalls.some((d: any) => d.nudgeBStudy === false)).toBe(true);
    expect(storage.checkAndFreezeCategory).toHaveBeenCalledWith('USER-0001', 'B-STUDY');
    expect(res.body).toHaveProperty('nudge');
    expect(res.body).toHaveProperty('preferences');
  });

  it('404 — nudge de outro usuario', async () => {
    const { handleNudgeUnsubscribe } = await import('../../../server/routes/coach');
    const req = makeReq({ params: { id: 'nl-other' } });
    const res = makeRes();
    await handleNudgeUnsubscribe(req, res, makeStorage());
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/preferences/unfreeze
// ---------------------------------------------------------------------------
describe('POST /api/coach/preferences/unfreeze', () => {
  it('200 — { category: "B-STUDY" } quando frozenCategories["B-STUDY"] existe -> remove a entrada', async () => {
    const { handleUnfreezeCategory } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { category: 'B-STUDY' } });
    const res = makeRes();
    await handleUnfreezeCategory(req, res, storage);
    expect(res.statusCode).toBe(200);
    // upsertCoachPreferences chamado com frozenCategories sem 'B-STUDY' (ou unfreeze handling equivalente)
    expect(storage.upsertCoachPreferences).toHaveBeenCalled();
    const delta = storage.upsertCoachPreferences.mock.calls[0][1];
    if (delta.frozenCategories) {
      expect(delta.frozenCategories['B-STUDY']).toBeUndefined();
    }
    expect(res.body).toHaveProperty('preferences');
  });

  it('no-op quando a categoria nao esta congelada -> 200', async () => {
    const { handleUnfreezeCategory } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { category: 'B-LEAK' } }); // nao congelada no mock
    const res = makeRes();
    await handleUnfreezeCategory(req, res, storage);
    expect(res.statusCode).toBe(200);
  });

  it('400 — { category: "B-XYZ" } (categoria inexistente)', async () => {
    const { handleUnfreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { category: 'B-XYZ' } });
    const res = makeRes();
    await handleUnfreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — body sem category', async () => {
    const { handleUnfreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ body: {} });
    const res = makeRes();
    await handleUnfreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('401 sem auth', async () => {
    const { handleUnfreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined, body: { category: 'B-STUDY' } });
    const res = makeRes();
    await handleUnfreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});
