import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// EST-5 / ADR-226 — weeklyReviewMondayTick (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/jobs/weeklyReviewMonday.ts
//     weeklyReviewMondayTick({ now?, injectedStorage? }): Promise<void>
//
// Molde = server/coach/jobs/bImport.ts. Gates na ORDEM do ADR §"Tick de segunda":
//   1. COACH_NUDGES_ENABLED === "false" -> skip imediato (nudges_globally_disabled).
//   2. listUsersForCron(LIST_USERS_FOR_REPORTS_FILTER).
//   3. pre-check local: getLocalWeekday(now,tz)===1 (segunda) && getLocalHour===9.
//   4. getReportTier(user) !== 'free'.
//   5. reportWeeklyEnabled === true.
//   6. idempotencia: getWeeklyReview(user, ymdUtc(nextMondayUtc(now))) -> skip se existe.
//   7. cria a review (createWeeklyReview do orquestrador: recap_sent -> posta -> awaiting_upload).
//
// Mocks por PATH (lesson #28/#14):
//   - getReportTier de reportEligibility (gate de tier).
//   - createWeeklyReview/getWeeklyReview de weeklyReviewOrchestrator (o tick chama
//     o orquestrador para criar; getWeeklyReview para o pre-check de idempotencia).
//
// getLocalWeekday/getLocalHour sao REAIS (timezone.ts) — controlamos via opts.now.
// Para um instante UTC ser "segunda 9h America/Sao_Paulo" (UTC-3): 12:00 UTC de
// uma segunda-feira -> 09:00 BRT segunda. 2026-06-08 é segunda. now=2026-06-08T12:00Z.
//
// injectedStorage por composicao (lesson #34).
// =============================================================================

const h = vi.hoisted(() => ({
  getReportTier: vi.fn(),
  createWeeklyReview: vi.fn(),
  getWeeklyReview: vi.fn(),
}));

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: h.getReportTier,
  LIST_USERS_FOR_REPORTS_FILTER: "subscription_plan IN ('trial','active','admin')",
}));

vi.mock('../../../server/coach/weeklyReview/weeklyReviewOrchestrator', () => ({
  createWeeklyReview: h.createWeeklyReview,
  getWeeklyReview: h.getWeeklyReview,
}));

async function loadTick() {
  return await import('../../../server/coach/jobs/weeklyReviewMonday');
}

// Segunda 09:00 America/Sao_Paulo (UTC-3) == 12:00 UTC de uma segunda (2026-06-08).
const MONDAY_9H_LOCAL = new Date('2026-06-08T12:00:00.000Z');
// Mesma segunda mas 15:00 BRT (18:00 UTC) -> hora != 9 -> skip.
const MONDAY_15H_LOCAL = new Date('2026-06-08T18:00:00.000Z');
// Terca 09:00 BRT (2026-06-09T12:00Z) -> dia != segunda -> skip.
const TUESDAY_9H_LOCAL = new Date('2026-06-09T12:00:00.000Z');

function makeStorage(overrides: Record<string, any> = {}) {
  return {
    listUsersForCron: vi.fn(async () => [
      { userPlatformId: 'USER-0001', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
    ]),
    // pref de opt-in do weekly (RF-02 gate 5). default ON.
    getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: true })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.COACH_NUDGES_ENABLED;
  h.getReportTier.mockResolvedValue('eligible');
  h.getWeeklyReview.mockResolvedValue(null); // sem review previa
  h.createWeeklyReview.mockResolvedValue({
    review: { id: 'wr_1', status: 'awaiting_upload', weekStartDate: '2026-06-15' },
  });
});

afterEach(() => {
  delete process.env.COACH_NUDGES_ENABLED;
});

describe('EST-5 weeklyReviewMondayTick — kill-switch (RF-02 gate 1)', () => {
  it('COACH_NUDGES_ENABLED=false -> no-op (nem itera users, nem cria review)', async () => {
    process.env.COACH_NUDGES_ENABLED = 'false';
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(storage.listUsersForCron).not.toHaveBeenCalled();
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });
});

describe('EST-5 weeklyReviewMondayTick — gates de dia/hora (RF-02 gate 3)', () => {
  it('segunda 9h local + elegivel + opt-in + sem review -> cria 1 review', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).toHaveBeenCalledTimes(1);
  });

  it('hora != 9 (15h local) -> skip (nenhuma review criada)', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_15H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });

  it('dia != segunda (terca 9h local) -> skip', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: TUESDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });
});

describe('EST-5 weeklyReviewMondayTick — gate de tier (RF-02 gate 4)', () => {
  it('user Free -> skip (nenhuma review criada, nenhuma mensagem)', async () => {
    h.getReportTier.mockResolvedValue('free');
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });
});

describe('EST-5 weeklyReviewMondayTick — gate de opt-in (RF-02 gate 5)', () => {
  it('reportWeeklyEnabled=false -> skip', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage({
      getCoachPreferences: vi.fn(async () => ({ reportWeeklyEnabled: false })),
    });
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });
});

describe('EST-5 weeklyReviewMondayTick — idempotencia da semana (RF-02 gate 6)', () => {
  it('review ja existe na semana -> no-op (nao re-posta recap)', async () => {
    h.getWeeklyReview.mockResolvedValue({ id: 'wr_existing', status: 'awaiting_upload' });
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });

  it('segundo tick na mesma hora/semana -> no-op (review do 1o tick ja existe)', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    // 1o tick cria; depois getWeeklyReview passa a achar a review.
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).toHaveBeenCalledTimes(1);
    h.getWeeklyReview.mockResolvedValue({ id: 'wr_1', status: 'awaiting_upload' });
    h.createWeeklyReview.mockClear();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    expect(h.createWeeklyReview).not.toHaveBeenCalled();
  });
});

describe('EST-5 weeklyReviewMondayTick — resiliencia (lesson #9)', () => {
  it('falha de createWeeklyReview de um user NAO derruba o tick (segue para o proximo)', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage({
      listUsersForCron: vi.fn(async () => [
        { userPlatformId: 'USER-A', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
        { userPlatformId: 'USER-B', timezone: 'America/Sao_Paulo', subscriptionPlan: 'trial' },
      ]),
    });
    h.createWeeklyReview
      .mockRejectedValueOnce(new Error('user A exploded'))
      .mockResolvedValueOnce({ review: { id: 'wr_b', status: 'awaiting_upload' } });
    // nao deve lancar; tenta os 2 users.
    await expect(
      weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage }),
    ).resolves.toBeUndefined();
    expect(h.createWeeklyReview).toHaveBeenCalledTimes(2);
  });

  it('now e injectedStorage sao injetaveis para teste determinístico (lesson #34)', async () => {
    const { weeklyReviewMondayTick } = await loadTick();
    const storage = makeStorage();
    await weeklyReviewMondayTick({ now: MONDAY_9H_LOCAL, injectedStorage: storage });
    // usa o storage injetado (nao o real).
    expect(storage.listUsersForCron).toHaveBeenCalled();
  });
});
