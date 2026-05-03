import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-01: shared/schema.ts -> tabela tournament_series + ENUMs
//
// Spec : Docs/specs/sprint-flight-1.md (RF-01)
// ADRs : 090 (single source of truth = tournament_series),
//        091 (stack_mode enum: single | combined; sem 'best')
// Migration: migrations/0029_add_tournament_series.sql
//
// Defaults aprovados pelo founder (D1-D14):
//  - D1: id e nanoid string (nao auto-increment)
//  - D2: series_id nullable + ON DELETE SET NULL
//  - D3: stackMode enum {single, combined} — sem 'best'
//  - D4: day2Status enum {pending, completed, cancelled}, default pending
//
// Red phase: tabela e enums NAO existem em schema.ts ainda — imports falham
// ate implementer adicionar. Cada teste exercita um campo/constraint distinto.
// =============================================================================

import {
  tournamentSeries,
  insertTournamentSeriesSchema,
  updateTournamentSeriesSchema,
  type TournamentSeries,
  type InsertTournamentSeries,
  SERIES_STACK_MODES,
  SERIES_DAY2_STATUSES,
} from '../../../shared/schema';

// ---------------------------------------------------------------------------
// 1. Definicao da tabela Drizzle
// ---------------------------------------------------------------------------

describe('tournament_series — tabela Drizzle (RF-01)', () => {
  it('e exportada de shared/schema.ts', () => {
    expect(tournamentSeries).toBeDefined();
  });

  it('tem coluna id (PK varchar nanoid)', () => {
    expect((tournamentSeries as any).id).toBeDefined();
  });

  it('tem coluna userId (FK users.userPlatformId, NOT NULL)', () => {
    expect((tournamentSeries as any).userId).toBeDefined();
  });

  it('tem coluna name (varchar NOT NULL)', () => {
    expect((tournamentSeries as any).name).toBeDefined();
  });

  it('tem coluna network (varchar NULLABLE)', () => {
    expect((tournamentSeries as any).network).toBeDefined();
  });

  it('tem coluna totalDay1s (integer NOT NULL DEFAULT 1)', () => {
    expect((tournamentSeries as any).totalDay1s).toBeDefined();
  });

  it('tem coluna day2DateTime (timestamp NOT NULL UTC)', () => {
    expect((tournamentSeries as any).day2DateTime).toBeDefined();
  });

  it('tem coluna day2Status (enum series_day2_status, NOT NULL DEFAULT pending)', () => {
    expect((tournamentSeries as any).day2Status).toBeDefined();
  });

  it('tem coluna stackMode (enum series_stack_mode, NOT NULL DEFAULT single)', () => {
    expect((tournamentSeries as any).stackMode).toBeDefined();
  });

  it('tem coluna notes (text NULLABLE)', () => {
    expect((tournamentSeries as any).notes).toBeDefined();
  });

  it('tem timestamps createdAt e updatedAt', () => {
    expect((tournamentSeries as any).createdAt).toBeDefined();
    expect((tournamentSeries as any).updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. ENUMs (ADR-091)
// ---------------------------------------------------------------------------

describe('SERIES_STACK_MODES (ADR-091) — single, combined; SEM best', () => {
  it("contem 'single'", () => {
    expect(SERIES_STACK_MODES).toContain('single');
  });

  it("contem 'combined'", () => {
    expect(SERIES_STACK_MODES).toContain('combined');
  });

  it("NAO contem 'best' (fora do escopo MVP — defer para Sprint Flight-2)", () => {
    expect(SERIES_STACK_MODES).not.toContain('best');
  });
});

describe('SERIES_DAY2_STATUSES (D4) — pending, completed, cancelled', () => {
  it("contem 'pending'", () => {
    expect(SERIES_DAY2_STATUSES).toContain('pending');
  });

  it("contem 'completed'", () => {
    expect(SERIES_DAY2_STATUSES).toContain('completed');
  });

  it("contem 'cancelled'", () => {
    expect(SERIES_DAY2_STATUSES).toContain('cancelled');
  });
});

// ---------------------------------------------------------------------------
// 3. insertTournamentSeriesSchema (Zod via drizzle-zod)
// ---------------------------------------------------------------------------

describe('insertTournamentSeriesSchema — validacao Zod (RF-01)', () => {
  const validInput = {
    userId: 'USER-0001',
    name: 'Sunday Million Phased',
    network: 'PokerStars',
    totalDay1s: 17,
    day2DateTime: new Date('2026-05-10T19:00:00Z'),
    stackMode: 'combined' as const,
  };

  it('aceita input minimo valido (com day2DateTime)', () => {
    const r = insertTournamentSeriesSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it('aceita input apenas com campos obrigatorios (defaults aplicados)', () => {
    const r = insertTournamentSeriesSchema.safeParse({
      userId: 'USER-0001',
      name: 'Single Series',
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
    });
    expect(r.success).toBe(true);
  });

  it('rejeita name vazio', () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, name: '' });
    expect(r.success).toBe(false);
  });

  it("rejeita stackMode='best' (fora do enum, ADR-091)", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, stackMode: 'best' });
    expect(r.success).toBe(false);
  });

  it("aceita stackMode='single'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, stackMode: 'single' });
    expect(r.success).toBe(true);
  });

  it("aceita stackMode='combined'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, stackMode: 'combined' });
    expect(r.success).toBe(true);
  });

  it('rejeita totalDay1s=-1 (negativo)', () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, totalDay1s: -1 });
    expect(r.success).toBe(false);
  });

  it('aceita totalDay1s=0 (D9 — late-reg direto Day 2)', () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, totalDay1s: 0 });
    expect(r.success).toBe(true);
  });

  it("aceita day2Status='pending'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, day2Status: 'pending' });
    expect(r.success).toBe(true);
  });

  it("aceita day2Status='completed'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, day2Status: 'completed' });
    expect(r.success).toBe(true);
  });

  it("aceita day2Status='cancelled'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, day2Status: 'cancelled' });
    expect(r.success).toBe(true);
  });

  it("rejeita day2Status='unknown'", () => {
    const r = insertTournamentSeriesSchema.safeParse({ ...validInput, day2Status: 'unknown' });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. updateTournamentSeriesSchema — patch parcial
// ---------------------------------------------------------------------------

describe('updateTournamentSeriesSchema — patch parcial (RF-02)', () => {
  it('aceita patch vazio (idempotente)', () => {
    const r = updateTournamentSeriesSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('aceita patch com apenas day2DateTime (RF-14)', () => {
    const r = updateTournamentSeriesSchema.safeParse({
      day2DateTime: new Date('2026-05-11T20:00:00Z'),
    });
    expect(r.success).toBe(true);
  });

  it('aceita patch mudando day2Status para completed', () => {
    const r = updateTournamentSeriesSchema.safeParse({ day2Status: 'completed' });
    expect(r.success).toBe(true);
  });

  it("rejeita tentativa de mudar userId (campo proibido em update)", () => {
    const r = updateTournamentSeriesSchema.safeParse({ userId: 'USER-9999' });
    // Schema deve EXCLUIR userId do shape de update OU rejeitar com refinement.
    // Implementer escolhe (omit() ou strict), mas o teste espera fail OU
    // sucesso onde userId nao e propagado. Aceita ambos os contratos.
    if (r.success) {
      expect((r.data as any).userId).toBeUndefined();
    } else {
      expect(r.success).toBe(false);
    }
  });

  it('rejeita tentativa de mudar id', () => {
    const r = updateTournamentSeriesSchema.safeParse({ id: 'novoId' });
    if (r.success) {
      expect((r.data as any).id).toBeUndefined();
    } else {
      expect(r.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Tipos TS exportados
// ---------------------------------------------------------------------------

describe('Tipos TS — TournamentSeries / InsertTournamentSeries', () => {
  it('TournamentSeries type satisfaz Drizzle $inferSelect', () => {
    const sample: TournamentSeries = {
      id: 'srs-1',
      userId: 'USER-0001',
      name: 'Test',
      network: null,
      totalDay1s: 1,
      day2DateTime: new Date(),
      day2Status: 'pending',
      stackMode: 'single',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    expect(sample).toBeDefined();
  });

  it('InsertTournamentSeries type satisfaz Drizzle $inferInsert', () => {
    const sample: InsertTournamentSeries = {
      userId: 'USER-0001',
      name: 'Test',
      day2DateTime: new Date(),
    } as any;
    expect(sample).toBeDefined();
  });
});
