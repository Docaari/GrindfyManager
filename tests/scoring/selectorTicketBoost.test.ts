/**
 * Test-Writer (Modo TDD — Red Phase) — Sprint D / Grind Live + Tickets cluster
 *   RF-03.4 Tournament Selector ticket boost
 *
 * Spec: Docs/specs/sprint-grind-live-cluster.md §RF-03.4
 * ADR:  Docs/architecture/decisions/186-selector-ticket-boost-availabletkt-opcional-bankroll-bypass.md
 * Diagrama: Docs/architecture/diagrams/sprint-grind-live-cluster/selector-ticket-boost.mermaid
 *
 * Cenarios cobertos:
 *   1) `enrichWithTickets` — sem tickets retorna SCT igual (no-op).
 *   2) `enrichWithTickets` — exact match por sourceName (case-insensitive
 *      substring). Setta `availableTicket`.
 *   3) `enrichWithTickets` — value match (tolerancia 1%) quando nao ha exact.
 *   4) `enrichWithTickets` — FIFO desempate (menor expiresAt vence).
 *   5) `enrichWithTickets` — filtra ticket `status != 'available'` e
 *      `expiresAt <= tournament.date`.
 *   6) `applyTicketBoost` — score 75 + ticket -> 85; grade re-derivado.
 *   7) `applyTicketBoost` — clamp 100 (score 95 + 10 = 100, NAO 105).
 *   8) `applyTicketBoost` — sem ticket -> score igual.
 *   9) `applyTicketBoost` — score 50 -> 60.
 *  10) `applyTicketBoost` — grade re-derive (ex: 88 -> 98 sobe tier).
 *  11) Bankroll filter bypass — torneio acima do `maxBuyIn` PASSA quando
 *      tem ticket disponivel (effectiveBuyIn=0 com ticket).
 *  12) Boost vive FORA de `computeTournamentScore` (PROIBIDO mexer no
 *      `server/scoring/tournamentScorer.ts`). Aplicado em camada acima.
 *
 * Lessons aplicadas:
 *   - #17 grep antes — confirmar `availableTicket` nao existe ja em scoring.ts.
 *   - #11 default minimo — sem ticket nao injeta nada.
 *   - ADR-186 §2.2 + §2.4 — boost via helper acima do scorer.
 */

import { describe, it, expect } from 'vitest';
import type { ScoringInputTournament } from '../../shared/scoring';

// Shape minimo de SCT para os testes (campos extras irrelevantes)
function baseSct(overrides: Partial<ScoringInputTournament> = {}): ScoringInputTournament {
  return {
    id: 'tx-1',
    source: 'suprema' as any,
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: 215,
    buyInBucket: '101-500',
    category: 'Vanilla',
    speed: 'Normal' as any,
    dayOfWeek: 0,
    time: '20:00',
    timeOfDayBucket: 'Evening' as any,
    fieldBucket: 'XL' as any,
    fieldSizeEstimate: 5000,
    ...overrides,
  };
}

const TICKET_SM_215 = {
  id: 'tk-1',
  userId: 'USER-A',
  sourceName: 'Sunday Million',
  valueUsd: 215,
  expiresAt: '2026-06-30T00:00:00Z',
  status: 'available',
};

