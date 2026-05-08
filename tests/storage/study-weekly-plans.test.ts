/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-3 Storage layer (study_weekly_plans)
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.2 + §RF-3.5 + §RF-3.7
 * ADRs : 132 (plan_jsonb embarcado, UNIQUE user+week, FOR UPDATE toggle race-safe)
 * Pad. : tests/storage/study-sessions-v2.test.ts (mock db Drizzle chain — lesson #3)
 *
 * Cobertura storage methods (RED):
 *   - upsertStudyWeeklyPlan({userId, weekStartDate, planJsonb, source, ...})
 *       INSERT...ON CONFLICT(user_id, week_start_date) DO UPDATE.
 *       Bumpa regenerated_count, atualiza regenerated_at em UPDATE.
 *   - getStudyWeeklyPlan(userId, weekStartDate?) -> plano corrente OR null.
 *   - getStudyWeeklyPlanById(planId, userId) -> ownership check.
 *   - markPlanItemCompleted(userId, weekStartDate, itemId, completed)
 *       read-modify-write FOR UPDATE em transacao.
 *   - listStudyWeeklyPlans(userId, limit) -> historico DESC.
 *   - getRecentStudySessionAvgMinutes(userId, days)
 *       -> usado por algoritmo daily_target_minutes (RF-3.1 §2 clamp 15-120).
 *
 * Lessons aplicadas:
 *   #3  shape REAL (mock chain Drizzle: insert/values/onConflictDoUpdate/returning)
 *   #5  vi.fn() ok (sem `new`)
 *   #14 await import (no JSX)
 *
 * Status RED: metodos nao existem em server/storage.ts ainda.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db Drizzle chain — shape REAL
// =============================================================================
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
  chain.for = make();
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
  (db as any).for = make();
  (db as any).transaction = vi.fn(async (cb: any) => cb(db));
});

// =============================================================================
// upsertStudyWeeklyPlan — INSERT ON CONFLICT DO UPDATE (idempotency)
// =============================================================================
describe('storage.upsertStudyWeeklyPlan (RF-3.2 / ADR-132)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).upsertStudyWeeklyPlan).toBe('function');
  });

  it('insere row nova quando nao existe plano para a semana', async () => {
    const planJsonb = {
      days: [
        {
          dayLabel: 'mon',
          date: '2026-05-04',
          activities: [
            {
              itemId: 'item-mon-1',
              type: 'drill_gto',
              title: 'Drill 3bet OOP 30min',
              description: 'Foco SB vs BTN',
              estimatedMinutes: 30,
              ctaTarget: null,
              themeId: 'th-1',
              lessonId: null,
              handIds: [],
              reasoning: 'Leak detectado: 3bet baixo',
            },
          ],
        },
      ],
    };

    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'swp-new',
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb,
        completedItemsJsonb: [],
        source: 'coach_auto',
        dailyTargetMinutes: 45,
        costTokensUsed: 1234,
        generatedAt: new Date('2026-05-04T09:00:00Z'),
        regeneratedAt: null,
        regeneratedCount: 0,
        createdAt: new Date('2026-05-04T09:00:00Z'),
        updatedAt: new Date('2026-05-04T09:00:00Z'),
      },
    ]);

    const result = await (storage as any).upsertStudyWeeklyPlan({
      userId: 'USER-0001',
      weekStartDate: new Date('2026-05-04'),
      planJsonb,
      source: 'coach_auto',
      dailyTargetMinutes: 45,
      costTokensUsed: 1234,
    });

    expect(result).toMatchObject({
      userId: 'USER-0001',
      source: 'coach_auto',
      dailyTargetMinutes: 45,
    });
    expect(typeof result.id).toBe('string');
  });

  it('UPDATE existente quando UNIQUE constraint hit (bump regenerated_count)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'swp-exist',
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb: { days: [] },
        completedItemsJsonb: [],
        source: 'coach_manual',
        dailyTargetMinutes: 60,
        regeneratedCount: 1, // bumped
        regeneratedAt: new Date('2026-05-05T11:00:00Z'),
      },
    ]);

    const result = await (storage as any).upsertStudyWeeklyPlan({
      userId: 'USER-0001',
      weekStartDate: new Date('2026-05-04'),
      planJsonb: { days: [] },
      source: 'coach_manual',
      dailyTargetMinutes: 60,
    });

    expect(result.regeneratedCount).toBeGreaterThanOrEqual(1);
    expect(result.regeneratedAt).toBeInstanceOf(Date);
  });

  it('rejeita source fora do enum (coach_auto | coach_manual)', async () => {
    await expect(
      (storage as any).upsertStudyWeeklyPlan({
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb: { days: [] },
        source: 'manual_user',
        dailyTargetMinutes: 30,
      }),
    ).rejects.toThrow();
  });

  it('rejeita dailyTargetMinutes fora de [5, 240]', async () => {
    await expect(
      (storage as any).upsertStudyWeeklyPlan({
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb: { days: [] },
        source: 'coach_auto',
        dailyTargetMinutes: 300,
      }),
    ).rejects.toThrow();

    await expect(
      (storage as any).upsertStudyWeeklyPlan({
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb: { days: [] },
        source: 'coach_auto',
        dailyTargetMinutes: 2,
      }),
    ).rejects.toThrow();
  });
});

