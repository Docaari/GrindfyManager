/**
 * Tests for shared/day-of-week.ts (Sprint torneios-custom-families — Fase 1).
 *
 * Espelha shared/time-bin.ts: usa getUTCDay() (NAO getDay) DE PROPOSITO para
 * que o dia da semana seja ESTAVEL entre ambientes (dev BRT vs prod UTC) para o
 * mesmo valor gravado em tournaments.datePlayed.
 *
 * RED PHASE: shared/day-of-week.ts ainda nao existe. Estes testes devem FALHAR
 * por modulo ausente (nao por harness).
 *
 * .test.ts roda no projeto "server" (node) — logica pura, sem DOM.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error - modulo ainda nao existe (red phase)
import { dayOfWeek, dayOfWeekLabel, NO_DAY, DAY_KEYS } from "../../../shared/day-of-week";

describe("DAY_KEYS — indice == getUTCDay() 0-6", () => {
  it("contem as 7 chaves dom..sab na ordem do getUTCDay (0=dom)", () => {
    // Validar presenca individual (lesson #8: NAO comparar length absoluto).
    expect(DAY_KEYS[0]).toBe("dom");
    expect(DAY_KEYS[1]).toBe("seg");
    expect(DAY_KEYS[2]).toBe("ter");
    expect(DAY_KEYS[3]).toBe("qua");
    expect(DAY_KEYS[4]).toBe("qui");
    expect(DAY_KEYS[5]).toBe("sex");
    expect(DAY_KEYS[6]).toBe("sab");
  });

  it("inclui cada dia individualmente (membership, nao length)", () => {
    for (const k of ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]) {
      expect(DAY_KEYS).toContain(k);
    }
  });

  it("NO_DAY = 'sem-dia'", () => {
    expect(NO_DAY).toBe("sem-dia");
  });
});

describe("dayOfWeek — usa getUTCDay (determinismo entre ambientes)", () => {
  it("2026-06-02T15:00:00Z e terca -> 'ter'", () => {
    // 2026-06-02 e uma terca-feira.
    expect(dayOfWeek(new Date("2026-06-02T15:00:00Z"))).toBe("ter");
  });

  it("aceita Date e string com o mesmo resultado", () => {
    const d = new Date("2026-06-02T15:00:00Z");
    expect(dayOfWeek(d)).toBe(dayOfWeek("2026-06-02T15:00:00Z"));
    expect(dayOfWeek("2026-06-02T15:00:00Z")).toBe("ter");
  });

  it("aceita timestamp numerico", () => {
    const ms = Date.UTC(2026, 5, 2, 15, 0, 0); // 2026-06-02 = terca
    expect(dayOfWeek(ms)).toBe("ter");
  });

  it("cobre os 7 dias da semana de 2026-06 (dom..sab)", () => {
    // 2026-05-31 domingo, 06-01 seg, 06-02 ter, 06-03 qua, 06-04 qui, 06-05 sex, 06-06 sab.
    expect(dayOfWeek("2026-05-31T12:00:00Z")).toBe("dom");
    expect(dayOfWeek("2026-06-01T12:00:00Z")).toBe("seg");
    expect(dayOfWeek("2026-06-02T12:00:00Z")).toBe("ter");
    expect(dayOfWeek("2026-06-03T12:00:00Z")).toBe("qua");
    expect(dayOfWeek("2026-06-04T12:00:00Z")).toBe("qui");
    expect(dayOfWeek("2026-06-05T12:00:00Z")).toBe("sex");
    expect(dayOfWeek("2026-06-06T12:00:00Z")).toBe("sab");
  });

  it("data perto da meia-noite UTC fica no dia UTC (NAO local)", () => {
    // 2026-06-02T00:30:00Z e terca em UTC. Em BRT (UTC-3) seria 2026-06-01 21:30
    // (segunda) — se usasse getDay() local daria 'seg'. getUTCDay() => 'ter'.
    expect(dayOfWeek("2026-06-02T00:30:00Z")).toBe("ter");
    // 2026-06-02T23:30:00Z ainda e terca em UTC (em BRT seria 20:30 terca tambem,
    // mas o ponto e que o calculo nao escorrega pra qua mesmo perto da virada).
    expect(dayOfWeek("2026-06-02T23:30:00Z")).toBe("ter");
  });

  it("null/undefined -> NO_DAY", () => {
    expect(dayOfWeek(null)).toBe(NO_DAY);
    expect(dayOfWeek(undefined)).toBe(NO_DAY);
  });

  it("string invalida -> NO_DAY", () => {
    expect(dayOfWeek("not-a-date")).toBe(NO_DAY);
    expect(dayOfWeek("")).toBe(NO_DAY);
  });
});

describe("dayOfWeekLabel — rotulo PT-BR", () => {
  it("mapeia cada chave para o rotulo capitalizado", () => {
    expect(dayOfWeekLabel("dom")).toBe("Dom");
    expect(dayOfWeekLabel("seg")).toBe("Seg");
    expect(dayOfWeekLabel("ter")).toBe("Ter");
    expect(dayOfWeekLabel("qua")).toBe("Qua");
    expect(dayOfWeekLabel("qui")).toBe("Qui");
    expect(dayOfWeekLabel("sex")).toBe("Sex");
    expect(dayOfWeekLabel("sab")).toBe("Sab");
  });

  it("NO_DAY -> 'Sem dia'", () => {
    expect(dayOfWeekLabel(NO_DAY)).toBe("Sem dia");
  });
});
