import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-01 — storage layer de user_coach_preferences
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-01)
//   - Docs/architecture/decisions/084-user-coach-preferences.md (Opcao A)
//
// Modulos alvo (a serem criados pelo Implementer):
//   - server/storage/coachPreferences.ts
//       - getCoachPreferences(userId) -> CoachPreferences (defaults se sem row)
//       - upsertCoachPreferences(userId, partial) -> merged CoachPreferences
//       - normalizeCoachPreferences(row) -> aplica ?? defaults (lesson #7)
//       - _resetPrefsCacheForTests() (helper de teste)
//
// Lessons aplicadas:
//   - #3 (mocks idealizados): tests validam shape REAL retornado pelo storage.
//   - #7 (deprecation gradual): normalizeCoachPreferences testado com colunas null.
//   - #9 (try/catch): DB error -> log + retorna defaults safe (NAO crasha caller).
//   - #19 (cache stale entre abas): TTL 30s + invalidate em upsert.
// =============================================================================

import { COACH_PREFS_DEFAULTS } from '../_fixtures/prefs-fixtures';

// Mock do db Drizzle. Implementer vai usar `db.select().from(...).where(...)`.
const dbSelectMock = vi.fn();
const dbInsertMock = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => dbSelectMock(),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => dbInsertMock(),
      }),
    }),
  },
  pool: {},
}));

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-pref-id') }));

// Tudo que o setup ja mocka deve continuar valido (clearMocks: true na config).

describe('getCoachPreferences — defaults quando sem row', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it('retorna SHAPE COMPLETO de defaults quando DB retorna array vazio (lazy-create)', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    const prefs = await getCoachPreferences('USER-0001');

    expect(prefs).toEqual(expect.objectContaining({
      nudgeBSnapshot: true,
      nudgeBLeak: true,
      nudgeBStudy: true,
      nudgeBVolume: true,
      nudgeBGrade: true,
      nudgeBDownswing: true,
      nudgeBLife: false,   // opt-in obrigatorio
      nudgeBMental: false, // opt-in obrigatorio
      quietHoursStart: 21,
      quietHoursEnd: 9,
      maxNudgesPerDay: 3,
      maxNudgesPerHour: 1,
      channelInApp: true,
      channelEmail: true,
      channelPush: false,
      coachTone: 'balanced',
    }));
  });

  it('NAO chama insert quando user nao tem row (lazy-create — so escreve em PUT)', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-LAZY');
    expect(dbInsertMock).not.toHaveBeenCalled();
  });
});

describe('getCoachPreferences — leitura de row existente', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it('retorna row do DB quando existe (shape REAL — todas colunas tipadas)', async () => {
    dbSelectMock.mockResolvedValue([{
      id: 'pref-1',
      userId: 'USER-0001',
      nudgeBSnapshot: true,
      nudgeBLeak: false,
      nudgeBStudy: true,
      nudgeBVolume: true,
      nudgeBGrade: true,
      nudgeBDownswing: true,
      nudgeBLife: true,   // user opt-in
      nudgeBMental: false,
      quietHoursStart: 22,
      quietHoursEnd: 8,
      maxNudgesPerDay: 5,
      maxNudgesPerHour: 2,
      channelInApp: true,
      channelEmail: false,
      channelPush: true,
      coachTone: 'gentle',
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    const prefs = await getCoachPreferences('USER-0001');
    expect(prefs.nudgeBLeak).toBe(false);
    expect(prefs.nudgeBLife).toBe(true);
    expect(prefs.quietHoursStart).toBe(22);
    expect(prefs.maxNudgesPerDay).toBe(5);
    expect(prefs.coachTone).toBe('gentle');
  });
});

describe('getCoachPreferences — DB error safe-fallback (lesson #9)', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it('quando DB explode, LOGA console.error ANTES de retornar defaults', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbSelectMock.mockRejectedValue(new Error('connection_reset'));

    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    const prefs = await getCoachPreferences('USER-DB-ERR');

    // Defaults retornados (safe-deny — NAO crasha caller)
    expect(prefs.nudgeBSnapshot).toBe(true);
    // Log estruturado ANTES do fallback (lesson #9)
    expect(consoleSpy).toHaveBeenCalled();
    const logArgs = consoleSpy.mock.calls[0];
    expect(String(logArgs[0])).toMatch(/coach\.prefs|coach\.preferences/i);
    consoleSpy.mockRestore();
  });

  it('NAO cacheia o fallback de erro (so cacheia sucesso)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbSelectMock.mockRejectedValueOnce(new Error('blew up'));
    dbSelectMock.mockResolvedValueOnce([{
      id: 'p2', userId: 'USER-X',
      nudgeBSnapshot: false, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      createdAt: new Date(), updatedAt: new Date(),
    }]);

    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-X');           // erro -> defaults
    const second = await getCoachPreferences('USER-X'); // re-query (NAO usa cache de erro)

    expect(second.nudgeBSnapshot).toBe(false); // veio do DB, nao do cache stale
    consoleSpy.mockRestore();
  });
});

