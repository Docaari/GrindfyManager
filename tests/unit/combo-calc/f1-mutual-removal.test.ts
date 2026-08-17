// F1 / RF-01.2 + RF-01.3 — card removal mutuo: a armadilha central da frente.
// Spec: Docs/specs/range-lab/F1-motor.md
// ADR : Docs/architecture/decisions/246-range-lab-f1-motor.md (D-F1-4, D-F1-8)
//
// Um combo do heroi e um combo do vilao que dividem carta NAO se enfrentam.
// Produto simples de pesos produz numero errado que nao parece errado — e este
// arquivo existe para que esse numero nao passe.
//
// Regra de produto que governa o arquivo (`.claude/rules/00-produto.md`):
// numero errado perde para numero ausente. Onde nao ha oponente, o combo sai do
// agregado com razao nomeada; nunca vira 0%.
import { describe, it, expect } from "vitest";
import { runEngineToCompletion } from "@/lib/combo-calc/engine/run";
import { estimateCost, runoutsPerPair } from "@/lib/combo-calc/engine/cost";
import type {
  EngineRequest,
  EngineResult,
  HeroComboResult,
} from "@/lib/combo-calc/engine/types";
import { comboKey } from "@/lib/combo-calc/cards";
import {
  V2_BLOCKER_ASYMMETRY,
  V2_EMPTY_HERO,
  V2_EMPTY_VILLAIN,
  V2_FLOP,
  V2_HERO_COMBO_WITHOUT_OPPONENT,
  V2_NO_VALID_PAIRS,
  V2_RIVER,
  V2_TURN,
  type SpotV2Like,
} from "./f1-fixtures";

const TOL = 1e-9;

function exact(spot: SpotV2Like): EngineRequest {
  return { spot: spot as EngineRequest["spot"], mode: "exact" };
}

function okResult(result: EngineResult, label: string) {
  if (result.status !== "ok") {
    throw new Error(`${label}: esperava status ok, veio degraded (${result.reason})`);
  }
  return result;
}

function comboLabel(c: HeroComboResult): string {
  return comboKey(c.combo[0], c.combo[1]);
}

function findCombo(list: HeroComboResult[], label: string): HeroComboResult {
  const found = list.find((c) => comboLabel(c) === label);
  if (!found) {
    throw new Error(
      `combo ${label} nao esta em perHeroCombo (tem: ${list.map(comboLabel).join(", ")})`,
    );
  }
  return found;
}

// ── runouts por par (D-F1-4) ─────────────────────────────────

describe("F1 D-F1-4 — runouts validos por par sao constantes", () => {
  it("river = 1, turn = 44, flop = 990", () => {
    expect(runoutsPerPair(5), "river").toBe(1);
    expect(runoutsPerPair(4), "turn").toBe(44);
    expect(runoutsPerPair(3), "flop").toBe(990);
  });

  it("990 = C(45,2): 52 menos 3 do bordo, 2 do heroi e 2 do vilao", () => {
    const c45x2 = (45 * 44) / 2;
    expect(runoutsPerPair(3)).toBe(c45x2);
  });

  it("44 = 52 menos 4 do bordo, 2 do heroi e 2 do vilao", () => {
    expect(runoutsPerPair(4)).toBe(52 - 4 - 2 - 2);
  });

  for (const { street, spot, runouts } of [
    { street: "river", spot: V2_RIVER, runouts: 1 },
    { street: "turn", spot: V2_TURN, runouts: 44 },
    { street: "flop", spot: V2_FLOP, runouts: 990 },
  ]) {
    it(`${street}: totalShowdowns = pares validos x ${runouts}`, () => {
      const cost = estimateCost(exact(spot));
      const result = okResult(runEngineToCompletion(exact(spot)), street);
      expect(cost.runoutsPerPair, `${street}: runouts estimados`).toBe(runouts);
      expect(
        result.totalShowdowns,
        `${street}: showdowns do motor=${result.totalShowdowns}, estimativa=${cost.showdowns}`,
      ).toBe(cost.validPairs * runouts);
      expect(result.runoutsPerPair).toBe(runouts);
    });
  }
});

// ── par que divide carta nunca entra na conta ────────────────

