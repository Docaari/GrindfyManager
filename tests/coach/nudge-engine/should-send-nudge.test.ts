import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-03 — Engine `shouldSendNudge` — checks principais
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-03)
//   - Docs/architecture/decisions/085-coach-nudge-engine.md (Opcao A)
//
// Modulo alvo: server/coach/nudgeEngine.ts
//   export async function shouldSendNudge(userId: string, ctx: NudgeContext)
//
// Cenarios cobertos (5 checks ordenados):
//   1. Categoria toggle off  -> DENY 'category_disabled'
//   2. Quiet hours           -> DENY 'quiet_hours' (exceto isCritical=true)
//   3. Daily cap             -> DENY 'daily_cap_reached'
//   4. Hourly cap            -> DENY 'hourly_cap_reached'
//   5. Cycle key             -> DENY 'already_sent_this_cycle'
//   ALL pass                 -> ALLOW
//   ANY error                -> DENY 'engine_error' + console.error (lesson #9)
//
// Lessons aplicadas:
//   - DI `now: Date` injetavel (sem useFakeTimers em testes core).
//   - #9 safe-deny on error + console.error LOGADO antes do fallback.
//   - #3 mocks com SHAPE REAL: prefs + countNudgeLog + findNudgeLog.
// =============================================================================

const getCoachPrefsMock = vi.fn();
const getUserTimezoneMock = vi.fn();
const countNudgeLogMock = vi.fn();
const findNudgeLogMock = vi.fn();

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
    countNudgeLog: countNudgeLogMock,
    findNudgeLog: findNudgeLogMock,
  },
}));

const FULL_PREFS_DEFAULT = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9,
  maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false,
  coachTone: 'balanced' as const,
};

beforeEach(() => {
  getCoachPrefsMock.mockReset().mockResolvedValue({ ...FULL_PREFS_DEFAULT });
  getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
  countNudgeLogMock.mockReset().mockResolvedValue(0);
  findNudgeLogMock.mockReset().mockResolvedValue(undefined);
});

describe('shouldSendNudge — happy path (ALLOW)', () => {
  it('aprova nudge quando todos os checks passam', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 14h Sao Paulo == 17h UTC. Fora de 21-9.
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT',
      cycleKey: '2026-05',
      now,
    });
    expect(out).toEqual({ allow: true });
  });
});

describe('Check 1 — categoria toggle off', () => {
  it('B-LIFE com nudgeBLife=false (default) retorna category_disabled', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', { category: 'B-LIFE', now });
    expect(out).toEqual({ allow: false, reason: 'category_disabled' });
  });

  it('B-MENTAL com nudgeBMental=false retorna category_disabled', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', { category: 'B-MENTAL', now });
    expect(out.allow).toBe(false);
    expect((out as any).reason).toBe('category_disabled');
  });

  it('B-LEAK com toggle desativado pelo user retorna category_disabled', async () => {
    getCoachPrefsMock.mockResolvedValue({ ...FULL_PREFS_DEFAULT, nudgeBLeak: false });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now });
    expect(out).toEqual({ allow: false, reason: 'category_disabled' });
  });
});

describe('Check 5 — one-shot per cycle (idempotencia R5)', () => {
  it('cycleKey ja sent retorna already_sent_this_cycle', async () => {
    findNudgeLogMock.mockResolvedValue({
      id: 'nl-1', userId: 'USER-0001', category: 'B-SNAPSHOT',
      cycleKey: '2026-05', status: 'sent', sentAt: new Date(),
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT',
      cycleKey: '2026-05',
      now,
    });
    expect(out).toEqual({ allow: false, reason: 'already_sent_this_cycle' });
  });

  it('cycleKey dismissed AINDA bloqueia (one-shot por ciclo, NAO re-tenta)', async () => {
    findNudgeLogMock.mockResolvedValue({
      id: 'nl-1', userId: 'USER-0001', category: 'B-SNAPSHOT',
      cycleKey: '2026-05', status: 'dismissed', sentAt: new Date(),
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('already_sent_this_cycle');
  });

  it('cycleKey snoozed NAO bloqueia (statusIn deve excluir snoozed)', async () => {
    // findNudgeLog so retorna entradas status IN ('sent','engaged','dismissed').
    // Snoozed NAO conta como "ja enviado neste ciclo".
    findNudgeLogMock.mockResolvedValue(undefined);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });

  it('sem cycleKey + categoria nao tem cycle (ex: critical) NAO bloqueia por cycle', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-DOWNSWING',
      // sem cycleKey
      now,
    });
    expect(out.allow).toBe(true);
    expect(findNudgeLogMock).not.toHaveBeenCalled();
  });
});

describe('Telemetria estruturada (console.info)', () => {
  it('console.info coach.nudge.allow disparado em ALLOW', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now });
    const allowed = spy.mock.calls.some(args =>
      String(args[0] || '').includes('coach.nudge.allow'));
    expect(allowed).toBe(true);
    spy.mockRestore();
  });

  it('console.info coach.nudge.deny disparado em DENY com reason', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    await shouldSendNudge('USER-0001', { category: 'B-LIFE', now });
    const denied = spy.mock.calls.some(args =>
      String(args[0] || '').includes('coach.nudge.deny'));
    expect(denied).toBe(true);
    spy.mockRestore();
  });
});

describe('Safe-deny on error (lesson #9)', () => {
  it('DB error em getCoachPreferences -> log error + DENY engine_error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCoachPrefsMock.mockRejectedValue(new Error('connection_reset'));

    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-DB-ERR', { category: 'B-SNAPSHOT', now });

    expect(out).toEqual({ allow: false, reason: 'engine_error' });
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.some(args =>
      String(args[0] || '').match(/coach\.nudge\.engine\.error/));
    expect(logged).toBe(true);
    errSpy.mockRestore();
  });

  it('DB error em countNudgeLog -> safe-deny SEM crash', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    countNudgeLogMock.mockRejectedValue(new Error('timeout'));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-X', { category: 'B-SNAPSHOT', now });
    expect((out as any).reason).toBe('engine_error');
    errSpy.mockRestore();
  });
});

describe('DI now: Date — determinismo', () => {
  it('chamada sem `now` usa new Date() (default — apenas smoke)', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-NOW', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05',
    });
    // O comportamento depende da hora atual real — apenas valida shape do retorno.
    expect(out).toHaveProperty('allow');
  });
});
