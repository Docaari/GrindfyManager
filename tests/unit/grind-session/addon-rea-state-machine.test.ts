import { describe, it, expect } from 'vitest';
import {
  insertSessionTournamentSchema,
} from '../../../shared/schema';

// =============================================================================
// Testes TDD: State Machine do torneio (Grind Live) - ADR-014
//
// Estados: upcoming -> registered -> finished (com loops)
//
// Transicoes:
//   upcoming     -> registered  (REGISTRAR)
//   registered   -> registered  (REBUY: rebuys++)
//   registered   -> registered  (ADD-ON: addOnTaken=true, guards aplicam)
//   registered   -> finished    (GG / RESULTADO)
//   finished     -> registered  (RE-ENTRY: reentries++, volta status)
//
// Invariantes (guards):
//   pode_fazer_addon(t)   := status==registered && allowsAddOn && !addOnTaken
//                             && addOnCost != null && addOnCost > 0
//   pode_fazer_reentry(t) := status==finished && allowsReentry
//                             && (maxReentries==null || reentries < maxReentries)
//   pode_fazer_rebuy(t)   := status==registered
//
// Transicoes proibidas: upcoming -> finished (pulando registered),
//                       finished -> registered sem reentries++, etc.
//
// Este teste usa uma funcao utilitaria `applyTransition` que SERA criada
// pelo implementer como helper puro em:
//   client/src/components/grind-session-live/state-machine.ts (ou similar)
//
// Modo: TDD - funcao nao existe ainda. Os testes validam comportamento esperado.
// =============================================================================

// ---------------------------------------------------------------------------
// Import da funcao (criada pelo Implementer — state-machine.ts)
// ---------------------------------------------------------------------------
import {
  canAddOn,
  canReentry,
  canRebuy,
  applyAddOn,
  applyReentry,
  applyRebuy,
  applyRegister,
  applyFinish,
} from '../../../client/src/components/grind-session-live/state-machine';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTournament(overrides: Partial<any> = {}): any {
  return {
    id: 't-001',
    userId: 'USER-0001',
    sessionId: 'session-001',
    site: 'PokerStars',
    name: 'Big $22',
    buyIn: '22.00',
    status: 'upcoming',
    rebuys: 0,
    allowsAddOn: false,
    addOnCost: null,
    addOnTaken: false,
    allowsReentry: false,
    maxReentries: null,
    reentries: 0,
    prize: '0',
    bounty: '0',
    position: null,
    ...overrides,
  };
}

// ===========================================================================
// canAddOn - guards de add-on
// ===========================================================================

describe('state-machine: canAddOn (guard)', () => {
  it('deve retornar true quando status=registered, allowsAddOn=true, !addOnTaken, addOnCost>0', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
    });
    expect(canAddOn(t)).toBe(true);
  });

  it('deve retornar false quando status=upcoming', () => {
    const t = makeTournament({
      status: 'upcoming',
      allowsAddOn: true,
      addOnCost: '22.00',
    });
    expect(canAddOn(t)).toBe(false);
  });

  it('deve retornar false quando status=finished', () => {
    const t = makeTournament({
      status: 'finished',
      allowsAddOn: true,
      addOnCost: '22.00',
    });
    expect(canAddOn(t)).toBe(false);
  });

  it('deve retornar false quando allowsAddOn=false', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: false,
    });
    expect(canAddOn(t)).toBe(false);
  });

  it('deve retornar false quando addOnTaken=true (ja pago)', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    });
    expect(canAddOn(t)).toBe(false);
  });

  it('deve retornar false quando addOnCost=null', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: null,
    });
    expect(canAddOn(t)).toBe(false);
  });

  it('deve retornar false quando addOnCost=0', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '0',
    });
    expect(canAddOn(t)).toBe(false);
  });
});

// ===========================================================================
// canReentry - guards de re-entry
// ===========================================================================

describe('state-machine: canReentry (guard)', () => {
  it('deve retornar true quando status=finished, allowsReentry=true, reentries<maxReentries', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 1,
    });
    expect(canReentry(t)).toBe(true);
  });

  it('deve retornar true quando maxReentries=null (ilimitado) mesmo com reentries=10', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: null,
      reentries: 10,
    });
    expect(canReentry(t)).toBe(true);
  });

  it('deve retornar false quando status=registered (nao bustou ainda)', () => {
    const t = makeTournament({
      status: 'registered',
      allowsReentry: true,
      maxReentries: 3,
    });
    expect(canReentry(t)).toBe(false);
  });

  it('deve retornar false quando allowsReentry=false', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: false,
    });
    expect(canReentry(t)).toBe(false);
  });

  it('deve retornar false quando reentries==maxReentries (limite atingido)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 3,
    });
    expect(canReentry(t)).toBe(false);
  });

  it('deve retornar false quando maxReentries=0 (edge: "allowsReentry=true" mas sem re-entries)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 0,
      reentries: 0,
    });
    expect(canReentry(t)).toBe(false);
  });
});

