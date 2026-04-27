import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — Schema de cooldown_logs
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-03)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulos NAO existem ainda — Implementer cria em shared/schema.ts:
//   - cooldownLogs (Drizzle table)
//   - insertCooldownLogSchema (Zod, via drizzle-zod)
//   - updateCooldownLogSchema (Zod parcial)
//   - cooldownLogModeSchema (Zod enum 'full' | 'quick')
//   - tipos: CooldownLog, InsertCooldownLog, AbGameAnswers
//
// Status esperado: TODOS DEVEM FALHAR por module-not-found ou exports inexistentes.
// =============================================================================

import {
  cooldownLogs,
  insertCooldownLogSchema,
  updateCooldownLogSchema,
  cooldownLogModeSchema,
  type CooldownLog,
  type InsertCooldownLog,
  type AbGameAnswers,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Tabela cooldown_logs — Drizzle
// ---------------------------------------------------------------------------

describe('cooldownLogs (Drizzle table)', () => {
  it('expoe a tabela cooldown_logs', () => {
    expect(cooldownLogs).toBeDefined();
  });

  it('tem coluna id (PK varchar)', () => {
    expect((cooldownLogs as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId)', () => {
    expect((cooldownLogs as any).userId).toBeDefined();
  });

  it('tem coluna sessionId (FK grind_sessions.id, 1:1)', () => {
    expect((cooldownLogs as any).sessionId).toBeDefined();
  });

  it('tem coluna startedAt (timestamp NOT NULL)', () => {
    expect((cooldownLogs as any).startedAt).toBeDefined();
  });

  it('tem coluna completedAt (timestamp nullable, null = rascunho)', () => {
    expect((cooldownLogs as any).completedAt).toBeDefined();
  });

  it('tem coluna durationMinutes (integer nullable)', () => {
    expect((cooldownLogs as any).durationMinutes).toBeDefined();
  });

  it('tem coluna mode (varchar default "full")', () => {
    expect((cooldownLogs as any).mode).toBeDefined();
  });

  it('tem coluna blocksCompleted (jsonb default [])', () => {
    expect((cooldownLogs as any).blocksCompleted).toBeDefined();
  });

  it('tem coluna abGameAnswers (jsonb nullable)', () => {
    expect((cooldownLogs as any).abGameAnswers).toBeDefined();
  });

  it('tem coluna tiltSelfAssessment (jsonb nullable, Sprint 2)', () => {
    expect((cooldownLogs as any).tiltSelfAssessment).toBeDefined();
  });

  it('tem coluna sleepIntent (boolean nullable, Sprint 2)', () => {
    expect((cooldownLogs as any).sleepIntent).toBeDefined();
  });

  it('tem coluna notes (text nullable)', () => {
    expect((cooldownLogs as any).notes).toBeDefined();
  });

  it('tem coluna createdAt (timestamp default now)', () => {
    expect((cooldownLogs as any).createdAt).toBeDefined();
  });

  it('tem coluna updatedAt (timestamp default now)', () => {
    expect((cooldownLogs as any).updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cooldownLogModeSchema — enum 'full' | 'quick'
// ---------------------------------------------------------------------------

describe('cooldownLogModeSchema', () => {
  it('aceita "full"', () => {
    const r = cooldownLogModeSchema.safeParse('full');
    expect(r.success).toBe(true);
  });

  it('aceita "quick"', () => {
    const r = cooldownLogModeSchema.safeParse('quick');
    expect(r.success).toBe(true);
  });

  it('rejeita string vazia', () => {
    const r = cooldownLogModeSchema.safeParse('');
    expect(r.success).toBe(false);
  });

  it('rejeita "FULL" (case-sensitive)', () => {
    const r = cooldownLogModeSchema.safeParse('FULL');
    expect(r.success).toBe(false);
  });

  it('rejeita valor desconhecido "complete"', () => {
    const r = cooldownLogModeSchema.safeParse('complete');
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// insertCooldownLogSchema — happy path + boundaries
// ---------------------------------------------------------------------------

describe('insertCooldownLogSchema - happy path', () => {
  const validBase = {
    userId: 'USER-0001',
    sessionId: 'ses_1',
    mode: 'full' as const,
  };

  it('aceita payload minimo { userId, sessionId, mode:"full" }', () => {
    const r = insertCooldownLogSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it('aceita mode "quick"', () => {
    const r = insertCooldownLogSchema.safeParse({ ...validBase, mode: 'quick' });
    expect(r.success).toBe(true);
  });

  it('aceita blocksCompleted como array vazio []', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      blocksCompleted: [],
    });
    expect(r.success).toBe(true);
  });

  it('aceita blocksCompleted com strings ["hands","abc"]', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      blocksCompleted: ['hands', 'abc'],
    });
    expect(r.success).toBe(true);
  });

  it('aceita abGameAnswers com shape {aGame[], bGame[], cGame, lesson}', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: ['Joguei concentrado nas primeiras 2h'],
        bGame: ['Calls marginais OOP'],
        cGame: 'Tilt apos cooler — segui jogando',
        lesson: 'Stop loss 3 BIs respeita',
      },
    });
    expect(r.success).toBe(true);
  });

  it('aceita abGameAnswers com aGame/bGame vazios (arrays)', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: [],
        bGame: [],
        cGame: '',
        lesson: '',
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('insertCooldownLogSchema - validacoes (negative)', () => {
  const validBase = {
    userId: 'USER-0001',
    sessionId: 'ses_1',
    mode: 'full' as const,
  };

  it('rejeita mode invalido "complete"', () => {
    const r = insertCooldownLogSchema.safeParse({ ...validBase, mode: 'complete' });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionId vazio ""', () => {
    const r = insertCooldownLogSchema.safeParse({ ...validBase, sessionId: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita userId vazio ""', () => {
    const r = insertCooldownLogSchema.safeParse({ ...validBase, userId: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionId ausente', () => {
    const { sessionId: _, ...body } = validBase;
    const r = insertCooldownLogSchema.safeParse(body);
    expect(r.success).toBe(false);
  });

  it('rejeita mode ausente', () => {
    const { mode: _, ...body } = validBase;
    const r = insertCooldownLogSchema.safeParse(body);
    expect(r.success).toBe(false);
  });

  it('rejeita abGameAnswers.lesson > 200 chars', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: ['x'],
        bGame: ['y'],
        cGame: 'z',
        lesson: 'L'.repeat(201),
      },
    });
    expect(r.success).toBe(false);
  });

  it('aceita abGameAnswers.lesson exatamente 200 chars (boundary)', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: [],
        bGame: [],
        cGame: '',
        lesson: 'L'.repeat(200),
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita abGameAnswers.cGame > 2000 chars', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: [],
        bGame: [],
        cGame: 'x'.repeat(2001),
        lesson: '',
      },
    });
    expect(r.success).toBe(false);
  });

  it('aceita abGameAnswers.cGame exatamente 2000 chars (boundary)', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      abGameAnswers: {
        aGame: [],
        bGame: [],
        cGame: 'x'.repeat(2000),
        lesson: '',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita blocksCompleted com nao-string [{}]', () => {
    const r = insertCooldownLogSchema.safeParse({
      ...validBase,
      blocksCompleted: [{} as any],
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateCooldownLogSchema — partial updates
// ---------------------------------------------------------------------------

describe('updateCooldownLogSchema - partial updates', () => {
  it('aceita atualizar APENAS blocksCompleted', () => {
    const r = updateCooldownLogSchema.safeParse({
      blocksCompleted: ['hands'],
    });
    expect(r.success).toBe(true);
  });

  it('aceita atualizar APENAS abGameAnswers', () => {
    const r = updateCooldownLogSchema.safeParse({
      abGameAnswers: {
        aGame: ['a'],
        bGame: ['b'],
        cGame: 'c',
        lesson: 'l',
      },
    });
    expect(r.success).toBe(true);
  });

  it('aceita atualizar APENAS completedAt', () => {
    const r = updateCooldownLogSchema.safeParse({
      completedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it('aceita atualizar APENAS notes', () => {
    const r = updateCooldownLogSchema.safeParse({
      notes: 'Cool-down rapido — foco em A-game',
    });
    expect(r.success).toBe(true);
  });

  it('aceita body vazio {} (PATCH idempotente)', () => {
    const r = updateCooldownLogSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('aceita atualizar durationMinutes', () => {
    const r = updateCooldownLogSchema.safeParse({ durationMinutes: 7 });
    expect(r.success).toBe(true);
  });

  it('rejeita atualizar id (imutavel)', () => {
    const r = updateCooldownLogSchema.safeParse({ id: 'novo-id' });
    expect(r.success).toBe(false);
  });

  it('rejeita atualizar userId (imutavel)', () => {
    const r = updateCooldownLogSchema.safeParse({ userId: 'USER-9999' });
    expect(r.success).toBe(false);
  });

  it('rejeita atualizar sessionId (imutavel)', () => {
    const r = updateCooldownLogSchema.safeParse({ sessionId: 'ses_other' });
    expect(r.success).toBe(false);
  });

  it('aceita combinacao parcial { blocksCompleted, abGameAnswers, completedAt }', () => {
    const r = updateCooldownLogSchema.safeParse({
      blocksCompleted: ['hands', 'abc'],
      abGameAnswers: {
        aGame: ['x'],
        bGame: ['y'],
        cGame: 'z',
        lesson: 'l',
      },
      completedAt: new Date().toISOString(),
    });
    expect(r.success).toBe(true);
  });

  it('rejeita lesson > 200 chars no PATCH (mesma boundary)', () => {
    const r = updateCooldownLogSchema.safeParse({
      abGameAnswers: {
        aGame: [],
        bGame: [],
        cGame: '',
        lesson: 'L'.repeat(201),
      },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tipos exportados (verificacao via compile-time — tests sao no-op em runtime
// porque types nao existem em runtime; tipo apenas precisa estar exportado para
// o import nao falhar)
// ---------------------------------------------------------------------------

describe('cooldown_logs - tipos TypeScript exportados', () => {
  it('shared/schema.ts exporta tipos CooldownLog/InsertCooldownLog/AbGameAnswers', () => {
    // Se o modulo nao tem esses tipos, o import falha em compile-time.
    // Em runtime, essa asserção apenas checa que o modulo carregou.
    const t1: CooldownLog | undefined = undefined;
    const t2: InsertCooldownLog | undefined = undefined;
    const t3: AbGameAnswers | undefined = undefined;
    expect(cooldownLogs).toBeDefined();
  });
});
