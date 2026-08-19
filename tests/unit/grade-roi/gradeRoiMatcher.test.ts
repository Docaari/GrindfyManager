import { describe, it, expect } from "vitest";
import {
  clampRealisticRoiPct,
  hourFromTimeString,
  plannedTimeBin,
  plannedBuyInTier,
  buildGradeLabel,
  matchFamilyStats,
  ROI_FLOOR_PCT,
  ROI_CEIL_PCT,
  activeDaysForProfile,
  filterPlannedByActiveDays,
  plannedRakeDecimal,
  rakeMarkupFromFeeShare,
  prizePoolPartOfBuyIn,
  siteFeeShare,
  describeMatchScope,
  groupPlannedTournaments,
} from "../../../server/services/gradeRoiMatcher";
import {
  canonicalSiteKey,
  isSameSite,
  mttRakePctForSite,
  DEFAULT_MTT_RAKE_PCT,
} from "../../../shared/poker-sites";

describe("clampRealisticRoiPct", () => {
  it("mantem ROI dentro da faixa realista", () => {
    expect(clampRealisticRoiPct(12.5)).toBe(12.5);
  });

  it("corta outlier positivo no teto", () => {
    expect(clampRealisticRoiPct(380)).toBe(ROI_CEIL_PCT);
  });

  it("corta outlier negativo no piso", () => {
    expect(clampRealisticRoiPct(-95)).toBe(ROI_FLOOR_PCT);
  });

  it("valor nao finito vira 0 (nao NaN)", () => {
    expect(clampRealisticRoiPct(Number.NaN)).toBe(0);
  });
});

describe("dimensoes do torneio planejado", () => {
  it("extrai a hora do campo time", () => {
    expect(hourFromTimeString("19:00")).toBe(19);
    expect(hourFromTimeString("07:30")).toBe(7);
    expect(hourFromTimeString("")).toBeNull();
    expect(hourFromTimeString("99:00")).toBeNull();
  });

  it("mapeia para o bin de 2h da biblioteca", () => {
    expect(plannedTimeBin("19:00")).toBe("18-20");
    expect(plannedTimeBin("22:45")).toBe("22-24");
    expect(plannedTimeBin(null)).toBe("sem-horario");
  });

  it("usa as mesmas faixas de ABI da biblioteca", () => {
    expect(plannedBuyInTier(55)).toBe("$50-70");
    expect(plannedBuyInTier(22)).toBe("$20-29");
  });

  it("monta o rotulo no padrao da biblioteca", () => {
    expect(
      buildGradeLabel({
        name: "Big 55",
        site: "WPN",
        type: "Vanilla",
        speed: "Normal",
        buyIn: 55,
        time: "22:00",
      }),
    ).toBe("Vanilla $50-70 · WPN · ~22h-24h");
  });
});

describe("matchFamilyStats", () => {
  const planned = {
    name: "Big 55",
    site: "WPN",
    type: "Vanilla",
    speed: "Normal",
    buyIn: 55,
    time: "22:00",
  };

  const exact = {
    site: "WPN",
    category: "Vanilla",
    buyInTier: "$50-70",
    timeBin: "22-24",
    volume: 120,
    roi: 18,
    avgFieldSize: 800,
    itmRate: 14,
  };

  it("prefere a familia mais especifica (site+abi+tipo+horario)", () => {
    const out = matchFamilyStats(planned, [
      exact,
      { ...exact, timeBin: "12-14", roi: -40, volume: 500 },
    ]);
    expect(out.level).toBe("site_abi_type_time");
    expect(out.roiPct).toBe(18);
    expect(out.volume).toBe(120);
  });

  it("cai para site+abi+tipo quando nao ha familia no horario", () => {
    const out = matchFamilyStats(planned, [{ ...exact, timeBin: "12-14" }]);
    expect(out.level).toBe("site_abi_type");
    expect(out.volume).toBe(120);
  });

  it("cai para abi+tipo em outro site", () => {
    const out = matchFamilyStats(planned, [
      { ...exact, site: "GGNetwork", timeBin: "12-14" },
    ]);
    expect(out.level).toBe("abi_type");
  });

  it("pondera o ROI pelo volume quando agrega familias", () => {
    const out = matchFamilyStats(planned, [
      { ...exact, timeBin: "22-24", volume: 100, roi: 10 },
      { ...exact, timeBin: "22-24", volume: 300, roi: 30 },
    ]);
    expect(out.volume).toBe(400);
    expect(out.roiPct).toBeCloseTo(25, 6);
  });

  it("sem amostra devolve none + roi null (nao inventa zero)", () => {
    const out = matchFamilyStats(planned, []);
    expect(out.level).toBe("none");
    expect(out.roiPct).toBeNull();
    expect(out.volume).toBe(0);
  });
});