// ===========================================================================
// canRebuy - guard independente de ReA
// ===========================================================================

describe('state-machine: canRebuy (guard)', () => {
  it('deve retornar true quando status=registered (independente de qualquer flag)', () => {
    const t = makeTournament({ status: 'registered' });
    expect(canRebuy(t)).toBe(true);
  });

  it('deve retornar false quando status=upcoming', () => {
    const t = makeTournament({ status: 'upcoming' });
    expect(canRebuy(t)).toBe(false);
  });

  it('deve retornar false quando status=finished', () => {
    const t = makeTournament({ status: 'finished' });
    expect(canRebuy(t)).toBe(false);
  });

  it('deve permitir rebuy independente de allowsReentry=false', () => {
    const t = makeTournament({ status: 'registered', allowsReentry: false });
    expect(canRebuy(t)).toBe(true);
  });

  it('deve permitir rebuy em torneio ReA (ambos coexistem)', () => {
    const t = makeTournament({
      status: 'registered',
      allowsReentry: true,
      maxReentries: 3,
    });
    expect(canRebuy(t)).toBe(true);
  });
});

// ===========================================================================
// Transicoes (apply*)
// ===========================================================================

describe('state-machine: applyRegister (upcoming -> registered)', () => {
  it('deve mudar status de upcoming para registered', () => {
    const t = makeTournament({ status: 'upcoming' });
    const updated = applyRegister(t);
    expect(updated.status).toBe('registered');
  });

  it('deve preservar flags Plus/ReA ao registrar', () => {
    const t = makeTournament({
      status: 'upcoming',
      allowsAddOn: true,
      addOnCost: '22.00',
      allowsReentry: true,
      maxReentries: 3,
    });
    const updated = applyRegister(t);
    expect(updated.allowsAddOn).toBe(true);
    expect(updated.addOnCost).toBe('22.00');
    expect(updated.allowsReentry).toBe(true);
    expect(updated.maxReentries).toBe(3);
  });

  it('deve manter reentries=0 e addOnTaken=false ao registrar', () => {
    const t = makeTournament({ status: 'upcoming' });
    const updated = applyRegister(t);
    expect(updated.reentries).toBe(0);
    expect(updated.addOnTaken).toBe(false);
  });
});

describe('state-machine: applyRebuy (registered -> registered com rebuys++)', () => {
  it('deve incrementar rebuys em 1', () => {
    const t = makeTournament({ status: 'registered', rebuys: 2 });
    const updated = applyRebuy(t);
    expect(updated.rebuys).toBe(3);
  });

  it('deve preservar status=registered', () => {
    const t = makeTournament({ status: 'registered', rebuys: 0 });
    const updated = applyRebuy(t);
    expect(updated.status).toBe('registered');
  });

  it('NAO deve tocar em reentries (rebuy != re-entry)', () => {
    const t = makeTournament({
      status: 'registered',
      rebuys: 1,
      allowsReentry: true,
      reentries: 2,
    });
    const updated = applyRebuy(t);
    expect(updated.reentries).toBe(2);
  });
});

describe('state-machine: applyAddOn (registered -> registered com addOnTaken=true)', () => {
  it('deve setar addOnTaken=true quando guard permite', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
    });
    const updated = applyAddOn(t);
    expect(updated.addOnTaken).toBe(true);
  });

  it('deve preservar status=registered', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
    });
    const updated = applyAddOn(t);
    expect(updated.status).toBe('registered');
  });

  it('deve lancar erro se allowsAddOn=false', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: false,
    });
    expect(() => applyAddOn(t)).toThrow();
  });

  it('deve lancar erro se addOnTaken ja esta true', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: true,
    });
    expect(() => applyAddOn(t)).toThrow();
  });
});

