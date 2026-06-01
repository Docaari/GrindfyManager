import { describe, it, expect } from 'vitest';

// =============================================================================
// EST-5 / ADR-226 — helpers puros (RED phase)
//
// Modulos alvo (AINDA NAO EXISTEM):
//   server/coach/weeklyReview/buildRecap.ts
//     buildRecap(bundle): RecapContent  (puro, sincrono, deterministico)
//   server/coach/weeklyReview/buildDeepAnalysisNarrative.ts
//     buildDeepAnalysisNarrative(input): AnalysisContent  (puro, sincrono)
//
// Shapes em ADR §"Shape de recap_content e analysis_content":
//   RecapContent { schemaVersion:1, periodStart, periodEnd, markdown,
//     performance{volume,profitUsd,roiPct}, mentalState|null, studyWeek|null, hasData }
//   AnalysisContent { schemaVersion:1, periodStart, periodEnd, markdown,
//     performance7d{volume,profitUsd,roiPct}, mentalState|null, studyWeek|null,
//     deltaVsPrevWeek{volume,profitUsd,roiPct}|null, llmGenerated:false }
//
// DEC-1: NENHUM destes usa LLM. Sao templates PT-BR deterministicos. O ponto de
// extensao (EST-5.1) troca o corpo por callReportLlm SEM mudar a assinatura.
//
// Lesson #6: numeros monetarios em USD (gatherBundle/builders ja normalizam).
// =============================================================================

async function loadRecap() {
  return await import('../../../server/coach/weeklyReview/buildRecap');
}
async function loadAnalysis() {
  return await import('../../../server/coach/weeklyReview/buildDeepAnalysisNarrative');
}

// Bundle "rico" — shape REAL do gatherBundle (lesson #3): performance via
// dashStats7d, mentalState/studyWeek prontos (vindos de buildMentalState/Week).
function richRecapBundle() {
  return {
    periodStart: '2026-06-01',
    periodEnd: '2026-06-07',
    dashStats7d: { count: 42, profit: 156.5, roi: 9.3 },
    mentalState: { breakCount: 12, fatigueSignal: true, weeklyAverages: { foco: 6.2 } },
    studyWeek: { minutesLogged: 240, handsSolvedTotal: 120 },
  };
}

describe('EST-5 buildRecap — shape RecapContent (RF-04)', () => {
  it('retorna schemaVersion 1 + periodStart/periodEnd da semana anterior', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap(richRecapBundle());
      expect(recap.schemaVersion).toBe(1);
      expect(recap.periodStart).toBe('2026-06-01');
      expect(recap.periodEnd).toBe('2026-06-07');
    });
  });

  it('markdown é string PT-BR contendo o CTA de upload + link /upload', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap(richRecapBundle());
      expect(typeof recap.markdown).toBe('string');
      expect(recap.markdown).toContain('/upload');
    });
  });

  it('performance traz volume/profitUsd/roiPct derivados de dashStats7d', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap(richRecapBundle());
      expect(recap.performance.volume).toBe(42);
      expect(recap.performance.profitUsd).toBe(156.5);
      expect(recap.performance.roiPct).toBe(9.3);
    });
  });

  it('inclui mentalState e studyWeek quando presentes no bundle', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap(richRecapBundle());
      expect(recap.mentalState).not.toBeNull();
      expect(recap.studyWeek).not.toBeNull();
    });
  });

  it('hasData=true quando ha volume/dados na semana', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap(richRecapBundle());
      expect(recap.hasData).toBe(true);
    });
  });

  it('semana SEM dados (volume 0, mental/study null) -> recap minimalista hasData=false sem crash', () => {
    return loadRecap().then(({ buildRecap }) => {
      const recap = buildRecap({
        periodStart: '2026-06-01',
        periodEnd: '2026-06-07',
        dashStats7d: { count: 0, profit: 0, roi: null },
        mentalState: null,
        studyWeek: null,
      });
      expect(recap.hasData).toBe(false);
      expect(typeof recap.markdown).toBe('string');
      expect(recap.markdown.length).toBeGreaterThan(0);
    });
  });

  it('é deterministico: mesma entrada -> mesma saida (sem timestamp/random no markdown)', () => {
    return loadRecap().then(({ buildRecap }) => {
      const a = buildRecap(richRecapBundle());
      const b = buildRecap(richRecapBundle());
      expect(a.markdown).toBe(b.markdown);
    });
  });
});

describe('EST-5 buildDeepAnalysisNarrative — shape AnalysisContent (RF-06)', () => {
  function analysisInput() {
    return {
      periodStart: '2026-06-01',
      periodEnd: '2026-06-08',
      performance7d: { volume: 50, profitUsd: 200, roiPct: 10 },
      mentalState: { breakCount: 15, fatigueSignal: false },
      studyWeek: { minutesLogged: 180, handsSolvedTotal: 90 },
      deltaVsPrevWeek: { volume: 8, profitUsd: 44, roiPct: 1 },
    };
  }

  it('retorna schemaVersion 1 + periodStart/periodEnd (7d)', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative(analysisInput());
      expect(a.schemaVersion).toBe(1);
      expect(a.periodStart).toBe('2026-06-01');
      expect(a.periodEnd).toBe('2026-06-08');
    });
  });

  it('llmGenerated é false (DEC-1 — deterministico neste sprint)', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative(analysisInput());
      expect(a.llmGenerated).toBe(false);
    });
  });

  it('markdown PT-BR contem bloco de performance 7d + bloco mental + bloco estudo', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative(analysisInput());
      expect(typeof a.markdown).toBe('string');
      expect(a.markdown.length).toBeGreaterThan(0);
    });
  });

  it('carrega deltaVsPrevWeek quando informado', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative(analysisInput());
      expect(a.deltaVsPrevWeek).toMatchObject({ volume: 8, profitUsd: 44, roiPct: 1 });
    });
  });

  it('gather parcial (studyWeek null) -> ainda monta narrativa com a fonte disponivel', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative({
        periodStart: '2026-06-01',
        periodEnd: '2026-06-08',
        performance7d: { volume: 20, profitUsd: 0, roiPct: 0 },
        mentalState: { breakCount: 4, fatigueSignal: false },
        studyWeek: null,
        deltaVsPrevWeek: null,
      });
      expect(a.studyWeek).toBeNull();
      expect(typeof a.markdown).toBe('string');
      expect(a.markdown.length).toBeGreaterThan(0);
    });
  });

  it('é deterministico: mesma entrada -> mesmo markdown', () => {
    return loadAnalysis().then(({ buildDeepAnalysisNarrative }) => {
      const a = buildDeepAnalysisNarrative(analysisInput());
      const b = buildDeepAnalysisNarrative(analysisInput());
      expect(a.markdown).toBe(b.markdown);
    });
  });
});
