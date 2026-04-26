import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts -> tabela tickets (RF-01)
//   + insertTicketSchema (refinements Zod)
//   + ALTERs em session_tournaments e tournaments (RF-01 / data-model)
//
// Fontes:
//  - docs/specs/satellite-tickets-management.md (RF-01)
//  - docs/architecture/data-model/tickets.md
//  - docs/architecture/decisions/037-tickets-table-vs-jsonb.md
//
// Defaults aprovados pelo dev (incorporados nos testes):
//  - 1 satelite = 1 ticket por player (unique parcial em sourceTournamentId
//    e sourceSessionTournamentId quando source='satellite_result').
//  - Coluna `notifiedExpiringAt` em tickets (dedupe da notificacao 48h).
// =============================================================================

import {
  tickets,
  sessionTournaments,
  tournaments,
  insertTicketSchema,
  type Ticket,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// 1. Tabela `tickets` — colunas + index/constraints declarados via Drizzle
// ---------------------------------------------------------------------------

describe('tickets - definicao da tabela Drizzle', () => {
  it('e exportada de shared/schema.ts', () => {
    expect(tickets).toBeDefined();
  });

  it('tem coluna id (PK)', () => {
    expect((tickets as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId, NOT NULL)', () => {
    expect((tickets as any).userId).toBeDefined();
  });

  it('tem coluna sourceTournamentId (FK tournaments.id, NULLABLE)', () => {
    expect((tickets as any).sourceTournamentId).toBeDefined();
  });

  it('tem coluna sourceSessionTournamentId (FK session_tournaments.id, NULLABLE)', () => {
    expect((tickets as any).sourceSessionTournamentId).toBeDefined();
  });

  it('tem coluna targetTemplateId (FK tournament_templates.id, NULLABLE)', () => {
    expect((tickets as any).targetTemplateId).toBeDefined();
  });

  it('tem coluna targetName (varchar, NULLABLE)', () => {
    expect((tickets as any).targetName).toBeDefined();
  });

  it('tem coluna targetSite (varchar, NULLABLE)', () => {
    expect((tickets as any).targetSite).toBeDefined();
  });

  it('tem coluna ticketValueUSD (decimal NOT NULL)', () => {
    expect((tickets as any).ticketValueUSD).toBeDefined();
  });

  it('tem coluna extraCashUSD (decimal, NULLABLE)', () => {
    expect((tickets as any).extraCashUSD).toBeDefined();
  });

  it('tem coluna status (varchar NOT NULL, default available)', () => {
    expect((tickets as any).status).toBeDefined();
  });

  it('tem coluna usedInTournamentId (FK tournaments.id, NULLABLE)', () => {
    expect((tickets as any).usedInTournamentId).toBeDefined();
  });

  it('tem coluna usedInSessionTournamentId (FK session_tournaments.id, NULLABLE)', () => {
    expect((tickets as any).usedInSessionTournamentId).toBeDefined();
  });

  it('tem coluna earnedAt (timestamp NOT NULL)', () => {
    expect((tickets as any).earnedAt).toBeDefined();
  });

  it('tem coluna expiresAt (timestamp NULLABLE)', () => {
    expect((tickets as any).expiresAt).toBeDefined();
  });

  it('tem coluna usedAt (timestamp NULLABLE)', () => {
    expect((tickets as any).usedAt).toBeDefined();
  });

  it('tem coluna cancelledAt (timestamp NULLABLE)', () => {
    expect((tickets as any).cancelledAt).toBeDefined();
  });

  it('tem coluna note (text NULLABLE)', () => {
    expect((tickets as any).note).toBeDefined();
  });

  it('tem coluna source (varchar NOT NULL)', () => {
    expect((tickets as any).source).toBeDefined();
  });

  it('tem coluna notifiedExpiringAt (timestamp NULLABLE) para dedupe da notificacao 48h', () => {
    // Default aprovado pelo dev — Sprint 1 ja entra com a coluna no schema
    expect((tickets as any).notifiedExpiringAt).toBeDefined();
  });

  it('tem timestamps createdAt e updatedAt', () => {
    expect((tickets as any).createdAt).toBeDefined();
    expect((tickets as any).updatedAt).toBeDefined();
  });

  it('reservados v2: transferredAt e transferredToUserId existem como colunas', () => {
    expect((tickets as any).transferredAt).toBeDefined();
    expect((tickets as any).transferredToUserId).toBeDefined();
  });

  it('exporta tipo TS Ticket via $inferSelect', () => {
    // type-only check: presenca de Ticket como tipo sera validada em compile-time.
    // Em runtime, garantimos pelo menos que o tipo nao quebra import.
    const _t: Ticket | null = null;
    expect(_t).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. ALTERs em session_tournaments (RF-01 + data-model)
// ---------------------------------------------------------------------------

describe('session_tournaments - colunas novas para suporte a tickets', () => {
  it('tem coluna enteredViaSatellite (boolean default false)', () => {
    expect((sessionTournaments as any).enteredViaSatellite).toBeDefined();
  });

  it('tem coluna consumedTicketId (FK tickets.id, NULLABLE)', () => {
    expect((sessionTournaments as any).consumedTicketId).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. ALTER em tournaments (RF-01 + data-model)
// ---------------------------------------------------------------------------

describe('tournaments - colunas novas para suporte a tickets', () => {
  it('tem coluna consumedTicketId (FK tickets.id, NULLABLE)', () => {
    expect((tournaments as any).consumedTicketId).toBeDefined();
  });

  it('mantem coluna ja existente enteredViaSatellite', () => {
    expect((tournaments as any).enteredViaSatellite).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. insertTicketSchema — Zod refinements
// ---------------------------------------------------------------------------

const baseValid = {
  userId: 'USER-0001',
  ticketValueUSD: '215',
  source: 'manual' as const,
  targetName: 'WSOP Main Event Online',
  targetSite: 'GG',
};

describe('insertTicketSchema - happy paths', () => {
  it('aceita ticket avulso (manual) com targetName e ticketValueUSD > 0', () => {
    const r = insertTicketSchema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });

  it('aceita ticket de satellite_result com sourceSessionTournamentId', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      source: 'satellite_result',
      sourceSessionTournamentId: 'st-123',
      targetTemplateId: 'tpl-1',
    });
    expect(r.success).toBe(true);
  });

  it('aceita ticket com targetTemplateId apenas (sem targetName)', () => {
    const r = insertTicketSchema.safeParse({
      userId: 'USER-0001',
      ticketValueUSD: '50',
      source: 'manual',
      targetTemplateId: 'tpl-WSOP',
    });
    expect(r.success).toBe(true);
  });

  it('aceita extraCashUSD = 0', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, extraCashUSD: '0' });
    expect(r.success).toBe(true);
  });

  it('aceita extraCashUSD > 0', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, extraCashUSD: '30' });
    expect(r.success).toBe(true);
  });

  it('aceita expiresAt no futuro (>earnedAt)', () => {
    const earned = new Date('2026-01-01T00:00:00Z');
    const expires = new Date('2026-01-08T00:00:00Z');
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      earnedAt: earned,
      expiresAt: expires,
    });
    expect(r.success).toBe(true);
  });
});

describe('insertTicketSchema - Z4 (ticketValueUSD > 0)', () => {
  it('rejeita ticketValueUSD = 0', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, ticketValueUSD: '0' });
    expect(r.success).toBe(false);
  });

  it('rejeita ticketValueUSD negativo', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, ticketValueUSD: '-10' });
    expect(r.success).toBe(false);
  });

  it('rejeita ticketValueUSD ausente', () => {
    const r = insertTicketSchema.safeParse({
      userId: 'USER-0001',
      source: 'manual',
      targetName: 'X',
    } as any);
    expect(r.success).toBe(false);
  });
});

