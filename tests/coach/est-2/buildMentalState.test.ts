import { describe, it, expect } from "vitest";

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-2 / RF-02 + RF-03 — buildMentalState(bundle) (NAO EXISTE AINDA)
//   export function buildMentalState(bundle): ReportMentalState | null
//
// Contrato (ADR-225):
//   - bundle.breakFeedbacks: BreakFeedback[]  (ordenado desc breakTime na origem)
//   - bundle.grindSessions:  grind_sessions rows da semana (notes + objectiveCompleted)
//   - Retorna null SO se zero breaks E zero grind notes/objectives.
//   - Agrupa breaks por sessionId; reordena ASC por breakTime antes de first/last.
//   - dim = { first, last, avg(1 casa), delta=last-first(1 casa) }
//   - weeklyAverages = media de TODOS os breaks da semana por dim (1 casa), null se zero.
//   - fatigueSignal = >=2 sessoes com foco.delta<=-2 OU energia.delta<=-2.
//   - cap 10 sessoes detalhadas (recentes por data) + totalSessionsWithBreaks.
//   - grindNotes: cap 10; campos vazios/null OMITIDOS; nota truncada 500 + sufixo.
//   - objectiveHitRate = % inteiro sobre sessoes com objectiveCompleted != null; null se nenhuma.
//
// Lessons: #3 (shape real BreakFeedback/grind_sessions), #7 (opcional/degrade).
// Status esperado: TODOS FALHAM (funcao nao existe / nao exportada).
// =============================================================================

import { buildMentalState } from "../../../server/services/weeklyReportGenerator";

// shape REAL de BreakFeedback (schema break_feedbacks).
function bf(
  sessionId: string,
  breakTime: string,
  dims: Partial<{ foco: number; energia: number; confianca: number; inteligenciaEmocional: number; interferencias: number }>,
  notes: string | null = null,
) {
  return {
    id: `bf-${sessionId}-${breakTime}`,
    userId: "USER-0001",
    sessionId,
    breakTime,
    foco: dims.foco ?? 5,
    energia: dims.energia ?? 5,
    confianca: dims.confianca ?? 5,
    inteligenciaEmocional: dims.inteligenciaEmocional ?? 5,
    interferencias: dims.interferencias ?? 5,
    notes,
    createdAt: breakTime,
  };
}

// shape REAL de grind_sessions (subset usado).
function gs(id: string, date: string, extra: Record<string, any> = {}) {
  return { id, date, status: "completed", ...extra };
}

describe("buildMentalState — RF-02 series mentais", () => {
  it("calcula first/last/avg/delta por dimensao de uma sessao (foco 8->6->4)", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8 }),
        bf("s1", "2026-05-06T21:00:00Z", { foco: 6 }),
        bf("s1", "2026-05-06T22:00:00Z", { foco: 4 }),
      ],
    };
    const out = buildMentalState(bundle as any)!;
    const dim = out.sessions[0].dims.foco;
    expect(dim.first).toBe(8);
    expect(dim.last).toBe(4);
    expect(dim.avg).toBe(6);
    expect(dim.delta).toBe(-4);
  });

  it("reordena breaks ASC por breakTime antes de first/last (input chega DESC)", () => {
    // input em ordem DESC breakTime (como getBreakFeedbacksBySessionIds retorna)
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T22:00:00Z", { foco: 4 }), // cronologicamente ULTIMO
        bf("s1", "2026-05-06T21:00:00Z", { foco: 6 }),
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8 }), // cronologicamente PRIMEIRO
      ],
    };
    const dim = buildMentalState(bundle as any)!.sessions[0].dims.foco;
    expect(dim.first).toBe(8);
    expect(dim.last).toBe(4);
    expect(dim.delta).toBe(-4);
  });

  it("breakCount por sessao reflete numero de breaks", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 7 }),
        bf("s1", "2026-05-06T21:00:00Z", { foco: 7 }),
      ],
    };
    expect(buildMentalState(bundle as any)!.sessions[0].breakCount).toBe(2);
  });

  it("weeklyAverages = media de TODOS os breaks da semana por dim (NAO media das medias)", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z"), gs("s2", "2026-05-07T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8 }),
        bf("s1", "2026-05-06T21:00:00Z", { foco: 6 }),
        bf("s1", "2026-05-06T22:00:00Z", { foco: 4 }),
        bf("s2", "2026-05-07T20:00:00Z", { foco: 5 }),
        bf("s2", "2026-05-07T21:00:00Z", { foco: 5 }),
      ],
    };
    // todos foco = [8,6,4,5,5] -> 28/5 = 5.6 (1 casa). media das medias seria (6+5)/2=5.5.
    expect(buildMentalState(bundle as any)!.weeklyAverages.foco).toBe(5.6);
  });

  it("breakCount total da semana soma todos os breaks", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z"), gs("s2", "2026-05-07T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", {}),
        bf("s1", "2026-05-06T21:00:00Z", {}),
        bf("s2", "2026-05-07T20:00:00Z", {}),
      ],
    };
    expect(buildMentalState(bundle as any)!.breakCount).toBe(3);
  });
});

