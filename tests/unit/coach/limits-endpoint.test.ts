import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-1 / RF-04.4 — GET /api/coach/limits
//
// Handler: handleGetCoachLimits em server/routes/coach.ts (NAO EXISTE)
//
// Response shape (RF-04.4):
//   {
//     plan: 'free' | 'pro' | 'premium' | 'admin',
//     dailyLimit: number | 'unlimited',
//     used: number,
//     remaining: number | 'unlimited',
//     resetAt: string | null,   // ISO
//     accessibleCoaches: CoachType[]
//   }
//
// O Implementer pode nomear o campo como "messagesUsedToday" / "messagesRemaining"
// conforme spec; aceitamos sinonimos desde que o contrato logico seja o mesmo.
// =============================================================================

vi.mock('../../../server/db', () => ({
  db: { select: vi.fn() },
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), desc: vi.fn(), asc: vi.fn(), gte: vi.fn(), sql: vi.fn(),
}));
vi.mock('@shared/schema', () => ({
  users: {}, chatSessions: {}, chatMessages: {},
}));

function makeReq(userOverride: any = {}) {
  return {
    user: {
      userPlatformId: 'USER-0001', id: 'u', email: 'p@t.com',
      role: 'user', subscriptionPlan: 'trial', ...userOverride,
    },
    query: {}, params: {}, body: {},
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

const storage: any = {
  resolveUserTier: vi.fn(),
  countUserMessagesInLastDay: vi.fn(),
  getOldestUserMessageInWindow: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Helpers para normalizar o shape mesmo se o Implementer nomear diferente
function pickUsed(body: any): number | undefined {
  return body.used ?? body.messagesUsedToday;
}
function pickRemaining(body: any): any {
  return body.remaining ?? body.messagesRemaining;
}

// =============================================================================

describe('GET /api/coach/limits', () => {
  it('free com 3 msgs hoje: plan=free, dailyLimit=10, used=3, remaining=7', async () => {
    storage.resolveUserTier.mockResolvedValue('free');
    storage.countUserMessagesInLastDay.mockResolvedValue(3);
    storage.getOldestUserMessageInWindow.mockResolvedValue({
      createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    });

    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' });
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.dailyLimit).toBe(10);
    expect(pickUsed(res.body)).toBe(3);
    expect(pickRemaining(res.body)).toBe(7);
    // Sprint AI-0B (ADR-148 / RF-06): nao ha mais gate por coachType — todo
    // tier tem acesso ao agente unico (as 3 "lentes" estao todas disponiveis).
    expect((res.body.accessibleCoaches as string[]).sort()).toEqual(['mental', 'technical', 'tournament']);
    expect(res.body.resetAt).toBeTruthy();
  });

  it('pro: accessibleCoaches = todas as lentes (agente unico — sem gate por coachType)', async () => {
    storage.resolveUserTier.mockResolvedValue('pro');
    storage.countUserMessagesInLastDay.mockResolvedValue(0);
    storage.getOldestUserMessageInWindow.mockResolvedValue(null);

    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' });
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);

    expect(res.body.plan).toBe('pro');
    expect(res.body.dailyLimit).toBe(50);
    // Sprint AI-0B (ADR-148 / RF-06): consolidacao — todas as 3 lentes liberadas.
    expect((res.body.accessibleCoaches as string[]).sort()).toEqual(['mental', 'technical', 'tournament']);
  });

  it('premium: accessibleCoaches = [mental, tournament, technical]', async () => {
    storage.resolveUserTier.mockResolvedValue('premium');
    storage.countUserMessagesInLastDay.mockResolvedValue(5);
    storage.getOldestUserMessageInWindow.mockResolvedValue({
      createdAt: new Date(Date.now() - 1000).toISOString(),
    });

    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'active' });
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);

    expect(res.body.plan).toBe('premium');
    expect(res.body.dailyLimit).toBe(200);
    expect((res.body.accessibleCoaches as string[]).sort()).toEqual(['mental', 'technical', 'tournament']);
  });

  it('used >= limit: ainda retorna 200 (nao 429), remaining=0', async () => {
    storage.resolveUserTier.mockResolvedValue('free');
    storage.countUserMessagesInLastDay.mockResolvedValue(10);
    storage.getOldestUserMessageInWindow.mockResolvedValue({
      createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    });

    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req = makeReq({ subscriptionPlan: 'trial' });
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(pickUsed(res.body)).toBe(10);
    expect(pickRemaining(res.body)).toBe(0);
  });

  it('admin: dailyLimit=unlimited, remaining=unlimited, resetAt=null', async () => {
    storage.resolveUserTier.mockResolvedValue('admin');
    storage.countUserMessagesInLastDay.mockResolvedValue(500);

    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req = makeReq({ role: 'admin', subscriptionPlan: 'admin' });
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe('admin');
    expect(res.body.dailyLimit).toBe('unlimited');
    expect(pickRemaining(res.body)).toBe('unlimited');
    expect(res.body.resetAt).toBeNull();
  });

  it('401 quando nao ha user autenticado', async () => {
    const { handleGetCoachLimits } = await import('../../../server/routes/coach');
    const req: any = { user: undefined, query: {}, params: {}, body: {} };
    const res = makeRes();
    await handleGetCoachLimits(req, res, storage);
    expect(res.statusCode).toBe(401);
  });
});
