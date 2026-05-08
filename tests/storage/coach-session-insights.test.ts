/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-4 Storage layer (coach_session_insights)
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-4.2 + §RF-4.5
 * ADRs : 133 (cache em tabela dedicada com expires_at + UNIQUE grind_session_id)
 * Pad. : tests/storage/study-sessions-v2.test.ts (mock db Drizzle chain — lesson #3)
 *
 * Cobertura storage methods (RED):
 *   - upsertCoachSessionInsights(input) — INSERT ON CONFLICT DO UPDATE.
 *       generated_at = now(), expires_at = now() + 24h, bumpa regenerated_count.
 *   - getCoachSessionInsights(grindSessionId, userId) — cache lookup expires_at > now().
 *   - getCoachSessionInsightsByUser(userId, limit) — historico debug.
 *   - hasFreshCoachSessionInsights(grindSessionId) — bool helper rapido.
 *
 * Lessons aplicadas:
 *   #3 shape REAL (mock chain Drizzle: insert/values/onConflictDoUpdate/returning)
 *   #5 vi.fn ok
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
  (db as any).insert = make();
  (db as any).values = make();
  (db as any).returning = make();
  (db as any).onConflictDoUpdate = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).delete = make();
});

// =============================================================================
// upsertCoachSessionInsights — INSERT ON CONFLICT DO UPDATE race-safe
// =============================================================================
describe('storage.upsertCoachSessionInsights (RF-4.2 / ADR-133)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).upsertCoachSessionInsights).toBe('function');
  });

  it('insere row nova com expires_at = generated_at + 24h', async () => {
    const insightsJsonb = {
      summary: 'Sessao 4h, 22 torneios, +$143. C-bet OOP fraco em 3-bet pots.',
      topHands: [
        {
          handId: 'spot-1',
          title: 'BB defense vs UTG 3bet',
          rationale: 'Pot 25BB, voce check-fold com middle pair OOP.',
          action: 'review',
          ctaUrl: '/estudos/spots/spot-1',
          handBadge: 'big_pot',
        },
      ],
      suggestedLessons: [],
      spotsToReview: [],
      focusStatsHighlight: [],
    };

    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'csi-new',
        userId: 'USER-0001',
        grindSessionId: 'gs-1',
        insightsJsonb,
        generatedAt: new Date('2026-05-08T20:00:00Z'),
        expiresAt: new Date('2026-05-09T20:00:00Z'),
        costTokensUsed: 600,
        regeneratedCount: 0,
      },
    ]);

    const result = await (storage as any).upsertCoachSessionInsights({
      userId: 'USER-0001',
      grindSessionId: 'gs-1',
      insightsJsonb,
      costTokensUsed: 600,
      tokensIn: 1200,
      tokensOut: 600,
      model: 'claude-opus-4-7',
      promptVersion: 'v1',
    });

    expect(result.grindSessionId).toBe('gs-1');
    expect(result.expiresAt.getTime() - result.generatedAt.getTime()).toBeGreaterThanOrEqual(
      23 * 3600 * 1000,
    );
  });

  it('UPDATE em conflict UNIQUE grind_session_id (bumpa regenerated_count)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'csi-1',
        userId: 'USER-0001',
        grindSessionId: 'gs-1',
        insightsJsonb: { summary: 'novo' },
        generatedAt: new Date('2026-05-09T10:00:00Z'),
        expiresAt: new Date('2026-05-10T10:00:00Z'),
        regeneratedCount: 1, // bumped
      },
    ]);

    const r = await (storage as any).upsertCoachSessionInsights({
      userId: 'USER-0001',
      grindSessionId: 'gs-1',
      insightsJsonb: { summary: 'novo' },
    });

    expect(r.regeneratedCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// getCoachSessionInsights — cache lookup com expires_at > now
// =============================================================================
describe('storage.getCoachSessionInsights (RF-4.5 cache)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getCoachSessionInsights).toBe('function');
  });

  it('retorna null quando nao existe cache', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getCoachSessionInsights('gs-1', 'USER-0001');
    expect(r).toBeNull();
  });

  it('retorna row quando cache valido (expires_at > now)', async () => {
    const expires = new Date(Date.now() + 12 * 3600 * 1000);
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        id: 'csi-1',
        userId: 'USER-0001',
        grindSessionId: 'gs-1',
        insightsJsonb: { summary: 'cached' },
        generatedAt: new Date(Date.now() - 12 * 3600 * 1000),
        expiresAt: expires,
      },
    ]);
    const r = await (storage as any).getCoachSessionInsights('gs-1', 'USER-0001');
    expect(r).toMatchObject({ grindSessionId: 'gs-1' });
    expect(r.insightsJsonb.summary).toBe('cached');
  });

  it('retorna null quando cache expirado (expires_at < now)', async () => {
    // Storage SQL deve filtrar expires_at > now() — passamos vazio simulando filter aplicado.
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getCoachSessionInsights('gs-1', 'USER-0001');
    expect(r).toBeNull();
  });

  it('cross-user: retorna null quando user_id NAO bate (ownership filter)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getCoachSessionInsights('gs-1', 'USER-INTRUDER');
    expect(r).toBeNull();
  });
});

// =============================================================================
// hasFreshCoachSessionInsights — helper bool rapido
// =============================================================================
describe('storage.hasFreshCoachSessionInsights', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).hasFreshCoachSessionInsights).toBe('function');
  });

  it('retorna true quando cache valido', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([{ id: 'csi-1' }]);
    const r = await (storage as any).hasFreshCoachSessionInsights('gs-1');
    expect(r).toBe(true);
  });

  it('retorna false quando cache vazio/expirado', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).hasFreshCoachSessionInsights('gs-1');
    expect(r).toBe(false);
  });
});

// =============================================================================
// getCoachSessionInsightsByUser — historico debug
// =============================================================================
describe('storage.getCoachSessionInsightsByUser', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getCoachSessionInsightsByUser).toBe('function');
  });

  it('retorna array DESC por generated_at', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'csi-3', generatedAt: new Date('2026-05-08T20:00:00Z') },
      { id: 'csi-2', generatedAt: new Date('2026-05-07T20:00:00Z') },
    ]);

    const r = await (storage as any).getCoachSessionInsightsByUser('USER-0001', 50);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(2);
    expect((db as any).orderBy).toHaveBeenCalled();
  });
});
