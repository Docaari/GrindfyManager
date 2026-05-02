import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint Coach-2B / RF-07 — B-SNAPSHOT cron mensal (dia 28, 9h timezone do user)
//
// Fontes:
//   - Docs/specs/coach-2b.md (RF-07)
//   - ADR-085 (engine consumido)
//   - ADR-087 (cronRunner timezone-aware)
//
// Cenarios (lesson #vi.useFakeTimers + clearMocks):
//   - vi.setSystemTime para 28/05/2026 9h SP (12h UTC) -> dispara para users SP
//   - mesma hora UTC -> NAO dispara para users Tokyo (la sao 21h)
//   - cron rodando 24x/dia 28 -> idempotente (engine bloqueia)
//   - per-user error nao crasha (lesson #9)
//   - user free NAO recebe (gate por plan)
// =============================================================================

const listUsersForCronMock = vi.fn();
const shouldSendNudgeMock = vi.fn();
const hasSnapshotThisMonthMock = vi.fn();
const createChatSessionMock = vi.fn();
const insertChatMessageMock = vi.fn();
const createNudgeLogMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    listUsersForCron: listUsersForCronMock,
    hasSnapshotThisMonth: hasSnapshotThisMonthMock,
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
  shouldSendNudgeMock.mockReset();
  hasSnapshotThisMonthMock.mockReset();
  createChatSessionMock.mockReset();
  insertChatMessageMock.mockReset();
  createNudgeLogMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('B-SNAPSHOT cron — happy path', () => {
  it('user SP em 9h local (12h UTC) recebe nudge', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    hasSnapshotThisMonthMock.mockResolvedValue(false);
    createChatSessionMock.mockResolvedValue({ id: 'cs-1' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm-1' });
    createNudgeLogMock.mockResolvedValue('nl-1');

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0)); // 9h SP
    await processBSnapshotTick({ now });

    expect(createNudgeLogMock).toHaveBeenCalled();
    const callArgs = createNudgeLogMock.mock.calls[0][0];
    expect(callArgs.category).toBe('B-SNAPSHOT');
    expect(callArgs.cycleKey).toMatch(/2026-05/);
    expect(callArgs.status).toBe('sent');
  });

  it('user Tokyo em 9h Tokyo (0h UTC) recebe ao tick UTC=0', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-TKY', timezone: 'Asia/Tokyo', subscriptionPlan: 'pro' },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    hasSnapshotThisMonthMock.mockResolvedValue(false);
    createNudgeLogMock.mockResolvedValue('nl-2');
    createChatSessionMock.mockResolvedValue({ id: 'cs-2' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm-2' });

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    // 9h Tokyo == 0h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 0, 0, 0));
    await processBSnapshotTick({ now });
    expect(createNudgeLogMock).toHaveBeenCalled();
  });

  it('user Tokyo em 12h UTC (21h Tokyo) NAO recebe (hora local != 9)', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-TKY', timezone: 'Asia/Tokyo', subscriptionPlan: 'pro' },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0)); // 21h Tokyo
    await processBSnapshotTick({ now });
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('B-SNAPSHOT cron — gate por plano (free nao recebe)', () => {
  it('listUsersForCron eh chamado com filter incluindo plans pro+premium', async () => {
    listUsersForCronMock.mockResolvedValue([]);
    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0));
    await processBSnapshotTick({ now });
    expect(listUsersForCronMock).toHaveBeenCalled();
    const filter = listUsersForCronMock.mock.calls[0][0];
    // filter pode ser string ou objeto; valida que tem 'pro' presente
    const filterStr = typeof filter === 'string' ? filter : JSON.stringify(filter);
    expect(filterStr).toMatch(/pro|premium/);
  });
});

describe('B-SNAPSHOT cron — idempotencia 24h', () => {
  it('cron rodando segunda vez na mesma hora -> engine bloqueia (already_sent_this_cycle)', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    // Primeira: ALLOW
    // Segunda: DENY already_sent_this_cycle
    shouldSendNudgeMock
      .mockResolvedValueOnce({ allow: true })
      .mockResolvedValueOnce({ allow: false, reason: 'already_sent_this_cycle' });
    hasSnapshotThisMonthMock.mockResolvedValue(false);
    createChatSessionMock.mockResolvedValue({ id: 'cs' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl-x');

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0));
    await processBSnapshotTick({ now });
    await processBSnapshotTick({ now });

    // Apenas 1 chat session criada
    expect(createChatSessionMock).toHaveBeenCalledTimes(1);
    expect(createNudgeLogMock).toHaveBeenCalledTimes(1);
  });
});

describe('B-SNAPSHOT cron — gap-check hasSnapshotThisMonth', () => {
  it('user ja tem snapshot do mes => SKIP sem disparar', async () => {
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-SP', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    hasSnapshotThisMonthMock.mockResolvedValue(true);

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0));
    await processBSnapshotTick({ now });

    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('B-SNAPSHOT cron — per-user error nao crasha (lesson #9)', () => {
  it('falha em createChatSession para 1 user nao impede processar outros', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUsersForCronMock.mockResolvedValue([
      { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
      { userPlatformId: 'USER-B', timezone: 'America/Sao_Paulo', subscriptionPlan: 'pro' },
    ]);
    shouldSendNudgeMock.mockResolvedValue({ allow: true });
    hasSnapshotThisMonthMock.mockResolvedValue(false);
    createChatSessionMock
      .mockRejectedValueOnce(new Error('db_explode'))
      .mockResolvedValueOnce({ id: 'cs-B' });
    insertChatMessageMock.mockResolvedValue({ id: 'cm' });
    createNudgeLogMock.mockResolvedValue('nl');

    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0));
    await expect(processBSnapshotTick({ now })).resolves.not.toThrow();

    // User B foi processado mesmo com falha em A
    expect(createChatSessionMock).toHaveBeenCalledTimes(2);
    // Per-user error logado
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('B-SNAPSHOT — vi.setSystemTime determinismo', () => {
  it('avancando vi.setSystemTime entre 9h SP e 21h UTC nao crasha', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 28, 12, 0, 0)));

    listUsersForCronMock.mockResolvedValue([]);
    const { processBSnapshotTick } =
      await import('../../../server/coach/jobs/processBSnapshot');

    await expect(processBSnapshotTick({})).resolves.not.toThrow();
    vi.advanceTimersByTime(60 * 60 * 1000);
    await expect(processBSnapshotTick({})).resolves.not.toThrow();
  });
});
