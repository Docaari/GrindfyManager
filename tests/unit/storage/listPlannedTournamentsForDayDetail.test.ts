import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint day-detail-consolidation — storage.listPlannedTournamentsForDayDetail
//
// Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-05 / §RF-08 (SQL fix commit 6f0396bc)
// ADR : Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D2
//
// Cobre:
//   - Metodo eh funcao exportada.
//   - SQL SELECT inclui colunas: prioridade, registration_time AS "registrationTime".
//   - WHERE filtra user_id + profile + day_of_week (param bindings).
//   - ORDER BY pt.time ASC.
//
// Pattern lesson #36 + #37:
//   - vi.doMock("drizzle-orm") parcial precisa augmentar relations: vi.fn().
//   - storage modulo carrega @shared/schema lazy via getter (sem top-level).
//   - db.execute mockado captura SQL via .strings/.values do template.
// =============================================================================

describe('storage.listPlannedTournamentsForDayDetail — shape exports', () => {
  it('eh uma funcao exportada em server/storage', async () => {
    const { storage } = await import('../../../server/storage');
    expect(typeof (storage as any).listPlannedTournamentsForDayDetail).toBe(
      'function',
    );
  });
});

describe('storage.listPlannedTournamentsForDayDetail — SQL shape', () => {
  let executeCalls: Array<{ strings: readonly string[]; values: any[] }> = [];

  beforeEach(() => {
    executeCalls = [];
    vi.resetModules();
  });

  it('SELECT inclui colunas prioridade + registration_time AS "registrationTime"', async () => {
    // Mock drizzle-orm parcial (lesson #36)
    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual<any>('drizzle-orm');
      return {
        ...actual,
        relations: vi.fn(),
      };
    });
    // Mock db.execute capturando o sql template (.strings + .values).
    vi.doMock('../../../server/db', () => ({
      db: {
        execute: vi.fn(async (query: any) => {
          // query eh sql template — capturar strings + values.
          const strings: readonly string[] =
            (query as any)?.queryChunks?.map((c: any) => c?.value?.[0] ?? '') ??
            (query as any)?.strings ??
            [];
          executeCalls.push({ strings, values: [] });
          return { rows: [] };
        }),
      },
    }));

    const { storage } = await import('../../../server/storage');
    await (storage as any).listPlannedTournamentsForDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 2,
    });

    expect(executeCalls.length).toBeGreaterThanOrEqual(1);
    const sqlText = executeCalls[0].strings.join(' ');
    // Validar tokens cruciais (case-insensitive concat de fragments do template tag).
    expect(sqlText).toMatch(/prioridade/i);
    expect(sqlText).toMatch(/registration_time/i);
    expect(sqlText).toMatch(/registrationTime/i);
  });

  it('ORDER BY pt.time ASC presente na query', async () => {
    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual<any>('drizzle-orm');
      return { ...actual, relations: vi.fn() };
    });
    vi.doMock('../../../server/db', () => ({
      db: {
        execute: vi.fn(async (query: any) => {
          const strings: readonly string[] =
            (query as any)?.queryChunks?.map((c: any) => c?.value?.[0] ?? '') ??
            (query as any)?.strings ??
            [];
          executeCalls.push({ strings, values: [] });
          return { rows: [] };
        }),
      },
    }));

    const { storage } = await import('../../../server/storage');
    await (storage as any).listPlannedTournamentsForDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 2,
    });

    const sqlText = executeCalls[0].strings.join(' ');
    expect(sqlText).toMatch(/ORDER BY/i);
    expect(sqlText).toMatch(/pt\.time\s+ASC/i);
  });

  it('WHERE filtra user_id + profile + day_of_week', async () => {
    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual<any>('drizzle-orm');
      return { ...actual, relations: vi.fn() };
    });
    vi.doMock('../../../server/db', () => ({
      db: {
        execute: vi.fn(async (query: any) => {
          const strings: readonly string[] =
            (query as any)?.queryChunks?.map((c: any) => c?.value?.[0] ?? '') ??
            (query as any)?.strings ??
            [];
          executeCalls.push({ strings, values: [] });
          return { rows: [] };
        }),
      },
    }));

    const { storage } = await import('../../../server/storage');
    await (storage as any).listPlannedTournamentsForDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 2,
    });

    const sqlText = executeCalls[0].strings.join(' ');
    expect(sqlText).toMatch(/WHERE/i);
    expect(sqlText).toMatch(/pt\.user_id/i);
    expect(sqlText).toMatch(/pt\.profile/i);
    expect(sqlText).toMatch(/pt\.day_of_week/i);
  });

  it('passa parametros via sql template (smoke — db.execute foi chamado)', async () => {
    vi.doMock('drizzle-orm', async () => {
      const actual = await vi.importActual<any>('drizzle-orm');
      return { ...actual, relations: vi.fn() };
    });
    const execMock = vi.fn(async () => ({ rows: [] }));
    vi.doMock('../../../server/db', () => ({
      db: { execute: execMock },
    }));

    const { storage } = await import('../../../server/storage');
    await (storage as any).listPlannedTournamentsForDayDetail({
      userId: 'USER-0042',
      profileLetter: 'B',
      dayOfWeek: 3,
    });

    expect(execMock).toHaveBeenCalledOnce();
  });
});
