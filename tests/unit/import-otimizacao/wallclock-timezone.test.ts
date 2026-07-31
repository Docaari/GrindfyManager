/**
 * ADR-243 — data do SharkScope vem como hora-de-parede do fuso declarado NO
 * CABECALHO (`Data de Início (America/Sao_Paulo)`), sem offset. O parser antigo
 * tratava como UTC: erro fixo de 3h e torneio 21h+ caindo no dia UTC seguinte.
 */
import { describe, it, expect } from "vitest";
import {
  wallClockToUtc,
  tzOffsetMinutes,
  timezoneFromHeader,
} from "../../../shared/wallclock-timezone";

describe("timezoneFromHeader", () => {
  it("extrai o fuso do cabecalho do SharkScope", () => {
    expect(timezoneFromHeader("Data de Início (America/Sao_Paulo)")).toBe("America/Sao_Paulo");
    expect(timezoneFromHeader("Data de Conclusão (America/Sao_Paulo)")).toBe("America/Sao_Paulo");
    expect(timezoneFromHeader(" Start Date (Europe/London) ")).toBe("Europe/London");
  });

  it("retorna null quando o cabecalho nao declara fuso", () => {
    expect(timezoneFromHeader("Data de Início")).toBeNull();
    expect(timezoneFromHeader("Stake")).toBeNull();
    expect(timezoneFromHeader(null)).toBeNull();
  });
});

describe("wallClockToUtc", () => {
  it("BRT (UTC-3) soma 3h para chegar em UTC", () => {
    const d = wallClockToUtc("2026-07-27 15:30", "America/Sao_Paulo");
    expect(d?.toISOString()).toBe("2026-07-27T18:30:00.000Z");
  });

  it("torneio das 21h BRT cai no dia UTC seguinte (bug de bucket de dia)", () => {
    const d = wallClockToUtc("2026-07-27 21:05", "America/Sao_Paulo");
    expect(d?.toISOString()).toBe("2026-07-28T00:05:00.000Z");
  });

  it("aceita segundos e formato com T", () => {
    expect(wallClockToUtc("2026-07-27T15:30:45", "America/Sao_Paulo")?.toISOString())
      .toBe("2026-07-27T18:30:45.000Z");
  });

  it("UTC como fuso nao desloca", () => {
    expect(wallClockToUtc("2026-07-27 15:30", "UTC")?.toISOString())
      .toBe("2026-07-27T15:30:00.000Z");
  });

  it("respeita horario de verao do fuso (Londres jul = UTC+1, jan = UTC+0)", () => {
    expect(wallClockToUtc("2026-07-15 12:00", "Europe/London")?.toISOString())
      .toBe("2026-07-15T11:00:00.000Z");
    expect(wallClockToUtc("2026-01-15 12:00", "Europe/London")?.toISOString())
      .toBe("2026-01-15T12:00:00.000Z");
  });

  it("formato invalido devolve null (caller cai no parseDate legado)", () => {
    expect(wallClockToUtc("", "America/Sao_Paulo")).toBeNull();
    expect(wallClockToUtc("27/07/2026 15:30", "America/Sao_Paulo")).toBeNull();
    expect(wallClockToUtc(null, "America/Sao_Paulo")).toBeNull();
  });

  it("fuso desconhecido degrada para UTC em vez de explodir", () => {
    const d = wallClockToUtc("2026-07-27 15:30", "Nao/Existe");
    expect(d?.toISOString()).toBe("2026-07-27T15:30:00.000Z");
  });

  it("tzOffsetMinutes: Sao Paulo = -180", () => {
    expect(tzOffsetMinutes(new Date("2026-07-27T18:30:00Z"), "America/Sao_Paulo")).toBe(-180);
  });
});
