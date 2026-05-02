import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-08 — B-LEAK pos-upload (setImmediate, NAO cron)
//
// Hook em routes/upload.ts apos commit dispara processCoachLeakDetection
// async. Background job detecta leaks novos (nao mencionados em 30d), agrupa
// e dispara 1 nudge B-LEAK por semana (cycleKey YYYY-WW).
//
// Cenarios criticos:
//   - 0 leaks novos => SKIP
//   - >= 1 leak novo => 1 nudge (mesmo se 5 detectados)
//   - 2 uploads mesma semana com leaks DIFERENTES => 1 nudge so (cycleKey block)
//   - detectLeaks DB error => log + SKIP, NAO afeta upload HTTP
// =============================================================================

const detectLeaksMock = vi.fn();
const shouldSendNudgeMock = vi.fn();
const queryRecentChatMessagesMock = vi.fn();
const createChatSessionMock = vi.fn();
const insertChatMessageMock = vi.fn();
const createNudgeLogMock = vi.fn();

vi.mock('../../../server/coachLeakDetection', () => ({
  detectLeaks: detectLeaksMock,
}));

vi.mock('../../../server/coach/nudgeEngine', () => ({
  shouldSendNudge: shouldSendNudgeMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    queryRecentChatMessages: queryRecentChatMessagesMock,
    createChatSession: createChatSessionMock,
    insertChatMessage: insertChatMessageMock,
    createNudgeLog: createNudgeLogMock,
  },
}));

beforeEach(() => {
  detectLeaksMock.mockReset();
  shouldSendNudgeMock.mockReset();
  queryRecentChatMessagesMock.mockReset().mockResolvedValue([]);
  createChatSessionMock.mockReset();
  insertChatMessageMock.mockReset();
  createNudgeLogMock.mockReset();
});

describe('B-LEAK — happy path', () => {
  it('1 leak novo => 1 nudge enviado', async () => {
    detectLeaksMock.mockResolvedValue([
      { code: 'negative_roi_pko', severity: 'medium', evidence: { n: 45, value: -15.2 } },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs-l1' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm-l1' });
    createNudgeLogMock.mockResolvedValue('nl-l1');

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-1' });

    expect(createNudgeLogMock).toHaveBeenCalled();
    const args = createNudgeLogMock.mock.calls[0][0];
    expect(args.category).toBe('B-LEAK');
    expect(args.cycleKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it('5 leaks detectados => agrupa em 1 nudge so (NAO 5)', async () => {
    detectLeaksMock.mockResolvedValue([
      { code: 'leak_1', severity: 'medium', evidence: { n: 50 } },
      { code: 'leak_2', severity: 'medium', evidence: { n: 50 } },
      { code: 'leak_3', severity: 'medium', evidence: { n: 50 } },
      { code: 'leak_4', severity: 'high', evidence: { n: 50 } },
      { code: 'leak_5', severity: 'medium', evidence: { n: 50 } },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-2' });

    expect(createNudgeLogMock).toHaveBeenCalledTimes(1);
    expect(createChatSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('B-LEAK — gap-check (ja mencionado em 30d)', () => {
  it('leak ja mencionado em chat_messages.content nas ultimas 30d => SKIP', async () => {
    detectLeaksMock.mockResolvedValue([
      { code: 'negative_roi_pko', severity: 'medium', evidence: { n: 45 } },
    ]);
    queryRecentChatMessagesMock.mockResolvedValue([
      { content: 'Detectei negative_roi_pko no seu jogo...', createdAt: new Date() },
    ]);

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-3' });

    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });

  it('0 leaks novos detectados => SKIP', async () => {
    detectLeaksMock.mockResolvedValue([]);
    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-4' });
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('B-LEAK — cycleKey semanal (idempotencia)', () => {
  it('2 uploads mesma semana com mesmos leaks => 1 nudge so', async () => {
    detectLeaksMock.mockResolvedValue([
      { code: 'leak_a', severity: 'medium', evidence: { n: 50 } },
    ]);
    shouldSendNudgeMock
      .mockResolvedValueOnce({ allow: true })
      .mockResolvedValueOnce({ allow: false, reason: 'already_sent_this_cycle' });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');

    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-5' });
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-6' });

    expect(createNudgeLogMock).toHaveBeenCalledTimes(1);
  });

  it('2 uploads mesma semana com leaks DIFERENTES => ainda 1 nudge so (cycleKey blocks)', async () => {
    detectLeaksMock
      .mockResolvedValueOnce([{ code: 'leak_x', severity: 'medium', evidence: { n: 50 } }])
      .mockResolvedValueOnce([{ code: 'leak_y', severity: 'medium', evidence: { n: 50 } }]);
    shouldSendNudgeMock
      .mockResolvedValueOnce({ allow: true })
      .mockResolvedValueOnce({ allow: false, reason: 'already_sent_this_cycle' });
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-7' });
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-8' });

    expect(createNudgeLogMock).toHaveBeenCalledTimes(1);
  });
});

describe('B-LEAK — opt-out (engine DENY)', () => {
  it('user opt-out B-LEAK => detectLeaks NEM eh chamado se engine deny precoce', async () => {
    // Opcao A: engine eh chamado primeiro com check rapido. Mas se a
    // implementacao chamar detectLeaks ANTES, ainda deve respeitar o DENY.
    shouldSendNudgeMock.mockResolvedValue({ allow: false, reason: 'category_disabled' });

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-optout' });

    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('B-LEAK — DB error em detectLeaks (lesson #9)', () => {
  it('detectLeaks throw => log + NAO crasha + NAO dispara nudge', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    detectLeaksMock.mockRejectedValue(new Error('db_explode'));

    const { processCoachLeakDetection } =
      await import('../../../server/coach/jobs/processCoachLeakDetection');
    await expect(
      processCoachLeakDetection({ userId: 'USER-0001', uploadId: 'up-err' }),
    ).resolves.not.toThrow();

    expect(createNudgeLogMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
