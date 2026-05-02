import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-01 — cache em memoria 30s para getCoachPreferences
//
// Fonte: ADR-084 — cache analogo a resolveUserTier.
//
// Lessons:
//   - #19 (cache stale entre abas): TTL 30s + invalidate em PUT na mesma instancia.
// =============================================================================

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

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'mock-id') }));

beforeEach(() => {
  dbSelectMock.mockReset();
  dbInsertMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Cache prefs 30s', () => {
  it('hit dentro de 30s: 1 query DB ainda que chamado 5 vezes', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    for (let i = 0; i < 5; i++) {
      await getCoachPreferences('USER-CACHE');
    }
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it('miss apos 31s: refetch do DB', async () => {
    vi.useFakeTimers();
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-MISS');
    vi.advanceTimersByTime(31_000);
    await getCoachPreferences('USER-MISS');
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });

  it('isolacao por user: cache de USER-A nao serve USER-B', async () => {
    dbSelectMock.mockResolvedValue([]);
    const { getCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-A');
    await getCoachPreferences('USER-B');
    expect(dbSelectMock).toHaveBeenCalledTimes(2);
  });

  it('cache eh invalidado apos upsertCoachPreferences (mesma instancia)', async () => {
    dbSelectMock.mockResolvedValue([]);
    dbInsertMock.mockResolvedValue([{ id: 'p1' }]);
    const { getCoachPreferences, upsertCoachPreferences, _resetPrefsCacheForTests } =
      await import('../../../server/storage/coachPreferences');
    _resetPrefsCacheForTests();

    await getCoachPreferences('USER-INV');               // 1 query
    await upsertCoachPreferences('USER-INV', { nudgeBLeak: false });
    await getCoachPreferences('USER-INV');               // 2 query (cache invalidado)

    expect(dbSelectMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