describe('state-machine: applyFinish (registered -> finished com GG)', () => {
  it('deve mudar status de registered para finished', () => {
    const t = makeTournament({ status: 'registered' });
    const updated = applyFinish(t, { prize: '0', position: 150 });
    expect(updated.status).toBe('finished');
  });

  it('deve gravar prize, position, bounty no payload', () => {
    const t = makeTournament({ status: 'registered' });
    const updated = applyFinish(t, { prize: '100', bounty: '25', position: 3 });
    expect(parseFloat(updated.prize)).toBe(100);
    expect(parseFloat(updated.bounty)).toBe(25);
    expect(updated.position).toBe(3);
  });

  it('deve preservar flags Plus/ReA apos finish', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnTaken: true,
      allowsReentry: true,
      maxReentries: 3,
    });
    const updated = applyFinish(t);
    expect(updated.allowsAddOn).toBe(true);
    expect(updated.addOnTaken).toBe(true);
    expect(updated.allowsReentry).toBe(true);
  });
});

describe('state-machine: applyReentry (finished -> registered com reentries++)', () => {
  it('deve mudar status de finished para registered', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
    });
    const updated = applyReentry(t);
    expect(updated.status).toBe('registered');
  });

  it('deve incrementar reentries em 1', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 1,
    });
    const updated = applyReentry(t);
    expect(updated.reentries).toBe(2);
  });

  it('deve resetar endTime ao re-entrar', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      endTime: '2026-04-23T20:00:00Z',
    });
    const updated = applyReentry(t);
    expect(updated.endTime).toBeNull();
  });

  it('deve lancar erro se allowsReentry=false', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: false,
    });
    expect(() => applyReentry(t)).toThrow();
  });

  it('deve lancar erro se reentries>=maxReentries', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 3,
    });
    expect(() => applyReentry(t)).toThrow();
  });

  it('deve permitir re-entry com maxReentries=null (ilimitado)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: null,
      reentries: 50,
    });
    const updated = applyReentry(t);
    expect(updated.reentries).toBe(51);
  });

  it('deve preservar rebuys ao re-entrar (RD-1)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      rebuys: 2,
    });
    const updated = applyReentry(t);
    expect(updated.rebuys).toBe(2);
  });
});

// ===========================================================================
// Acumulacao prize/bounty/position (ADR-014 RD-1)
// ===========================================================================

describe('state-machine: acumulacao em re-entries (RD-1)', () => {
  it('deve preservar prize da tentativa anterior ao re-entrar (v1 frontend nao envia)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      prize: '10.00',
      bounty: '2.00',
      position: 42,
    });
    const updated = applyReentry(t);
    // Decisao C (RD-1): preserva prize/bounty/position (frontend nao envia, backend preserva).
    expect(parseFloat(updated.prize)).toBe(10);
    expect(parseFloat(updated.bounty)).toBe(2);
    expect(updated.position).toBe(42);
  });

  it('deve acumular prize quando explicitamente fornecido (defensivo)', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      prize: '10.00',
    });
    const updated = applyReentry(t, { prize: '50.00' });
    expect(parseFloat(updated.prize)).toBe(60);
  });

  it('deve escolher melhor position (min) em acumulacao', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      position: 42,
    });
    const updated = applyReentry(t, { position: 3 });
    expect(updated.position).toBe(3);
  });

  it('deve escolher melhor position quando tentativa anterior era null', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      position: null,
    });
    const updated = applyReentry(t, { position: 58 });
    expect(updated.position).toBe(58);
  });

  it('deve preservar position existente quando nova e null', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 0,
      position: 42,
    });
    const updated = applyReentry(t, { position: null });
    expect(updated.position).toBe(42);
  });
});

// ===========================================================================
// Integracao com Zod refinements (apos transicoes)
// ===========================================================================

describe('Transicoes resultam em payload valido para Zod', () => {
  it('applyAddOn em torneio valido produz payload aceito por insertSessionTournamentSchema', () => {
    const t = makeTournament({
      status: 'registered',
      allowsAddOn: true,
      addOnCost: '22.00',
      addOnTaken: false,
    });
    const updated = applyAddOn(t);
    const result = insertSessionTournamentSchema.safeParse(updated);
    expect(result.success).toBe(true);
  });

  it('applyReentry em torneio ReA valido produz payload aceito', () => {
    const t = makeTournament({
      status: 'finished',
      allowsReentry: true,
      maxReentries: 3,
      reentries: 1,
    });
    const updated = applyReentry(t);
    const result = insertSessionTournamentSchema.safeParse(updated);
    expect(result.success).toBe(true);
  });

  it('transicao upcoming -> finished pulando registered deve ser proibida no backend', () => {
    // O state machine nao tem transicao direta; applyFinish exige status=registered.
    const t = makeTournament({ status: 'upcoming' });
    expect(() => applyFinish(t)).toThrow();
  });
});
