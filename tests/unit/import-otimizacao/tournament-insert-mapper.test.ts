/**
 * ADR-243 — mapeamento UNICO ParsedTournament -> row de INSERT.
 *
 * Guarda a causa raiz de "rake e duration 100% nulos em 126k torneios": os 3
 * endpoints de upload tinham listas de campos divergentes e o fluxo usado pela UI
 * era o mais pobre. Este teste falha se um campo extraido pelo parser voltar a
 * ser descartado no INSERT.
 */
import { describe, it, expect } from "vitest";
import { buildTournamentInsertRow, mapParsedToInsertRows } from "../../../server/services/tournamentInsertMapper";

const base: any = {
  userId: "USER-TEST",
  tournamentId: "295426215",
  name: "$108 Mystery Bounty Main Event, $5M GTD [Day 2]",
  buyIn: 108,
  prize: 133.19,
  position: 1376,
  datePlayed: new Date("2026-07-27T18:30:00Z"),
  endDate: new Date("2026-07-28T20:07:00Z"),
  site: "GGNetwork",
  format: "MTT",
  category: "Mystery",
  speed: "Normal",
  fieldSize: 4628,
  fieldTotalEntries: 2348,
  currency: "USD",
  finalTable: false,
  bigHit: false,
  reentries: 0,
  rake: 8.64,
  convertedToUSD: false,
  grossPrize: 241.19,
  bountyPrize: 28.12,
  durationSeconds: 92253,
  playersPerTable: 8,
  structure: "NL",
  gameType: "Holdem",
  startingStackBb: null,
  deepStack: true,
  playerNick: "5505GG",
  flags: ["Bounty", "Deep-Stack", "Mystery-Bounty"],
  sourceTimezone: "America/Sao_Paulo",
};

describe("buildTournamentInsertRow", () => {
  it("persiste os campos que antes morriam no INSERT", () => {
    const row = buildTournamentInsertRow(base, "USER-0001");
    expect(row.rake).toBe("8.64");
    expect(row.durationSeconds).toBe(92253);
    expect(row.playersPerTable).toBe(8);
    expect(row.structure).toBe("NL");
    expect(row.gameType).toBe("Holdem");
    expect(row.grossPrize).toBe("241.19");
    expect(row.bountyPrize).toBe("28.12");
    expect(row.playerNick).toBe("5505GG");
    expect(row.endDate).toEqual(base.endDate);
    expect(row.fieldTotalEntries).toBe(2348);
    expect(row.flags).toEqual(["Bounty", "Deep-Stack", "Mystery-Bounty"]);
    expect(row.sourceTimezone).toBe("America/Sao_Paulo");
    expect(row.deepStack).toBe(true);
  });

  it("userId vem do contexto de auth, nunca do CSV", () => {
    const row = buildTournamentInsertRow({ ...base, userId: "USER-HACK" }, "USER-0001");
    expect(row.userId).toBe("USER-0001");
  });

  it("grava converted_to_usd (a flag que ninguem gravava -> dupla conversao)", () => {
    expect(buildTournamentInsertRow({ ...base, convertedToUSD: true }, "U").convertedToUSD).toBe(true);
    expect(buildTournamentInsertRow(base, "U").convertedToUSD).toBe(false);
  });

  it("guarda valores nativos + taxa quando houve conversao", () => {
    const row = buildTournamentInsertRow(
      { ...base, currency: "CNY", convertedToUSD: true, buyInNative: 388, prizeNative: 283.5, fxRateUsed: 7.2, fxSource: "import_rates" },
      "U",
    );
    expect(row.buyInNative).toBe("388");
    expect(row.prizeNative).toBe("283.5");
    expect(row.fxRateUsed).toBe("7.2");
    expect(row.fxSource).toBe("import_rates");
  });

  it("bandeira do export vence heuristica de nome no tipo primario", () => {
    // Nome sem qualquer pista de satelite; bandeira diz Satellite.
    const row = buildTournamentInsertRow(
      { ...base, name: "Zodiac Main Event", category: "Vanilla", flags: ["Satellite"] },
      "U",
    );
    expect(row.type).toBe("Satellite");
  });

  it("Rebuy/Multi-Entry das bandeiras chegam em allowsAddOn/allowsReentry", () => {
    const row = buildTournamentInsertRow(
      { ...base, name: "BoM: 25 Cavalry Charge", category: "Vanilla", flags: ["Rebuy", "Multi-Entry"] },
      "U",
    );
    expect(row.allowsAddOn).toBe(true);
    expect(row.allowsReentry).toBe(true);
    // addOnCost = stake (buyIn - rake), nunca buyIn cheio (launch-fix P1#2).
    expect(row.addOnCost).toBe(String(108 - 8.64));
  });

  it("campo ausente vira null (nao 0/false) — lesson #7", () => {
    const row = buildTournamentInsertRow(
      { userId: "U", name: "X", buyIn: 10, prize: -10, position: 0, datePlayed: new Date("2026-01-01T00:00:00Z"), site: "WPN", format: "MTT", category: "Vanilla", speed: "Normal", fieldSize: 0, currency: "USD", finalTable: false, bigHit: false } as any,
      "U",
    );
    expect(row.durationSeconds).toBeNull();
    expect(row.playersPerTable).toBeNull();
    expect(row.grossPrize).toBeNull();
    expect(row.bountyPrize).toBeNull();
    expect(row.playerNick).toBeNull();
    expect(row.endDate).toBeNull();
    expect(row.fieldTotalEntries).toBeNull();
    expect(row.flags).toBeNull();
    expect(row.position).toBeNull();
    expect(row.fieldSize).toBeNull();
  });

  it("uploadId propaga para permitir desfazer import", () => {
    const rows = mapParsedToInsertRows([base], "U", { uploadId: "UP-1" });
    expect(rows[0].uploadId).toBe("UP-1");
    expect(mapParsedToInsertRows([base], "U")[0].uploadId).toBeNull();
  });

  it("prizePool NAO recebe o premio do jogador", () => {
    const row = buildTournamentInsertRow(base, "U");
    expect(row.prizePool).toBeNull();
    expect(row.grossPrize).toBe("241.19");
  });
});
