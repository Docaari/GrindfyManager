import { describe, it, expect } from 'vitest';
import {
  insertSessionTournamentSchema,
  insertPlannedTournamentSchema,
  insertTournamentLibrarySchema,
} from '../../../shared/schema';

// =============================================================================
// Testes TDD: Endpoints PUT/POST com os campos novos (Spec 1/2/3)
//
// O projeto ainda nao tem suite de integracao full-stack (server startup),
// entao estes testes validam os CONTRATOS de request/response via schemas
// Zod (aproximacao do que o handler PUT/POST vai retornar) e stubs de
// validacao cruzada (merge-before-validate).
//
// Quando a infra de integracao full-stack for montada (Spec 1 §8),
// converter estes testes para usar supertest + app real.
//
// Modo: TDD - refinements cruzados ainda nao existem; merge-before-validate
//             helper ainda nao existe.
// =============================================================================

// ---------------------------------------------------------------------------
// Helper: simular merge-before-validate que o handler PUT deve fazer
// ---------------------------------------------------------------------------

// Stub - implementer deve criar em:
//   server/routes/helpers.ts ou server/routes/grind-sessions.ts
//
// export function validateWithMerge<T>(
//   schema: ZodSchema<T>,
//   existing: any,
//   partial: any
// ): { success: true; data: T } | { success: false; errors: string[] }
function validateWithMerge(
  schema: any,
  existing: any,
  partial: any
): { success: boolean; data?: any; error?: any } {
  // Referencia: antes de validar update parcial, merge com registro existente
  // para que refinements cruzados funcionem.
  const merged = { ...existing, ...partial };
  const result = schema.safeParse(merged);
  return result;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExistingSessionTournament(overrides: Partial<any> = {}): any {
  return {
    userId: 'USER-0001',
    sessionId: 'session-001',
    site: 'PokerStars',
    name: 'Big $22',
    buyIn: '22.00',
    rebuys: 0,
    reentries: 0,
    allowsAddOn: false,
    addOnCost: null,
    addOnTaken: false,
    allowsReentry: false,
    maxReentries: null,
    status: 'registered',
    type: 'Vanilla',
    speed: 'Normal',
    ...overrides,
  };
}

// ===========================================================================
// POST /api/session-tournaments: criar com novos campos
// ===========================================================================

describe('POST /api/session-tournaments - criacao com Add-on/ReA', () => {
  it('deve aceitar payload com allowsAddOn=true e addOnCost', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
    };
    const result = insertSessionTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve aceitar payload com allowsReentry=true e maxReentries=3', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: 3,
    };
    const result = insertSessionTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve aceitar payload com todas as 6 flags', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
    };
    const result = insertSessionTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve rejeitar addOnTaken=true com allowsAddOn=false (400)', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: false,
      addOnTaken: true,
    };
    const result = insertSessionTournamentSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('deve rejeitar reentries=5 com maxReentries=3 (400)', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 5,
    };
    const result = insertSessionTournamentSchema.safeParse(body);
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// PUT /api/session-tournaments/:id - update parcial com merge
// ===========================================================================

