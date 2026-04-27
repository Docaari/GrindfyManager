import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-1 (MVP) — Schema de starred_hands
//
// Spec: Docs/specs/cooldown-refactor-plan.md (RF-03)
// ADR : Docs/architecture/decisions/041-cooldown-dedicated-spec-and-schema.md
//
// Modulos NAO existem ainda — Implementer cria em shared/schema.ts:
//   - starredHands (Drizzle table)
//   - insertStarredHandSchema (Zod, via drizzle-zod)
//   - starredHandTypeSchema (Zod enum 8 valores)
//   - starredHandSpotSchema (Zod enum 8 valores)
//   - tipos: StarredHand, InsertStarredHand
// =============================================================================

import {
  starredHands,
  insertStarredHandSchema,
  starredHandTypeSchema,
  starredHandSpotSchema,
  type StarredHand,
  type InsertStarredHand,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// Tabela starred_hands — Drizzle
// ---------------------------------------------------------------------------

describe('starredHands (Drizzle table)', () => {
  it('expoe a tabela starred_hands', () => {
    expect(starredHands).toBeDefined();
  });

  it('tem coluna id (PK varchar)', () => {
    expect((starredHands as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId)', () => {
    expect((starredHands as any).userId).toBeDefined();
  });

  it('tem coluna sessionId (FK grind_sessions.id)', () => {
    expect((starredHands as any).sessionId).toBeDefined();
  });

  it('tem coluna sessionTournamentId (FK session_tournaments.id, ADR-014 entry-level)', () => {
    expect((starredHands as any).sessionTournamentId).toBeDefined();
  });

  it('tem coluna cooldownLogId (FK cooldown_logs.id, NULLABLE, ON DELETE SET NULL)', () => {
    expect((starredHands as any).cooldownLogId).toBeDefined();
  });

  it('tem coluna type (varchar enum 8 valores)', () => {
    expect((starredHands as any).type).toBeDefined();
  });

  it('tem coluna spot (varchar enum 8 valores)', () => {
    expect((starredHands as any).spot).toBeDefined();
  });

  it('tem coluna notes (text nullable, max 500 chars validado por Zod)', () => {
    expect((starredHands as any).notes).toBeDefined();
  });

  it('tem coluna createdAt (timestamp default now)', () => {
    expect((starredHands as any).createdAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// starredHandTypeSchema — enum 8 valores
// ---------------------------------------------------------------------------

describe('starredHandTypeSchema', () => {
  const valid = ['tilt', 'leak', 'soulread', 'hero-call', 'cooler', 'mistake', 'sick', 'other'];

  for (const v of valid) {
    it(`aceita "${v}"`, () => {
      const r = starredHandTypeSchema.safeParse(v);
      expect(r.success).toBe(true);
    });
  }

  it('rejeita "TILT" (case-sensitive)', () => {
    const r = starredHandTypeSchema.safeParse('TILT');
    expect(r.success).toBe(false);
  });

  it('rejeita string vazia', () => {
    const r = starredHandTypeSchema.safeParse('');
    expect(r.success).toBe(false);
  });

  it('rejeita valor desconhecido "amazing"', () => {
    const r = starredHandTypeSchema.safeParse('amazing');
    expect(r.success).toBe(false);
  });

  it('valida presenca individual de cada valor (nao testa length absoluta - lessons-learned #8)', () => {
    for (const v of valid) {
      expect(starredHandTypeSchema.safeParse(v).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// starredHandSpotSchema — enum 8 valores
// ---------------------------------------------------------------------------

describe('starredHandSpotSchema', () => {
  const valid = [
    'preflop',
    'flop',
    'turn',
    'river',
    'icm',
    'final-table',
    'bubble',
    'other',
  ];

  for (const v of valid) {
    it(`aceita "${v}"`, () => {
      const r = starredHandSpotSchema.safeParse(v);
      expect(r.success).toBe(true);
    });
  }

  it('rejeita "Preflop" (case-sensitive)', () => {
    const r = starredHandSpotSchema.safeParse('Preflop');
    expect(r.success).toBe(false);
  });

  it('rejeita "deep-stack"', () => {
    const r = starredHandSpotSchema.safeParse('deep-stack');
    expect(r.success).toBe(false);
  });

  it('rejeita undefined/null', () => {
    expect(starredHandSpotSchema.safeParse(undefined).success).toBe(false);
    expect(starredHandSpotSchema.safeParse(null).success).toBe(false);
  });

  it('valida presenca individual de cada valor (nao testa length absoluta - lessons-learned #8)', () => {
    for (const v of valid) {
      expect(starredHandSpotSchema.safeParse(v).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// insertStarredHandSchema — happy path
// ---------------------------------------------------------------------------

describe('insertStarredHandSchema - happy path', () => {
  const valid = {
    userId: 'USER-0001',
    sessionId: 'ses_1',
    sessionTournamentId: 'st_1',
    type: 'tilt' as const,
    spot: 'river' as const,
  };

  it('aceita payload minimo (sem notes, sem cooldownLogId)', () => {
    const r = insertStarredHandSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('aceita payload com cooldownLogId presente', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      cooldownLogId: 'cd_1',
    });
    expect(r.success).toBe(true);
  });

  it('aceita payload com cooldownLogId NULL (Sprint 2/3 starred sem cool-down ativo)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      cooldownLogId: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita notes ate 500 chars', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      notes: 'n'.repeat(500),
    });
    expect(r.success).toBe(true);
  });

  it('aceita notes vazia ""', () => {
    const r = insertStarredHandSchema.safeParse({ ...valid, notes: '' });
    expect(r.success).toBe(true);
  });

  it('aceita notes ausente', () => {
    const r = insertStarredHandSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insertStarredHandSchema — validacoes negativas
// ---------------------------------------------------------------------------

describe('insertStarredHandSchema - validacoes (negative)', () => {
  const valid = {
    userId: 'USER-0001',
    sessionId: 'ses_1',
    sessionTournamentId: 'st_1',
    type: 'tilt' as const,
    spot: 'river' as const,
  };

  it('rejeita type invalido "amazing"', () => {
    const r = insertStarredHandSchema.safeParse({ ...valid, type: 'amazing' });
    expect(r.success).toBe(false);
  });

  it('rejeita spot invalido "deep-stack"', () => {
    const r = insertStarredHandSchema.safeParse({ ...valid, spot: 'deep-stack' });
    expect(r.success).toBe(false);
  });

  it('rejeita userId vazio', () => {
    const r = insertStarredHandSchema.safeParse({ ...valid, userId: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionId vazio', () => {
    const r = insertStarredHandSchema.safeParse({ ...valid, sessionId: '' });
    expect(r.success).toBe(false);
  });

  it('rejeita sessionTournamentId vazio', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      sessionTournamentId: '',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita type ausente', () => {
    const { type: _, ...body } = valid;
    const r = insertStarredHandSchema.safeParse(body);
    expect(r.success).toBe(false);
  });

  it('rejeita spot ausente', () => {
    const { spot: _, ...body } = valid;
    const r = insertStarredHandSchema.safeParse(body);
    expect(r.success).toBe(false);
  });

  it('rejeita notes > 500 chars', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      notes: 'n'.repeat(501),
    });
    expect(r.success).toBe(false);
  });

  it('aceita notes exatamente 500 chars (boundary)', () => {
    const r = insertStarredHandSchema.safeParse({
      ...valid,
      notes: 'n'.repeat(500),
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

describe('starred_hands - tipos TypeScript exportados', () => {
  it('shared/schema.ts exporta tipos StarredHand/InsertStarredHand', () => {
    const _t1: StarredHand | undefined = undefined;
    const _t2: InsertStarredHand | undefined = undefined;
    expect(starredHands).toBeDefined();
  });
});
