import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Sprint Coach-2A / RF-03 Tool 2 — find_top_leaks
//
// Modulo a ser criado pelo Implementer:
//   server/coachTools/handlers/findTopLeaks.ts
//
// Handler chama detectLeaks(userInput) de server/coachLeakDetection.ts (existente)
// + le dados via storage. Filtra/ordena por severidade. Trunca por limit.
//
// Output: { leaks: [...], total, note? }
// Spec RF-03 Tool 2.
// =============================================================================

const detectLeaksMock = vi.fn();
vi.mock('../../../../server/coachLeakDetection', () => ({
  detectLeaks: (...args: any[]) => detectLeaksMock(...args),
}));

const storageMock: any = {
  getDashboardStats: vi.fn(),
  getAnalyticsByCategory: vi.fn(),
  getAnalyticsBySite: vi.fn(),
  getAnalyticsByMonth: vi.fn(),
};
vi.mock('../../../../server/storage', () => ({
  storage: storageMock,
}));

import { findTopLeaksTool } from '../../../../server/coachTools/handlers/findTopLeaks';

const ctx = { userId: 'USER-0001', chatSessionId: 'sess', messageId: 'm1' } as any;

beforeEach(() => {
  detectLeaksMock.mockReset();
  Object.values(storageMock).forEach((fn: any) => fn.mockReset?.());
  storageMock.getDashboardStats.mockResolvedValue({ totalTournaments: 200, roi: 5 });
  storageMock.getAnalyticsByCategory.mockResolvedValue([]);
  storageMock.getAnalyticsBySite.mockResolvedValue([]);
  storageMock.getAnalyticsByMonth.mockResolvedValue([]);
});

describe('findTopLeaksTool — schema', () => {
  it('aceita input vazio (defaults limit=5, minSeverity=low)', () => {
    const r = findTopLeaksTool.inputSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).limit).toBe(5);
      expect((r.data as any).minSeverity).toBe('low');
    }
  });

  it('rejeita limit > 20', () => {
    expect(findTopLeaksTool.inputSchema.safeParse({ limit: 25 }).success).toBe(false);
  });

  it('rejeita minSeverity invalido', () => {
    expect(findTopLeaksTool.inputSchema.safeParse({ minSeverity: 'huge' }).success).toBe(false);
  });
});

describe('findTopLeaksTool — handler', () => {
  it('retorna leaks ordenados por severidade desc + total', async () => {
    detectLeaksMock.mockReturnValue([
      { severity: 'low', code: 'l1', description: 'L1', evidence: { dimension: 'x', value: 1, n: 30 } },
      { severity: 'high', code: 'h1', description: 'H1', evidence: { dimension: 'y', value: 2, n: 50 } },
      { severity: 'medium', code: 'm1', description: 'M1', evidence: { dimension: 'z', value: 3, n: 40 } },
    ]);
    const out: any = await findTopLeaksTool.handler({ limit: 5, minSeverity: 'low' } as any, ctx);
    expect(out.total).toBe(3);
    expect(out.leaks).toHaveLength(3);
    expect(out.leaks[0].severity).toBe('high');
  });

  it('respeita limit', async () => {
    detectLeaksMock.mockReturnValue(
      Array.from({ length: 10 }).map((_, i) => ({
        severity: 'high',
        code: `c${i}`,
        description: `d${i}`,
        evidence: { dimension: 'x', value: i, n: 50 },
      })),
    );
    const out: any = await findTopLeaksTool.handler({ limit: 3, minSeverity: 'low' } as any, ctx);
    expect(out.leaks).toHaveLength(3);
  });

  it('filtra por minSeverity', async () => {
    detectLeaksMock.mockReturnValue([
      { severity: 'low', code: 'l1', description: 'L1', evidence: { dimension: 'x', value: 1, n: 30 } },
      { severity: 'high', code: 'h1', description: 'H1', evidence: { dimension: 'y', value: 2, n: 50 } },
    ]);
    const out: any = await findTopLeaksTool.handler({ minSeverity: 'high' } as any, ctx);
    expect(out.leaks.every((l: any) => l.severity === 'high')).toBe(true);
  });
});

describe('findTopLeaksTool — edge cases', () => {
  it('usuario sem dados -> leaks:[], total:0, note "sem dados suficientes"', async () => {
    detectLeaksMock.mockReturnValue([]);
    storageMock.getDashboardStats.mockResolvedValue({ totalTournaments: 0 });
    const out: any = await findTopLeaksTool.handler({} as any, ctx);
    expect(out.leaks).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.note).toMatch(/sem dados suficientes/i);
  });
});