describe('PUT /api/session-tournaments/:id - update parcial com merge-before-validate', () => {
  it('deve aceitar { addOnTaken: true } quando DB tem allowsAddOn=true e addOnCost=22', () => {
    const existing = makeExistingSessionTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
    });
    const partial = { addOnTaken: true };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(true);
  });

  it('deve REJEITAR { addOnTaken: true } quando DB tem allowsAddOn=false', () => {
    const existing = makeExistingSessionTournament({
      allowsAddOn: false,
      addOnCost: null,
      addOnTaken: false,
    });
    const partial = { addOnTaken: true };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(false);
  });

  it('deve REJEITAR { addOnTaken: true } quando DB tem addOnCost=null', () => {
    const existing = makeExistingSessionTournament({
      allowsAddOn: true,
      addOnCost: null,
    });
    const partial = { addOnTaken: true };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(false);
  });

  it('deve aceitar re-entry: status finished -> registered com reentries++', () => {
    const existing = makeExistingSessionTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
    });
    const partial = { status: 'registered', reentries: 1 };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(true);
  });

  it('deve REJEITAR re-entry quando DB tem allowsReentry=false', () => {
    const existing = makeExistingSessionTournament({
      status: 'finished',
      allowsReentry: false,
      reentries: 0,
    });
    const partial = { status: 'registered', reentries: 1 };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(false);
  });

  it('deve REJEITAR re-entry quando reentries+1 > maxReentries', () => {
    const existing = makeExistingSessionTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 2,
      reentries: 2,
    });
    const partial = { status: 'registered', reentries: 3 };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(false);
  });

  it('deve aceitar update de rebuys (independente de reentries)', () => {
    const existing = makeExistingSessionTournament({ rebuys: 1 });
    const partial = { rebuys: 2 };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(true);
  });

  it('deve aceitar desfazer add-on: { addOnTaken: false }', () => {
    const existing = makeExistingSessionTournament({
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    });
    const partial = { addOnTaken: false };
    const result = validateWithMerge(insertSessionTournamentSchema, existing, partial);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/planned-tournaments: criar planned com flags
// ===========================================================================

describe('POST /api/planned-tournaments - criacao com flags', () => {
  it('deve aceitar planned com allowsAddOn=true e addOnCost', () => {
    const body = {
      userId: 'USER-0001',
      dayOfWeek: 2,
      site: 'PokerStars',
      time: '19:00',
      type: 'PKO',
      speed: 'Normal',
      name: 'Big $22',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
    };
    const result = insertPlannedTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve aceitar planned com allowsReentry=true e maxReentries', () => {
    const body = {
      userId: 'USER-0001',
      dayOfWeek: 2,
      site: 'PokerStars',
      time: '19:00',
      type: 'Vanilla',
      speed: 'Normal',
      name: 'Re-Entry Masters',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: 3,
    };
    const result = insertPlannedTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve aceitar planned sem flags (defaults)', () => {
    const body = {
      userId: 'USER-0001',
      dayOfWeek: 2,
      site: 'PokerStars',
      time: '19:00',
      type: 'Vanilla',
      speed: 'Normal',
      name: 'Daily $22',
      buyIn: '22.00',
    };
    const result = insertPlannedTournamentSchema.safeParse(body);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// POST /api/tournament-library: criar library com flags
// ===========================================================================

describe('POST /api/tournament-library - criacao com flags', () => {
  it('deve aceitar library com allowsAddOn=true', () => {
    const body = {
      userId: 'USER-0001',
      name: 'Big $22 Plus',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
    };
    const result = insertTournamentLibrarySchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('deve aceitar library com allowsReentry=true', () => {
    const body = {
      userId: 'USER-0001',
      name: 'Re-Entry Masters',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: 3,
    };
    const result = insertTournamentLibrarySchema.safeParse(body);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Copy-on-promote: planned -> session preserva flags
// ===========================================================================

describe('Copy-on-promote planned -> session_tournament', () => {
  // O handler em GrindSessionLive.tsx:948/965 chama addTournamentMutation
  // copiando campos do planned. Os novos campos DEVEM entrar nesse copy.

  it('payload de copy-on-promote deve conter allowsAddOn do planned', () => {
    const planned = {
      id: 'pt-001',
      userId: 'USER-0001',
      dayOfWeek: 2,
      site: 'PokerStars',
      time: '19:00',
      type: 'PKO',
      speed: 'Normal',
      name: 'Plus Sunday $22',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
      allowsReentry: false,
      maxReentries: null,
    };

    // Simula o helper promoteTournament que o implementer deve criar
    const promotePayload = {
      userId: planned.userId,
      sessionId: 'session-001',
      site: planned.site,
      name: planned.name,
      buyIn: planned.buyIn,
      type: planned.type,
      speed: planned.speed,
      fromPlannedTournament: true,
      plannedTournamentId: planned.id,
      // NOVOS CAMPOS do copy-on-promote
      allowsAddOn: planned.allowsAddOn,
      addOnCost: planned.addOnCost,
      allowsReentry: planned.allowsReentry,
      maxReentries: planned.maxReentries,
    };

    const result = insertSessionTournamentSchema.safeParse(promotePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).allowsAddOn).toBe(true);
      expect(parseFloat(String((result.data as any).addOnCost))).toBe(22);
    }
  });

  it('payload de copy-on-promote deve conter allowsReentry + maxReentries', () => {
    const planned = {
      userId: 'USER-0001',
      dayOfWeek: 2,
      site: 'PokerStars',
      time: '19:00',
      type: 'Vanilla',
      speed: 'Normal',
      name: 'Re-Entry Masters',
      buyIn: '22.00',
      allowsAddOn: false,
      addOnCost: null,
      allowsReentry: true,
      maxReentries: 3,
    };

    const promotePayload = {
      userId: planned.userId,
      sessionId: 'session-001',
      site: planned.site,
      name: planned.name,
      buyIn: planned.buyIn,
      allowsReentry: planned.allowsReentry,
      maxReentries: planned.maxReentries,
    };

    const result = insertSessionTournamentSchema.safeParse(promotePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).allowsReentry).toBe(true);
      expect((result.data as any).maxReentries).toBe(3);
    }
  });

  it('planned sem flags promove com defaults', () => {
    const planned = {
      userId: 'USER-0001',
      site: 'PokerStars',
      name: 'Daily $22',
      buyIn: '22.00',
      sessionId: 'session-001',
    };
    const result = insertSessionTournamentSchema.safeParse(planned);
    expect(result.success).toBe(true);
  });

  it('copy-on-promote preserva maxReentries=null (ilimitado)', () => {
    const payload = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: null,
    };
    const result = insertSessionTournamentSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Status codes esperados (documentar expectativa)
// ===========================================================================

describe('Status codes esperados', () => {
  it('refinement cruzado aplica: 200 quando valido, 400 quando invalido', () => {
    // Valida via schema direto; quando o backend endpoint for pronto,
    // estes testes devem virar supertest.
    const validBody = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    };
    const invalidBody = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: false,
      addOnTaken: true, // invalido
    };
    expect(insertSessionTournamentSchema.safeParse(validBody).success).toBe(true);
    expect(insertSessionTournamentSchema.safeParse(invalidBody).success).toBe(false);
  });

  it('maxReentries negativo => 400', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsReentry: true,
      maxReentries: -1,
    };
    expect(insertSessionTournamentSchema.safeParse(body).success).toBe(false);
  });

  it('addOnTaken=true com addOnCost=0 => 400', () => {
    const body = {
      userId: 'USER-0001',
      sessionId: 'session-001',
      site: 'PokerStars',
      buyIn: '22.00',
      allowsAddOn: true,
      addOnCost: '0',
      addOnTaken: true,
    };
    expect(insertSessionTournamentSchema.safeParse(body).success).toBe(false);
  });
});