describe("filtro de dias ativos (grade real x planned_tournaments)", () => {
  const states = [
    { dayOfWeek: 0, activeProfile: "A" },
    { dayOfWeek: 1, activeProfile: "A" },
    { dayOfWeek: 2, activeProfile: "B" },
    { dayOfWeek: 6, activeProfile: "OFF" },
  ];

  it("mantem so os dias em que o perfil esta ativo", () => {
    const out = activeDaysForProfile(states, "A");
    expect([...out].sort()).toEqual([0, 1]);
  });

  it("ignora dias OFF", () => {
    expect(activeDaysForProfile(states, "A").has(6)).toBe(false);
    expect(activeDaysForProfile([{ dayOfWeek: 6, activeProfile: "OFF" }], "OFF").size).toBe(0);
  });

  it("descarta torneio de dia que pertence a outro perfil", () => {
    const planned = [
      { dayOfWeek: 0, name: "dom perfil B" },
      { dayOfWeek: 1, name: "seg perfil A" },
      { dayOfWeek: 2, name: "ter perfil B" },
    ];
    const out = filterPlannedByActiveDays(planned, states, "A");
    expect(out.rows.map((r) => r.name)).toEqual(["dom perfil B", "seg perfil A"]);
    expect(out.activeDays).toEqual([0, 1]);
    expect(out.applied).toBe(true);
  });

  it("sem nenhum estado salvo nao filtra (nao esvazia a importacao)", () => {
    const planned = [{ dayOfWeek: 3 }];
    const out = filterPlannedByActiveDays(planned, [], "A");
    expect(out.rows).toHaveLength(1);
    expect(out.applied).toBe(false);
  });
});

describe("site canonico e rake", () => {
  it("GGPoker (grade) casa com GGNetwork (historico)", () => {
    expect(canonicalSiteKey("GGPoker")).toBe(canonicalSiteKey("GGNetwork"));
    expect(isSameSite("ACR", "Americas Cardroom")).toBe(true);
    expect(isSameSite("WPN", "GGPoker")).toBe(false);
  });

  it("casa a familia do historico mesmo com o nome do site diferente", () => {
    const out = matchFamilyStats(
      { site: "GGPoker", type: "Vanilla", buyIn: 55, time: "22:00" },
      [
        {
          site: "GGNetwork",
          category: "Vanilla",
          buyInTier: "$50-70",
          timeBin: "22-24",
          volume: 60,
          roi: 12,
        },
      ],
    );
    expect(out.level).toBe("site_abi_type_time");
    expect(out.roiPct).toBe(12);
  });

  it("rake conhecido por site, default 9% no resto", () => {
    expect(mttRakePctForSite("CoinPoker")).toBe(8);
    expect(mttRakePctForSite("GGPoker")).toBe(9);
    expect(mttRakePctForSite("Sala Desconhecida")).toBe(DEFAULT_MTT_RAKE_PCT);
  });

  it("converte fatia do buy-in total em markup do engine", () => {
    // $55 com 9,09% de taxa = $50 no prize pool + $5 -> markup 10%.
    expect(rakeMarkupFromFeeShare(0.0909)).toBeCloseTo(0.1, 3);
    expect(rakeMarkupFromFeeShare(0)).toBe(0);
    // CoinPoker 8% do total -> 8,7% sobre a parte do prize pool.
    expect(plannedRakeDecimal({ site: "CoinPoker" })).toBeCloseTo(0.087, 3);
  });

  it("separa a parte do prize pool do buy-in total", () => {
    expect(prizePoolPartOfBuyIn(55, 0.0909)).toBeCloseTo(50, 1);
    expect(prizePoolPartOfBuyIn(0, 0.09)).toBe(0);
    // Custo reconstruido = buy-in total (invariante do engine).
    const fee = siteFeeShare("GGPoker");
    const part = prizePoolPartOfBuyIn(55, fee);
    expect(part * (1 + rakeMarkupFromFeeShare(fee))).toBeCloseTo(55, 6);
  });
});