describe("buildMentalState — fatigueSignal", () => {
  it("true quando >=2 sessoes tem foco.delta <= -2", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z"), gs("s2", "2026-05-07T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8 }),
        bf("s1", "2026-05-06T22:00:00Z", { foco: 5 }), // delta -3
        bf("s2", "2026-05-07T20:00:00Z", { foco: 9 }),
        bf("s2", "2026-05-07T22:00:00Z", { foco: 6 }), // delta -3
      ],
    };
    expect(buildMentalState(bundle as any)!.fatigueSignal).toBe(true);
  });

  it("true quando satisfeito via energia.delta (OU foco)", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z"), gs("s2", "2026-05-07T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8, energia: 8 }),
        bf("s1", "2026-05-06T22:00:00Z", { foco: 4, energia: 8 }), // foco delta -4
        bf("s2", "2026-05-07T20:00:00Z", { foco: 7, energia: 9 }),
        bf("s2", "2026-05-07T22:00:00Z", { foco: 7, energia: 6 }), // energia delta -3
      ],
    };
    expect(buildMentalState(bundle as any)!.fatigueSignal).toBe(true);
  });

  it("false quando apenas 1 sessao cai (threshold >=2)", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z"), gs("s2", "2026-05-07T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 8 }),
        bf("s1", "2026-05-06T22:00:00Z", { foco: 4 }), // delta -4
        bf("s2", "2026-05-07T20:00:00Z", { foco: 7 }),
        bf("s2", "2026-05-07T22:00:00Z", { foco: 7 }), // delta 0
      ],
    };
    expect(buildMentalState(bundle as any)!.fatigueSignal).toBe(false);
  });
});

describe("buildMentalState — cap 10 sessoes", () => {
  it("limita sessions a 10 detalhadas mas conta total em totalSessionsWithBreaks", () => {
    const grindSessions = Array.from({ length: 12 }, (_v, i) =>
      gs(`s${i}`, `2026-05-${String(i + 1).padStart(2, "0")}T18:00:00Z`));
    const breakFeedbacks = grindSessions.flatMap((g) => [
      bf(g.id, `${g.date.slice(0, 10)}T20:00:00Z`, { foco: 7 }),
      bf(g.id, `${g.date.slice(0, 10)}T21:00:00Z`, { foco: 6 }),
    ]);
    const out = buildMentalState({ grindSessions, breakFeedbacks } as any)!;
    expect(out.sessions.length).toBe(10);
    expect(out.totalSessionsWithBreaks).toBe(12);
  });
});

