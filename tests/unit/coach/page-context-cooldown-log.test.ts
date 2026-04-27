import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint Cooldown-3 / RF-07 — Page context variante `cooldown-log`
//
// Spec : Docs/specs/cooldown-refactor-plan.md (RF-07)
// ADR  : Docs/architecture/decisions/043-coach-page-context-cooldown-log.md
// Base : ADR-025 (page context Zod whitelist por route)
// Flow : Docs/architecture/flows/coach/sequence-cooldown-tool.mermaid (cenario B)
//
// Modulo a ser estendido pelo Implementer:
//   server/coachPageContext.ts (existente — adicionar variante na union)
//
// Variante:
//   route literal 'cooldown-log'
//   cooldownLogId: string (max 50)
//   sessionId: string (max 50)
//   mode: enum ['full', 'quick']
//   blocksCompleted: array of enum ['hands', 'abc', 'tilt', 'sleep', 'quick'] (max 5)
//   completedAt: ISO string OR null (rascunho)
//   abGameAnswers? sanitized (only booleans hasAGame, hasBGame, hasCGame, hasLesson)
//   tiltSelfAssessment? sanitized (sliders + triggersCount + dominantTrigger)
//   starredHandsCount: int 0..50
//   starredHandsByType? Record<typeEnum, int>
//   recentLessonTokens?: string[] (max 10, each max 30 chars)
//
// PII rejeitado: notes, cGame, action, aGame[], bGame[], lesson (texto livre).
//
// IMPORTANT: red phase — modulo coachPageContext nao tem variante ainda;
// testes falham por validation error ou module-not-found.
// =============================================================================

import { pageContextSchema } from '../../../server/coachPageContext';

// Helper — minimal valid cooldown-log shape
function validCooldownLog() {
  return {
    route: 'cooldown-log' as const,
    cooldownLogId: 'cd_abc123',
    sessionId: 'sess_xyz',
    mode: 'full' as const,
    blocksCompleted: ['hands', 'abc'],
    completedAt: '2026-04-25T22:14:00.000Z',
    starredHandsCount: 3,
  };
}

// =============================================================================
// Variante cooldown-log — happy path
// =============================================================================

describe('pageContextSchema variante cooldown-log — happy path', () => {
  it('aceita shape minimo valido', () => {
    const r = pageContextSchema.safeParse(validCooldownLog());
    expect(r.success).toBe(true);
  });

  it('aceita mode "quick"', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      mode: 'quick',
      blocksCompleted: ['quick'],
    });
    expect(r.success).toBe(true);
  });

  it('aceita completedAt = null (rascunho)', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      completedAt: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita abGameAnswers sanitizado (apenas booleans)', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      abGameAnswers: {
        hasAGame: true,
        hasBGame: false,
        hasCGame: true,
        hasLesson: true,
      },
    });
    expect(r.success).toBe(true);
  });

  it('aceita tiltSelfAssessment sanitizado (sliders + triggersCount)', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      tiltSelfAssessment: {
        feltTilt: 6,
        keptTilting: 4,
        presence: 5,
        triggersCount: 2,
        dominantTrigger: 'distracao',
      },
    });
    expect(r.success).toBe(true);
  });

  it('aceita starredHandsByType com counts por tipo', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      starredHandsByType: { tilt: 2, leak: 1 },
    });
    expect(r.success).toBe(true);
  });

  it('aceita recentLessonTokens array de strings curtas', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      recentLessonTokens: ['paciencia', 'foco'],
    });
    expect(r.success).toBe(true);
  });
});

// =============================================================================
// PII rejection — campos textuais sao bloqueados
// =============================================================================

describe('pageContextSchema variante cooldown-log — rejeicao PII', () => {
  it('rejeita campo "notes" no body (PII)', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      notes: 'minha nota privada',
    } as any);
    expect(r.success).toBe(false);
  });

  it('rejeita "cGame" texto livre dentro de abGameAnswers', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      abGameAnswers: {
        hasAGame: true,
        hasBGame: true,
        hasCGame: true,
        hasLesson: true,
        cGame: 'erros que cometi', // PII
      } as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita "action" texto livre dentro de tiltSelfAssessment', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      tiltSelfAssessment: {
        feltTilt: 6,
        keptTilting: 4,
        presence: 5,
        triggersCount: 2,
        action: 'fazer pausa antes de proximo torneio', // PII
      } as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita aGame[] (array de strings cruas) em abGameAnswers', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      abGameAnswers: {
        hasAGame: true,
        hasBGame: true,
        hasCGame: true,
        hasLesson: true,
        aGame: ['joguei bem preflop', 'foliei value bet'], // PII
      } as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita bGame[] (array de strings cruas) em abGameAnswers', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      abGameAnswers: {
        hasAGame: true,
        hasBGame: true,
        hasCGame: true,
        hasLesson: true,
        bGame: ['decisao no turn'],
      } as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita lesson texto livre solto em abGameAnswers', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      abGameAnswers: {
        hasAGame: true,
        hasBGame: true,
        hasCGame: true,
        hasLesson: true,
        lesson: 'praticar paciencia em ICM',
      } as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita triggers[] array (apenas dominantTrigger e count permitidos)', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      tiltSelfAssessment: {
        feltTilt: 6,
        keptTilting: 4,
        presence: 5,
        triggersCount: 3,
        triggers: ['cooler', 'slowroll', 'distracao'], // privacy: array completo nao
      } as any,
    });
    expect(r.success).toBe(false);
  });
});

// =============================================================================
// Limites de tamanho e tipos
// =============================================================================

describe('pageContextSchema variante cooldown-log — limites', () => {
  it('rejeita mode invalido', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      mode: 'extended' as any,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita blocksCompleted com valor fora do enum', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      blocksCompleted: ['hands', 'unknown-block'],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita starredHandsCount negativo', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      starredHandsCount: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita tiltSelfAssessment.feltTilt > 10', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      tiltSelfAssessment: {
        feltTilt: 15,
        keptTilting: 4,
        presence: 5,
        triggersCount: 2,
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita recentLessonTokens com mais de 10 entries', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      recentLessonTokens: Array.from({ length: 11 }, (_, i) => `t${i}`),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita token individual > 30 chars', () => {
    const r = pageContextSchema.safeParse({
      ...validCooldownLog(),
      recentLessonTokens: ['x'.repeat(31)],
    });
    expect(r.success).toBe(false);
  });
});

// =============================================================================
// Backward-compat — outras routes continuam aceitas
// =============================================================================

describe('pageContextSchema — backward compat com Sprint 2A', () => {
  it('grade-planner continua aceito', () => {
    const r = pageContextSchema.safeParse({ route: 'grade-planner' });
    expect(r.success).toBe(true);
  });

  it('grind-live continua aceito', () => {
    const r = pageContextSchema.safeParse({
      route: 'grind-live',
      sessionStatus: 'active',
    });
    expect(r.success).toBe(true);
  });

  it('dashboard continua aceito', () => {
    const r = pageContextSchema.safeParse({ route: 'dashboard' });
    expect(r.success).toBe(true);
  });

  it('coach-ai continua aceito', () => {
    const r = pageContextSchema.safeParse({ route: 'coach-ai' });
    expect(r.success).toBe(true);
  });

  it('rejeita route desconhecida (nao confunde com cooldown-log)', () => {
    const r = pageContextSchema.safeParse({ route: 'cooldown' });
    expect(r.success).toBe(false);
  });
});
