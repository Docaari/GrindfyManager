import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-03 — log_session_completed (write tool)
//
// Transit active -> completed. Aceita logging parcial. Undo restaura
// status='active' + valores anteriores integralmente.
// =============================================================================

const getGrindSessionMock = vi.fn();
const updateGrindSessionMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: getGrindSessionMock,
    updateGrindSession: updateGrindSessionMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  getGrindSessionMock.mockReset();
  updateGrindSessionMock.mockReset();
});

describe('log_session_completed — Zod', () => {
  it('aceita logging parcial (so volume + profit)', async () => {
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const out = logSessionCompletedTool.inputSchema.safeParse({
      sessionId: 's-1', volume: 50, profit: 250.5,
    });
    expect(out.success).toBe(true);
  });

  it('rejeita volume negativo', async () => {
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const out = logSessionCompletedTool.inputSchema.safeParse({
      sessionId: 's-1', volume: -5,
    });
    expect(out.success).toBe(false);
  });

  it('rejeita notes > 2000 chars', async () => {
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const out = logSessionCompletedTool.inputSchema.safeParse({
      sessionId: 's-1',
      notes: 'a'.repeat(2001),
    });
    expect(out.success).toBe(false);
  });
});

describe('log_session_completed.executeConfirmed', () => {
  it('session active de outro user => 403/unauthorized', async () => {
    getGrindSessionMock.mockResolvedValue({
      id: 's-1', userId: 'USER-OTHER', status: 'active',
    });
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const tx = { query: vi.fn() };
    await expect(logSessionCompletedTool.executeConfirmed(
      { sessionId: 's-1', volume: 10 },
      ctx as any, tx,
    )).rejects.toThrow(/unauthorized|not_owned|forbidden/i);
  });

  it('session com status != active => 409 session_not_active', async () => {
    getGrindSessionMock.mockResolvedValue({
      id: 's-1', userId: 'USER-0001', status: 'completed',
    });
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const tx = { query: vi.fn() };
    await expect(logSessionCompletedTool.executeConfirmed(
      { sessionId: 's-1', volume: 10 },
      ctx as any, tx,
    )).rejects.toThrow(/session_not_active|invalid_status/i);
  });

  it('UPDATE seta status=completed + endTime', async () => {
    getGrindSessionMock.mockResolvedValue({
      id: 's-1', userId: 'USER-0001', status: 'active',
      startTime: new Date('2026-05-02T18:00:00Z'),
      volume: 0, profit: '0',
    });
    updateGrindSessionMock.mockResolvedValue({
      id: 's-1', status: 'completed', endTime: new Date(), volume: 50, profit: '250',
    });
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const tx = { query: vi.fn() };
    const out = await logSessionCompletedTool.executeConfirmed(
      { sessionId: 's-1', volume: 50, profit: 250 },
      ctx as any, tx,
    );
    expect(out.affectedEntityType).toBeDefined();
    const args = updateGrindSessionMock.mock.calls[0];
    const update = args[1] || args[2];
    expect(update.status).toBe('completed');
  });
});

describe('log_session_completed.undo', () => {
  it('restaura status=active + valores anteriores integralmente', async () => {
    updateGrindSessionMock.mockResolvedValue({ id: 's-1', status: 'active' });
    const { logSessionCompletedTool } =
      await import('../../../server/coachTools/handlers/logSessionCompleted');
    const tx = { query: vi.fn() };
    await logSessionCompletedTool.undo(
      {
        id: 's-1', status: 'active', endTime: null,
        volume: 30, profit: '100', notes: 'old',
      }, // payloadBefore
      {
        id: 's-1', status: 'completed', endTime: new Date(),
        volume: 50, profit: '250',
      }, // payloadAfter
      ctx as any, tx,
    );
    expect(updateGrindSessionMock).toHaveBeenCalled();
    const args = updateGrindSessionMock.mock.calls[0];
    const update = args[1] || args[2];
    expect(update.status).toBe('active');
    // Restaura valores anteriores
    expect(update.volume).toBe(30);
  });
});