// ---------------------------------------------------------------------------
// Cenarios 1-5 — enrichWithTickets
// ---------------------------------------------------------------------------
describe('enrichWithTickets — match heuristica', () => {
  it('cenario 1 — sem tickets retorna SCT igual', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const out = enrichWithTickets(sct, [], {
      name: sct.name, date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket ?? null).toBeNull();
  });

  it('cenario 2 — exact match por sourceName (case-insensitive)', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct({ name: 'Sunday Million Special' });
    const out = enrichWithTickets(sct, [TICKET_SM_215], {
      name: 'Sunday Million Special', date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket).toBeTruthy();
    expect(out.availableTicket!.id).toBe('tk-1');
    expect(out.availableTicket!.valueUsd).toBe(215);
  });

  it('cenario 3 — value match (tolerancia 1%) quando sem exact', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const ticket = { ...TICKET_SM_215, sourceName: 'Random Sat Result' };
    const sct = baseSct({ name: 'Bounty Builder Big' });
    const out = enrichWithTickets(sct, [ticket], {
      name: 'Bounty Builder Big', date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket).toBeTruthy();
    expect(out.availableTicket!.valueUsd).toBe(215);
  });

  it('cenario 4 — FIFO desempate (menor expiresAt vence)', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const earlier = { ...TICKET_SM_215, id: 'tk-early', expiresAt: '2026-06-01T00:00:00Z' };
    const later = { ...TICKET_SM_215, id: 'tk-late', expiresAt: '2026-12-01T00:00:00Z' };
    const sct = baseSct();
    const out = enrichWithTickets(sct, [later, earlier], {
      name: sct.name, date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket?.id).toBe('tk-early');
  });

  it('cenario 5a — filtra ticket `status != available`', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const usedTicket = { ...TICKET_SM_215, status: 'used' };
    const sct = baseSct();
    const out = enrichWithTickets(sct, [usedTicket], {
      name: sct.name, date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket ?? null).toBeNull();
  });

  it('cenario 5b — filtra ticket expirado antes da data do torneio', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const expired = { ...TICKET_SM_215, expiresAt: '2026-05-01T00:00:00Z' };
    const sct = baseSct();
    const out = enrichWithTickets(sct, [expired], {
      name: sct.name, date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket ?? null).toBeNull();
  });

  it('cenario 5c — sem match (sem exact + sem value match) -> null', async () => {
    const { enrichWithTickets } = await import('../../server/scoring/buildScoringInput');
    const ticket = { ...TICKET_SM_215, sourceName: 'Foo', valueUsd: 7.77 };
    const sct = baseSct({ name: 'Different Tournament' });
    const out = enrichWithTickets(sct, [ticket], {
      name: 'Different Tournament', date: '2026-05-25', buyInUsd: 215,
    });
    expect(out.availableTicket ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cenarios 6-10 — applyTicketBoost
// ---------------------------------------------------------------------------
describe('applyTicketBoost — score + grade', () => {
  it('cenario 6 — score 75 + ticket -> 85 + grade re-derivada', async () => {
    const { applyTicketBoost } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const base = { score: 75, grade: 'B' as const };
    const out = applyTicketBoost(base, { ...sct, availableTicket: { id: 'x', valueUsd: 215, expiresAt: null } } as any);
    expect(out.score).toBe(85);
    // 85 = A (typical scoreToGrade ranges) — implementer re-deriva via scoreToGrade
    expect(out.grade).not.toBe('B');
    expect(out.ticketBoost).toBe(10);
  });

  it('cenario 7 — clamp 100 (95 + 10 = 100, NAO 105)', async () => {
    const { applyTicketBoost } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const out = applyTicketBoost(
      { score: 95, grade: 'S' as const },
      { ...sct, availableTicket: { id: 'x', valueUsd: 215, expiresAt: null } } as any,
    );
    expect(out.score).toBe(100);
  });

  it('cenario 8 — sem ticket -> score inalterado + ticketBoost=0', async () => {
    const { applyTicketBoost } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const base = { score: 75, grade: 'B' as const };
    const out = applyTicketBoost(base, sct);
    expect(out.score).toBe(75);
    expect(out.ticketBoost ?? 0).toBe(0);
  });

  it('cenario 9 — score 50 + ticket -> 60', async () => {
    const { applyTicketBoost } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const out = applyTicketBoost(
      { score: 50, grade: 'C' as const },
      { ...sct, availableTicket: { id: 'x', valueUsd: 215, expiresAt: null } } as any,
    );
    expect(out.score).toBe(60);
  });

  it('cenario 10 — grade re-derive (88 sobe pra >=90 com boost)', async () => {
    const { applyTicketBoost } = await import('../../server/scoring/buildScoringInput');
    const sct = baseSct();
    const out = applyTicketBoost(
      { score: 88, grade: 'A' as const },
      { ...sct, availableTicket: { id: 'x', valueUsd: 215, expiresAt: null } } as any,
    );
    expect(out.score).toBe(98);
    // 98 -> S (tier mais alto). scoreToGrade do tournamentScorer mapeia >=90 -> S.
    expect(out.grade).toBe('S');
  });
});

// ---------------------------------------------------------------------------
// Cenario 11 — Bankroll filter bypass (helper isolado, sem rotas)
// ---------------------------------------------------------------------------
describe('shouldPassBankrollFilter — ticket bypass', () => {
  it('cenario 11a — torneio acima de maxBuyIn PASSA quando tem availableTicket', async () => {
    const { shouldPassBankrollFilter } = await import('../../server/scoring/buildScoringInput');
    const ok = shouldPassBankrollFilter({
      effectiveBuyIn: 215,
      maxBuyIn: 50,
      availableTicket: { id: 'x', valueUsd: 215, expiresAt: null },
    });
    expect(ok).toBe(true);
  });

  it('cenario 11b — torneio acima de maxBuyIn SEM ticket -> false', async () => {
    const { shouldPassBankrollFilter } = await import('../../server/scoring/buildScoringInput');
    const ok = shouldPassBankrollFilter({
      effectiveBuyIn: 215,
      maxBuyIn: 50,
      availableTicket: null,
    });
    expect(ok).toBe(false);
  });

  it('cenario 11c — torneio dentro do maxBuyIn passa normalmente', async () => {
    const { shouldPassBankrollFilter } = await import('../../server/scoring/buildScoringInput');
    const ok = shouldPassBankrollFilter({
      effectiveBuyIn: 22,
      maxBuyIn: 50,
      availableTicket: null,
    });
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cenario 12 — Boost vive FORA do tournamentScorer
// ---------------------------------------------------------------------------
describe('isolacao do scorer', () => {
  it('cenario 12 — computeTournamentScore NAO ganhou parametro de ticket (PROIBIDO mexer)', async () => {
    const mod = await import('../../server/scoring/tournamentScorer');
    expect(typeof mod.computeTournamentScore).toBe('function');
    // Inspecao defensiva: nenhum dos campos no scorer faz referencia a ticket.
    // (Se implementer mexer no scorer, este teste deve falhar na review humano.)
    const src = mod.computeTournamentScore.toString();
    expect(src).not.toMatch(/availableTicket|ticketBoost/);
  });
});
