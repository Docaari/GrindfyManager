import { describe, it, expect } from "vitest";

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-2 / RF-04 — buildStudyWeek(bundle) (NAO EXISTE AINDA)
//   export function buildStudyWeek(bundle): ReportStudyWeek | null
//
// Contrato (ADR-225):
//   - bundle.studySessions: study_sessions_v2 rows da semana (+ v1 merged).
//   - Retorna null se studySessions.length === 0.
//   - handsSolvedTotal / filtersAnalyzedTotal somam (null -> 0).
//   - statAnalysisEntriesTotal = soma de statAnalysisEntries.length (null/undef -> 0).
//   - statAnalysisSessionCount = nº de sessoes mode === 'stat_analysis'.
//   - timeByTheme = agrega durationMinutes por themeId; cap 8; minutos desc; ignora themeId vazio.
//   - lessonInsightsCount = nº de sessoes com lessonInsights nao-vazio.
//   - sessionCount = studySessions.length; minutesLogged = soma durationMinutes.
//
// Lessons: #3 (shape real study_sessions_v2), #7 (cols EST-3 nullable -> degrade 0).
// Status esperado: TODOS FALHAM (funcao nao existe / nao exportada).
// =============================================================================

import { buildStudyWeek } from "../../../server/services/weeklyReportGenerator";

// shape REAL de study_sessions_v2 (subset usado).
function ss(id: string, extra: Record<string, any> = {}) {
  return {
    id,
    mode: "drill_gto",
    durationMinutes: 30,
    themeId: "theme-icm",
    handsSolvedCount: null,
    filtersAnalyzedCount: null,
    statAnalysisEntries: null,
    lessonInsights: null,
    ...extra,
  };
}

describe("buildStudyWeek — RF-04 metricas EST-3", () => {
  it("sessionCount + minutesLogged agregam todas as sessoes", () => {
    const bundle = { studySessions: [ss("a", { durationMinutes: 60 }), ss("b", { durationMinutes: 30 })] };
    const out = buildStudyWeek(bundle as any)!;
    expect(out.sessionCount).toBe(2);
    expect(out.minutesLogged).toBe(90);
  });

  it("handsSolvedTotal soma ignorando null (10, null, 5 -> 15)", () => {
    const bundle = {
      studySessions: [
        ss("a", { handsSolvedCount: 10 }),
        ss("b", { handsSolvedCount: null }),
        ss("c", { handsSolvedCount: 5 }),
      ],
    };
    expect(buildStudyWeek(bundle as any)!.handsSolvedTotal).toBe(15);
  });

  it("filtersAnalyzedTotal soma ignorando null", () => {
    const bundle = {
      studySessions: [ss("a", { filtersAnalyzedCount: 4 }), ss("b", { filtersAnalyzedCount: null }), ss("c", { filtersAnalyzedCount: 6 })],
    };
    expect(buildStudyWeek(bundle as any)!.filtersAnalyzedTotal).toBe(10);
  });

  it("statAnalysisEntriesTotal soma o length dos arrays de entradas", () => {
    const bundle = {
      studySessions: [
        ss("a", { mode: "stat_analysis", statAnalysisEntries: [{}, {}, {}] }),
        ss("b", { statAnalysisEntries: null }),
        ss("c", { mode: "stat_analysis", statAnalysisEntries: [{}] }),
      ],
    };
    expect(buildStudyWeek(bundle as any)!.statAnalysisEntriesTotal).toBe(4);
  });

  it("statAnalysisSessionCount conta sessoes mode === stat_analysis", () => {
    const bundle = {
      studySessions: [ss("a", { mode: "stat_analysis" }), ss("b", { mode: "drill_gto" }), ss("c", { mode: "stat_analysis" })],
    };
    expect(buildStudyWeek(bundle as any)!.statAnalysisSessionCount).toBe(2);
  });

  it("timeByTheme agrega durationMinutes por themeId, ordenado por minutos desc", () => {
    const bundle = {
      studySessions: [
        ss("a", { themeId: "A", durationMinutes: 40 }),
        ss("b", { themeId: "A", durationMinutes: 20 }),
        ss("c", { themeId: "B", durationMinutes: 30 }),
      ],
    };
    const out = buildStudyWeek(bundle as any)!;
    expect(out.timeByTheme).toEqual([
      { themeId: "A", minutes: 60 },
      { themeId: "B", minutes: 30 },
    ]);
  });

  it("timeByTheme ignora sessoes sem themeId", () => {
    const bundle = {
      studySessions: [ss("a", { themeId: "A", durationMinutes: 40 }), ss("b", { themeId: "", durationMinutes: 20 }), ss("c", { themeId: null, durationMinutes: 10 })],
    };
    const out = buildStudyWeek(bundle as any)!;
    expect(out.timeByTheme).toEqual([{ themeId: "A", minutes: 40 }]);
  });

  it("timeByTheme limita a 8 temas (top por minutos)", () => {
    const studySessions = Array.from({ length: 12 }, (_v, i) =>
      ss(`s${i}`, { themeId: `theme-${i}`, durationMinutes: (i + 1) * 10 }));
    const out = buildStudyWeek({ studySessions } as any)!;
    expect(out.timeByTheme.length).toBe(8);
    // top por minutos: theme-11 (120) primeiro
    expect(out.timeByTheme[0].themeId).toBe("theme-11");
  });

  it("lessonInsightsCount conta sessoes com lessonInsights nao-vazio", () => {
    const bundle = {
      studySessions: [
        ss("a", { lessonInsights: "aprendi 3-bet pot" }),
        ss("b", { lessonInsights: "" }),
        ss("c", { lessonInsights: null }),
        ss("d", { lessonInsights: "nota 2" }),
      ],
    };
    expect(buildStudyWeek(bundle as any)!.lessonInsightsCount).toBe(2);
  });
});

describe("buildStudyWeek — degrade", () => {
  it("retorna null quando zero sessoes de estudo", () => {
    expect(buildStudyWeek({ studySessions: [] } as any)).toBeNull();
  });

  it("sessoes pre-EST-3 (todas cols null) -> totais 0 sem erro", () => {
    const bundle = { studySessions: [ss("a"), ss("b")] };
    const out = buildStudyWeek(bundle as any)!;
    expect(out.handsSolvedTotal).toBe(0);
    expect(out.filtersAnalyzedTotal).toBe(0);
    expect(out.statAnalysisEntriesTotal).toBe(0);
    expect(out.statAnalysisSessionCount).toBe(0);
    expect(out.lessonInsightsCount).toBe(0);
  });
});
