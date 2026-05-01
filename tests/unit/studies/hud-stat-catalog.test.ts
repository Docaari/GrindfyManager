// =============================================================================
// Sprint Stats-V2 — Catalogo HUD estatico (RF-01, RF-02, RF-15)
//
// Red phase. Catalogo (`shared/hud-stat-catalog.ts`) ainda NAO existe.
//
// Espec defaults (Stats-V2 spec):
//   - 200+ entradas
//   - 16 grupos profissionais (snake_case)
//   - StatField: { id, label, group, subgroup?, targetMin, targetMax,
//                  direction, unit, formula? }
//   - direction enum: 'higher_better' | 'lower_better' | 'context' | 'neutral'
//   - unit enum: 'pct' | 'bb' | 'count'
//
// IMPORTANTE (lesson learned #8): NAO assert `.length === N` em catalogo. Use
// `>=` ou `getStatById('foo')`. Validacao por presenca individual + counts >=.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  HUD_STAT_CATALOG,
  getStatById,
  getStatsByGroup,
  getDefaultRange,
  type StatField,
  type HudGroupId,
  HUD_GROUP_IDS,
} from "../../../shared/hud-stat-catalog";

const EXPECTED_GROUPS: HudGroupId[] = [
  "basics",
  "rfi",
  "threebet",
  "resteal",
  "pos_flop_pfr_ip",
  "pos_flop_pfr_oop",
  "pos_flop_multiway",
  "cbets_by_board",
  "caller_pre_flop",
  "threeway_bb",
  "bb_defense",
  "pos_flop_pfc_ip",
  "blind_war_sb",
  "blind_war_bb",
  "threebet_pot_ip",
  "threebet_pot_oop_vs_lp",
];

const VALID_DIRECTIONS = [
  "higher_better",
  "lower_better",
  "context",
  "neutral",
];

const VALID_UNITS = ["pct", "bb", "count"];

describe("HUD_STAT_CATALOG (shape)", () => {
  it("e exportado como array", () => {
    expect(Array.isArray(HUD_STAT_CATALOG)).toBe(true);
  });

  it("tem pelo menos 180 entradas (alvo 200+; safety>=180)", () => {
    expect(HUD_STAT_CATALOG.length).toBeGreaterThanOrEqual(180);
  });

  it("toda entry tem `id` snake_case (regex ^[a-z][a-z0-9_]*$)", () => {
    const idPattern = /^[a-z][a-z0-9_]*$/;
    for (const stat of HUD_STAT_CATALOG) {
      expect(stat.id, `id invalido: ${stat.id}`).toMatch(idPattern);
    }
  });

  it("nao tem ids duplicados", () => {
    const ids = HUD_STAT_CATALOG.map((s) => s.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("toda entry tem `label` nao vazio", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(stat.label, `label vazio para ${stat.id}`).toBeTruthy();
      expect(typeof stat.label).toBe("string");
    }
  });

  it("toda entry tem `group` valido (1 dos 16)", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(EXPECTED_GROUPS, `group invalido em ${stat.id}: ${stat.group}`).toContain(
        stat.group,
      );
    }
  });

  it("toda entry tem `direction` definido (1 dos 4 enums)", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(VALID_DIRECTIONS, `direction invalido em ${stat.id}`).toContain(
        stat.direction,
      );
    }
  });

  it("toda entry tem `unit` definido (1 dos 3 enums)", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(VALID_UNITS, `unit invalido em ${stat.id}`).toContain(stat.unit);
    }
  });

  it("toda entry tem `targetMin` e `targetMax` numericos", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(typeof stat.targetMin, `targetMin nao numerico em ${stat.id}`).toBe(
        "number",
      );
      expect(typeof stat.targetMax, `targetMax nao numerico em ${stat.id}`).toBe(
        "number",
      );
    }
  });

  it("targetMin <= targetMax para todos", () => {
    for (const stat of HUD_STAT_CATALOG) {
      expect(
        stat.targetMin <= stat.targetMax,
        `targetMin>targetMax em ${stat.id}: ${stat.targetMin} > ${stat.targetMax}`,
      ).toBe(true);
    }
  });

  it("stats `pct` tem range dentro de [0, 100]", () => {
    for (const stat of HUD_STAT_CATALOG) {
      if (stat.unit !== "pct") continue;
      expect(stat.targetMin, `${stat.id} targetMin<0`).toBeGreaterThanOrEqual(0);
      expect(stat.targetMax, `${stat.id} targetMax>100`).toBeLessThanOrEqual(100);
    }
  });
});

describe("HUD_GROUP_IDS enum", () => {
  it("exporta exatamente 16 ids", () => {
    expect(HUD_GROUP_IDS.length).toBe(16);
  });

  it("contem cada id esperado (validacao individual, sem length match)", () => {
    for (const expected of EXPECTED_GROUPS) {
      expect(
        HUD_GROUP_IDS,
        `grupo esperado ausente: ${expected}`,
      ).toContain(expected);
    }
  });
});

describe("HUD_STAT_CATALOG (presenca de stats criticos)", () => {
  // NAO usamos `.length === 200` (lesson #8). Validamos presenca individual.
  const criticalIds = [
    "vpip",
    "pfr",
    "wwsf_pct",
    "rfi_btn",
    "threebet_total",
    "cbet_ip_vs_bb",
    "fold_vs_cbet_oop",
    "sb_resteal",
    "bb_defend_vs_steal",
  ];

  for (const id of criticalIds) {
    it(`contem stat critico '${id}'`, () => {
      const found = HUD_STAT_CATALOG.find((s) => s.id === id);
      expect(found, `stat critico ausente: ${id}`).toBeDefined();
    });
  }
});

describe("getStatById()", () => {
  it("retorna entry quando id existe", () => {
    const result = getStatById("vpip");
    expect(result).toBeDefined();
    expect(result?.id).toBe("vpip");
  });

  it("retorna undefined quando id nao existe", () => {
    expect(getStatById("nao_existe_xyz")).toBeUndefined();
  });

  it("VPIP tem direction='context' (RF-01 AC-1.2)", () => {
    const vpip = getStatById("vpip");
    expect(vpip?.direction).toBe("context");
  });
});

describe("getStatsByGroup()", () => {
  it("retorna array de StatField filtrada por group", () => {
    const basics = getStatsByGroup("basics");
    expect(Array.isArray(basics)).toBe(true);
    for (const s of basics) {
      expect(s.group).toBe("basics");
    }
  });

  it("cada um dos 16 grupos tem >=1 stat (presenca, NAO length absoluta)", () => {
    for (const group of EXPECTED_GROUPS) {
      const stats = getStatsByGroup(group);
      expect(
        stats.length,
        `grupo ${group} tem 0 stats — esperado >=1`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("retorna array vazio para group desconhecido", () => {
    // @ts-expect-error — testando runtime behaviour
    const result = getStatsByGroup("not_a_group");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("getDefaultRange()", () => {
  it("retorna { min, max } quando id existe", () => {
    const range = getDefaultRange("vpip");
    expect(range).not.toBeNull();
    expect(range).toHaveProperty("min");
    expect(range).toHaveProperty("max");
    if (range) {
      expect(typeof range.min).toBe("number");
      expect(typeof range.max).toBe("number");
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
  });

  it("retorna null quando id nao existe", () => {
    expect(getDefaultRange("nao_existe_xyz")).toBeNull();
  });
});
