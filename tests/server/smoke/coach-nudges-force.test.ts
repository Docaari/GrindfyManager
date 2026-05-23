// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-02 §6 — force 5 nudges + assert coach_nudge_log
//
// Cobertura:
//   - forceNudgesForUser({userId, categories}) chama dispatcher por categoria.
//   - Cada categoria dispara nudge → row em coach_nudge_log.
//   - Categorias: B-DOWNSWING, B-VOLUME, B-GRADE, B-GAPCHECK, B-IMPORT.
//
// Lessons: #36 (drizzle parcial), #34 (handler 3o arg).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: vi.fn(() => ({})) };
});

vi.mock('../../../server/db', () => ({ db: {}, pool: {} }));

beforeEach(() => vi.clearAllMocks());

describe('RF-02 — forceNudgesForUser smoke helper', () => {
  it('export forceNudgesForUser', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');
    expect(typeof mod.forceNudgesForUser).toBe('function');
  });

  it('chama dispatcher 5x (uma por categoria)', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    const dispatchMock = vi.fn().mockResolvedValue({ inserted: 1 });
    const result = await mod.forceNudgesForUser(
      {
        userId: 'USER-SMOKE-0001',
        categories: ['B-DOWNSWING', 'B-VOLUME', 'B-GRADE', 'B-GAPCHECK', 'B-IMPORT'],
      },
      { dispatch: dispatchMock },
    );

    expect(dispatchMock).toHaveBeenCalledTimes(5);
    expect(result.fired).toBe(5);
  });

  it('retorna fired=0 quando categoria desconhecida', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    const dispatchMock = vi.fn().mockResolvedValue({ inserted: 1 });
    const result = await mod.forceNudgesForUser(
      { userId: 'USER-SMOKE-0001', categories: ['UNKNOWN-CAT'] },
      { dispatch: dispatchMock },
    );

    expect(result.fired).toBe(0);
  });
});
