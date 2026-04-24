import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts — tabela tournament_selector_logs (RF-07)
//
// Spec da tabela (data-model.mermaid):
//   id                    varchar (nanoid) PK
//   userId                varchar FK users.userPlatformId
//   eventType             varchar  ('view' | 'add_to_grid')
//   tournamentExternalId  varchar nullable
//   score                 integer nullable
//   grade                 varchar(1) nullable
//   confidence            varchar nullable
//   metadata              jsonb nullable
//   createdAt             timestamp default now()
//
// Indices: (userId, createdAt DESC), (eventType, createdAt DESC)
//
// Decisoes Q9, Q10:
//   - "view" loga so contagem + filtros minimos
//   - "add_to_grid" loga snapshot completo dos signals em metadata
//   - sem TTL (cresce naturalmente)
// =============================================================================

import {
  tournamentSelectorLogs,
  insertTournamentSelectorLogSchema,
} from '../../../shared/schema';

describe('tournamentSelectorLogs - definicao de tabela Drizzle', () => {
  it('deve estar exportado do shared/schema.ts', () => {
    expect(tournamentSelectorLogs).toBeDefined();
  });

  it('tem a coluna id (PK)', () => {
    expect((tournamentSelectorLogs as any).id).toBeDefined();
  });

  it('tem userId (FK users.userPlatformId)', () => {
    expect((tournamentSelectorLogs as any).userId).toBeDefined();
  });

  it('tem eventType', () => {
    expect((tournamentSelectorLogs as any).eventType).toBeDefined();
  });

  it('tem tournamentExternalId (nullable)', () => {
    expect((tournamentSelectorLogs as any).tournamentExternalId).toBeDefined();
  });

  it('tem score (nullable integer)', () => {
    expect((tournamentSelectorLogs as any).score).toBeDefined();
  });

  it('tem grade (nullable varchar 1)', () => {
    expect((tournamentSelectorLogs as any).grade).toBeDefined();
  });

  it('tem confidence (nullable)', () => {
    expect((tournamentSelectorLogs as any).confidence).toBeDefined();
  });

  it('tem metadata (jsonb nullable)', () => {
    expect((tournamentSelectorLogs as any).metadata).toBeDefined();
  });

  it('tem createdAt', () => {
    expect((tournamentSelectorLogs as any).createdAt).toBeDefined();
  });
});

describe('insertTournamentSelectorLogSchema (Zod)', () => {
  it('deve estar exportado', () => {
    expect(insertTournamentSelectorLogSchema).toBeDefined();
  });

  it('aceita view minimo (sem snapshot)', () => {
    const data = {
      userId: 'USER-0001',
      eventType: 'view',
      metadata: { source: 'suprema,library', filtersApplied: { minScore: 0 } },
    };
    const r = insertTournamentSelectorLogSchema.safeParse(data);
    expect(r.success).toBe(true);
  });

  it('aceita add_to_grid completo (Q9: snapshot completo)', () => {
    const data = {
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      tournamentExternalId: 'suprema-12345',
      score: 87,
      grade: 'S',
      confidence: 'high',
      metadata: {
        signals: { siteRoi: { value: 14.2, sample: 312, weight: 0.2, score: 76 } },
        filtersApplied: { sources: 'suprema,library', minScore: 0 },
        bankrollOk: true,
      },
    };
    const r = insertTournamentSelectorLogSchema.safeParse(data);
    expect(r.success).toBe(true);
  });

  it('rejeita eventType invalido', () => {
    const r = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'invalid_type',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita falta de userId', () => {
    const r = insertTournamentSelectorLogSchema.safeParse({ eventType: 'view' });
    expect(r.success).toBe(false);
  });

  it('aceita view sem score/grade/confidence (sao opcionais)', () => {
    const r = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'view',
    });
    expect(r.success).toBe(true);
  });

  it('grade aceita apenas S/A/B/C/D', () => {
    const ok = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      grade: 'S',
    });
    expect(ok.success).toBe(true);

    const ko = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      grade: 'X',
    });
    expect(ko.success).toBe(false);
  });

  it('score deve ser inteiro 0-100', () => {
    const ok = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      score: 87,
    });
    expect(ok.success).toBe(true);

    const ko1 = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      score: 150,
    });
    expect(ko1.success).toBe(false);

    const ko2 = insertTournamentSelectorLogSchema.safeParse({
      userId: 'USER-0001',
      eventType: 'add_to_grid',
      score: -1,
    });
    expect(ko2.success).toBe(false);
  });

  it('confidence aceita low/medium/high', () => {
    for (const c of ['low', 'medium', 'high']) {
      const r = insertTournamentSelectorLogSchema.safeParse({
        userId: 'USER-0001',
        eventType: 'add_to_grid',
        confidence: c,
      });
      expect(r.success).toBe(true);
    }
  });
});
