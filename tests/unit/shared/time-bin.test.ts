/**
 * Tests for shared/time-bin.ts (Sprint torneios-library-grouping).
 * Janelas fixas de 2h para separar $55@12h de $55@21h no agrupamento.
 */
import { describe, it, expect } from "vitest";
import { timeBin2h, timeBinLabel, NO_TIME_BIN } from "../../../shared/time-bin";

describe("timeBin2h", () => {
  it("mapeia hora (0-23) p/ bin de 2h ancorado em hora par", () => {
    expect(timeBin2h(0)).toBe("0-2");
    expect(timeBin2h(1)).toBe("0-2");
    expect(timeBin2h(12)).toBe("12-14");
    expect(timeBin2h(13)).toBe("12-14");
    expect(timeBin2h(21)).toBe("20-22");
    expect(timeBin2h(23)).toBe("22-24");
  });

  it("separa meio-dia de noite (founder: $55@12h != $55@21h)", () => {
    expect(timeBin2h(12)).not.toBe(timeBin2h(21));
  });

  it("aceita Date e deriva a hora (UTC, estavel entre ambientes)", () => {
    const d = new Date(Date.UTC(2026, 0, 15, 13, 30, 0));
    expect(timeBin2h(d)).toBe("12-14");
  });

  it("entrada ausente/invalida -> NO_TIME_BIN", () => {
    expect(timeBin2h(null)).toBe(NO_TIME_BIN);
    expect(timeBin2h(undefined)).toBe(NO_TIME_BIN);
    expect(timeBin2h("not-a-date")).toBe(NO_TIME_BIN);
  });
});

describe("timeBinLabel", () => {
  it("formata label PT-BR", () => {
    expect(timeBinLabel("12-14")).toBe("~12h-14h");
    expect(timeBinLabel("0-2")).toBe("~00h-02h");
    expect(timeBinLabel(NO_TIME_BIN)).toBe("Sem horario");
    expect(timeBinLabel("")).toBe("Sem horario");
  });
});
