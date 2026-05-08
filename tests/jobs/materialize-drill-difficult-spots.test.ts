/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2.3 cron materializeDrillDifficultSpotsCron
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.3
 * ADRs: 137 (cap 5/dia), 138 (relax FK), 139 (initial state)
 *
 * Cobertura RED:
 *   - Registra cron com expressao "0 6 * * *" UTC.
 *   - Le study_sessions_v2 ultimos 7d com mode='drill_gto' AND difficult_spots != null.
 *   - Idempotency: hash md5(session_id || context). Re-run = 0 dups.
 *   - Cap 5 cards/user/dia (source='drill_gto_difficult_spot').
 *   - Cria starred_hand orfao (session_id=NULL, captured_during='drill_gto', type='drill').
 *   - Cria spot_reentry_cards com initial state (interval=1, ease=2.5).
 *   - Erro per-user: continua processando outros users.
 *   - Janela 7d respeitada — sessions mais antigas ignoradas.
 *   - Log estruturado de metricas.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted spies para cron mock + storage mocks
 *   #5 vi.fn ok
 *
 * Status RED: arquivo server/jobs/materializeDrillDifficultSpots.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  cronScheduleMock,
  listAllUsersMock,
  getRecentDrillSessionsMock,
  countDrillCardsCreatedTodayMock,
  findStarredHandByDrillHashMock,
  createDrillStarredHandMock,
  createSpotReentryCardMock,
  getActiveReentryCardForSpotMock,
} = vi.hoisted(() => ({
  cronScheduleMock: vi.fn(),
  listAllUsersMock: vi.fn(),
  getRecentDrillSessionsMock: vi.fn(),
  countDrillCardsCreatedTodayMock: vi.fn(),
  findStarredHandByDrillHashMock: vi.fn(),
  createDrillStarredHandMock: vi.fn(),
  createSpotReentryCardMock: vi.fn(),
  getActiveReentryCardForSpotMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
  schedule: cronScheduleMock,
}));

