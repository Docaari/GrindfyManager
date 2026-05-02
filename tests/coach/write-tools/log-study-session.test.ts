import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-06 — log_study_session (write tool)
// =============================================================================

const createStudySessionMock = vi.fn();
const deleteStudySessionMock = vi.fn();
const getStudyCardMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    createStudySession: createStudySessionMock,
    deleteStudySession: deleteStudySessionMock,
    getStudyCard: getStudyCardMock,
  },
}));

const ctx = { userId: 'USER-0001', chatSessionId: 's', messageId: 'm', actionId: 'a' };

beforeEach(() => {
  createStudySessionMock.mockReset();
  deleteStudySessionMock.mockReset();
  getStudyCardMock.mockReset();
});

describe('log_study_session — Zod', () => {
  it('aceita topic enum + duration valida', async () => {
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const out = logStudySessionTool.inputSchema.safeParse({
      topic: 'solver', durationMinutes: 60,
    });
    expect(out.success).toBe(true);
  });

  it('rejeita duration < 5min', async () => {
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const out = logStudySessionTool.inputSchema.safeParse({
      topic: 'solver', durationMinutes: 2,
    });
    expect(out.success).toBe(false);
  });

  it('rejeita duration > 480min', async () => {
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const out = logStudySessionTool.inputSchema.safeParse({
      topic: 'solver', durationMinutes: 500,
    });
    expect(out.success).toBe(false);
  });

  it('rejeita topic fora do enum', async () => {
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const out = logStudySessionTool.inputSchema.safeParse({
      topic: 'cooking', durationMinutes: 30,
    });
    expect(out.success).toBe(false);
  });

  it('focusScore deve ser 0..10', async () => {
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const out = logStudySessionTool.inputSchema.safeParse({
      topic: 'solver', durationMinutes: 30, focusScore: 11,
    });
    expect(out.success).toBe(false);
  });
});

describe('log_study_session.executeConfirmed', () => {
  it('cria row em study_sessions', async () => {
    createStudySessionMock.mockResolvedValue({
      id: 'ss-x', topic: 'solver', durationMinutes: 60, date: new Date(),
    });
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const tx = { query: vi.fn() };
    const out = await logStudySessionTool.executeConfirmed(
      { topic: 'solver', durationMinutes: 60 },
      ctx as any, tx,
    );
    expect(out.affectedEntityId).toBe('ss-x');
  });

  it('studyCardId de outro user => 403/unauthorized', async () => {
    getStudyCardMock.mockResolvedValue({ id: 'sc-1', userId: 'USER-OTHER' });
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const tx = { query: vi.fn() };
    await expect(logStudySessionTool.executeConfirmed(
      { topic: 'solver', durationMinutes: 60, studyCardId: 'sc-1' },
      ctx as any, tx,
    )).rejects.toThrow(/unauthorized|not_owned|forbidden/i);
  });

  it('sem studyCardId aceita estudo livre', async () => {
    createStudySessionMock.mockResolvedValue({
      id: 'ss-y', topic: 'mental', durationMinutes: 30,
    });
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const tx = { query: vi.fn() };
    const out = await logStudySessionTool.executeConfirmed(
      { topic: 'mental', durationMinutes: 30 },
      ctx as any, tx,
    );
    expect(out.affectedEntityId).toBe('ss-y');
  });
});

describe('log_study_session.undo', () => {
  it('DELETE row', async () => {
    deleteStudySessionMock.mockResolvedValue({ deleted: 1 });
    const { logStudySessionTool } =
      await import('../../../server/coachTools/handlers/logStudySession');
    const tx = { query: vi.fn() };
    await logStudySessionTool.undo(
      null,
      { id: 'ss-x' },
      ctx as any, tx,
    );
    expect(deleteStudySessionMock).toHaveBeenCalled();
  });
});
