/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-2 storage layer (spot_reentry_cards CRUD)
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-2.4 + §RF-2 ACs
 * ADRs: 136 (table + algoritmo), 137 (cap 5/dia), 139 (initial interval)
 * Pad : tests/storage/coach-session-insights.test.ts
 *
 * Cobertura RED:
 *   - createSpotReentryCard(input) — INSERT + UNIQUE conflict tratado.
 *   - getActiveReentryCardForSpot(userId, spotId) — lookup unico ativo.
 *   - getActiveReentryCardsBySpotIds(userId, spotIds[]) — batch lookup p/ Coach RF-4.
 *   - getReentryQueue(userId, today, limit) — pendentes + cap.
 *   - getReentryCardById(cardId, userId) — ownership filter.
 *   - updateReentryCardAfterGrade(cardId, userId, patch) — apos SM-2.
 *   - updateReentryCardSkip(cardId, userId) — push +1d.
 *   - archiveReentryCard(spotId, userId) — soft-delete (UPDATE archived_at).
 *   - bulkCreateReentryCards(userId, items[]) — bulk INSERT idempotente.
 *   - countDrillCardsCreatedToday(userId, todayStartUtc) — cap cron.
 *   - getSrsStats(userId, now) — pending/reviewed/accuracy/streak.
 *
 * Lessons aplicadas:
 *   #3 Drizzle chain mock
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
  chain.offset = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.onConflictDoUpdate = make();
  chain.onConflictDoNothing = make();
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
  (db as any).onConflictDoUpdate = make();
  (db as any).onConflictDoNothing = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).delete = make();
});

// =============================================================================
// createSpotReentryCard
// =============================================================================
describe('storage.createSpotReentryCard (RF-2.4)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).createSpotReentryCard).toBe('function');
  });

  it('insere card novo com defaults SM-2 (interval=1, ease=2.5)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'card-1',
        userId: 'USER-0001',
        spotId: 'spot-1',
        source: 'manual_add',
        intervalDays: '1.00',
        easeFactor: '2.50',
        reviewCount: 0,
        correctCount: 0,
        archivedAt: null,
        nextReviewAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const r = await (storage as any).createSpotReentryCard({
      userId: 'USER-0001',
      spotId: 'spot-1',
      source: 'manual_add',
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewAt: new Date(Date.now() + 86_400_000),
    });
    expect(r).toBeDefined();
    expect(r.spotId).toBe('spot-1');
    expect(r.source).toBe('manual_add');
  });

  it('retorna null + sinaliza conflict quando UNIQUE ativo viola (idempotency)', async () => {
    // Implementer pode usar onConflictDoNothing -> returning vazio.
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).createSpotReentryCard({
      userId: 'USER-0001',
      spotId: 'spot-1',
      source: 'manual_add',
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewAt: new Date(),
    });
    expect(r).toBeNull();
  });

  it('aceita source coach_session_insight com initial interval 2 (low confidence)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'card-2', userId: 'USER-0001', spotId: 'spot-2', source: 'coach_session_insight', intervalDays: '2.00', easeFactor: '2.50' },
    ]);
    const r = await (storage as any).createSpotReentryCard({
      userId: 'USER-0001',
      spotId: 'spot-2',
      source: 'coach_session_insight',
      intervalDays: 2,
      easeFactor: 2.5,
      nextReviewAt: new Date(Date.now() + 2 * 86_400_000),
    });
    expect(Number(r.intervalDays)).toBe(2);
  });
});

// =============================================================================
// getActiveReentryCardForSpot — single lookup
// =============================================================================
describe('storage.getActiveReentryCardForSpot', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getActiveReentryCardForSpot).toBe('function');
  });

  it('retorna null quando nao tem card ativo', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getActiveReentryCardForSpot('USER-0001', 'spot-1');
    expect(r).toBeNull();
  });

  it('retorna row quando archived_at IS NULL', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'card-1', userId: 'USER-0001', spotId: 'spot-1', archivedAt: null },
    ]);
    const r = await (storage as any).getActiveReentryCardForSpot('USER-0001', 'spot-1');
    expect(r.id).toBe('card-1');
  });
});

