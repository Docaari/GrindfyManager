import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// ADR-241 — goalDailyLogsStorage (relatorio diario do calendario de metas)
//   storage.upsertGoalDailyLog(userId, logDate, payload, injectedDb?)
//   storage.getGoalDailyLog(userId, logDate, injectedDb?)
//   storage.listGoalDailyLogsInRange(userId, from, to, injectedDb?)
//
// Lessons: #3 fakeDb espelha shape real; #34 injectedDb ultimo arg; #36 lazy
// schema + placeholder; #14/#38 await import. .test.ts roda no projeto server.
// =============================================================================

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function loadAttach() {
  return await import('../../../server/storage/goalDailyLogsStorage');
}

describe('attachGoalDailyLogsStorage', () => {
  it('popula upsertGoalDailyLog/getGoalDailyLog/listGoalDailyLogsInRange', async () => {
    const { attachGoalDailyLogsStorage } = await loadAttach();
    const storage: any = {};
    attachGoalDailyLogsStorage(storage);
    expect(typeof storage.upsertGoalDailyLog).toBe('function');
    expect(typeof storage.getGoalDailyLog).toBe('function');
    expect(typeof storage.listGoalDailyLogsInRange).toBe('function');
  });

  it('upsert: insere com nanoid + ON CONFLICT DO UPDATE; SET ignora undefined', async () => {
    const { attachGoalDailyLogsStorage } = await loadAttach();
    const storage: any = {};
    attachGoalDailyLogsStorage(storage);

    let capturedValues: any = null;
    let capturedSet: any = null;
    const fakeDb: any = {
      insert: vi.fn(() => ({
        values: vi.fn((v: any) => {
          capturedValues = v;
          return {
            onConflictDoUpdate: vi.fn(({ set }: any) => {
              capturedSet = set;
              return { returning: vi.fn(async () => [{ ...v }]) };
            }),
          };
        }),
      })),
    };

    await storage.upsertGoalDailyLog(
      'USER-1',
      '2026-06-10',
      { note: 'foco', tournamentsPlayed: 8 }, // studyHours ausente -> NAO entra no SET
      fakeDb,
    );

    expect(capturedValues.id).toBeTruthy();
    expect(capturedValues.userId).toBe('USER-1');
    expect(capturedValues.logDate).toBe('2026-06-10');
    expect(capturedSet.note).toBe('foco');
    expect(capturedSet.tournamentsPlayed).toBe(8);
    expect('studyHours' in capturedSet).toBe(false); // undefined preserva valor existente
    expect(capturedSet.updatedAt).toBeInstanceOf(Date);
  });

  it('getGoalDailyLog: SELECT por userId+logDate retorna 1a row', async () => {
    const { attachGoalDailyLogsStorage } = await loadAttach();
    const storage: any = {};
    attachGoalDailyLogsStorage(storage);

    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: 'log_1', logDate: '2026-06-10' }]),
          })),
        })),
      })),
    };

    const r = await storage.getGoalDailyLog('USER-1', '2026-06-10', fakeDb);
    expect(r.id).toBe('log_1');
  });

  it('listGoalDailyLogsInRange: SELECT range retorna array', async () => {
    const { attachGoalDailyLogsStorage } = await loadAttach();
    const storage: any = {};
    attachGoalDailyLogsStorage(storage);

    const fakeDb: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]),
        })),
      })),
    };

    const r = await storage.listGoalDailyLogsInRange('USER-1', '2026-06-01', '2026-06-30', fakeDb);
    expect(r).toHaveLength(2);
  });
});
