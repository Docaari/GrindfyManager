import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-03 — start_grind_session (write tool)
//
// 2 modes: from_planned (transit planned -> active) | instant (cria + active).
// Undo: from_planned reverte para planned + clear startTime; instant deleta row.
// =============================================================================

const getPlannedSessionMock = vi.fn();
const updatePlannedSessionMock = vi.fn();
const createGrindSessionMock = vi.fn();
const deleteGrindSessionMock = vi.fn();
const getGrindSessionMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getPlannedSession: getPlannedSessionMock,
    updatePlannedSession: updatePlannedSessionMock,
    createGrindSession: createGrindSessionMock,
    deleteGrindSession: deleteGrindSessionMock,
    getGrindSession: getGrindSessionMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  getPlannedSessionMock.mockReset();
  updatePlannedSessionMock.mockReset();
  createGrindSessionMock.mockReset();
  deleteGrindSessionMock.mockReset();
  getGrindSessionMock.mockReset();
});

describe('start_grind_session — Zod', () => {
  it('aceita mode=instant sem plannedSessionId', async () => {
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const out = startGrindSessionTool.inputSchema.safeParse({ mode: 'instant' });
    expect(out.success).toBe(true);
  });

  it('rejeita mode=from_planned sem plannedSessionId (superRefine)', async () => {
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const out = startGrindSessionTool.inputSchema.safeParse({ mode: 'from_planned' });
    expect(out.success).toBe(false);
  });

  it('rejeita mode invalido', async () => {
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const out = startGrindSessionTool.inputSchema.safeParse({ mode: 'random' });
    expect(out.success).toBe(false);
  });
});

describe('start_grind_session.executeConfirmed', () => {
  it('mode=from_planned + planned status=planned => UPDATE para active', async () => {
    getPlannedSessionMock.mockResolvedValue({
      id: 'p-1', userId: 'USER-0001', status: 'planned', date: new Date(),
    });
    updatePlannedSessionMock.mockResolvedValue({
      id: 'p-1', status: 'active', startTime: new Date(),
    });

    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    const out = await startGrindSessionTool.executeConfirmed(
      { mode: 'from_planned', plannedSessionId: 'p-1' },
      ctx as any, tx,
    );
    expect(out.affectedEntityType).toBeDefined();
    expect(out.affectedEntityId).toBe('p-1');
  });

  it('mode=from_planned com status != planned => session_not_planned', async () => {
    getPlannedSessionMock.mockResolvedValue({
      id: 'p-1', userId: 'USER-0001', status: 'completed',
    });
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    await expect(startGrindSessionTool.executeConfirmed(
      { mode: 'from_planned', plannedSessionId: 'p-1' },
      ctx as any, tx,
    )).rejects.toThrow(/session_not_planned/);
  });

  it('mode=from_planned planned de outro user => unauthorized', async () => {
    getPlannedSessionMock.mockResolvedValue({
      id: 'p-1', userId: 'USER-OTHER', status: 'planned',
    });
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    await expect(startGrindSessionTool.executeConfirmed(
      { mode: 'from_planned', plannedSessionId: 'p-1' },
      ctx as any, tx,
    )).rejects.toThrow(/unauthorized|not_owned|forbidden/i);
  });

  it('mode=instant cria row em planned_sessions com status=active', async () => {
    createGrindSessionMock.mockResolvedValue({
      id: 'p-new', status: 'active', startTime: new Date(),
    });
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    const out = await startGrindSessionTool.executeConfirmed(
      { mode: 'instant' },
      ctx as any, tx,
    );
    expect(createGrindSessionMock).toHaveBeenCalled();
    expect(out.affectedEntityId).toBe('p-new');
  });
});

describe('start_grind_session.undo', () => {
  it('from_planned undo => UPDATE status=planned + startTime=null', async () => {
    updatePlannedSessionMock.mockResolvedValue({ id: 'p-1', status: 'planned' });
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    await startGrindSessionTool.undo(
      { id: 'p-1', status: 'planned', startTime: null },
      { id: 'p-1', status: 'active', startTime: new Date(), mode: 'from_planned' },
      ctx as any, tx,
    );
    expect(updatePlannedSessionMock).toHaveBeenCalled();
    const args = updatePlannedSessionMock.mock.calls[0];
    const update = args[1] || args[2];
    expect(update.status).toBe('planned');
  });

  it('instant undo => DELETE row', async () => {
    deleteGrindSessionMock.mockResolvedValue({ deleted: 1 });
    const { startGrindSessionTool } =
      await import('../../../server/coachTools/handlers/startGrindSession');
    const tx = { query: vi.fn() };
    await startGrindSessionTool.undo(
      null, // payloadBefore = null para instant (sem estado anterior)
      { id: 'p-new', status: 'active', mode: 'instant' },
      ctx as any, tx,
    );
    expect(deleteGrindSessionMock).toHaveBeenCalled();
  });
});