describe('insertTicketSchema - Z1 (pelo menos um target)', () => {
  it('rejeita sem targetTemplateId E sem targetName', () => {
    const r = insertTicketSchema.safeParse({
      userId: 'USER-0001',
      ticketValueUSD: '215',
      source: 'manual',
    } as any);
    expect(r.success).toBe(false);
  });

  it('aceita apenas targetName preenchido', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      targetTemplateId: undefined,
    } as any);
    expect(r.success).toBe(true);
  });

  it('aceita apenas targetTemplateId preenchido', () => {
    const r = insertTicketSchema.safeParse({
      userId: 'USER-0001',
      ticketValueUSD: '215',
      source: 'manual',
      targetTemplateId: 'tpl-1',
    });
    expect(r.success).toBe(true);
  });
});

describe('insertTicketSchema - Z5 (expiresAt > earnedAt)', () => {
  it('rejeita expiresAt < earnedAt', () => {
    const earned = new Date('2026-01-08T00:00:00Z');
    const expires = new Date('2026-01-01T00:00:00Z');
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      earnedAt: earned,
      expiresAt: expires,
    });
    expect(r.success).toBe(false);
  });

  it('rejeita expiresAt == earnedAt', () => {
    const earned = new Date('2026-01-01T00:00:00Z');
    const expires = new Date('2026-01-01T00:00:00Z');
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      earnedAt: earned,
      expiresAt: expires,
    });
    expect(r.success).toBe(false);
  });

  it('aceita expiresAt nulo / undefined (nao expira)', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, expiresAt: null });
    expect(r.success).toBe(true);
  });
});