// =============================================================================
// getStudyWeeklyPlan — current week default
// =============================================================================
describe('storage.getStudyWeeklyPlan (RF-3.7 GET)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStudyWeeklyPlan).toBe('function');
  });

  it('retorna null quando nao ha plano para semana', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    const r = await (storage as any).getStudyWeeklyPlan('USER-0001', new Date('2026-05-04'));
    expect(r).toBeNull();
  });

  it('retorna plano hidratado para a semana especificada', async () => {
    const planJsonb = {
      days: [
        { dayLabel: 'mon', date: '2026-05-04', activities: [{ itemId: 'a-1', type: 'lesson' }] },
      ],
    };
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        id: 'swp-1',
        userId: 'USER-0001',
        weekStartDate: new Date('2026-05-04'),
        planJsonb,
        completedItemsJsonb: ['a-1'],
        source: 'coach_auto',
        dailyTargetMinutes: 45,
        generatedAt: new Date('2026-05-04T09:00:00Z'),
      },
    ]);

    const r = await (storage as any).getStudyWeeklyPlan('USER-0001', new Date('2026-05-04'));
    expect(r).toMatchObject({
      userId: 'USER-0001',
      source: 'coach_auto',
      completedItemsJsonb: ['a-1'],
    });
    expect(r.planJsonb.days[0].dayLabel).toBe('mon');
  });

  it('quando weekStartDate ausente, calcula segunda atual em UTC', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([]);
    await (storage as any).getStudyWeeklyPlan('USER-0001');
    expect((db as any).select).toHaveBeenCalled();
  });
});

// =============================================================================
// markPlanItemCompleted — read-modify-write FOR UPDATE
// =============================================================================
describe('storage.markPlanItemCompleted (RF-3.5 / ADR-132 §2.4)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).markPlanItemCompleted).toBe('function');
  });

  it('adiciona itemId em completed_items_jsonb quando completed=true', async () => {
    (db as any).limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'swp-1',
          userId: 'USER-0001',
          weekStartDate: new Date('2026-05-04'),
          completedItemsJsonb: [],
        },
      ]);
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'swp-1',
        userId: 'USER-0001',
        completedItemsJsonb: ['item-mon-1'],
      },
    ]);

    const r = await (storage as any).markPlanItemCompleted(
      'USER-0001',
      new Date('2026-05-04'),
      'item-mon-1',
      true,
    );

    expect(r.completedItemsJsonb).toContain('item-mon-1');
  });

  it('remove itemId quando completed=false', async () => {
    (db as any).limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'swp-1',
          userId: 'USER-0001',
          weekStartDate: new Date('2026-05-04'),
          completedItemsJsonb: ['item-mon-1', 'item-tue-1'],
        },
      ]);
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        id: 'swp-1',
        userId: 'USER-0001',
        completedItemsJsonb: ['item-tue-1'],
      },
    ]);

    const r = await (storage as any).markPlanItemCompleted(
      'USER-0001',
      new Date('2026-05-04'),
      'item-mon-1',
      false,
    );

    expect(r.completedItemsJsonb).not.toContain('item-mon-1');
    expect(r.completedItemsJsonb).toContain('item-tue-1');
  });

  it('PLAN_NOT_FOUND quando nao existe plano para semana', async () => {
    (db as any).limit = vi.fn().mockResolvedValueOnce([]);

    await expect(
      (storage as any).markPlanItemCompleted(
        'USER-0001',
        new Date('2026-05-04'),
        'item-x',
        true,
      ),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('idempotent: marcar completed=true em itemId ja completed retorna sem duplicar', async () => {
    (db as any).limit = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'swp-1',
          userId: 'USER-0001',
          completedItemsJsonb: ['item-mon-1'],
        },
      ]);
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'swp-1', completedItemsJsonb: ['item-mon-1'] },
    ]);

    const r = await (storage as any).markPlanItemCompleted(
      'USER-0001',
      new Date('2026-05-04'),
      'item-mon-1',
      true,
    );

    // Sem duplicata, count = 1.
    const occurrences = (r.completedItemsJsonb as string[]).filter((x) => x === 'item-mon-1');
    expect(occurrences.length).toBe(1);
  });

  it('usa transaction com FOR UPDATE para race-safe', async () => {
    (db as any).limit = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'swp-1', userId: 'USER-0001', completedItemsJsonb: [] },
      ]);
    (db as any).returning = vi.fn().mockResolvedValue([
      { id: 'swp-1', completedItemsJsonb: ['item-1'] },
    ]);

    await (storage as any).markPlanItemCompleted(
      'USER-0001',
      new Date('2026-05-04'),
      'item-1',
      true,
    );

    expect((db as any).transaction).toHaveBeenCalled();
  });
});

// =============================================================================
// listStudyWeeklyPlans — historico
// =============================================================================
describe('storage.listStudyWeeklyPlans', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).listStudyWeeklyPlans).toBe('function');
  });

  it('retorna array DESC por generated_at', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      { id: 'swp-3', generatedAt: new Date('2026-05-04T09:00:00Z') },
      { id: 'swp-2', generatedAt: new Date('2026-04-27T09:00:00Z') },
      { id: 'swp-1', generatedAt: new Date('2026-04-20T09:00:00Z') },
    ]);

    const r = await (storage as any).listStudyWeeklyPlans('USER-0001', 10);
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(3);
    expect((db as any).orderBy).toHaveBeenCalled();
  });
});

// =============================================================================
// getRecentStudySessionAvgMinutes — input do calc daily_target
// =============================================================================
describe('storage.getRecentStudySessionAvgMinutes (RF-3.1)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getRecentStudySessionAvgMinutes).toBe('function');
  });

  it('retorna avg em minutos da janela rolling 7d (excluindo source=auto_lesson)', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ avg: '32.5' }]);
    const r = await (storage as any).getRecentStudySessionAvgMinutes('USER-0001', 7);
    expect(typeof r === 'number' || r === null).toBe(true);
  });

  it('retorna null quando user sem sessions', async () => {
    (db as any).where = vi.fn().mockResolvedValue([{ avg: null }]);
    const r = await (storage as any).getRecentStudySessionAvgMinutes('USER-0001', 7);
    expect(r).toBeNull();
  });
});
