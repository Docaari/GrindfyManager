import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: shared/schema.ts — coluna nova library_template_id em planned_tournaments (Q4)
//
// Suprema continua identificando "ja na grade" via externalId (existente).
// Library/manual passa a usar library_template_id (FK nullable -> tournament_library.id).
// Heuristica name+time+site foi DESCARTADA (Q4) por risco de falso positivo.
// =============================================================================

import {
  plannedTournaments,
  insertPlannedTournamentSchema,
} from '../../../shared/schema';

describe('plannedTournaments - nova coluna library_template_id (Q4)', () => {
  it('coluna libraryTemplateId existe no schema Drizzle', () => {
    expect((plannedTournaments as any).libraryTemplateId).toBeDefined();
  });

  it('externalId continua existindo (Suprema)', () => {
    expect((plannedTournaments as any).externalId).toBeDefined();
  });
});

describe('insertPlannedTournamentSchema - libraryTemplateId', () => {
  const base = {
    userId: 'USER-0001',
    dayOfWeek: 4,
    site: 'PokerStars',
    time: '19:00',
    type: 'PKO',
    speed: 'Normal',
    name: 'Big $22',
    buyIn: '22.00',
  };

  it('aceita planned tournament SEM libraryTemplateId (caso Suprema/manual)', () => {
    const r = insertPlannedTournamentSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('aceita libraryTemplateId como string id (caso vindo da biblioteca)', () => {
    const r = insertPlannedTournamentSchema.safeParse({
      ...base,
      libraryTemplateId: 'lib-tpl-abc123',
    });
    expect(r.success).toBe(true);
  });

  it('aceita libraryTemplateId=null explicito', () => {
    const r = insertPlannedTournamentSchema.safeParse({
      ...base,
      libraryTemplateId: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita libraryTemplateId E externalId simultaneos (raro mas valido)', () => {
    const r = insertPlannedTournamentSchema.safeParse({
      ...base,
      libraryTemplateId: 'lib-xyz',
      externalId: 'suprema-12345',
    });
    expect(r.success).toBe(true);
  });
});
