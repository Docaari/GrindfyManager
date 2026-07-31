/**
 * ADR-243 — cambio pela DATA do torneio.
 *
 * Antes toda linha nao-USD era convertida por UMA taxa flat das settings, entao
 * um torneio de 2021 e um de 2026 usavam a mesma cotacao e o passado mudava a
 * cada import. Estes testes cobrem o nucleo PURO (cascata de cotacao +
 * re-valorizacao), sem tocar banco/rede.
 */
import { describe, it, expect } from "vitest";
import {
  buildRateIndex,
  pickHistoricalRate,
  applyHistoricalFx,
  summarizeFxNeeds,
  MAX_PREV_DAYS,
} from "../../../server/services/fx/historicalFxResolver";

const rows = [
  { currency: "CNY", date: "2026-05-20", ratePerUsd: 7.0 },
  { currency: "CNY", date: "2026-05-21", ratePerUsd: 6.9 },
  { currency: "CNY", date: "2026-05-25", ratePerUsd: 6.8 },
  { currency: "EUR", date: "2026-05-21", ratePerUsd: 0.85 },
];

describe("pickHistoricalRate", () => {
  const index = buildRateIndex(rows);

  it("usa a cotacao do proprio dia quando existe", () => {
    const hit = pickHistoricalRate(index, "CNY", "2026-05-21");
    expect(hit).toEqual({ rate: 6.9, source: "historical_exact", rateDate: "2026-05-21" });
  });

  it("cai no ultimo dia util anterior (fim de semana/feriado)", () => {
    const hit = pickHistoricalRate(index, "CNY", "2026-05-23");
    expect(hit?.rate).toBe(6.9);
    expect(hit?.source).toBe("historical_prev");
    expect(hit?.rateDate).toBe("2026-05-21");
  });

  it(`nao usa dia anterior distante > ${MAX_PREV_DAYS} dias — usa a mais proxima`, () => {
    const hit = pickHistoricalRate(index, "CNY", "2026-06-30");
    expect(hit?.source).toBe("historical_nearest");
    expect(hit?.rateDate).toBe("2026-05-25");
  });

  it("data anterior a toda a serie usa a mais proxima (nearest futuro)", () => {
    const hit = pickHistoricalRate(index, "CNY", "2021-11-22");
    expect(hit?.source).toBe("historical_nearest");
    expect(hit?.rateDate).toBe("2026-05-20");
  });

  it("moeda sem cotacao devolve null (caller mantem taxa flat)", () => {
    expect(pickHistoricalRate(index, "GBP", "2026-05-21")).toBeNull();
  });

  it("indice ignora taxa invalida/zero/negativa", () => {
    const idx = buildRateIndex([
      { currency: "CNY", date: "2026-05-21", ratePerUsd: 0 },
      { currency: "CNY", date: "2026-05-22", ratePerUsd: -1 },
      { currency: "CNY", date: "2026-05-23", ratePerUsd: Number.NaN as any },
    ]);
    expect(pickHistoricalRate(idx, "CNY", "2026-05-21")).toBeNull();
  });
});

