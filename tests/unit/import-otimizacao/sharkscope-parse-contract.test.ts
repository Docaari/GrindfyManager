/**
 * ADR-243 — contrato do parser SharkScope sobre uma fatia REAL do export do
 * founder (cabecalhos e valores copiados do arquivo, incluindo o fuso declarado
 * no cabecalho e a linha WPT Global sem nome que era descartada em silencio).
 */
import { describe, it, expect } from "vitest";
import { PokerCSVParser } from "../../../server/csvParser";

const HEADER =
  "Rede, Jogador, ID do Jogo, Stake, Data de Início (America/Sao_Paulo), Data de Conclusão (America/Sao_Paulo), Participantes, Rake, Jogo, Estrutura, Velocidade, Resultado (incluindo Rake), Posição, Bandeiras, Moeda, Reentradas/Recompras, Duração, Jogadores por mesa, Prêmio, Nome, Total de Reentradas, Prêmio de Recompensa";

const ROW_GG =
  'GGNetwork,"5505GG",295426215,99.36,2026-07-27 15:30,2026-07-28 17:07,4628,8.64,H,No Limit,Normal,133.19,1376,Bounty Deep-Stack Mystery-Bounty,USD,,92253,8,241.19,"$108 Mystery Bounty Main Event",2348,28.12';

// Linha real: `Nome` vazio -> era descartada (4 delas no export, mexendo no lucro).
const ROW_NO_NAME =
  'WPT Global,"Dowkali",566178,20.0,2026-05-21 17:00,2026-05-21 21:08,142,2.0,H,No Limit,Normal,3.39,33,Multi-Entry,USD,,14928,8,25.39,,42,';

const ROW_CNY =
  'WPT Global,"Dowkali",559999,188.0,2026-05-23 09:30,2026-05-23 15:07,1149,0.0,H,No Limit,Normal,216.23,515,Bounty,CNY,,20254,8,404.23,"Zodiac ¥2000",,';

const ROW_SAT =
  'CoinPoker,"kdo",72289,13.8,2026-07-27 21:05,2026-07-27 23:05,585,1.2,H,No Limit,Super Turbo,-15.00,305,Satellite Rebuy,USD,1,27343,7,,"BoM: Maltese Classic Sat",373,';

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

describe("parseSharkScopeFormat — contrato ADR-243", () => {
  it("buy-in = Stake + Rake e prize = Resultado (liquido)", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_GG), "USER-T", {});
    expect(t.buyIn).toBeCloseTo(108, 6);
    expect(t.prize).toBeCloseTo(133.19, 6);
    expect(t.rake).toBeCloseTo(8.64, 6);
  });

  it("`Prêmio` vai para grossPrize e NAO para prizePool", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_GG), "USER-T", {});
    expect(t.grossPrize).toBeCloseTo(241.19, 6);
    expect(t.prizePool ?? null).toBeNull();
    // Coerencia aritmetica do export: Prêmio == Resultado + investimento.
    expect((t.grossPrize as number) - t.prize).toBeCloseTo(108, 6);
  });

  it("data usa o fuso declarado no cabecalho (BRT -> UTC)", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_GG), "USER-T", {});
    expect(t.datePlayed?.toISOString()).toBe("2026-07-27T18:30:00.000Z");
    expect(t.sourceTimezone).toBe("America/Sao_Paulo");
    expect(t.endDate?.toISOString()).toBe("2026-07-28T20:07:00.000Z");
  });

  it("21:05 BRT vira 00:05Z do dia seguinte", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_SAT), "USER-T", {});
    expect(t.datePlayed?.toISOString()).toBe("2026-07-28T00:05:00.000Z");
  });

  it("campos antes descartados chegam preenchidos", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_GG), "USER-T", {});
    expect(t.playerNick).toBe("5505GG");
    expect(t.durationSeconds).toBe(92253);
    expect(t.playersPerTable).toBe(8);
    expect(t.fieldTotalEntries).toBe(2348);
    expect(t.bountyPrize).toBeCloseTo(28.12, 6);
    expect(t.structure).toBe("NL");
    expect(t.gameType).toBe("Holdem");
    expect(t.flags).toEqual(["Bounty", "Deep-Stack", "Mystery-Bounty"]);
  });

  it("bandeiras definem tipo e modificadores", async () => {
    const [gg] = await PokerCSVParser.parseCSV(csv(ROW_GG), "USER-T", {});
    expect(gg.category).toBe("Mystery");
    expect(gg.deepStack).toBe(true);

    const [sat] = await PokerCSVParser.parseCSV(csv(ROW_SAT), "USER-T", {});
    expect(sat.category).toBe("Satellite");
    expect(sat.allowsAddOn).toBe(true); // Rebuy
    expect(sat.speed).toBe("Hyper"); // Super Turbo -> Hyper
    expect(sat.reentries).toBe(1);
  });

  it("linha sem `Nome` NAO e mais descartada — nome sintetizado + flag", async () => {
    const { tournaments, report } = await PokerCSVParser.parseCSVDetailed(csv(ROW_NO_NAME), "USER-T", {});
    expect(tournaments).toHaveLength(1);
    expect(tournaments[0].nameSynthesized).toBe(true);
    expect(tournaments[0].name).toContain("[sem nome]");
    expect(tournaments[0].name).toContain("WPT Global");
    expect(tournaments[0].prize).toBeCloseTo(3.39, 6);
    expect(report.rejected).toHaveLength(0);
    expect(report.rowsInFile).toBe(1);
  });

  it("relatorio de rejeicao existe e conta linhas do arquivo", async () => {
    const bad = "Rede, Jogador\nGGNetwork,x";
    const { report } = await PokerCSVParser.parseCSVDetailed(bad, "USER-T", {});
    expect(report.rowsInFile).toBe(1);
    expect(report.parsedCount).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].reason).toBeTruthy();
  });

  it("CNY: converte com a taxa informada e guarda nativo + taxa + origem", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_CNY), "USER-T", { CNY: 7.2 });
    expect(t.currency).toBe("CNY");
    expect(t.convertedToUSD).toBe(true);
    expect(t.buyIn).toBeCloseTo(188 / 7.2, 6);
    expect(t.prize).toBeCloseTo(216.23 / 7.2, 6);
    expect(t.fxRateUsed).toBe(7.2);
    expect(t.buyInNative).toBeCloseTo(188, 4);
  });

  it("CNY sem taxa: nao converte e sinaliza (valor fica nativo)", async () => {
    const [t] = await PokerCSVParser.parseCSV(csv(ROW_CNY), "USER-T", {});
    expect(t.convertedToUSD).toBe(false);
    expect(t.buyIn).toBeCloseTo(188, 6);
    expect(t.fxRateUsed ?? null).toBeNull();
  });
});
