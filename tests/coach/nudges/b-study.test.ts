import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-09 — B-STUDY cron diario 19h timezone do user
//
// Cron 1x/dia 19h local:
//   - Itera users pro/premium
//   - Para cada user: getActiveLeakFocus(currentMonth)
//   - Se sem foco => SKIP
//   - Para cada foco: count study_sessions ultimos 7d
//   - Se 0 sessoes => candidato a nudge B-STUDY
//   - shouldSendNudge cycleKey YYYY-WW (max 1 por semana)
//   - 2+ focos: pega o de baselineSampleSize maior
//   - Boundary: nudge so apos 7d do createdAt do foco
// =============================================================================

const listUsersForCronMock = vi.fn();
const findActiveLeakFocusListMock = vi.fn();
const countStudySessionsMatchingFocusMock = vi.fn();
const shouldSendNudgeMock = vi.fn();
const createChatSessionMock = vi.fn();
const insertChatMessageMock = vi.fn();
const createNudgeLogMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    listUsersForCron: listUsersForCronMock,
    findActiveLeakFocusList: findActiveLeakFocusListMock,
    countStudySessionsMatchingFocus: countStudySessionsMatchingFocusMock,
    createChatSession: createChatSessionMock,
    insertChatMessage: insertChatMessageMock,
    createNudgeLog: createNudgeLogMock,
  },
}));

vi.mock('../../../server/coach/nudgeEngine', () => ({
  shouldSendNudge: shouldSendNudgeMock,
}));

beforeEach(() => {
  listUsersForCronMock.mockReset();
  findActiveLeakFocusListMock.mockReset();
  countStudySessionsMatchingFocusMock.mockReset();
  shouldSendNudgeMock.mockReset();
  createChatSessionMock.mockReset();
  insertChatMessageMock.mockReset();
  createNudgeLogMock.mockReset();
});

describe('B-STUDY — happy path', () => {
  it('user com foco ativo + 0 study_sessions em 7d => dispara nudge', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    findActiveLeakFocusListMock.mockResolvedValue([
      {
        id: 'lf-1', userId: 'USER-A',
        leakCode: 'roi_pko',
        description: 'ROI -10% em PKO',
        baselineSampleSize: 50,
        createdAt: new Date(Date.UTC(2026, 4, 15)), // 2 semanas atras
      },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(0);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    // 19h SP == 22h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    await processBStudyTick({ now });

    expect(createNudgeLogMock).toHaveBeenCalled();
    expect(createNudgeLogMock.mock.calls[0][0].category).toBe('B-STUDY');
  });
});

describe('B-STUDY — gap-check', () => {
  it('user sem foco ativo => SKIP', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    findActiveLeakFocusListMock.mockResolvedValue([]);
    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    await processBStudyTick({ now });
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });

  it('user com 1+ study_session em 7d no foco => SKIP', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    findActiveLeakFocusListMock.mockResolvedValue([
      {
        id: 'lf-1', userId: 'USER-A', leakCode: 'roi_pko',
        baselineSampleSize: 50,
        createdAt: new Date(Date.UTC(2026, 4, 15)),
      },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(1);

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    await processBStudyTick({ now });
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('B-STUDY — boundary 7 dias do createdAt do foco', () => {
  it('foco criado ha 3 dias => SKIP (ainda dentro do periodo de garantia)', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    const created = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    findActiveLeakFocusListMock.mockResolvedValue([
      {
        id: 'lf-1', userId: 'USER-A', leakCode: 'roi',
        baselineSampleSize: 50, createdAt: created,
      },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(0);

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    await processBStudyTick({ now });
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });

  it('foco criado ha 8 dias + 0 sessoes => dispara', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    const created = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    findActiveLeakFocusListMock.mockResolvedValue([
      {
        id: 'lf-1', userId: 'USER-A', leakCode: 'roi',
        baselineSampleSize: 50, createdAt: created,
      },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(0);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    await processBStudyTick({ now });
    expect(createNudgeLogMock).toHaveBeenCalled();
  });
});

describe('B-STUDY — multiplo focos: pega o de baselineSampleSize maior', () => {
  it('2 focos com 0 sessoes em 7d => 1 nudge para o foco com sampleSize maior', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    const old = new Date(Date.UTC(2026, 4, 10));
    findActiveLeakFocusListMock.mockResolvedValue([
      { id: 'lf-1', userId: 'USER-A', leakCode: 'small', baselineSampleSize: 30, createdAt: old },
      { id: 'lf-2', userId: 'USER-A', leakCode: 'large', baselineSampleSize: 200, createdAt: old },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(0);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    await processBStudyTick({ now });

    expect(createNudgeLogMock).toHaveBeenCalledTimes(1);
    // O leakCode 'large' (200 sample) deve ter sido escolhido
    const args = createNudgeLogMock.mock.calls[0][0];
    expect(String(args.bodyPreview || args.title || '').toLowerCase()).toMatch(/large|200|negative_roi|pko/i);
  });
});

describe('B-STUDY — cycle semanal', () => {
  it('cycleKey usado eh YYYY-WW', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    findActiveLeakFocusListMock.mockResolvedValue([
      {
        id: 'lf-1', userId: 'USER-A', leakCode: 'x',
        baselineSampleSize: 100,
        createdAt: new Date(Date.UTC(2026, 4, 10)),
      },
    ]);
    countStudySessionsMatchingFocusMock.mockResolvedValue(0);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processBStudyTick } =
      await import('../../../server/coach/jobs/processBStudy');
    const now = new Date(Date.UTC(2026, 4, 28, 22, 0, 0));
    await processBStudyTick({ now });

    const cycleKey = createNudgeLogMock.mock.calls[0][0].cycleKey;
    expect(cycleKey).toMatch(/^\d{4}-\d{1,2}$/); // YYYY-WW format
  });
});