describe("F1 D-F1-4 — par com carta compartilhada nao se enfrenta", () => {
  it("KsQs so enfrenta 3 dos 6 combos de KK (o Ks e dele)", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "bloqueio");
    const blocker = findCombo(result.perHeroCombo, comboKey(
      { rank: 13, suit: "s" },
      { rank: 12, suit: "s" },
    ));
    expect(
      blocker.pairMass,
      `KsQs bloqueia Ks: sobram KcKd, KcKh, KdKh = 3 combos de massa 1`,
    ).toBeCloseTo(3, 12);
  });

  it("2c2d enfrenta os 6 combos de KK (nao bloqueia nada)", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "bloqueio");
    const free = findCombo(result.perHeroCombo, comboKey(
      { rank: 2, suit: "c" },
      { rank: 2, suit: "d" },
    ));
    expect(free.pairMass, "2c2d nao divide carta com nenhum KK").toBeCloseTo(6, 12);
  });

  it("a massa de pares de um combo bloqueador e MENOR que a massa do range do vilao", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "bloqueio");
    const massaTotalDoVilao = 6; // 6 combos de KK, frequencia 1
    for (const c of result.perHeroCombo) {
      expect(
        c.pairMass,
        `${comboLabel(c)}: pairMass=${c.pairMass} nao pode passar da massa do vilao`,
      ).toBeLessThanOrEqual(massaTotalDoVilao + TOL);
    }
    const blocker = findCombo(result.perHeroCombo, comboKey(
      { rank: 13, suit: "s" },
      { rank: 12, suit: "s" },
    ));
    expect(blocker.pairMass).toBeLessThan(massaTotalDoVilao);
  });
});

// ── produto simples de pesos da resposta diferente ───────────

describe("F1 D-F1-4 — o agregado pesa por massa de pares, nao por w_h", () => {
  it("heroRangeEquity = soma(w * pairMass * eq) / soma(w * pairMass)", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "agregado");
    const vivos = result.perHeroCombo.filter((c) => c.degradedReason === null);
    expect(vivos.length, "fixture precisa de pelo menos dois combos vivos").toBe(2);

    let num = 0;
    let den = 0;
    for (const c of vivos) {
      const w = c.weight * c.pairMass;
      num += w * (c.equity as number);
      den += w;
    }
    const esperado = num / den;
    expect(
      Math.abs(result.heroRangeEquity - esperado),
      `motor=${result.heroRangeEquity} ponderado-por-massa=${esperado}`,
    ).toBeLessThan(TOL);
  });

  it("e NAO e a media ponderada so por w_h (o numero que nao parece errado)", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "agregado");
    const vivos = result.perHeroCombo.filter((c) => c.degradedReason === null);

    let num = 0;
    let den = 0;
    for (const c of vivos) {
      num += c.weight * (c.equity as number);
      den += c.weight;
    }
    const produtoSimples = num / den;

    const equities = vivos.map((c) => `${comboLabel(c)}=${c.equity}`).join(", ");
    expect(
      Math.abs(result.heroRangeEquity - produtoSimples),
      `os dois modelos coincidiram (${result.heroRangeEquity}); ` +
        `equities: ${equities} — a fixture perdeu o poder de detectar produto simples`,
    ).toBeGreaterThan(1e-6);
  });

  it("um combo que bloqueia metade do range pesa metade no agregado", () => {
    const result = okResult(runEngineToCompletion(exact(V2_BLOCKER_ASYMMETRY)), "peso");
    const blocker = findCombo(result.perHeroCombo, comboKey(
      { rank: 13, suit: "s" },
      { rank: 12, suit: "s" },
    ));
    const free = findCombo(result.perHeroCombo, comboKey(
      { rank: 2, suit: "c" },
      { rank: 2, suit: "d" },
    ));
    expect(blocker.weight).toBe(free.weight);
    expect(
      blocker.pairMass / free.pairMass,
      `pesos iguais (${blocker.weight}) mas massas ${blocker.pairMass} vs ${free.pairMass}`,
    ).toBeCloseTo(0.5, 12);
  });
});

// ── combo do heroi sem oponente ──────────────────────────────

