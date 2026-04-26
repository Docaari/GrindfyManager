import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: helpers `getEffectiveBuyIn`, `getProfit`, `getIndividualROI`
//
// Fontes:
//  - docs/specs/satellite-tickets-management.md (RF-06)
//  - docs/architecture/decisions/036-tickets-effective-buyin.md
//
// Decisao da ADR-036:
//  - effectiveBuyIn = 0 quando enteredViaSatellite=true OU consumedTicketId != null.
//  - profit = prize + bounty - effectiveBuyIn (rake nao considerado v1; bounty so PKO/Mystery).
//  - getIndividualROI retorna null quando effectiveBuyIn === 0; senao % numerico.
//
// O modulo de implementacao pode ficar em `shared/ticketScoring.ts` ou `shared/scoring.ts`.
// O teste tenta o import primario de `shared/ticketScoring.ts` (preferido).
// =============================================================================

import {
  getEffectiveBuyIn,
  getProfit,
  getIndividualROI,
} from '../../../shared/ticketScoring';

// ---------------------------------------------------------------------------
// getEffectiveBuyIn
// ---------------------------------------------------------------------------

describe('getEffectiveBuyIn', () => {
  it('retorna 0 quando consumedTicketId != null', () => {
    expect(getEffectiveBuyIn({
      buyIn: '215',
      type: 'Vanilla',
      consumedTicketId: 'tkt-123',
    } as any)).toBe(0);
  });

  it('retorna 0 quando enteredViaSatellite === true (mesmo sem consumedTicketId)', () => {
    expect(getEffectiveBuyIn({
      buyIn: '215',
      type: 'Vanilla',
      enteredViaSatellite: true,
    } as any)).toBe(0);
  });

  it('retorna 0 quando enteredViaSatellite=true E consumedTicketId preenchido', () => {
    expect(getEffectiveBuyIn({
      buyIn: '215',
      type: 'Vanilla',
      enteredViaSatellite: true,
      consumedTicketId: 'tkt-1',
    } as any)).toBe(0);
  });

  it('retorna parseFloat(buyIn) para Vanilla sem ticket', () => {
    expect(getEffectiveBuyIn({
      buyIn: '215',
      type: 'Vanilla',
      enteredViaSatellite: false,
    } as any)).toBe(215);
  });

  it('retorna parseFloat(buyIn) para PKO sem ticket', () => {
    expect(getEffectiveBuyIn({ buyIn: '50.5', type: 'PKO' } as any)).toBe(50.5);
  });

  it('retorna parseFloat(buyIn) para Mystery sem ticket', () => {
    expect(getEffectiveBuyIn({ buyIn: '109', type: 'Mystery' } as any)).toBe(109);
  });

  it('retorna parseFloat(buyIn) para Satellite (o satelite em si nao vem de ticket)', () => {
    expect(getEffectiveBuyIn({
      buyIn: '11',
      type: 'Satellite',
      enteredViaSatellite: false,
    } as any)).toBe(11);
  });

  it('aceita buyIn como number tambem (nao apenas string Drizzle decimal)', () => {
    expect(getEffectiveBuyIn({ buyIn: 215, type: 'Vanilla' } as any)).toBe(215);
  });

  it('retorna 0 quando buyIn ausente / null', () => {
    expect(getEffectiveBuyIn({ buyIn: null, type: 'Vanilla' } as any)).toBe(0);
    expect(getEffectiveBuyIn({ buyIn: undefined, type: 'Vanilla' } as any)).toBe(0);
  });

  it('retorna number, nunca string', () => {
    const v = getEffectiveBuyIn({ buyIn: '50', type: 'Vanilla' } as any);
    expect(typeof v).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// getProfit
// ---------------------------------------------------------------------------

describe('getProfit - Vanilla (sem bounty)', () => {
  it('profit = prize - buyIn', () => {
    expect(getProfit({
      buyIn: '50', prize: '100', type: 'Vanilla',
    } as any)).toBe(50);
  });

  it('profit negativo quando bust', () => {
    expect(getProfit({
      buyIn: '50', prize: '0', type: 'Vanilla',
    } as any)).toBe(-50);
  });
});

describe('getProfit - PKO (com bounty)', () => {
  it('profit = prize + bounty - buyIn (PKO)', () => {
    expect(getProfit({
      buyIn: '50', prize: '40', bounty: '20', type: 'PKO',
    } as any)).toBe(10);
  });

  it('bounty considerado para PKO mesmo quando prize=0', () => {
    expect(getProfit({
      buyIn: '50', prize: '0', bounty: '30', type: 'PKO',
    } as any)).toBe(-20);
  });
});

describe('getProfit - Mystery (com bounty)', () => {
  it('profit = prize + bounty - buyIn (Mystery)', () => {
    expect(getProfit({
      buyIn: '20', prize: '0', bounty: '100', type: 'Mystery',
    } as any)).toBe(80);
  });
});

describe('getProfit - Satellite (sem bounty)', () => {
  it('bounty IGNORADO em Satellite (campo nao aplicavel)', () => {
    expect(getProfit({
      buyIn: '11', prize: '100', bounty: '50', type: 'Satellite',
    } as any)).toBe(89);
  });
});

describe('getProfit - quando entrou via ticket', () => {
  it('profit = prize - 0 quando enteredViaSatellite=true (Vanilla)', () => {
    expect(getProfit({
      buyIn: '215', prize: '5000', type: 'Vanilla',
      enteredViaSatellite: true,
    } as any)).toBe(5000);
  });

  it('profit = prize + bounty quando enteredViaSatellite=true (PKO)', () => {
    expect(getProfit({
      buyIn: '215', prize: '5000', bounty: '1000', type: 'PKO',
      enteredViaSatellite: true,
    } as any)).toBe(6000);
  });

  it('profit considera consumedTicketId mesmo sem flag enteredViaSatellite', () => {
    expect(getProfit({
      buyIn: '215', prize: '500', type: 'Vanilla',
      consumedTicketId: 'tkt-1',
    } as any)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// getIndividualROI
// ---------------------------------------------------------------------------

describe('getIndividualROI - retorna null quando effectiveBuyIn = 0', () => {
  it('retorna null quando enteredViaSatellite=true', () => {
    expect(getIndividualROI({
      buyIn: '215', prize: '5000', type: 'Vanilla',
      enteredViaSatellite: true,
    } as any)).toBeNull();
  });

  it('retorna null quando consumedTicketId preenchido', () => {
    expect(getIndividualROI({
      buyIn: '215', prize: '500', type: 'Vanilla',
      consumedTicketId: 'tkt-1',
    } as any)).toBeNull();
  });

  it('retorna null quando buyIn ausente', () => {
    expect(getIndividualROI({
      buyIn: null, prize: '500', type: 'Vanilla',
    } as any)).toBeNull();
  });
});

describe('getIndividualROI - retorna percentual numerico quando effectiveBuyIn > 0', () => {
  it('100 buyIn, 200 prize -> ROI 100%', () => {
    expect(getIndividualROI({
      buyIn: '100', prize: '200', type: 'Vanilla',
    } as any)).toBe(100);
  });

  it('100 buyIn, 100 prize -> ROI 0%', () => {
    expect(getIndividualROI({
      buyIn: '100', prize: '100', type: 'Vanilla',
    } as any)).toBe(0);
  });

  it('100 buyIn, 0 prize -> ROI -100%', () => {
    expect(getIndividualROI({
      buyIn: '100', prize: '0', type: 'Vanilla',
    } as any)).toBe(-100);
  });

  it('PKO: ROI considera bounty', () => {
    // 100 buyIn, prize=80, bounty=70 -> profit=50, ROI=50%
    expect(getIndividualROI({
      buyIn: '100', prize: '80', bounty: '70', type: 'PKO',
    } as any)).toBe(50);
  });

  it('retorna number quando aplicavel', () => {
    const v = getIndividualROI({
      buyIn: '100', prize: '200', type: 'Vanilla',
    } as any);
    expect(typeof v).toBe('number');
  });
});
