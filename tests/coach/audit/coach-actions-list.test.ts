import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-06 — Audit page endpoints
//
// Endpoints:
//   GET /api/coach/audit                 — Timeline (cursor pagination)
//   POST /api/coach/audit/:id/dismiss    — Marca nudge como dismissed
//   POST /api/coach/audit/export         — Export GDPR
//
// Lessons:
//   - feature-detect storage.listCoachActions (Sprint 0 le coach_nudge_log;
//     coach_actions vem em Coach-2B).
//   - Ownership rigoroso (req.user.userPlatformId).
// =============================================================================

const listCoachAuditMock = vi.fn();
const updateNudgeLogStatusMock = vi.fn();
const getCoachAuditByIdMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    listCoachAudit: listCoachAuditMock,
    updateNudgeLogStatus: updateNudgeLogStatusMock,
    getCoachAuditById: getCoachAuditByIdMock,
    listCoachActions: undefined, // sprint 0 NAO tem (feature-detect)
  },
}));

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    user: { id: 'u-1', userPlatformId: 'USER-0001', subscriptionPlan: 'pro' },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: any) => { res.body = body; return res; });
  return res;
}

beforeEach(() => {
  listCoachAuditMock.mockReset();
  updateNudgeLogStatusMock.mockReset();
  getCoachAuditByIdMock.mockReset();
});

describe('GET /api/coach/audit — listing timeline', () => {
  it('retorna 200 com itens cronologicos reverso + nextCursor', async () => {
    listCoachAuditMock.mockResolvedValue({
      items: [
        {
          id: 'nl-3', type: 'nudge', timestamp: new Date('2026-05-02T10:00:00Z').toISOString(),
          title: 'Snapshot mensal', description: 'Bora fechar bankroll de maio?',
          category: 'B-SNAPSHOT', status: 'sent', canDismiss: true, canUndo: false,
        },
        {
          id: 'nl-2', type: 'nudge', timestamp: new Date('2026-05-01T15:00:00Z').toISOString(),
          title: 'Leak novo detectado', description: '...',
          category: 'B-LEAK', status: 'engaged', canDismiss: false, canUndo: false,
        },
      ],
      nextCursor: null,
      totalCount: 2,
    });

    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq({ query: { limit: '20' } });
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].id).toBe('nl-3');
    expect(res.body.totalCount).toBe(2);
  });

  it('paginacao: cursor passado eh repassado ao storage', async () => {
    listCoachAuditMock.mockResolvedValue({
      items: [], nextCursor: null, totalCount: 0,
    });
    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq({ query: { limit: '10', cursor: 'cur-abc' } });
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);

    expect(listCoachAuditMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ cursor: 'cur-abc', limit: 10 }),
    );
  });

  it('filtro type=nudge eh repassado ao storage', async () => {
    listCoachAuditMock.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0 });
    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq({ query: { type: 'nudge' } });
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);
    expect(listCoachAuditMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ type: 'nudge' }),
    );
  });

  it('dateFrom > dateTo => 400 validation_failed', async () => {
    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq({
      query: { dateFrom: '2026-05-10', dateTo: '2026-05-01' },
    });
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('limit > 100 eh clampado para 100', async () => {
    listCoachAuditMock.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0 });
    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq({ query: { limit: '500' } });
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);
    expect(listCoachAuditMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('empty state: lista vazia => totalCount=0 (frontend renderiza empty state)', async () => {
    listCoachAuditMock.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0 });
    const { handleGetCoachAudit } = await import('../../../server/routes/coach');
    const req = createMockReq();
    const res = createMockRes();
    await handleGetCoachAudit(req as any, res as any);
    expect(res.body.totalCount).toBe(0);
  });
});

describe('POST /api/coach/audit/:id/dismiss', () => {
  it('marca nudge sent como dismissed (200)', async () => {
    getCoachAuditByIdMock.mockResolvedValue({
      id: 'nl-3', userId: 'USER-0001', type: 'nudge',
      status: 'sent', category: 'B-SNAPSHOT',
    });
    updateNudgeLogStatusMock.mockResolvedValue({ id: 'nl-3', status: 'dismissed' });

    const { handlePostCoachAuditDismiss } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'nl-3' } });
    const res = createMockRes();
    await handlePostCoachAuditDismiss(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(updateNudgeLogStatusMock).toHaveBeenCalledWith(
      'nl-3', 'dismissed', expect.any(Object),
    );
  });

  it('id de outro user => 403', async () => {
    getCoachAuditByIdMock.mockResolvedValue({
      id: 'nl-3', userId: 'USER-OTHER', type: 'nudge', status: 'sent',
    });

    const { handlePostCoachAuditDismiss } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'nl-3' } });
    const res = createMockRes();
    await handlePostCoachAuditDismiss(req as any, res as any);

    expect(res.statusCode).toBe(403);
    expect(updateNudgeLogStatusMock).not.toHaveBeenCalled();
  });

  it('id inexistente => 404', async () => {
    getCoachAuditByIdMock.mockResolvedValue(undefined);
    const { handlePostCoachAuditDismiss } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ params: { id: 'nl-X' } });
    const res = createMockRes();
    await handlePostCoachAuditDismiss(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/coach/audit/export — GDPR', () => {
  it('retorna application/json com array completo', async () => {
    listCoachAuditMock.mockResolvedValue({
      items: [
        { id: 'nl-1', type: 'nudge', status: 'sent' },
        { id: 'nl-2', type: 'nudge', status: 'dismissed' },
      ],
      nextCursor: null,
      totalCount: 2,
    });
    const { handlePostCoachAuditExport } =
      await import('../../../server/routes/coach');
    const req = createMockReq();
    const res = createMockRes();
    await handlePostCoachAuditExport(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items) || Array.isArray(res.body)).toBe(true);
  });
});