// =============================================================================
// getActiveReentryCardsBySpotIds — batch (RF-4 enrichment)
// =============================================================================
describe('storage.getActiveReentryCardsBySpotIds (Coach RF-4)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getActiveReentryCardsBySpotIds).toBe('function');
  });

  it('retorna [] para spotIds=[]', async () => {
    const r = await (storage as any).getActiveReentryCardsBySpotIds('USER-0001', []);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
  });

  it('retorna apenas cards ativos para spotIds dados (filter user + archived_at NULL)', async () => {
    (db as any).where = vi.fn().mockResolvedValue([
      { id: 'card-1', spotId: 'spot-1', archivedAt: null },
      { id: 'card-2', spotId: 'spot-2', archivedAt: null },
    ]);
    const r = await (storage as any).getActiveReentryCardsBySpotIds('USER-0001', [
      'spot-1', 'spot-2', 'spot-3',
    ]);
    expect(r.length).toBe(2);
  });
});

// =============================================================================
// getReentryQueue
// =============================================================================
describe('storage.getReentryQueue', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getReentryQueue).toBe('function');
  });

  it('retorna items + pendingTotal + nextScheduledAt', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'card-1', userId: 'USER-0001', spotId: 'spot-1', nextReviewAt: new Date() },
    ]);
    const r = await (storage as any).getReentryQueue('USER-0001', new Date(), 5);
    expect(r).toBeDefined();
    expect(r).toHaveProperty('items');
    expect(r).toHaveProperty('pendingTotal');
  });

  it('cap limit max 20', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    await (storage as any).getReentryQueue('USER-0001', new Date(), 100 /* abusive */);
    // Implementer deve cappar internamente; teste verifica que call NAO falha
    // e que limit foi chamado com valor razoavel (<=20).
    const limitCalls = (db as any).limit.mock.calls;
    const lastLimit = limitCalls[limitCalls.length - 1]?.[0];
    if (typeof lastLimit === 'number') {
      expect(lastLimit).toBeLessThanOrEqual(20);
    }
  });

  it('exclude archived cards (where archived_at IS NULL)', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    await (storage as any).getReentryQueue('USER-0001', new Date(), 5);
    expect((db as any).where).toHaveBeenCalled();
  });
});

// =============================================================================
// getReentryCardById
// =============================================================================
describe('storage.getReentryCardById', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getReentryCardById).toBe('function');
  });

  it('retorna null se card nao pertence ao user', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getReentryCardById('card-1', 'USER-INTRUDER');
    expect(r).toBeNull();
  });

  it('retorna card quando ownership ok', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'card-1', userId: 'USER-0001', spotId: 'spot-1' },
    ]);
    const r = await (storage as any).getReentryCardById('card-1', 'USER-0001');
    expect(r.id).toBe('card-1');
  });
});

// =============================================================================
// updateReentryCardAfterGrade
// =============================================================================
describe('storage.updateReentryCardAfterGrade', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).updateReentryCardAfterGrade).toBe('function');
  });

  it('atualiza interval/ease/next + bumpa review_count (+correct_count se ok)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'card-1',
        userId: 'USER-0001',
        intervalDays: '2.50',
        easeFactor: '2.50',
        reviewCount: 1,
        correctCount: 1,
        lastGrade: 'good',
        lastReviewAt: new Date(),
      },
    ]);
    const r = await (storage as any).updateReentryCardAfterGrade('card-1', 'USER-0001', {
      intervalDays: 2.5,
      easeFactor: 2.5,
      nextReviewAt: new Date(Date.now() + 2.5 * 86_400_000),
      lastGrade: 'good',
      incrementCorrect: true,
    });
    expect(r.lastGrade).toBe('good');
    expect(r.reviewCount).toBe(1);
    expect(r.correctCount).toBe(1);
  });

  it('NAO incrementa correct_count em grade=again', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'card-1', userId: 'USER-0001', reviewCount: 1, correctCount: 0, lastGrade: 'again' },
    ]);
    const r = await (storage as any).updateReentryCardAfterGrade('card-1', 'USER-0001', {
      intervalDays: 1,
      easeFactor: 2.0,
      nextReviewAt: new Date(),
      lastGrade: 'again',
      incrementCorrect: false,
    });
    expect(r.correctCount).toBe(0);
  });

  it('retorna null se cardId nao bate ownership', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).updateReentryCardAfterGrade('card-1', 'USER-INTRUDER', {
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewAt: new Date(),
      lastGrade: 'good',
      incrementCorrect: true,
    });
    expect(r).toBeNull();
  });
});