describe("escopo da amostra (de onde veio o ROI)", () => {
  const bodog = { site: "Bodog", type: "Vanilla", buyIn: 25, time: "17:00" };

  it("amostra do proprio site nao marca aproximacao", () => {
    const sc = describeMatchScope(bodog, "site_abi_type_time");
    expect(sc?.siteSampleMissing).toBe(false);
    expect(sc?.label).toContain("Bodog");
  });

  it("fallback cross-site avisa que nao ha amostra do site", () => {
    const sc = describeMatchScope(bodog, "abi_type");
    expect(sc?.siteSampleMissing).toBe(true);
    expect(sc?.label).toBe("Vanilla $20-29 (todos os sites)");
    expect(sc?.label).not.toContain("Bodog");
  });

  it("sem casamento nenhum nao inventa escopo", () => {
    expect(describeMatchScope(bodog, "none")).toBeNull();
  });
});

describe("groupPlannedTournaments", () => {
  const mk = (day: number, time: string, name = "Mini Kickoff", buyIn = 25) => ({
    dayOfWeek: day,
    time,
    name,
    site: "CoinPoker",
    type: "Vanilla",
    speed: "Normal",
    buyIn,
  });

  it("colapsa o mesmo torneio dos 5 dias numa linha so", () => {
    const units = groupPlannedTournaments([1, 2, 3, 4, 5].map((d) => mk(d, "14:30")));
    expect(units).toHaveLength(1);
    expect(units[0].occurrencesPerWeek).toBe(5);
    expect(units[0].days).toEqual([1, 2, 3, 4, 5]);
    expect(units[0].tournamentName).toBe("Mini Kickoff");
  });

  it("nao parte a linha quando o horario cruza a fronteira da janela de 2h", () => {
    // 13:30 cai em 12-14 e 14:30 em 14-16 — mesmo torneio, bins diferentes.
    const units = groupPlannedTournaments([
      mk(1, "13:30"),
      mk(2, "14:30"),
      mk(3, "14:30"),
      mk(4, "14:30"),
      mk(5, "14:30"),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].occurrencesPerWeek).toBe(5);
    expect(units[0].timeBins.sort()).toEqual(["12-14", "14-16"]);
    // Representante fica com o horario PREDOMINANTE (4 de 5 ocorrencias).
    expect(units[0].representative.time).toBe("14:30");
    expect(buildGradeLabel(units[0].representative)).toContain("~14h-16h");
  });

  it("mantem separados torneios diferentes no mesmo site e horario", () => {
    const units = groupPlannedTournaments([
      mk(1, "14:30", "Mini Kickoff"),
      mk(1, "14:30", "Daily Special"),
    ]);
    expect(units).toHaveLength(2);
  });

  it("sem nome utilizavel volta a agrupar pelas dimensoes do rotulo", () => {
    const units = groupPlannedTournaments([
      { ...mk(1, "14:30"), name: "" },
      { ...mk(2, "14:40"), name: "" },
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].tournamentName).toBeNull();
  });

  it("media os buy-ins das ocorrencias dentro da mesma faixa", () => {
    const units = groupPlannedTournaments([mk(1, "14:30", "X", 24), mk(2, "14:30", "X", 26)]);
    expect(units).toHaveLength(1);
    expect(units[0].avgBuyIn).toBe(25);
  });

  it("buy-ins em faixas de ABI diferentes nao entram na mesma linha", () => {
    // $22 e $35 sao torneios de stake diferente: juntar mentiria no investimento.
    const units = groupPlannedTournaments([mk(1, "14:30", "X", 22), mk(2, "14:30", "X", 35)]);
    expect(units).toHaveLength(2);
  });
});

describe("tolerancia a divergencia de tipo entre grade e historico", () => {
  const planned = { site: "CoinPoker", type: "Vanilla", buyIn: 25, time: "14:30" };

  it("usa a amostra do proprio site quando so o tipo diverge", () => {
    // O jogador escreve "Vanilla"; o historico classificou como "Add-on".
    const out = matchFamilyStats(planned, [
      {
        site: "CoinPoker",
        category: "Add-on",
        buyInTier: "$20-29",
        timeBin: "14-16",
        volume: 37,
        roi: 11,
      },
    ]);
    expect(out.level).toBe("site_abi_time");
    expect(out.volume).toBe(37);
    const scope = describeMatchScope(planned, out.level);
    expect(scope?.siteSampleMissing).toBe(false);
    expect(scope?.label).toContain("CoinPoker");
  });

  it("amostra do proprio site vence a media cross-site do tipo certo", () => {
    const out = matchFamilyStats(planned, [
      { site: "CoinPoker", category: "Add-on", buyInTier: "$20-29", timeBin: "14-16", volume: 37, roi: 11 },
      { site: "WPN", category: "Vanilla", buyInTier: "$20-29", timeBin: "14-16", volume: 2400, roi: 8 },
    ]);
    expect(out.roiPct).toBe(11);
  });
});
