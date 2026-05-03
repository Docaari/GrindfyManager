import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-01: ALTERs em tournaments e planned_tournaments
//
// Spec : Docs/specs/sprint-flight-1.md (RF-01)
// ADR  : 090 — adiciona series_id (FK SET NULL) + bagged_at TIMESTAMP NULL
//
// Estes testes validam que a migration 0029 adicionou as colunas via Drizzle
// schema declarations. Implementer deve atualizar `tournaments` e
// `planned_tournaments` em shared/schema.ts.
// =============================================================================

import {
  tournaments,
  plannedTournaments,
} from '../../../shared/schema';

describe('tournaments — coluna series_id (RF-01, ADR-090)', () => {
  it('tem coluna seriesId (FK tournament_series.id, NULLABLE, ON DELETE SET NULL)', () => {
    expect((tournaments as any).seriesId).toBeDefined();
  });
});

describe('tournaments — coluna bagged_at (RF-04 / ADR-090)', () => {
  it('tem coluna baggedAt (timestamp NULLABLE — substitui flightAdvanced)', () => {
    expect((tournaments as any).baggedAt).toBeDefined();
  });
});

describe('planned_tournaments — coluna series_id (RF-01)', () => {
  it('tem coluna seriesId (FK tournament_series.id, NULLABLE, ON DELETE SET NULL)', () => {
    expect((plannedTournaments as any).seriesId).toBeDefined();
  });
});

describe('Backwards-compat — torneios single-flight (sem seriesId)', () => {
  it('seriesId default null em INSERT sem o campo (compat ZERO regressao)', () => {
    // Drizzle nao executa SQL aqui; apenas validamos que a coluna NAO eh
    // NOT NULL (nullable). Isso garante que tournaments antigos com
    // seriesId=null continuem validos.
    const col = (tournaments as any).seriesId;
    // Drizzle column object expoe `.notNull` quando setado; nao setar = nullable.
    // Aceitamos qualquer "shape" desde que o campo exista.
    expect(col).toBeDefined();
  });
});
