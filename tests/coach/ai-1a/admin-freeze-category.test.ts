import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-05 — POST /api/admin/coach/freeze-category
//   handleAdminFreezeCategory(req, res, injectedStorage?)
//
// Auth: requirePermission('admin') / isAdminUser — 403 se nao-admin.
// Body: { userId, category: NudgeCategory, action: 'freeze' | 'unfreeze' }.
// Efeito: freeze -> frozenCategories[category] = { frozenAt: now, reason: 'admin' };
//         unfreeze -> remove. Response: { ok: true, frozenCategories }.
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-05, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§3, §8)
//
// O handler pode viver em routes/coach.ts ou routes/admin.ts — testamos a funcao
// exportada (de routes/coach.ts conforme ADR-152 code references; se o implementer
// escolher routes/admin.ts, este import precisa ajustar — flagueado no resumo).
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { id: 'admin-1', userPlatformId: 'USER-ADMIN', email: 'a@t.com', role: 'admin', subscriptionPlan: 'admin' },
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
    getCoachPreferences: vi.fn(async () => ({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced', frozenCategories: {},
    })),
    upsertCoachPreferences: vi.fn(async (_uid: string, delta: any) => ({ frozenCategories: {}, ...delta })),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/admin/coach/freeze-category — auth', () => {
  it('403 — usuario nao-admin', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ user: { id: 'u-1', userPlatformId: 'USER-0001', role: 'user', subscriptionPlan: 'pro' }, body: { userId: 'USER-0002', category: 'B-MENTAL', action: 'freeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(403);
  });

  it('401 — sem auth', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined, body: { userId: 'USER-0002', category: 'B-MENTAL', action: 'freeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/admin/coach/freeze-category — efeito', () => {
  it('action: "freeze" -> frozenCategories[category] com reason: "admin"', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { userId: 'USER-0002', category: 'B-MENTAL', action: 'freeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    expect(res.body).toHaveProperty('frozenCategories');
    const delta = storage.upsertCoachPreferences.mock.calls[0][1];
    expect(delta.frozenCategories['B-MENTAL']).toEqual(expect.objectContaining({ reason: 'admin' }));
    expect(typeof delta.frozenCategories['B-MENTAL'].frozenAt).toBe('string');
  });

  it('action: "unfreeze" -> remove a entrada', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const storage = makeStorage({
      getCoachPreferences: vi.fn(async () => ({
        nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
        nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
        quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
        channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
        frozenCategories: { 'B-MENTAL': { frozenAt: '2026-05-01T00:00:00Z', reason: 'admin' } },
      })),
    });
    const req = makeReq({ body: { userId: 'USER-0002', category: 'B-MENTAL', action: 'unfreeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, storage);
    expect(res.statusCode).toBe(200);
    const delta = storage.upsertCoachPreferences.mock.calls[0][1];
    if (delta.frozenCategories) {
      expect(delta.frozenCategories['B-MENTAL']).toBeUndefined();
    }
  });

  it('400 — category fora do enum B-*', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { userId: 'USER-0002', category: 'B-NONSENSE', action: 'freeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — action invalido', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { userId: 'USER-0002', category: 'B-MENTAL', action: 'toggle' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — body sem userId', async () => {
    const { handleAdminFreezeCategory } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { category: 'B-MENTAL', action: 'freeze' } });
    const res = makeRes();
    await handleAdminFreezeCategory(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });
});