describe("buildMentalState — RF-03 grindNotes", () => {
  it("inclui apenas campos de nota presentes; omite vazios/null", () => {
    const bundle = {
      grindSessions: [
        gs("s1", "2026-05-06T18:00:00Z", {
          finalNotes: "",
          dailyGoals: null,
          preparationNotes: "Aquecimento ICM antes de jogar",
        }),
      ],
      breakFeedbacks: [],
    };
    const note = buildMentalState(bundle as any)!.grindNotes[0];
    expect(note.preparationNotes).toBe("Aquecimento ICM antes de jogar");
    expect(note).not.toHaveProperty("finalNotes");
    expect(note).not.toHaveProperty("dailyGoals");
  });

  it("objectiveHitRate = % inteiro sobre sessoes com objectiveCompleted definido", () => {
    const bundle = {
      grindSessions: [
        gs("s1", "2026-05-06T18:00:00Z", { objectiveCompleted: true, finalNotes: "ok" }),
        gs("s2", "2026-05-07T18:00:00Z", { objectiveCompleted: true, finalNotes: "ok" }),
        gs("s3", "2026-05-08T18:00:00Z", { objectiveCompleted: false, finalNotes: "ruim" }),
      ],
      breakFeedbacks: [],
    };
    // 2 de 3 definidas -> 67%
    expect(buildMentalState(bundle as any)!.objectiveHitRate).toBe(67);
  });

  it("objectiveHitRate = null quando nenhuma sessao tem objectiveCompleted definido", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z", { finalNotes: "so nota" })],
      breakFeedbacks: [],
    };
    expect(buildMentalState(bundle as any)!.objectiveHitRate).toBeNull();
  });

  it("trunca nota textual longa a 500 chars com sufixo de truncamento", () => {
    const longNote = "x".repeat(2000);
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z", { finalNotes: longNote })],
      breakFeedbacks: [],
    };
    const note = buildMentalState(bundle as any)!.grindNotes[0];
    expect(note.finalNotes!.length).toBeLessThanOrEqual(501); // 500 + caractere de elipse
    expect(note.finalNotes!.startsWith("x".repeat(500))).toBe(true);
    expect(note.finalNotes!.endsWith("…")).toBe(true);
  });

  it("limita grindNotes a 10 (sessoes mais recentes)", () => {
    const grindSessions = Array.from({ length: 14 }, (_v, i) =>
      gs(`s${i}`, `2026-05-${String(i + 1).padStart(2, "0")}T18:00:00Z`, { finalNotes: `nota ${i}` }));
    const out = buildMentalState({ grindSessions, breakFeedbacks: [] } as any)!;
    expect(out.grindNotes.length).toBe(10);
  });
});

describe("buildMentalState — degrade (RF-02/RF-05)", () => {
  it("retorna null quando zero breaks E zero notas/objectives", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z", { finalNotes: "", preparationNotes: null, dailyGoals: "", objectiveCompleted: null })],
      breakFeedbacks: [],
    };
    expect(buildMentalState(bundle as any)).toBeNull();
  });

  it("retorna null quando bundle nao tem grind sessions nem breaks", () => {
    expect(buildMentalState({ grindSessions: [], breakFeedbacks: [] } as any)).toBeNull();
  });

  it("breaks SEM notas -> bloco existe com grindNotes vazio", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z")],
      breakFeedbacks: [
        bf("s1", "2026-05-06T20:00:00Z", { foco: 7 }),
        bf("s1", "2026-05-06T21:00:00Z", { foco: 6 }),
      ],
    };
    const out = buildMentalState(bundle as any)!;
    expect(out).not.toBeNull();
    expect(out.grindNotes).toEqual([]);
    expect(out.sessions.length).toBe(1);
  });

  it("notas SEM breaks -> bloco existe com sessions vazio e weeklyAverages null", () => {
    const bundle = {
      grindSessions: [gs("s1", "2026-05-06T18:00:00Z", { finalNotes: "joguei mal" })],
      breakFeedbacks: [],
    };
    const out = buildMentalState(bundle as any)!;
    expect(out).not.toBeNull();
    expect(out.sessions).toEqual([]);
    expect(out.fatigueSignal).toBe(false);
    expect(out.weeklyAverages.foco).toBeNull();
    expect(out.weeklyAverages.energia).toBeNull();
    expect(out.grindNotes.length).toBe(1);
  });
});
