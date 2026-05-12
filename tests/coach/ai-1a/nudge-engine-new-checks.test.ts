import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-03 + RF-04 — nudgeEngine: 3 checks novos
//   - check 0:   kill switch global COACH_NUDGES_ENABLED === 'false'
//                -> 'nudges_globally_disabled' (ABSOLUTO — nem isCritical bypassa)
//   - check 1.5: categoria congelada (prefs.frozenCategories[ctx.category])
//                -> 'category_frozen' (bypass se isCritical)
//   - check 1.6: snooze ativo (storage.getActiveSnoozeForCategory > now)
//                -> 'category_snoozed' (bypass se isCritical)
//
// Ordem final: kill switch -> toggle -> frozen -> snooze -> quiet hours ->
//              daily cap -> hourly cap -> cycle -> emit
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-03, RF-04, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§ordem final)
//
// Lessons:
//   - #3: mock SHAPE REAL — prefs (com frozenCategories) + getActiveSnoozeForCategory.
//   - #9: erro ao consultar snooze/frozen -> safe-deny 'engine_error' + console.error.
//   - env resolvido a cada chamada (mudar COACH_NUDGES_ENABLED em runtime reflete).
//
// NAO modifica tests/coach/nudge-engine/* — estes sao ADITIVOS.
// =============================================================================

const getCoachPrefsMock = vi.fn();
const getUserTimezoneMock = vi.fn();
const countNudgeLogMock = vi.fn();
const findNudgeLogMock = vi.fn();
const getActiveSnoozeForCategoryMock = vi.fn();

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
    countNudgeLog: countNudgeLogMock,
    findNudgeLog: findNudgeLogMock,
    getActiveSnoozeForCategory: getActiveSnoozeForCategoryMock,
  },
}));

// SHAPE REAL pos-AI-1A: prefs ganha frozenCategories (normalize back-fills {} — lesson #3)
const FULL_PREFS_DEFAULT = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9,
  maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false,
  coachTone: 'balanced' as const,
  frozenCategories: {} as Record<string, any>,
};

// 14h Sao Paulo == 17h UTC. Fora de 21-9 quiet hours.
const NOW = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
// 23h Sao Paulo == 02h UTC. DENTRO de quiet hours (21..9).
const NOW_QUIET = new Date(Date.UTC(2026, 4, 28, 2, 0, 0));

const ORIGINAL_FLAG = process.env.COACH_NUDGES_ENABLED;

beforeEach(() => {
  getCoachPrefsMock.mockReset().mockResolvedValue({ ...FULL_PREFS_DEFAULT });
  getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
  countNudgeLogMock.mockReset().mockResolvedValue(0);
  findNudgeLogMock.mockReset().mockResolvedValue(undefined);
  getActiveSnoozeForCategoryMock.mockReset().mockResolvedValue(null);
  delete process.env.COACH_NUDGES_ENABLED;
});

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.COACH_NUDGES_ENABLED;
  else process.env.COACH_NUDGES_ENABLED = ORIGINAL_FLAG;
});

// ---------------------------------------------------------------------------
// Check 0 — kill switch global
// ---------------------------------------------------------------------------
describe('Check 0 — COACH_NUDGES_ENABLED kill switch (absoluto)', () => {
  it('=false -> nudges_globally_disabled', async () => {
    process.env.COACH_NUDGES_ENABLED = 'false';
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(out).toEqual({ allow: false, reason: 'nudges_globally_disabled' });
  });

  it('=false -> nem isCritical bypassa', async () => {
    process.env.COACH_NUDGES_ENABLED = 'false';
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', isCritical: true, now: NOW });
    expect(out).toEqual({ allow: false, reason: 'nudges_globally_disabled' });
  });

  it('ausente -> engine prossegue normalmente (ALLOW no happy path)', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(out).toEqual({ allow: true });
  });

  it('=true (ou qualquer outro valor) -> engine prossegue normalmente', async () => {
    process.env.COACH_NUDGES_ENABLED = 'true';
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(out.allow).toBe(true);
  });

  it('resolvido a cada chamada — mudar em runtime reflete imediatamente', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const a = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(a.allow).toBe(true);
    process.env.COACH_NUDGES_ENABLED = 'false';
    const b = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(b).toEqual({ allow: false, reason: 'nudges_globally_disabled' });
  });

  it('vence tudo, inclusive category_disabled (toggle off) — check 0 e o primeiro', async () => {
    process.env.COACH_NUDGES_ENABLED = 'false';
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LIFE', now: NOW }); // B-LIFE default off
    expect(out).toEqual({ allow: false, reason: 'nudges_globally_disabled' });
  });
});

