// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint MP-VALIDATION / RF-02 §8 — exercise 3 write tools
//
// Cobertura (estrutura helper smoke):
//   - exerciseWriteToolsForUser({userId}) chama bulk_propose_grade,
//     schedule_study_block, mark_off_day via tool runner.
//   - Cada tool result.persisted = true OR specific count.
//
// Lessons: #34, #36.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', async () => {
  const actual: any = await vi.importActual('drizzle-orm');
  return { ...actual, relations: vi.fn(() => ({})) };
});

vi.mock('../../../server/db', () => ({ db: {}, pool: {} }));

beforeEach(() => vi.clearAllMocks());

describe('RF-02 — exerciseWriteToolsForUser smoke helper', () => {
  it('export exerciseWriteToolsForUser', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');
    expect(typeof mod.exerciseWriteToolsForUser).toBe('function');
  });

  it('chama 3 write tools (bulk_propose_grade, schedule_study_block, mark_off_day)', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    const runToolMock = vi.fn().mockResolvedValue({ persisted: true, count: 1 });
    const result = await mod.exerciseWriteToolsForUser(
      { userId: 'USER-SMOKE-0001' },
      { runTool: runToolMock },
    );

    expect(runToolMock).toHaveBeenCalledTimes(3);
    const toolNames = runToolMock.mock.calls.map((c: any[]) => c[0]).sort();
    expect(toolNames).toEqual(
      ['bulk_propose_grade', 'mark_off_day', 'schedule_study_block'].sort(),
    );
    expect(result.tools).toBe(3);
  });

  it('respeita cap 20 em bulk_propose_grade (passa <=20 torneios)', async () => {
    const mod: any = await import('../../../scripts/smoke-coach-proactive');

    const runToolMock = vi.fn().mockResolvedValue({ persisted: true });
    await mod.exerciseWriteToolsForUser(
      { userId: 'USER-SMOKE-0001' },
      { runTool: runToolMock },
    );

    const bulkCall = runToolMock.mock.calls.find((c: any[]) => c[0] === 'bulk_propose_grade');
    expect(bulkCall).toBeDefined();
    const args = bulkCall![1];
    const tournaments = args?.tournaments ?? args?.input?.tournaments ?? [];
    expect(tournaments.length).toBeLessThanOrEqual(20);
  });
});