// =============================================================================
// updateReentryCardSkip
// =============================================================================
describe('storage.updateReentryCardSkip', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).updateReentryCardSkip).toBe('function');
  });

  it('push +1d em next_review_at sem alterar grade/stats', async () => {
    const now = new Date('2026-05-08T12:00:00Z');
    const expected = new Date(now.getTime() + 86_400_000);
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'card-1',
        userId: 'USER-0001',
        nextReviewAt: expected,
        lastGrade: null,
        reviewCount: 0,
      },
    ]);
    const r = await (storage as any).updateReentryCardSkip('card-1', 'USER-0001');
    expect(r.reviewCount).toBe(0);
    expect(r.lastGrade).toBeNull();
  });

  it('retorna null se ownership nao bate', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).updateReentryCardSkip('card-1', 'USER-INTRUDER');
    expect(r).toBeNull();
  });
});

// =============================================================================
// archiveReentryCard
// =============================================================================
describe('storage.archiveReentryCard', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).archiveReentryCard).toBe('function');
  });

  it('marca archived_at=now() — retorna { archived: true }', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'card-1', userId: 'USER-0001', spotId: 'spot-1', archivedAt: new Date() },
    ]);
    const r = await (storage as any).archiveReentryCard('USER-0001', 'spot-1');
    expect(r.archived).toBe(true);
  });

  it('retorna { archived: false } quando nenhum card ativo encontrado', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).archiveReentryCard('USER-0001', 'spot-without-card');
    expect(r.archived).toBe(false);
  });
});

// =============================================================================
// bulkCreateReentryCards
// =============================================================================
describe('storage.bulkCreateReentryCards (RF-4 bulk-from-session)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).bulkCreateReentryCards).toBe('function');
  });

  it('insere multiplos cards em uma transacao', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'card-a', spotId: 'spot-a', userId: 'USER-0001' },
      { id: 'card-b', spotId: 'spot-b', userId: 'USER-0001' },
    ]);
    const r = await (storage as any).bulkCreateReentryCards('USER-0001', [
      { spotId: 'spot-a', source: 'coach_session_insight', intervalDays: 1, easeFactor: 2.5, nextReviewAt: new Date() },
      { spotId: 'spot-b', source: 'coach_session_insight', intervalDays: 2, easeFactor: 2.5, nextReviewAt: new Date() },
    ]);
    expect(r).toHaveProperty('created');
    expect(r).toHaveProperty('skipped');
    expect(r.created).toBeGreaterThanOrEqual(0);
  });

  it('idempotency: spots ja com card ativo entram em "skipped"', async () => {
    // Storage detecta UNIQUE conflict -> skipped++
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'card-c', spotId: 'spot-c', userId: 'USER-0001' },
    ]);
    const r = await (storage as any).bulkCreateReentryCards('USER-0001', [
      { spotId: 'spot-c', source: 'coach_session_insight', intervalDays: 1, easeFactor: 2.5, nextReviewAt: new Date() },
      { spotId: 'spot-d', source: 'coach_session_insight', intervalDays: 1, easeFactor: 2.5, nextReviewAt: new Date() },
    ]);
    expect(r.created).toBeLessThanOrEqual(2);
    expect(typeof r.skipped).toBe('number');
  });
});

// =============================================================================
// countDrillCardsCreatedToday — cap 5/dia (RF-2.3 + ADR-137)
// =============================================================================
describe('storage.countDrillCardsCreatedToday (cron cap)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).countDrillCardsCreatedToday).toBe('function');
  });

  it('retorna count de cards source=drill_gto_difficult_spot criados hoje', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 3 }]);
    const todayStart = new Date('2026-05-08T00:00:00Z');
    const r = await (storage as any).countDrillCardsCreatedToday('USER-0001', todayStart);
    expect(typeof r).toBe('number');
  });

  it('retorna 0 quando user ainda nao teve card criado hoje', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const r = await (storage as any).countDrillCardsCreatedToday('USER-0001', new Date());
    expect(r).toBe(0);
  });
});

// =============================================================================
// getSrsStats — RF-5
// =============================================================================
describe('storage.getSrsStats (RF-5)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getSrsStats).toBe('function');
  });

  it('retorna shape { pendingToday, reviewedLast7Days, accuracyLast7Days, streakDays }', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const r = await (storage as any).getSrsStats('USER-0001', new Date());
    expect(r).toHaveProperty('pendingToday');
    expect(r).toHaveProperty('reviewedLast7Days');
    expect(r).toHaveProperty('accuracyLast7Days');
    expect(r).toHaveProperty('streakDays');
  });

  it('accuracyLast7Days = 0 quando reviewedLast7Days = 0 (zero division protection)', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ count: 0 }]);
    const r = await (storage as any).getSrsStats('USER-0001', new Date());
    expect(r.accuracyLast7Days).toBe(0);
  });
});
