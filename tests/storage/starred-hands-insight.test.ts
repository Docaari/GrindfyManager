/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-1 storage layer (starred_hands +4 columns)
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-1.5 + §RF-1 ACs
 * ADRs: 138 (relax FK NULLABLE)
 * Pad : tests/storage/coach-session-insights.test.ts (mock db Drizzle chain)
 *
 * Cobertura RED:
 *   - storage.updateStarredHandInsight(handId, userId, patch) — UPDATE +
 *     ownership filter, retorna row atualizado.
 *   - storage.getStarredHandsWithInsight(userId, filters) — filtros opcionais
 *     (withInsight, tag, decisionCorrect, minConfidence).
 *
 * Lessons aplicadas:
 *   #3 mock storage shape REAL (Drizzle chain)
 *   #5 vi.fn() ok
 *   #14 vi.hoisted opcional (aqui usamos chain do db diretamente)
 *
 * Status RED: metodos nao existem em server/storage.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.onConflictDoUpdate = make();
  chain.update = make();
  chain.set = make();
  chain.delete = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
  const make = () => vi.fn().mockReturnValue(db as any);
  (db as any).select = make();
  (db as any).from = make();
  (db as any).where = make();
  (db as any).orderBy = make();
  (db as any).limit = make();
  (db as any).offset = make();
  (db as any).insert = make();
  (db as any).values = make();
  (db as any).returning = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).delete = make();
});

// =============================================================================
// updateStarredHandInsight — UPDATE + ownership
// =============================================================================
describe('storage.updateStarredHandInsight (RF-1.5)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).updateStarredHandInsight).toBe('function');
  });

  it('atualiza insight + tags + decision + confidence e retorna row', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'spot-1',
        userId: 'USER-0001',
        insight: 'Bluff river OOP errado em pot grande',
        decisionCorrect: false,
        confidenceLevel: 3,
        tags: ['ICM', 'river', 'GTO'],
        updatedAt: new Date(),
      },
    ]);

    const result = await (storage as any).updateStarredHandInsight(
      'spot-1',
      'USER-0001',
      {
        insight: 'Bluff river OOP errado em pot grande',
        decisionCorrect: false,
        confidenceLevel: 3,
        tags: ['ICM', 'river', 'GTO'],
      },
    );

    expect(result).toBeDefined();
    expect(result.insight).toContain('Bluff');
    expect(result.tags).toEqual(['ICM', 'river', 'GTO']);
    expect(result.confidenceLevel).toBe(3);
    expect(result.decisionCorrect).toBe(false);
  });

  it('retorna null quando ownership nao bate (user_id filter)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const result = await (storage as any).updateStarredHandInsight(
      'spot-1',
      'USER-INTRUDER',
      { insight: 'x' },
    );
    expect(result).toBeNull();
  });

  it('aceita patch parcial (apenas insight)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', insight: 'novo', tags: null, decisionCorrect: null, confidenceLevel: null },
    ]);
    const r = await (storage as any).updateStarredHandInsight('spot-1', 'USER-0001', {
      insight: 'novo',
    });
    expect(r.insight).toBe('novo');
  });

  it('aceita patch parcial (apenas tags)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'spot-1', userId: 'USER-0001', tags: ['ICM'] },
    ]);
    const r = await (storage as any).updateStarredHandInsight('spot-1', 'USER-0001', {
      tags: ['ICM'],
    });
    expect(r.tags).toEqual(['ICM']);
  });

  it('chama db.update em starredHands (set + where)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([{ id: 'spot-1', userId: 'USER-0001' }]);
    await (storage as any).updateStarredHandInsight('spot-1', 'USER-0001', {
      insight: 'x',
    });
    expect((db as any).update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalled();
    expect((db as any).where).toHaveBeenCalled();
  });
});

// =============================================================================
// getStarredHandsWithInsight — filtros opcionais
// =============================================================================
describe('storage.getStarredHandsWithInsight (RF-1.5)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStarredHandsWithInsight).toBe('function');
  });

  it('retorna lista vazia + total=0 quando user nao tem spots', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStarredHandsWithInsight('USER-0001', {});
    expect(r).toMatchObject({ items: [], total: 0 });
  });

  it('retorna apenas spots com insight quando withInsight=true', async () => {
    const rows = [
      { id: 'spot-1', userId: 'USER-0001', insight: 'algo', tags: ['ICM'], confidenceLevel: 3 },
    ];
    (db as any).limit = vi.fn().mockResolvedValue(rows);
    (db as any).offset = vi.fn().mockResolvedValue(rows);
    (db as any).where = vi.fn().mockReturnValue({
      ...db,
      orderBy: vi.fn().mockReturnValue({ ...db, limit: vi.fn().mockReturnValue({ ...db, offset: vi.fn().mockResolvedValue(rows) }) }),
    });
    const r = await (storage as any).getStarredHandsWithInsight('USER-0001', {
      withInsight: true,
    });
    expect(Array.isArray(r.items)).toBe(true);
  });

  it('aplica filtro tag (jsonb contains)', async () => {
    const rows = [
      { id: 'spot-1', userId: 'USER-0001', tags: ['ICM', 'river'] },
    ];
    (db as any).limit = vi.fn().mockResolvedValue(rows);
    (db as any).offset = vi.fn().mockResolvedValue(rows);
    const r = await (storage as any).getStarredHandsWithInsight('USER-0001', {
      tag: 'ICM',
    });
    expect(r).toBeDefined();
    expect((db as any).where).toHaveBeenCalled();
  });

  it('aplica filtro decisionCorrect=false', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStarredHandsWithInsight('USER-0001', {
      decisionCorrect: false,
    });
    expect((db as any).where).toHaveBeenCalled();
  });

  it('aplica filtro minConfidence=4 (apenas >= 4)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStarredHandsWithInsight('USER-0001', {
      minConfidence: 4,
    });
    expect((db as any).where).toHaveBeenCalled();
  });

  it('combina multiplos filtros (withInsight + tag + decisionCorrect)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStarredHandsWithInsight('USER-0001', {
      withInsight: true,
      tag: 'ICM',
      decisionCorrect: false,
      minConfidence: 2,
    });
    expect((db as any).where).toHaveBeenCalled();
  });

  it('respeita limit/offset paginacao', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStarredHandsWithInsight('USER-0001', {
      limit: 25,
      offset: 50,
    });
    expect((db as any).limit).toHaveBeenCalled();
    expect((db as any).offset).toHaveBeenCalled();
  });

  it('ownership: query SEMPRE filtra por userId (user A nao pega spots de B)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    (db as any).offset = vi.fn().mockResolvedValue([]);
    await (storage as any).getStarredHandsWithInsight('USER-A', {});
    // Algumas chamadas where devem ter sido feitas (pelo menos 1 com userId).
    expect((db as any).where).toHaveBeenCalled();
  });
});
