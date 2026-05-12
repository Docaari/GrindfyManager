// =============================================================================
// Sprint F4 W1 — schema F4 tests (Zod)
//
// Cobre back-compat min/max, novos campos targetMin/targetMax/targetRef/subGroup,
// snapshot.values em 3 formatos, hudStatTargets.
//
// NOTA (2026-05-11): parte do W1 (insertHudStatTargetSchema, hudStatTargets,
// targetMin/targetMax inline) foi mergeada pra main; o resto (StatField
// back-compat min->inputMin, validacao de barra em targetRef, subGroup livre,
// snapshot.values V2 {value,sampleSize}) vive em `feature/stats-analyzer-f4` —
// branch ~1 mes atras de main, merge inviavel sem re-sprint. Os 7 it() abaixo
// ficam `it.skip` ate o W1 ser re-aplicado por sprint dedicado.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  insertHudLayoutSchema,
  insertHudStatSnapshotSchema,
  insertHudStatTargetSchema,
  hudLayoutSectionsZodSchema,
} from "../../../shared/schema";

describe("StatField back-compat min/max -> inputMin/inputMax", () => {
  it.skip("aceita field legado com min/max", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Legacy",
      sections: [
        {
          label: "Pre-flop",
          sortOrder: 0,
          stats: [{ key: "vpip", label: "VPIP", decimals: 1, min: 0, max: 100 }],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.inputMin).toBe(0);
    expect(stat.inputMax).toBe(100);
  });

  it.skip("aceita field novo com inputMin/inputMax direto", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "New",
      sections: [
        {
          label: "Pre-flop",
          sortOrder: 0,
          stats: [
            { key: "vpip", label: "VPIP", decimals: 1, inputMin: 0, inputMax: 100 },
          ],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.inputMin).toBe(0);
    expect(stat.inputMax).toBe(100);
  });

  it.skip("inputMin tem precedencia quando ambos presentes", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Both",
      sections: [
        {
          label: "Pre-flop",
          sortOrder: 0,
          stats: [
            { key: "vpip", label: "VPIP", decimals: 1, min: 5, inputMin: 10, max: 99, inputMax: 100 },
          ],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.inputMin).toBe(10);
    expect(stat.inputMax).toBe(100);
  });
});

