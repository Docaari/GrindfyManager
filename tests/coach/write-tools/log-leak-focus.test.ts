import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-05 — log_leak_focus (write tool)
//
// Schema novo coach_leak_focus.
// UNIQUE constraint em (userId, leakCode, targetMonth) — 409 em duplicata.
// Undo: UPDATE status='abandoned'.
// =============================================================================

const createCoachLeakFocusMock = vi.fn();
const updateCoachLeakFocusMock = vi.fn();
const findCoachLeakFocusMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    createCoachLeakFocus: createCoachLeakFocusMock,
    updateCoachLeakFocus: updateCoachLeakFocusMock,
    findCoachLeakFocus: findCoachLeakFocusMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  createCoachLeakFocusMock.mockReset();
  updateCoachLeakFocusMock.mockReset();
  findCoachLeakFocusMock.mockReset();
});

describe('log_leak_focus — Zod', () => {
  it('aceita input completo', async () => {
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const out = logLeakFocusTool.inputSchema.safeParse({
      leakCode: 'negative_roi_pko',
      description: 'ROI negativo em PKO ultimo mes',
      targetMonth: '2026-05',
      baselineStat: { statKey: 'roi.category=PKO', currentValue: -15.2, sampleSize: 45 },
    });
    expect(out.success).toBe(true);
  });

  it('rejeita targetMonth formato invalido (2026-13)', async () => {
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const out = logLeakFocusTool.inputSchema.safeParse({
      leakCode: 'x', description: 'd', targetMonth: '2026-13',
      baselineStat: { statKey: 'k', currentValue: 0, sampleSize: 50 },
    });
    expect(out.success).toBe(false);
  });

  it('rejeita description > 200 chars', async () => {
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const out = logLeakFocusTool.inputSchema.safeParse({
      leakCode: 'x', description: 'a'.repeat(201), targetMonth: '2026-05',
      baselineStat: { statKey: 'k', currentValue: 0, sampleSize: 50 },
    });
    expect(out.success).toBe(false);
  });

  it('rejeita sampleSize <= 0', async () => {
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const out = logLeakFocusTool.inputSchema.safeParse({
      leakCode: 'x', description: 'd', targetMonth: '2026-05',
      baselineStat: { statKey: 'k', currentValue: 0, sampleSize: 0 },
    });
    expect(out.success).toBe(false);
  });
});

describe('log_leak_focus.executeConfirmed', () => {
  it('cria row em coach_leak_focus', async () => {
    findCoachLeakFocusMock.mockResolvedValue(undefined);
    createCoachLeakFocusMock.mockResolvedValue({
      id: 'lf-1', userId: 'USER-0001', leakCode: 'negative_roi_pko',
      targetMonth: '2026-05', status: 'active',
    });
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const tx = { query: vi.fn() };
    const out = await logLeakFocusTool.executeConfirmed(
      {
        leakCode: 'negative_roi_pko', description: 'ROI -15%',
        targetMonth: '2026-05',
        baselineStat: { statKey: 'roi.category=PKO', currentValue: -15.2, sampleSize: 45 },
      },
      ctx as any, tx,
    );
    expect(out.affectedEntityId).toBe('lf-1');
    expect(out.affectedEntityType).toMatch(/leak_focus/);
  });

  it('ja existe foco UNIQUE (user+leakCode+month) => 409 / leak_focus_already_active', async () => {
    findCoachLeakFocusMock.mockResolvedValue({
      id: 'lf-prev', leakCode: 'negative_roi_pko', targetMonth: '2026-05', status: 'active',
    });
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const tx = { query: vi.fn() };
    await expect(logLeakFocusTool.executeConfirmed(
      {
        leakCode: 'negative_roi_pko', description: 'd', targetMonth: '2026-05',
        baselineStat: { statKey: 'k', currentValue: 0, sampleSize: 50 },
      },
      ctx as any, tx,
    )).rejects.toThrow(/leak_focus_already_active|already_exists|conflict/i);
  });
});

describe('log_leak_focus.undo', () => {
  it('UPDATE status=abandoned (NAO hard-delete)', async () => {
    updateCoachLeakFocusMock.mockResolvedValue({ id: 'lf-1', status: 'abandoned' });
    const { logLeakFocusTool } =
      await import('../../../server/coachTools/handlers/logLeakFocus');
    const tx = { query: vi.fn() };
    await logLeakFocusTool.undo(
      null,
      { id: 'lf-1' },
      ctx as any, tx,
    );
    expect(updateCoachLeakFocusMock).toHaveBeenCalled();
    const args = updateCoachLeakFocusMock.mock.calls[0];
    const update = args[1] || args[2];
    expect(update.status).toBe('abandoned');
  });
});