describe('upsertCoachPreferences — merge parcial', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it('faz UPSERT com merge — campos nao enviados preservam valor anterior', async () => {
    // Estado atual no DB: defaults (lazy)
    dbSelectMock.mockResolvedValue([]);
    dbInsertMock.mockResolvedValue([{ id: 'p1' }]);

    const { upsertCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    const merged = await upsertCoachPreferences('USER-MERGE', {
      nudgeBLeak: false,
      maxNudgesPerDay: 2,
    });

    // Merge: valores enviados aplicados, demais preservam defaults
    expect(merged.nudgeBLeak).toBe(false);
    expect(merged.maxNudgesPerDay).toBe(2);
    expect(merged.nudgeBSnapshot).toBe(true);          // default preservado
    expect(merged.nudgeBLife).toBe(false);              // default preservado
    expect(merged.maxNudgesPerHour).toBe(1);
    expect(merged.coachTone).toBe('balanced');
  });

  it('invalida cache APOS upsert (proxima leitura nao traz valor stale)', async () => {
    dbSelectMock.mockResolvedValueOnce([]);
    dbInsertMock.mockResolvedValueOnce([{ id: 'p1' }]);
    // Apos upsert, leitura traz row atualizada
    dbSelectMock.mockResolvedValueOnce([{
      id: 'p1', userId: 'USER-INV',
      nudgeBSnapshot: true, nudgeBLeak: false, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9,
      maxNudgesPerDay: 2, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false,
      coachTone: 'balanced', createdAt: new Date(), updatedAt: new Date(),
    }]);

    const { getCoachPreferences, upsertCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-INV');                // popula cache de defaults
    await upsertCoachPreferences('USER-INV', { nudgeBLeak: false, maxNudgesPerDay: 2 });
    const after = await getCoachPreferences('USER-INV');   // forca refetch (cache invalidado)

    expect(after.nudgeBLeak).toBe(false);
    expect(after.maxNudgesPerDay).toBe(2);
  });
});

describe('normalizeCoachPreferences — back-fill defaults (lesson #7)', () => {
  it('aplica ?? defaults para qualquer coluna que venha null', async () => {
    const { normalizeCoachPreferences } =
      await import('../../../server/storage/coachPreferences');

    // Simula row "stale" (coluna nao adicionada em sprint anterior)
    const partialRow: any = {
      id: 'old', userId: 'USER-OLD',
      nudgeBSnapshot: null, nudgeBLeak: null, nudgeBStudy: null,
      nudgeBVolume: null, nudgeBGrade: null, nudgeBDownswing: null,
      nudgeBLife: null, nudgeBMental: null,
      quietHoursStart: null, quietHoursEnd: null,
      maxNudgesPerDay: null, maxNudgesPerHour: null,
      channelInApp: null, channelEmail: null, channelPush: null,
      coachTone: null,
    };
    const norm = normalizeCoachPreferences(partialRow);
    expect(norm.nudgeBSnapshot).toBe(COACH_PREFS_DEFAULTS.nudgeBSnapshot);
    expect(norm.quietHoursStart).toBe(21);
    expect(norm.coachTone).toBe('balanced');
  });
});

describe('cache TTL 30s', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
    dbInsertMock.mockReset();
  });

  it('segunda chamada dentro de 30s NAO bate no DB de novo', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-CACHE');
    await getCoachPreferences('USER-CACHE');
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it('apos 31s, refetch (TTL expirou)', async () => {
    vi.useFakeTimers();
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-TTL');
    vi.advanceTimersByTime(31_000);
    await getCoachPreferences('USER-TTL');
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
