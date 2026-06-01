import { describe, it, expect } from 'vitest';

// =============================================================================
// Motor de Aderência — Fase A (ADR-227) — RED phase — DEC-MA6 plug no EST-5
//
// O plug é ADITIVO (lesson #7): RecapInput ganha campo opcional `adherence?`.
//   - SEM adherence  -> output byte-idêntico ao atual; schemaVersion fica 1.
//   - COM adherence  -> schemaVersion sobe para 2; markdown ganha seção
//                       "Plano vs Realizado" (só quando dataSufficiency='ok').
//
// Módulo alvo (JÁ EXISTE, será ESTENDIDO pelo implementer):
//   server/coach/weeklyReview/buildRecap.ts
//
// Estes testes guardam o contrato de back-compat. Os testes legados de EST-5
// (tests/coach/est-5/buildRecap.deepAnalysis.test.ts) NÃO passam `adherence` e
// asseguram schemaVersion=1 — devem continuar verdes (back-compat byte-idêntico).
//
// Lesson #7 (opcional -> back-compat), #14/#26/#38 (await import).
// =============================================================================

async function loadRecap() {
  return await import('../../../server/coach/weeklyReview/buildRecap');
}

function baseInput() {
  return {
    periodStart: '2026-05-25',
    periodEnd: '2026-05-31',
    dashStats7d: { count: 42, profit: 156.5, roi: 9.3 },
    mentalState: { breakCount: 12, fatigueSignal: true } as any,
    studyWeek: { minutesLogged: 240, handsSolvedTotal: 120 } as any,
  };
}

function adherenceBlock(dataSufficiency: 'ok' | 'low') {
  const mk = (sourceMetric: string, planned: number | null, actual: number) => ({
    sourceMetric,
    period: { kind: 'week' as const, weekStartDate: '2026-05-25' },
    planned,
    actual,
    compliancePct: planned && planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : null,
    dataSufficiency,
    breakdown: { skipped: false, shortfall: planned !== null ? Math.max(0, planned - actual) : null, overachieved: false, note: null },
  });
  return {
    grind: mk('grind_sessions_count', 4, 2),
    study: mk('study_minutes', 300, 180),
    summaryText: 'Semana passada voce planejou 4 sessoes de grind e realizou 2.',
  };
}

describe('DEC-MA6 — back-compat: RecapInput SEM adherence', () => {
  it('schemaVersion permanece 1 quando adherence ausente', async () => {
    const { buildRecap } = await loadRecap();
    const recap = buildRecap(baseInput());
    expect(recap.schemaVersion).toBe(1);
  });

  it('markdown é byte-idêntico ao baseline quando adherence ausente (lesson #7)', async () => {
    const { buildRecap } = await loadRecap();
    // Dois builds idênticos do MESMO input sem adherence devem coincidir; e o
    // markdown NÃO deve conter a seção nova de aderência.
    const a = buildRecap(baseInput());
    const b = buildRecap(baseInput());
    expect(a.markdown).toBe(b.markdown);
    expect(a.markdown).not.toContain('Plano vs Realizado');
  });
});

describe('DEC-MA6 — plug: RecapInput COM adherence', () => {
  it('schemaVersion sobe para 2 quando adherence presente', async () => {
    const { buildRecap } = await loadRecap();
    const recap = buildRecap({ ...baseInput(), adherence: adherenceBlock('ok') } as any);
    expect(recap.schemaVersion).toBe(2);
  });

  it('markdown ganha seção "Plano vs Realizado" quando adherence presente e dataSufficiency="ok"', async () => {
    const { buildRecap } = await loadRecap();
    const recap = buildRecap({ ...baseInput(), adherence: adherenceBlock('ok') } as any);
    expect(recap.markdown).toContain('Plano vs Realizado');
  });

  it('dataSufficiency="low" -> NÃO emite veredito numérico forte (D9), mostra "sem dado suficiente"', async () => {
    const { buildRecap } = await loadRecap();
    const recap = buildRecap({ ...baseInput(), adherence: adherenceBlock('low') } as any);
    // schemaVersion ainda 2 (adherence populado), mas o texto não crava o compliance forte.
    expect(recap.schemaVersion).toBe(2);
    expect(recap.markdown.toLowerCase()).toMatch(/sem (plano|dado)|ainda sem|dado suficiente/);
  });

  it('o objeto adherence é carregado no RecapContent quando presente (consumível pelo EST-5)', async () => {
    const { buildRecap } = await loadRecap();
    const adh = adherenceBlock('ok');
    const recap = buildRecap({ ...baseInput(), adherence: adh } as any);
    expect((recap as any).adherence).toMatchObject({
      grind: { sourceMetric: 'grind_sessions_count' },
      study: { sourceMetric: 'study_minutes' },
    });
  });
});
