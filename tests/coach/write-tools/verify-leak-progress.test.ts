import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-05 — verify_leak_progress (READ tool, NAO write)
//
// Diferente: requiresConfirmation=false, auditLevel='log'.
// Re-roda query do baselineStatKey no storage atual e compara.
// =============================================================================

const findActiveLeakFocusMock = vi.fn();
const queryStatByKeyMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    findActiveLeakFocus: findActiveLeakFocusMock,
    queryStatByKey: queryStatByKeyMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm' };

beforeEach(() => {
  findActiveLeakFocusMock.mockReset();
  queryStatByKeyMock.mockReset();
});

describe('verify_leak_progress — meta', () => {
  it('requiresConfirmation = false (read tool)', async () => {
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    expect(verifyLeakProgressTool.requiresConfirmation).toBe(false);
  });

  it('auditLevel = log', async () => {
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    expect(verifyLeakProgressTool.auditLevel).toBe('log');
  });
});

describe('verify_leak_progress.handler', () => {
  it('sem leakFocusId: retorna foco active do mes atual', async () => {
    findActiveLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001',
      leakCode: 'negative_roi_pko',
      description: 'ROI -15%',
      baselineStatKey: 'roi.category=PKO',
      baselineValue: '-15.2',
      baselineSampleSize: 45,
      targetMonth: '2026-05',
      status: 'active',
    });
    queryStatByKeyMock.mockResolvedValue({ value: -8.0, sampleSize: 60 });

    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler(
      {}, ctx as any,
    );
    expect(out.leakFocusId).toBe('lf-1');
    expect(out.baseline).toMatchObject({ value: -15.2, sampleSize: 45 });
    expect(out.current).toMatchObject({ value: -8.0, sampleSize: 60 });
    expect(out.improvementPct).toBeGreaterThan(0); // melhorou
  });

  it('sem foco ativo: retorna note=no_active_focus', async () => {
    findActiveLeakFocusMock.mockResolvedValue(undefined);
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler({}, ctx as any);
    expect(out.note).toBe('no_active_focus');
  });

  it('sampleSize current < 30 => status=insufficient_sample', async () => {
    findActiveLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001',
      leakCode: 'low_itm_turbos',
      baselineStatKey: 'itm.speed=Turbo',
      baselineValue: '12',
      baselineSampleSize: 100,
      targetMonth: '2026-05',
      status: 'active',
    });
    queryStatByKeyMock.mockResolvedValue({ value: 14, sampleSize: 12 });
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler({}, ctx as any);
    expect(out.status).toBe('insufficient_sample');
  });

  it('improvement > 10% relativo => status=improving', async () => {
    findActiveLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001',
      leakCode: 'roi_pko',
      baselineStatKey: 'roi.category=PKO',
      baselineValue: '-10',
      baselineSampleSize: 50,
      targetMonth: '2026-05',
      status: 'active',
    });
    queryStatByKeyMock.mockResolvedValue({ value: -5, sampleSize: 60 });
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler({}, ctx as any);
    expect(out.status).toBe('improving');
  });

  it('improvement < -10% relativo => status=regressing', async () => {
    findActiveLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001',
      leakCode: 'roi',
      baselineStatKey: 'roi',
      baselineValue: '-5',
      baselineSampleSize: 50,
      targetMonth: '2026-05',
      status: 'active',
    });
    queryStatByKeyMock.mockResolvedValue({ value: -10, sampleSize: 60 });
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler({}, ctx as any);
    expect(out.status).toBe('regressing');
  });

  it('statKey nao mais suportado => note=stat_key_unsupported', async () => {
    findActiveLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001',
      leakCode: 'old_metric',
      baselineStatKey: 'metric_deprecated',
      baselineValue: '0',
      baselineSampleSize: 50,
      targetMonth: '2026-05',
      status: 'active',
    });
    queryStatByKeyMock.mockResolvedValue(undefined); // statKey nao existe
    const { verifyLeakProgressTool } =
      await import('../../../server/coachTools/handlers/verifyLeakProgress');
    const out = await verifyLeakProgressTool.handler({}, ctx as any);
    expect(out.note).toBe('stat_key_unsupported');
  });
});
