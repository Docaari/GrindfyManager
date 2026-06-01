import { describe, it, expect } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase) — Sprint EST-3 / RF-01, RF-02, RF-03
//
// Spec: Docs/specs/estudo-ia-overhaul-2026-06-01/est-3-study-recording-stat-analysis.md
// ADR : Docs/architecture/decisions/222-est3-stat-analysis-study-sessions-v2.md
//
// Contratos a testar (schema/zod em shared/schema.ts):
//   - STUDY_SESSION_MODES inclui 'stat_analysis'.
//   - statAnalysisEntrySchema (novo): id?, filters max 500, errorText/learnedText max
//     1000, playImageKey/solutionImageKey nullable.
//   - insertStudySessionV2Schema estendido: statId, statAnalysisEntries (cap 10),
//     handsSolvedCount (>=0, <=1000), filtersAnalyzedCount (>=0, <=1000),
//     lessonInsights (max 2000) — TODOS opcionais (lesson #7).
//   - Back-compat: sessao sem os campos novos continua valida (lesson #7).
//
// NOTA red phase: 'stat_analysis' ainda nao esta em STUDY_SESSION_MODES e
// os campos novos ainda nao existem no insertStudySessionV2Schema — estes
// testes DEVEM falhar ate o implementer estender o schema.
// =============================================================================

import {
  STUDY_SESSION_MODES,
  insertStudySessionV2Schema,
  // @ts-expect-error - schema/tipo novos ainda nao existem (red phase)
  statAnalysisEntrySchema,
} from '@shared/schema';

// Sessao base valida (campos obrigatorios pre-EST-3).
function baseSession(overrides: Record<string, any> = {}) {
  return {
    userId: 'USER-0001',
    mode: 'stat_analysis',
    source: 'manual_post_hoc',
    themeId: 'theme_1',
    statId: 'vpip',
    durationMinutes: 30,
    ...overrides,
  };
}

function makeEntry(overrides: Record<string, any> = {}) {
  return {
    filters: 'BTN vs BB, 3bet pot, SPR<3',
    errorText: 'Foldei demais no turn',
    learnedText: 'Defender mais turn cards',
    ...overrides,
  };
}

// =============================================================================
// RF-01 — enum de modos
// =============================================================================

describe('EST-3 RF-01 — STUDY_SESSION_MODES inclui stat_analysis', () => {
  it('contem o modo stat_analysis (presenca individual, nao length — lesson #8)', () => {
    expect(STUDY_SESSION_MODES).toContain('stat_analysis');
  });

  it('preserva os modos legados (regressao)', () => {
    for (const mode of ['drill_gto', 'tournament_review', 'hand_review', 'lesson', 'other']) {
      expect(STUDY_SESSION_MODES).toContain(mode);
    }
  });
});

// =============================================================================
// RF-02 — statAnalysisEntrySchema (shape de uma entry)
// =============================================================================

describe('EST-3 RF-02 — statAnalysisEntrySchema', () => {
  it('aceita uma entry minima valida (filters + errorText + learnedText)', () => {
    const parsed = statAnalysisEntrySchema.safeParse(makeEntry());
    expect(parsed.success).toBe(true);
  });

  it('rejeita filters > 500 chars', () => {
    const parsed = statAnalysisEntrySchema.safeParse(makeEntry({ filters: 'x'.repeat(501) }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita errorText > 1000 chars', () => {
    const parsed = statAnalysisEntrySchema.safeParse(makeEntry({ errorText: 'x'.repeat(1001) }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita learnedText > 1000 chars', () => {
    const parsed = statAnalysisEntrySchema.safeParse(makeEntry({ learnedText: 'x'.repeat(1001) }));
    expect(parsed.success).toBe(false);
  });

  it('aceita playImageKey/solutionImageKey null', () => {
    const parsed = statAnalysisEntrySchema.safeParse(
      makeEntry({ playImageKey: null, solutionImageKey: null }),
    );
    expect(parsed.success).toBe(true);
  });
});

// =============================================================================
// RF-02 — insertStudySessionV2Schema: statAnalysisEntries cap 10
// =============================================================================

describe('EST-3 RF-02 — statAnalysisEntries cap 10', () => {
  it('aceita exatamente 10 entries', () => {
    const parsed = insertStudySessionV2Schema.safeParse(
      baseSession({ statAnalysisEntries: Array.from({ length: 10 }, () => makeEntry()) }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejeita 11 entries (cap 10)', () => {
    const parsed = insertStudySessionV2Schema.safeParse(
      baseSession({ statAnalysisEntries: Array.from({ length: 11 }, () => makeEntry()) }),
    );
    expect(parsed.success).toBe(false);
  });
});

// =============================================================================
// RF-03 — campos enriquecidos (Parte B) opcionais
// =============================================================================

describe('EST-3 RF-03 — campos enriquecidos (Parte B)', () => {
  it('aceita handsSolvedCount / filtersAnalyzedCount / lessonInsights validos', () => {
    const parsed = insertStudySessionV2Schema.safeParse(
      baseSession({ handsSolvedCount: 25, filtersAnalyzedCount: 4, lessonInsights: 'Insight da aula' }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejeita handsSolvedCount negativo', () => {
    const parsed = insertStudySessionV2Schema.safeParse(baseSession({ handsSolvedCount: -1 }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita handsSolvedCount > 1000', () => {
    const parsed = insertStudySessionV2Schema.safeParse(baseSession({ handsSolvedCount: 1001 }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita filtersAnalyzedCount negativo', () => {
    const parsed = insertStudySessionV2Schema.safeParse(baseSession({ filtersAnalyzedCount: -5 }));
    expect(parsed.success).toBe(false);
  });

  it('rejeita lessonInsights > 2000 chars', () => {
    const parsed = insertStudySessionV2Schema.safeParse(
      baseSession({ lessonInsights: 'x'.repeat(2001) }),
    );
    expect(parsed.success).toBe(false);
  });
});

// =============================================================================
// Back-compat (lesson #7) — sessao sem os campos novos continua valida
// =============================================================================

describe('EST-3 back-compat — campos novos sao opcionais (lesson #7)', () => {
  it('aceita sessao drill_gto SEM nenhum campo novo (regressao)', () => {
    const parsed = insertStudySessionV2Schema.safeParse({
      userId: 'USER-0001',
      mode: 'drill_gto',
      source: 'manual_post_hoc',
      themeId: 'theme_1',
      durationMinutes: 20,
    });
    expect(parsed.success).toBe(true);
  });

  it('aceita sessao stat_analysis SEM statAnalysisEntries (entries vem via upload depois)', () => {
    const parsed = insertStudySessionV2Schema.safeParse(baseSession());
    expect(parsed.success).toBe(true);
  });

  it('campos novos ausentes nao sao required no schema', () => {
    const parsed = insertStudySessionV2Schema.safeParse(baseSession());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // statId presente; demais ausentes nao quebram.
      expect((parsed.data as any).handsSolvedCount ?? null).toBeNull();
      expect((parsed.data as any).filtersAnalyzedCount ?? null).toBeNull();
      expect((parsed.data as any).lessonInsights ?? null).toBeNull();
    }
  });
});
