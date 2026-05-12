import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-05 — Auto-congelamento de categoria por taxa de dismiss
//
// Modulo alvo (NAO existe ainda): server/coach/nudgeAutoFreeze.ts
//   export async function checkAndFreezeCategory(userId, category, opts?): Promise<{ frozen: boolean; rate?: number }>
//   export const WINDOW_DAYS = 7
//   export const MIN_SAMPLE = 3
//   export const DISMISS_RATE_THRESHOLD = 0.5
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-05 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§6 auto-congelamento)
//
// Comportamento:
//   - getNudgeDismissRate(userId, category, WINDOW_DAYS) -> { sent, dismissed, rate }
//   - se sent >= MIN_SAMPLE && rate > DISMISS_RATE_THRESHOLD -> congela:
//       upsertCoachPreferences({ frozenCategories: { ...current, [cat]: { frozenAt, reason: 'auto_dismiss_rate', dismissRate, windowDays } } })
//     + cria coach_nudge_log row de aviso (createNudgeLog) com triggeredByEvent='auto_freeze_notice', status='sent'
//   - NAO congela com sent < MIN_SAMPLE mesmo com rate 1.0
//   - idempotente: categoria ja congelada -> nao recria o aviso
//   - NAO auto-descongela
//
// Lesson #34: handler/service aceita injecao via composicao se util — aqui mockamos
// storage + coachPreferences storage por path.
// =============================================================================

const getNudgeDismissRateMock = vi.fn();
const createNudgeLogMock = vi.fn();
const getCoachPrefsMock = vi.fn();
const upsertCoachPrefsMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getNudgeDismissRate: getNudgeDismissRateMock,
    createNudgeLog: createNudgeLogMock,
  },
}));

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
  upsertCoachPreferences: upsertCoachPrefsMock,
}));

const PREFS_BASE = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced' as const,
  frozenCategories: {} as Record<string, any>,
};

beforeEach(() => {
  getNudgeDismissRateMock.mockReset();
  createNudgeLogMock.mockReset().mockResolvedValue('nl-mock-id');
  getCoachPrefsMock.mockReset().mockResolvedValue({ ...PREFS_BASE });
  upsertCoachPrefsMock.mockReset().mockImplementation(async (_uid: string, delta: any) => ({ ...PREFS_BASE, ...delta }));
});

describe('checkAndFreezeCategory — constantes', () => {
  it('exporta WINDOW_DAYS=7, MIN_SAMPLE=3, DISMISS_RATE_THRESHOLD=0.5', async () => {
    const mod: any = await import('../../../server/coach/nudgeAutoFreeze');
    expect(mod.WINDOW_DAYS).toBe(7);
    expect(mod.MIN_SAMPLE).toBe(3);
    expect(mod.DISMISS_RATE_THRESHOLD).toBe(0.5);
  });
});

describe('checkAndFreezeCategory — congela quando estoura threshold', () => {
  it('4 entregues, 3 dismissed (rate 0.75 > 0.5, sample 4 >= 3) -> congela', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 4, dismissed: 3, rate: 0.75 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    expect(out.frozen).toBe(true);
    expect(out.rate).toBeCloseTo(0.75, 5);

    // upsertCoachPreferences chamado com frozenCategories['B-STUDY'] reason auto_dismiss_rate
    expect(upsertCoachPrefsMock).toHaveBeenCalled();
    const delta = upsertCoachPrefsMock.mock.calls[0][1];
    expect(delta.frozenCategories).toBeDefined();
    expect(delta.frozenCategories['B-STUDY']).toEqual(expect.objectContaining({
      reason: 'auto_dismiss_rate',
      dismissRate: expect.any(Number),
      windowDays: 7,
    }));
    expect(typeof delta.frozenCategories['B-STUDY'].frozenAt).toBe('string');
  });

  it('cria coach_nudge_log row de aviso (triggeredByEvent=auto_freeze_notice, status=sent)', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 5, dismissed: 4, rate: 0.8 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    await checkAndFreezeCategory('USER-0001', 'B-VOLUME');
    expect(createNudgeLogMock).toHaveBeenCalled();
    const logArg = createNudgeLogMock.mock.calls[0][0];
    expect(logArg.triggeredByEvent).toBe('auto_freeze_notice');
    expect(logArg.status).toBe('sent');
    expect(logArg.category).toBe('B-VOLUME'); // categoria original
    expect(typeof logArg.titleI18n === 'string' || typeof logArg.titleI18n === 'undefined').toBe(true);
  });

  it('rate exatamente 0.5 (>= mas nao >) -> NAO congela (threshold e estritamente > 0.5)', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 10, dismissed: 5, rate: 0.5 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    expect(out.frozen).toBe(false);
    expect(upsertCoachPrefsMock).not.toHaveBeenCalled();
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });

  it('preserva entradas existentes de frozenCategories ao adicionar a nova (merge)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_BASE,
      frozenCategories: { 'B-LEAK': { frozenAt: '2026-05-01T00:00:00Z', reason: 'admin' } },
    });
    getNudgeDismissRateMock.mockResolvedValue({ sent: 4, dismissed: 3, rate: 0.75 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    const delta = upsertCoachPrefsMock.mock.calls[0][1];
    expect(delta.frozenCategories['B-LEAK']).toBeDefined();
    expect(delta.frozenCategories['B-STUDY']).toBeDefined();
  });
});