describe("applyHistoricalFx", () => {
  const index = buildRateIndex(rows);

  it("re-valoriza linha ja convertida pela taxa flat, sem perda", () => {
    // Linha nativa ¥388 convertida no parse a 7.2 -> 53.888...
    const parsed: any[] = [
      {
        currency: "CNY",
        datePlayed: new Date("2026-05-21T12:00:00Z"),
        buyIn: 388 / 7.2,
        prize: -388 / 7.2,
        rake: 0,
        grossPrize: null,
        convertedToUSD: true,
        fxRateUsed: 7.2,
        fxSource: "import_rates",
      },
    ];
    const { tournaments, applied, bySource } = applyHistoricalFx(parsed, index);
    expect(applied).toBe(1);
    expect(bySource.historical_exact).toBe(1);
    // 388 / 6.9 (cotacao do dia), nao 388 / 7.2
    expect(tournaments[0].buyIn).toBeCloseTo(388 / 6.9, 8);
    expect(tournaments[0].prize).toBeCloseTo(-388 / 6.9, 8);
    expect(tournaments[0].fxRateUsed).toBe(6.9);
    expect(tournaments[0].fxSource).toBe("historical_exact");
    expect(tournaments[0].fxRateDate).toBe("2026-05-21");
    // Nativo preservado exatamente.
    expect(tournaments[0].buyInNative).toBeCloseTo(388, 6);
  });

  it("converte linha que ficou nativa (sem taxa no parse)", () => {
    const parsed: any[] = [
      {
        currency: "EUR",
        datePlayed: new Date("2026-05-21T12:00:00Z"),
        buyIn: 100,
        prize: 50,
        convertedToUSD: false,
        fxRateUsed: null,
      },
    ];
    const { tournaments } = applyHistoricalFx(parsed, index);
    expect(tournaments[0].buyIn).toBeCloseTo(100 / 0.85, 8);
    expect(tournaments[0].convertedToUSD).toBe(true);
    expect(tournaments[0].fxRateUsed).toBe(0.85);
  });

  it("converte TODOS os campos monetarios (rake, gross, bounty, prizePool)", () => {
    const parsed: any[] = [
      {
        currency: "CNY",
        datePlayed: new Date("2026-05-21T12:00:00Z"),
        buyIn: 10,
        prize: 5,
        rake: 1,
        grossPrize: 15,
        bountyPrize: 3,
        prizePool: 1000,
        convertedToUSD: false,
      },
    ];
    const [t] = applyHistoricalFx(parsed, index).tournaments;
    expect(t.rake).toBeCloseTo(1 / 6.9, 8);
    expect(t.grossPrize).toBeCloseTo(15 / 6.9, 8);
    expect(t.bountyPrize).toBeCloseTo(3 / 6.9, 8);
    expect(t.prizePool).toBeCloseTo(1000 / 6.9, 8);
  });

  it("linha USD passa intacta", () => {
    const parsed: any[] = [
      { currency: "USD", datePlayed: new Date("2026-05-21T12:00:00Z"), buyIn: 108, prize: 133.19 },
    ];
    const { tournaments, applied } = applyHistoricalFx(parsed, index);
    expect(applied).toBe(0);
    expect(tournaments[0]).toBe(parsed[0]);
  });

  it("moeda sem cobertura mantem o valor da taxa flat (degrada, nao quebra)", () => {
    const parsed: any[] = [
      {
        currency: "GBP",
        datePlayed: new Date("2026-05-21T12:00:00Z"),
        buyIn: 80,
        prize: 10,
        convertedToUSD: true,
        fxRateUsed: 0.8,
        fxSource: "import_rates",
      },
    ];
    const { tournaments, applied } = applyHistoricalFx(parsed, index);
    expect(applied).toBe(0);
    expect(tournaments[0].fxSource).toBe("import_rates");
    expect(tournaments[0].buyIn).toBe(80);
  });

  it("nao muta o array de entrada", () => {
    const original: any = {
      currency: "CNY",
      datePlayed: new Date("2026-05-21T12:00:00Z"),
      buyIn: 10,
      prize: 1,
      convertedToUSD: false,
    };
    applyHistoricalFx([original], index);
    expect(original.buyIn).toBe(10);
    expect(original.convertedToUSD).toBe(false);
  });
});

describe("summarizeFxNeeds", () => {
  it("lista moedas nao-USD e a janela de datas do lote", () => {
    const needs = summarizeFxNeeds([
      { currency: "USD", datePlayed: new Date("2026-01-01T00:00:00Z") },
      { currency: "CNY", datePlayed: new Date("2026-05-21T00:00:00Z") },
      { currency: "EUR", datePlayed: new Date("2026-07-27T00:00:00Z") },
      { currency: "CNY", datePlayed: new Date("2026-03-10T00:00:00Z") },
    ] as any[]);
    expect(needs.currencies).toEqual(["CNY", "EUR"]);
    expect(needs.minDate).toBe("2026-03-10");
    expect(needs.maxDate).toBe("2026-07-27");
  });

  it("lote 100% USD nao precisa de cotacao", () => {
    const needs = summarizeFxNeeds([
      { currency: "USD", datePlayed: new Date("2026-01-01T00:00:00Z") },
    ] as any[]);
    expect(needs.currencies).toEqual([]);
    expect(needs.minDate).toBeNull();
  });
});