describe('insertTicketSchema - status enum', () => {
  it('aceita status available', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, status: 'available' });
    expect(r.success).toBe(true);
  });

  it('aceita status used', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'used',
      usedInTournamentId: 't-1',
      usedAt: new Date('2026-01-01T12:00:00Z'),
    });
    expect(r.success).toBe(true);
  });

  it('aceita status expired', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, status: 'expired' });
    expect(r.success).toBe(true);
  });

  it('aceita status cancelled (com cancelledAt)', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'cancelled',
      cancelledAt: new Date('2026-01-01T12:00:00Z'),
    });
    expect(r.success).toBe(true);
  });

  it('rejeita status invalido', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, status: 'pending' });
    expect(r.success).toBe(false);
  });
});

describe('insertTicketSchema - source enum', () => {
  it('aceita source manual', () => {
    expect(insertTicketSchema.safeParse({ ...baseValid, source: 'manual' }).success).toBe(true);
  });

  it('aceita source satellite_result', () => {
    expect(insertTicketSchema.safeParse({
      ...baseValid,
      source: 'satellite_result',
      sourceSessionTournamentId: 'st-1',
    }).success).toBe(true);
  });

  it('rejeita source invalido (e.g. csv_import nao habilitado v1)', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, source: 'foo' });
    expect(r.success).toBe(false);
  });
});

describe('insertTicketSchema - Z2 (XOR usedInTournamentId vs usedInSessionTournamentId quando status=used)', () => {
  it('rejeita ambos preenchidos quando status=used', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'used',
      usedInTournamentId: 't-1',
      usedInSessionTournamentId: 'st-1',
      usedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita status=used sem nenhum dos dois preenchido', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'used',
      usedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });

  it('aceita status=used com apenas usedInTournamentId', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'used',
      usedInTournamentId: 't-1',
      usedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('aceita status=used com apenas usedInSessionTournamentId', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      status: 'used',
      usedInSessionTournamentId: 'st-1',
      usedAt: new Date(),
    });
    expect(r.success).toBe(true);
  });
});

describe('insertTicketSchema - Z7 (consistencia source vs source ids)', () => {
  it('source=manual rejeita sourceTournamentId preenchido', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      source: 'manual',
      sourceTournamentId: 't-1',
    });
    expect(r.success).toBe(false);
  });

  it('source=manual rejeita sourceSessionTournamentId preenchido', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      source: 'manual',
      sourceSessionTournamentId: 'st-1',
    });
    expect(r.success).toBe(false);
  });

  it('source=satellite_result exige pelo menos um source id', () => {
    const r = insertTicketSchema.safeParse({
      ...baseValid,
      source: 'satellite_result',
    });
    expect(r.success).toBe(false);
  });
});

describe('insertTicketSchema - extraCashUSD nao-negativo', () => {
  it('rejeita extraCashUSD negativo', () => {
    const r = insertTicketSchema.safeParse({ ...baseValid, extraCashUSD: '-1' });
    expect(r.success).toBe(false);
  });

  it('aceita extraCashUSD null / undefined', () => {
    expect(insertTicketSchema.safeParse({ ...baseValid, extraCashUSD: null }).success).toBe(true);
    expect(insertTicketSchema.safeParse({ ...baseValid }).success).toBe(true);
  });
});