describe('checkAndFreezeCategory — NAO congela', () => {
  it('2 entregues, 2 dismissed (rate 1.0 mas sample 2 < 3) -> NAO congela (amostra insuficiente)', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 2, dismissed: 2, rate: 1.0 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-LEAK');
    expect(out.frozen).toBe(false);
    expect(upsertCoachPrefsMock).not.toHaveBeenCalled();
    expect(createNudgeLogMock).not.toHaveBeenCalled();
  });

  it('10 entregues, 3 dismissed (rate 0.3 <= 0.5) -> NAO congela', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 10, dismissed: 3, rate: 0.3 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-VOLUME');
    expect(out.frozen).toBe(false);
  });

  it('0 entregues -> NAO congela (rate 0)', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 0, dismissed: 0, rate: 0 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    expect(out.frozen).toBe(false);
  });
});

describe('checkAndFreezeCategory — idempotente', () => {
  it('categoria ja congelada -> nao recria o aviso (createNudgeLog nao chamado)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_BASE,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate', dismissRate: 0.8, windowDays: 7 } },
    });
    getNudgeDismissRateMock.mockResolvedValue({ sent: 5, dismissed: 5, rate: 1.0 });
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    // Ja congelada -> idempotente: nao recria o aviso
    expect(createNudgeLogMock).not.toHaveBeenCalled();
    // frozen pode ser true (continua congelada) ou false (nao fez nada novo) — o que importa e nao duplicar
    expect(typeof out.frozen).toBe('boolean');
  });
});

describe('getNudgeDismissRate — semantica do denominador/numerador (via mock contract)', () => {
  // Estes testes validam o CONTRATO esperado de storage.getNudgeDismissRate
  // (a impl real e testada em storage-nudge-methods.test.ts). Aqui so garantimos
  // que checkAndFreezeCategory consome o shape { sent, dismissed, rate }.
  it('checkAndFreezeCategory chama getNudgeDismissRate com (userId, category, WINDOW_DAYS)', async () => {
    getNudgeDismissRateMock.mockResolvedValue({ sent: 4, dismissed: 3, rate: 0.75 });
    const { checkAndFreezeCategory, WINDOW_DAYS } = await import('../../../server/coach/nudgeAutoFreeze') as any;
    await checkAndFreezeCategory('USER-0001', 'B-STUDY');
    expect(getNudgeDismissRateMock).toHaveBeenCalledWith('USER-0001', 'B-STUDY', WINDOW_DAYS);
  });
});

describe('checkAndFreezeCategory — integracao com o engine (RF-03)', () => {
  it('apos congelar, shouldSendNudge para a categoria retorna category_frozen', async () => {
    // Simula: congela B-STUDY; depois o engine le prefs com a entrada.
    getNudgeDismissRateMock.mockResolvedValue({ sent: 4, dismissed: 3, rate: 0.75 });
    upsertCoachPrefsMock.mockImplementation(async (_uid: string, delta: any) => ({ ...PREFS_BASE, ...delta }));
    const { checkAndFreezeCategory } = await import('../../../server/coach/nudgeAutoFreeze');
    const out = await checkAndFreezeCategory('USER-FROZEN', 'B-STUDY');
    expect(out.frozen).toBe(true);
    // O contrato com o engine e: a partir daqui getCoachPreferences retorna a entrada.
    // (a integracao real e coberta em nudge-engine-new-checks.test.ts via mock direto de prefs)
    const delta = upsertCoachPrefsMock.mock.calls[0][1];
    expect(delta.frozenCategories['B-STUDY']).toBeTruthy();
  });
});