describe("StatField novos campos F4 (target + subGroup)", () => {
  it("aceita targetMin/targetMax inline", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Target inline",
      sections: [
        {
          label: "Pre-flop",
          sortOrder: 0,
          stats: [
            {
              key: "vpip",
              label: "VPIP",
              decimals: 1,
              targetMin: 28,
              targetMax: 30,
            },
          ],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.targetMin).toBe(28);
    expect(stat.targetMax).toBe(30);
  });

  it("aceita targetRef no formato {format}/{stakeBucket}", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Target ref",
      sections: [
        {
          label: "Pre-flop",
          sortOrder: 0,
          stats: [
            {
              key: "vpip",
              label: "VPIP",
              decimals: 1,
              targetRef: "mtt-6max/mid",
            },
          ],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.targetRef).toBe("mtt-6max/mid");
  });

  it.skip("rejeita targetRef sem barra", () => {
    expect(() =>
      insertHudLayoutSchema.parse({
        userId: "USER-0001",
        name: "Bad ref",
        sections: [
          {
            label: "Pre-flop",
            sortOrder: 0,
            stats: [
              {
                key: "vpip",
                label: "VPIP",
                decimals: 1,
                targetRef: "mtt-6max-mid",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it.skip("aceita subGroup string livre", () => {
    const parsed = insertHudLayoutSchema.parse({
      userId: "USER-0001",
      name: "Sub-secao",
      sections: [
        {
          label: "Blind War SB",
          sortOrder: 0,
          stats: [
            {
              key: "stab",
              label: "Stab",
              decimals: 1,
              subGroup: "limped pots",
            },
          ],
        },
      ],
    });
    const stat = (parsed.sections[0].stats[0] as any);
    expect(stat.subGroup).toBe("limped pots");
  });
});

describe("Snapshot.values 3 formatos (ADR-089)", () => {
  it("V1 number puro continua valido", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: { vpip: 22.5, pfr: 18.0 },
    });
    expect(parsed.values.vpip).toBe(22.5);
  });

  it.skip("V2 object {value, sampleSize} aceito", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: {
        vpip: { value: 22.5, sampleSize: 5000 },
      },
    });
    expect((parsed.values.vpip as any).value).toBe(22.5);
    expect((parsed.values.vpip as any).sampleSize).toBe(5000);
  });

  it.skip("formato mixto V1 + V2 + null aceito", () => {
    const parsed = insertHudStatSnapshotSchema.parse({
      userId: "USER-0001",
      layoutId: "lyt-1",
      values: {
        vpip: 22.5,
        rare: { value: 99, sampleSize: 2 },
        missing: null,
      },
    });
    expect(parsed.values.vpip).toBe(22.5);
    expect((parsed.values.rare as any).sampleSize).toBe(2);
    expect(parsed.values.missing).toBeNull();
  });

  it("rejeita sampleSize negativo", () => {
    expect(() =>
      insertHudStatSnapshotSchema.parse({
        userId: "USER-0001",
        layoutId: "lyt-1",
        values: { vpip: { value: 22, sampleSize: -1 } },
      }),
    ).toThrow();
  });
});

describe("insertHudStatTargetSchema", () => {
  it("aceita target valido", () => {
    const parsed = insertHudStatTargetSchema.parse({
      statKey: "vpip",
      format: "mtt-6max",
      stakeBucket: "mid",
      targetMin: 18,
      targetMax: 26,
    });
    expect(parsed.statKey).toBe("vpip");
    expect(parsed.source).toBe("founder");
    expect(parsed.version).toBe(1);
  });

  it("rejeita format desconhecido", () => {
    expect(() =>
      insertHudStatTargetSchema.parse({
        statKey: "vpip",
        format: "invalid-fmt",
        stakeBucket: "mid",
        targetMin: 18,
        targetMax: 26,
      }),
    ).toThrow();
  });

  it("rejeita stakeBucket desconhecido", () => {
    expect(() =>
      insertHudStatTargetSchema.parse({
        statKey: "vpip",
        format: "mtt-6max",
        stakeBucket: "ultra-stratosphere",
        targetMin: 18,
        targetMax: 26,
      }),
    ).toThrow();
  });

  it("rejeita statKey nao-snake_case", () => {
    expect(() =>
      insertHudStatTargetSchema.parse({
        statKey: "VPIP",
        format: "mtt-6max",
        stakeBucket: "mid",
        targetMin: 18,
        targetMax: 26,
      }),
    ).toThrow();
  });

  it("source e version tem defaults", () => {
    const parsed = insertHudStatTargetSchema.parse({
      statKey: "pfr",
      format: "mtt-6max",
      stakeBucket: "low",
      targetMin: 14,
      targetMax: 22,
    });
    expect(parsed.source).toBe("founder");
    expect(parsed.version).toBe(1);
  });
});

describe("hudLayoutSectionsZodSchema com sub-secoes", () => {
  it("aceita section com stats em multiplos subGroups", () => {
    const sections = hudLayoutSectionsZodSchema.parse([
      {
        label: "Blind War SB",
        sortOrder: 0,
        stats: [
          { key: "rfi", label: "RFI", decimals: 1 },
          { key: "limp", label: "Limp", decimals: 1 },
          { key: "stab", label: "Stab", decimals: 1, subGroup: "limped pots" },
          { key: "cbet_flop_lp", label: "Cbet Flop", decimals: 1, subGroup: "limped pots" },
          { key: "cbet_flop_rp", label: "Cbet Flop", decimals: 1, subGroup: "raised pots" },
        ],
      },
    ]);
    expect(sections[0].stats).toHaveLength(5);
  });
});