// ---------------------------------------------------------------------------
// Check 1.5 — categoria congelada
// ---------------------------------------------------------------------------
describe('Check 1.5 — categoria congelada (category_frozen)', () => {
  it('frozenCategories["B-STUDY"] setado -> category_frozen (sem checar quiet hours / caps)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-10T00:00:00Z', reason: 'auto_dismiss_rate', dismissRate: 0.75, windowDays: 7 } },
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-STUDY', cycleKey: '2026-05', now: NOW });
    expect(out).toEqual({ allow: false, reason: 'category_frozen' });
    // nao deve ter ido ate o cap (mas e aceitavel se foi — o importante e o reason)
  });

  it('outra categoria nao-congelada -> ALLOW', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-10T00:00:00Z', reason: 'admin' } },
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', cycleKey: '2026-05', now: NOW });
    expect(out.allow).toBe(true);
  });

  it('isCritical bypassa category_frozen', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-10T00:00:00Z', reason: 'admin' } },
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-STUDY', isCritical: true, now: NOW });
    expect(out.allow).toBe(true);
  });

  it('prefs sem o campo frozenCategories (mock parcial) -> tolera (le como {}) — lesson #3', async () => {
    const { frozenCategories, ...prefsNoFrozen } = FULL_PREFS_DEFAULT;
    getCoachPrefsMock.mockResolvedValue(prefsNoFrozen);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-STUDY', cycleKey: '2026-05', now: NOW });
    expect(out.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Check 1.6 — snooze ativo
// ---------------------------------------------------------------------------
describe('Check 1.6 — snooze ativo (category_snoozed)', () => {
  it('getActiveSnoozeForCategory retorna data futura -> category_snoozed', async () => {
    getActiveSnoozeForCategoryMock.mockResolvedValue(new Date(NOW.getTime() + 24 * 3600 * 1000));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', cycleKey: '2026-05', now: NOW });
    expect(out).toEqual({ allow: false, reason: 'category_snoozed' });
  });

  it('snooze expirado (data passada) -> NAO bloqueia (engine prossegue)', async () => {
    // getActiveSnoozeForCategory ja so retorna snoozeUntil > now, entao retorna null
    getActiveSnoozeForCategoryMock.mockResolvedValue(null);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', cycleKey: '2026-05', now: NOW });
    expect(out.allow).toBe(true);
  });

  it('getActiveSnoozeForCategory retorna null -> NAO bloqueia', async () => {
    getActiveSnoozeForCategoryMock.mockResolvedValue(null);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now: NOW });
    expect(out.allow).toBe(true);
  });

  it('isCritical bypassa category_snoozed', async () => {
    getActiveSnoozeForCategoryMock.mockResolvedValue(new Date(NOW.getTime() + 30 * 24 * 3600 * 1000));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', isCritical: true, now: NOW });
    expect(out.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ordem dos checks
// ---------------------------------------------------------------------------
describe('Ordem dos checks — frozen vence snooze vence quiet hours', () => {
  it('category_frozen vence quiet_hours quando ambos se aplicam', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-10T00:00:00Z', reason: 'admin' } },
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // NOW_QUIET esta dentro de quiet hours; mas a categoria esta congelada
    const out = await shouldSendNudge('USER-0001', { category: 'B-STUDY', now: NOW_QUIET });
    expect(out).toEqual({ allow: false, reason: 'category_frozen' });
  });

  it('category_snoozed vence quiet_hours quando ambos se aplicam', async () => {
    getActiveSnoozeForCategoryMock.mockResolvedValue(new Date(NOW_QUIET.getTime() + 24 * 3600 * 1000));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now: NOW_QUIET });
    expect(out).toEqual({ allow: false, reason: 'category_snoozed' });
  });

  it('category_disabled (toggle off) vence category_frozen (toggle e check 1, frozen e 1.5)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      nudgeBLeak: false,
      frozenCategories: { 'B-LEAK': { frozenAt: '2026-05-10T00:00:00Z', reason: 'admin' } },
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now: NOW });
    expect(out).toEqual({ allow: false, reason: 'category_disabled' });
  });
});

// ---------------------------------------------------------------------------
// Safe-deny on error (lesson #9)
// ---------------------------------------------------------------------------
describe('Safe-deny on error (lesson #9) — checks novos', () => {
  it('erro em getActiveSnoozeForCategory -> engine_error + console.error logado', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getActiveSnoozeForCategoryMock.mockRejectedValue(new Error('timeout'));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-DB-ERR', { category: 'B-LEAK', now: NOW });
    expect(out).toEqual({ allow: false, reason: 'engine_error' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('erro ao ler frozenCategories (prefs explode) -> engine_error, sem throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCoachPrefsMock.mockRejectedValue(new Error('connection_reset'));
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const out = await shouldSendNudge('USER-X', { category: 'B-LEAK', now: NOW });
    expect((out as any).reason).toBe('engine_error');
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// NudgeDenyReason ganha os 3 reasons novos (smoke type-level via runtime check)
// ---------------------------------------------------------------------------
describe('NudgeDenyReason — novos reasons disponiveis', () => {
  it('os 3 reasons novos aparecem como retorno valido em cenarios reais', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');

    process.env.COACH_NUDGES_ENABLED = 'false';
    const r0 = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', now: NOW });
    expect((r0 as any).reason).toBe('nudges_globally_disabled');
    delete process.env.COACH_NUDGES_ENABLED;

    getCoachPrefsMock.mockResolvedValue({
      ...FULL_PREFS_DEFAULT,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-10T00:00:00Z', reason: 'admin' } },
    });
    const r1 = await shouldSendNudge('USER-0001', { category: 'B-STUDY', now: NOW });
    expect((r1 as any).reason).toBe('category_frozen');

    getCoachPrefsMock.mockResolvedValue({ ...FULL_PREFS_DEFAULT });
    getActiveSnoozeForCategoryMock.mockResolvedValue(new Date(NOW.getTime() + 24 * 3600 * 1000));
    const r2 = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now: NOW });
    expect((r2 as any).reason).toBe('category_snoozed');
  });
});