describe("F1 D-F1-4 — combo do heroi sem oponente degrada, nunca vira 0%", () => {
  const KS_QS = comboKey({ rank: 13, suit: "s" }, { rank: 12, suit: "s" });
  const DEUCES = comboKey({ rank: 2, suit: "c" }, { rank: 2, suit: "d" });

  it("pairMass 0 produz degradedReason 'no_valid_villain_combo'", () => {
    const result = okResult(
      runEngineToCompletion(exact(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente",
    );
    const orfao = findCombo(result.perHeroCombo, KS_QS);
    expect(orfao.pairMass, "KsQs divide o Ks com o unico combo do vilao").toBe(0);
    expect(orfao.degradedReason).toBe("no_valid_villain_combo");
  });

  it("o combo degradado tem equity, evCall e decision NULOS (nao zero)", () => {
    const result = okResult(
      runEngineToCompletion(exact(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente",
    );
    const orfao = findCombo(result.perHeroCombo, KS_QS);
    expect(orfao.equity, "equity 0 seria um numero errado com cara de certo").toBeNull();
    expect(orfao.evCall).toBeNull();
    expect(orfao.decision).toBeNull();
  });

  it("o combo degradado fica FORA do agregado", () => {
    const result = okResult(
      runEngineToCompletion(exact(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente",
    );
    const vivo = findCombo(result.perHeroCombo, DEUCES);
    expect(
      Math.abs(result.heroRangeEquity - (vivo.equity as number)),
      `agregado=${result.heroRangeEquity} deveria ser so o combo vivo=${vivo.equity}`,
    ).toBeLessThan(TOL);
  });

  it("o combo degradado nao entra no callThresholdIndex", () => {
    const result = okResult(
      runEngineToCompletion(exact(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente",
    );
    const vivos = result.perHeroCombo.filter((c) => c.degradedReason === null);
    expect(result.callThresholdIndex).toBeLessThanOrEqual(vivos.length);
    const pagantes = vivos.filter((c) => (c.evCall as number) >= 0).length;
    expect(
      result.callThresholdIndex,
      `combos vivos que pagam=${pagantes}, motor=${result.callThresholdIndex}`,
    ).toBe(pagantes);
  });

  it("o combo degradado continua listado (o jogador ve que ele existiu)", () => {
    const result = okResult(
      runEngineToCompletion(exact(V2_HERO_COMBO_WITHOUT_OPPONENT)),
      "sem oponente",
    );
    expect(result.perHeroCombo.map(comboLabel).sort()).toEqual([DEUCES, KS_QS].sort());
  });
});

// ── degradacao no nivel da corrida (D-F1-8) ─────────────────

describe("F1 D-F1-8 — degradacao de corrida guarda por status, nao por numero", () => {
  it("range do heroi vazio degrada com 'empty_hero_range'", () => {
    const result = runEngineToCompletion(exact(V2_EMPTY_HERO));
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") throw new Error("esperava degraded");
    expect(result.reason).toBe("empty_hero_range");
  });

  it("range do vilao vazio degrada com 'empty_villain_range'", () => {
    const result = runEngineToCompletion(exact(V2_EMPTY_VILLAIN));
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") throw new Error("esperava degraded");
    expect(result.reason).toBe("empty_villain_range");
  });

  it("range com massa ponderada zero conta como vazio (licao da F0 RF-00.2)", () => {
    const semMassa: SpotV2Like = {
      ...V2_FLOP,
      villainRange: V2_FLOP.villainRange.map((e) => ({ ...e, frequency: 0 })),
    };
    const result = runEngineToCompletion(exact(semMassa));
    expect(
      result.status,
      "massa zero nao pode virar FOLD com 0% — foi o defeito que a F0 corrigiu",
    ).toBe("degraded");
    if (result.status !== "degraded") throw new Error("esperava degraded");
    expect(result.reason).toBe("empty_villain_range");
  });

  it("dois ranges nao-vazios sem nenhum par valido degradam com 'no_valid_pairs'", () => {
    const result = runEngineToCompletion(exact(V2_NO_VALID_PAIRS));
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") throw new Error("esperava degraded");
    expect(result.reason).toBe("no_valid_pairs");
  });

  it("o ramo degradado NAO expoe heroRangeEquity (o compilador cobra o if)", () => {
    const result = runEngineToCompletion(exact(V2_EMPTY_VILLAIN));
    if (result.status !== "degraded") throw new Error("esperava degraded");
    // O `@ts-expect-error` abaixo e guarda de EDITOR, nao de `npm run check`: o
    // `tsconfig.json` exclui `tests/**`, entao quem cobra o contrato em CI sao as
    // assercoes de runtime logo em seguida. As duas juntas dizem a mesma coisa.
    // @ts-expect-error — D-F1-8: o ramo 'degraded' nao carrega numero de equity.
    void result.heroRangeEquity;
    expect((result as unknown as Record<string, unknown>).heroRangeEquity).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).evCall).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).decision).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).perHeroCombo).toBeUndefined();
  });

  it("o ramo degradado ainda diz qual era o alpha (pot odds nao dependem do range)", () => {
    const result = runEngineToCompletion(exact(V2_EMPTY_VILLAIN));
    if (result.status !== "degraded") throw new Error("esperava degraded");
    expect(Number.isFinite(result.requiredEquity)).toBe(true);
    expect(result.requiredEquity).toBeGreaterThan(0);
    expect(result.mode).toBe("exact");
  });
});
