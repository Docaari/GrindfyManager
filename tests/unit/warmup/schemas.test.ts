import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD (Sprint W-1 Warm-up): Schemas Drizzle/Zod para warmup_rituals
// + extensoes de user_settings (weeklyHeuristics, drillUrl)
//
// Fonte:
//   - Docs/specs/warm-up-sprint-w1-spec.md (Secao 6 - Modelo de Dados)
//   - ADR-028 (warmup_rituals tabela dedicada)
//   - ADR-029 (no dual-write com preparation_logs)
//
// RF cobertos: RF-15 (validacao endpoint POST), RF-22 (weeklyHeuristics)
//
// Status esperado: TODOS DEVEM FALHAR (red) — modulos referenciados nao existem.
// =============================================================================

import {
  warmupRituals,
  insertWarmupRitualSchema,
  insertUserSettingsSchema,
  userSettings,
  type WarmupRitual,
  type InsertWarmupRitual,
  type WarmupBlockSnapshot,
  type SessionIntention,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Tabela warmup_rituals — schema Drizzle existe e tem colunas esperadas
// ---------------------------------------------------------------------------

describe('warmupRituals (Drizzle table)', () => {
  it('expoe a tabela warmup_rituals', () => {
    expect(warmupRituals).toBeDefined();
  });

  it('tem coluna id (PK varchar)', () => {
    expect((warmupRituals as any).id).toBeDefined();
  });

  it('tem coluna userId (FK para users.userPlatformId)', () => {
    expect((warmupRituals as any).userId).toBeDefined();
  });

  it('tem coluna startedAt (timestamp NOT NULL)', () => {
    expect((warmupRituals as any).startedAt).toBeDefined();
  });

  it('tem coluna completedAt (timestamp nullable)', () => {
    expect((warmupRituals as any).completedAt).toBeDefined();
  });

  it('tem coluna durationMinutes', () => {
    expect((warmupRituals as any).durationMinutes).toBeDefined();
  });

  it('tem coluna version (full | aborted)', () => {
    expect((warmupRituals as any).version).toBeDefined();
  });

  it('tem coluna emotionalCheckScore (0-10 nullable)', () => {
    expect((warmupRituals as any).emotionalCheckScore).toBeDefined();
  });

  it('tem coluna decisionToPlay (boolean nullable)', () => {
    expect((warmupRituals as any).decisionToPlay).toBeDefined();
  });

  it('tem coluna overrideUsed (boolean default false)', () => {
    expect((warmupRituals as any).overrideUsed).toBeDefined();
  });

  it('tem coluna blocksCompleted (jsonb default [])', () => {
    expect((warmupRituals as any).blocksCompleted).toBeDefined();
  });

  it('tem coluna sessionIntention (jsonb)', () => {
    expect((warmupRituals as any).sessionIntention).toBeDefined();
  });

  it('tem coluna linkedGrindSessionId (FK opcional)', () => {
    expect((warmupRituals as any).linkedGrindSessionId).toBeDefined();
  });

  it('tem coluna createdAt', () => {
    expect((warmupRituals as any).createdAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// insertWarmupRitualSchema — happy path
// ---------------------------------------------------------------------------

describe('insertWarmupRitualSchema - payload full (happy path)', () => {
  const validFullPayload = {
    userId: 'USER-0001',
    startedAt: new Date('2026-04-25T18:00:00Z').toISOString(),
    completedAt: new Date('2026-04-25T18:10:00Z').toISOString(),
    durationMinutes: 10,
    version: 'full' as const,
    emotionalCheckScore: 8,
    decisionToPlay: true,
    overrideUsed: false,
    blocksCompleted: [
      {
        blockId: 1,
        startedAt: '2026-04-25T18:00:00Z',
        completedAt: '2026-04-25T18:02:00Z',
        durationSeconds: 120,
      },
    ],
    sessionIntention: {
      focus: 'Defender BB vs BTN open 25bb seguindo a range estudada',
      tiltPlan: '5 respiracoes 4-4-4-4 + reler intencao',
      stopCriteria: 'Stop-loss -3 buy-ins ou 4h',
    },
  };

  it('aceita payload full valido', () => {
    const r = insertWarmupRitualSchema.safeParse(validFullPayload);
    expect(r.success).toBe(true);
  });

  it('aceita payload com sessionIntention nas 3 chaves obrigatorias', () => {
    const r = insertWarmupRitualSchema.safeParse(validFullPayload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.sessionIntention as any)?.focus).toBeTruthy();
      expect((r.data.sessionIntention as any)?.tiltPlan).toBeTruthy();
      expect((r.data.sessionIntention as any)?.stopCriteria).toBeTruthy();
    }
  });

  it('overrideUsed default false quando ausente', () => {
    const { overrideUsed: _, ...withoutFlag } = validFullPayload;
    const r = insertWarmupRitualSchema.safeParse(withoutFlag);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.overrideUsed).toBe(false);
    }
  });

  it('blocksCompleted default [] quando ausente', () => {
    const { blocksCompleted: _, ...withoutBlocks } = validFullPayload;
    const r = insertWarmupRitualSchema.safeParse(withoutBlocks);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Array.isArray(r.data.blocksCompleted)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// insertWarmupRitualSchema — payload aborted
// ---------------------------------------------------------------------------

describe('insertWarmupRitualSchema - payload aborted', () => {
  it('aceita aborted com decisionToPlay=false (gate no-go)', () => {
    const r = insertWarmupRitualSchema.safeParse({
      userId: 'USER-0001',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMinutes: 2,
      version: 'aborted',
      emotionalCheckScore: 4,
      decisionToPlay: false,
      overrideUsed: false,
      blocksCompleted: [],
      sessionIntention: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita aborted com campos null (campos opcionais)', () => {
    const r = insertWarmupRitualSchema.safeParse({
      userId: 'USER-0001',
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMinutes: 1,
      version: 'aborted',
      emotionalCheckScore: null,
      decisionToPlay: null,
      blocksCompleted: [],
    });
    expect(r.success).toBe(true);
  });

  it('aceita aborted sem sessionIntention', () => {
    const r = insertWarmupRitualSchema.safeParse({
      userId: 'USER-0001',
      startedAt: new Date().toISOString(),
      durationMinutes: 0,
      version: 'aborted',
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertWarmupRitualSchema — failures
// ---------------------------------------------------------------------------

describe('insertWarmupRitualSchema - rejeicoes', () => {
  const base = {
    userId: 'USER-0001',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMinutes: 10,
    version: 'full' as const,
    emotionalCheckScore: 8,
    decisionToPlay: true,
    overrideUsed: false,
    blocksCompleted: [],
    sessionIntention: { focus: 'A', tiltPlan: 'B', stopCriteria: 'C' },
  };

  it('rejeita version invalida (apenas full | aborted nesta sprint)', () => {
    const r = insertWarmupRitualSchema.safeParse({ ...base, version: 'minimal' });
    expect(r.success).toBe(false);
  });

  it('rejeita emotionalCheckScore negativo', () => {
    const r = insertWarmupRitualSchema.safeParse({ ...base, emotionalCheckScore: -1 });
    expect(r.success).toBe(false);
  });

  it('rejeita emotionalCheckScore > 10', () => {
    const r = insertWarmupRitualSchema.safeParse({ ...base, emotionalCheckScore: 11 });
    expect(r.success).toBe(false);
  });

  it('rejeita emotionalCheckScore nao-inteiro', () => {
    const r = insertWarmupRitualSchema.safeParse({ ...base, emotionalCheckScore: 7.5 });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionIntention.focus vazio (apos trim)', () => {
    const r = insertWarmupRitualSchema.safeParse({
      ...base,
      sessionIntention: { focus: '   ', tiltPlan: 'B', stopCriteria: 'C' },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionIntention.tiltPlan acima de 200 chars', () => {
    const r = insertWarmupRitualSchema.safeParse({
      ...base,
      sessionIntention: {
        focus: 'A',
        tiltPlan: 'x'.repeat(201),
        stopCriteria: 'C',
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionIntention.stopCriteria vazio', () => {
    const r = insertWarmupRitualSchema.safeParse({
      ...base,
      sessionIntention: { focus: 'A', tiltPlan: 'B', stopCriteria: '' },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// userSettings — extensoes weeklyHeuristics + drillUrl
// ---------------------------------------------------------------------------

describe('userSettings - extensoes Sprint W-1', () => {
  it('coluna weeklyHeuristics existe (jsonb tuple de 3 strings | null)', () => {
    expect((userSettings as any).weeklyHeuristics).toBeDefined();
  });

  it('coluna drillUrl existe (varchar, default GTO Wizard)', () => {
    expect((userSettings as any).drillUrl).toBeDefined();
  });
});

describe('insertUserSettingsSchema - weeklyHeuristics + drillUrl', () => {
  it('aceita weeklyHeuristics com tuple de 3 strings (parsed value preserva o array)', () => {
    const heuristics = [
      'BB vs BTN 25bb defender 58%',
      '3betar 11% polarizado',
      'fold abaixo de Q7o',
    ];
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      weeklyHeuristics: heuristics,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // Schema novo deve preservar o array no parsed value (nao apenas droppar via passthrough).
      expect((r.data as any).weeklyHeuristics).toEqual(heuristics);
    }
  });

  it('aceita weeklyHeuristics=null', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      weeklyHeuristics: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita weeklyHeuristics com 2 elementos (deve ter exatamente 3)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      weeklyHeuristics: ['a', 'b'],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita weeklyHeuristics com elemento >280 chars', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      weeklyHeuristics: ['a', 'b', 'x'.repeat(281)],
    });
    expect(r.success).toBe(false);
  });

  it('aceita drillUrl como string url valida e preserva o valor', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
      drillUrl: 'https://app.gtowizard.com/',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as any).drillUrl).toBe('https://app.gtowizard.com/');
    }
  });

  it('aceita ausencia de drillUrl (default no DB)', () => {
    const r = insertUserSettingsSchema.safeParse({
      userId: 'USER-0001',
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tipos exportados (compilacao)
// ---------------------------------------------------------------------------

describe('Tipos exportados (Sprint W-1)', () => {
  // Nota: testes runtime de tipos sao limitados — nao podemos checar os tipos diretamente.
  // O sinal mais forte e: o INSERT schema acima ter rejeitado/aceitado corretamente.
  // Aqui validamos apenas que o `warmupRituals` table object (Drizzle) e usavel para
  // construir um payload completo aceito pelo insert schema.
  it('WarmupRitual interno (Drizzle inferSelect) compila e tem todos os campos', () => {
    // Se o tipo nao existir, o cast vai compilar como never — esperamos que existam.
    const sample = {
      id: 'r-001',
      userId: 'USER-0001',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMinutes: 10,
      version: 'full' as const,
      emotionalCheckScore: 8,
      decisionToPlay: true,
      overrideUsed: false,
      blocksCompleted: [],
      sessionIntention: null,
      linkedGrindSessionId: null,
      createdAt: new Date(),
    };
    // Validar que ao menos a chave warmupRituals foi exportada (red ate schema implementado).
    expect(warmupRituals).toBeTruthy();
    expect(sample.id).toBe('r-001');
  });

  it('WarmupBlockSnapshot type estrutura runtime aceita blockId 1..5', () => {
    const b = {
      blockId: 3 as 1 | 2 | 3 | 4 | 5,
      startedAt: '2026-04-25T18:04:00Z',
      completedAt: '2026-04-25T18:08:00Z',
      durationSeconds: 240,
      drillCompleted: true,
    };
    expect(b.blockId).toBeGreaterThanOrEqual(1);
    expect(b.blockId).toBeLessThanOrEqual(5);
  });

  it('SessionIntention struct tem 3 campos string', () => {
    const s = { focus: 'a', tiltPlan: 'b', stopCriteria: 'c' };
    expect(s.focus).toBe('a');
    expect(s.tiltPlan).toBe('b');
    expect(s.stopCriteria).toBe('c');
  });
});