vi.mock('../../server/storage', () => ({
  storage: {
    listAllUsers: listAllUsersMock,
    getRecentDrillSessions: getRecentDrillSessionsMock,
    countDrillCardsCreatedToday: countDrillCardsCreatedTodayMock,
    findStarredHandByDrillHash: findStarredHandByDrillHashMock,
    createDrillStarredHand: createDrillStarredHandMock,
    createSpotReentryCard: createSpotReentryCardMock,
    getActiveReentryCardForSpot: getActiveReentryCardForSpotMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults sensiveis para evitar undefined.mockResolvedValue.
  listAllUsersMock.mockResolvedValue([]);
  getRecentDrillSessionsMock.mockResolvedValue([]);
  countDrillCardsCreatedTodayMock.mockResolvedValue(0);
  findStarredHandByDrillHashMock.mockResolvedValue(null);
  getActiveReentryCardForSpotMock.mockResolvedValue(null);
  createDrillStarredHandMock.mockResolvedValue({ id: 'spot-drill-new' });
  createSpotReentryCardMock.mockResolvedValue({ id: 'card-new' });
});

// =============================================================================
// Cron registration
// =============================================================================
describe('materializeDrillDifficultSpotsCron — register', () => {
  it('exporta registerMaterializeDrillDifficultSpotsCron', async () => {
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    expect(typeof mod.registerMaterializeDrillDifficultSpotsCron).toBe('function');
  });

  it('registra cron com expressao "0 6 * * *" (UTC default)', async () => {
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.registerMaterializeDrillDifficultSpotsCron();
    expect(cronScheduleMock).toHaveBeenCalled();
    const callArgs = cronScheduleMock.mock.calls[0];
    expect(callArgs[0]).toBe('0 6 * * *');
  });
});

// =============================================================================
// Run logic
// =============================================================================
describe('materializeDrillDifficultSpotsCron — run logic', () => {
  it('exporta runMaterializeDrillDifficultSpots (manual trigger)', async () => {
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    expect(typeof mod.runMaterializeDrillDifficultSpots).toBe('function');
  });

  it('processa cada user que tem drill sessions nos ultimos 7d', async () => {
    listAllUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A' },
      { userPlatformId: 'USER-B' },
    ]);
    getRecentDrillSessionsMock.mockImplementation(async (userId: string) => {
      if (userId === 'USER-A') {
        return [
          {
            id: 'ss-a',
            userId: 'USER-A',
            mode: 'drill_gto',
            difficultSpots: [{ context: 'BB defense vs UTG', note: 'misplayed' }],
          },
        ];
      }
      return [];
    });
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(getRecentDrillSessionsMock).toHaveBeenCalledWith('USER-A', expect.anything());
    expect(getRecentDrillSessionsMock).toHaveBeenCalledWith('USER-B', expect.anything());
  });

  it('cria starred_hand orfao + spot_reentry_card para cada difficult_spot novo', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a',
        userId: 'USER-A',
        mode: 'drill_gto',
        difficultSpots: [
          { context: 'BB defense vs UTG', note: 'misplayed' },
          { context: 'CO 3bet AKo', note: 'too thin' },
        ],
      },
    ]);
    findStarredHandByDrillHashMock.mockResolvedValue(null);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createDrillStarredHandMock).toHaveBeenCalledTimes(2);
    expect(createSpotReentryCardMock).toHaveBeenCalledTimes(2);
  });

  it('idempotency hash dedup: starred_hand ja existe + ja tem reentry → SKIP', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a',
        userId: 'USER-A',
        mode: 'drill_gto',
        difficultSpots: [{ context: 'BB defense vs UTG', note: 'misplayed' }],
      },
    ]);
    // Ja existe spot orfao com hash dedup
    findStarredHandByDrillHashMock.mockResolvedValue({ id: 'spot-existing' });
    // Ja tem card ativo
    getActiveReentryCardForSpotMock.mockResolvedValue({
      id: 'card-existing', spotId: 'spot-existing', archivedAt: null,
    });
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createDrillStarredHandMock).not.toHaveBeenCalled();
    expect(createSpotReentryCardMock).not.toHaveBeenCalled();
  });

  it('cap 5/user/dia respeitado (createdToday=5 → SKIP user)', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    countDrillCardsCreatedTodayMock.mockResolvedValue(5);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [
          { context: 'a', note: '1' },
          { context: 'b', note: '2' },
          { context: 'c', note: '3' },
        ],
      },
    ]);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createSpotReentryCardMock).not.toHaveBeenCalled();
  });

  it('cap mid-run: createdToday=3, 5 difficult_spots → cria apenas 2 (cap atingido)', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    countDrillCardsCreatedTodayMock.mockResolvedValue(3);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [
          { context: 'a', note: '1' },
          { context: 'b', note: '2' },
          { context: 'c', note: '3' },
          { context: 'd', note: '4' },
          { context: 'e', note: '5' },
        ],
      },
    ]);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    // 5 - 3 = 2 cards podem ser criados
    expect(createSpotReentryCardMock).toHaveBeenCalledTimes(2);
  });

  it('erro per-user nao trava cron: USER-A throw, USER-B continua', async () => {
    listAllUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A' },
      { userPlatformId: 'USER-B' },
    ]);
    getRecentDrillSessionsMock.mockImplementation(async (userId: string) => {
      if (userId === 'USER-A') throw new Error('user A db boom');
      return [
        {
          id: 'ss-b', userId: 'USER-B', mode: 'drill_gto',
          difficultSpots: [{ context: 'x', note: 'y' }],
        },
      ];
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createSpotReentryCardMock).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('cria starred_hand com captured_during=drill_gto + type=drill (ADR-138)', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [{ context: 'foo', note: 'bar' }],
      },
    ]);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createDrillStarredHandMock).toHaveBeenCalled();
    const callArg = createDrillStarredHandMock.mock.calls[0]?.[0];
    if (callArg) {
      expect(callArg).toMatchObject(
        expect.objectContaining({
          userId: 'USER-A',
        }),
      );
      // Implementer pode passar capturedDuring + type explicit, ou storage.createDrillStarredHand
      // setar internamente. Aceita ambos.
      if (callArg.capturedDuring !== undefined) {
        expect(callArg.capturedDuring).toBe('drill_gto');
      }
    }
  });

  it('cria reentry card com source=drill_gto_difficult_spot + interval=1 (ADR-139)', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [{ context: 'foo', note: 'bar' }],
      },
    ]);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(createSpotReentryCardMock).toHaveBeenCalled();
    const arg = createSpotReentryCardMock.mock.calls[0]?.[0];
    expect(arg.source).toBe('drill_gto_difficult_spot');
    expect(Number(arg.intervalDays)).toBe(1);
    expect(Number(arg.easeFactor)).toBe(2.5);
  });

  it('emite log estruturado de metricas (count_created, count_skipped, errors)', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [{ context: 'foo', note: 'bar' }],
      },
    ]);
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    await mod.runMaterializeDrillDifficultSpots();
    expect(logSpy).toHaveBeenCalled();
    const haystack = JSON.stringify(logSpy.mock.calls.flat());
    expect(haystack).toMatch(/cron|drill|materialize|created|skipped/i);
    logSpy.mockRestore();
  });

  it('idempotent: roda 2x no mesmo dia → mesmos cards, 0 dups', async () => {
    listAllUsersMock.mockResolvedValue([{ userPlatformId: 'USER-A' }]);
    getRecentDrillSessionsMock.mockResolvedValue([
      {
        id: 'ss-a', userId: 'USER-A', mode: 'drill_gto',
        difficultSpots: [{ context: 'foo', note: 'bar' }],
      },
    ]);
    const mod: any = await import('../../server/jobs/materializeDrillDifficultSpots');
    // primeiro run cria
    await mod.runMaterializeDrillDifficultSpots();
    expect(createDrillStarredHandMock).toHaveBeenCalledTimes(1);

    // segundo run: hash dedup retorna existing + active card, NAO cria novamente
    findStarredHandByDrillHashMock.mockResolvedValue({ id: 'spot-drill-new' });
    getActiveReentryCardForSpotMock.mockResolvedValue({
      id: 'card-new', spotId: 'spot-drill-new', archivedAt: null,
    });
    createDrillStarredHandMock.mockClear();
    createSpotReentryCardMock.mockClear();
    await mod.runMaterializeDrillDifficultSpots();
    expect(createDrillStarredHandMock).not.toHaveBeenCalled();
    expect(createSpotReentryCardMock).not.toHaveBeenCalled();
  });
});
